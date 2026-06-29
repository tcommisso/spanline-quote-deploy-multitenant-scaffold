import { and, desc, eq, inArray } from "drizzle-orm";
import { constructionInstallers, siteInductions, tradePortalAccess } from "../drizzle/schema";
import { appendTenantScope, tenantIdFromContext } from "./_core/tenant-scope";

export type TradeReadinessWarningKey =
  | "missing_contact_details"
  | "missing_trade_portal_access"
  | "missing_site_induction"
  | "site_induction_pending"
  | "site_induction_expired";

export type TradeReadinessWarning = {
  key: TradeReadinessWarningKey;
  label: string;
  message: string;
  severity: "warning";
};

export type TradeReadiness = {
  jobId: number;
  installerId: number;
  hasContactDetails: boolean;
  hasTradePortalAccess: boolean;
  hasCompletedInduction: boolean;
  inductionId: number | null;
  inductionStatus: string;
  warningTags: string[];
  warnings: TradeReadinessWarning[];
};

type TradeReadinessPair = {
  jobId: number;
  installerId?: number | null;
};

type InstallerContact = {
  id: number;
  phone?: string | null;
  email?: string | null;
};

function hasText(value: unknown) {
  return String(value ?? "").trim().length > 0;
}

function uniqueNumbers(values: Array<number | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is number => typeof value === "number")));
}

export function tradeReadinessKey(jobId: number, installerId: number) {
  return `${jobId}:${installerId}`;
}

function warning(key: TradeReadinessWarningKey, label: string, message: string): TradeReadinessWarning {
  return { key, label, message, severity: "warning" };
}

function inductionRank(status: string) {
  if (status === "completed") return 3;
  if (status === "pending") return 2;
  if (status === "expired") return 1;
  return 0;
}

function newerTimestamp(row: any) {
  return new Date(row?.updatedAt || row?.completedAt || row?.createdAt || 0).getTime();
}

function preferInduction(existing: any | undefined, candidate: any) {
  if (!existing) return candidate;
  const existingRank = inductionRank(String(existing.status || ""));
  const candidateRank = inductionRank(String(candidate.status || ""));
  if (candidateRank !== existingRank) return candidateRank > existingRank ? candidate : existing;
  return newerTimestamp(candidate) > newerTimestamp(existing) ? candidate : existing;
}

export async function getTradeReadinessMap(
  db: any,
  ctx: any,
  pairs: TradeReadinessPair[],
  knownInstallers?: Map<number, InstallerContact>,
): Promise<Map<string, TradeReadiness>> {
  const scopedPairs = pairs
    .filter((pair): pair is { jobId: number; installerId: number } => typeof pair.installerId === "number")
    .filter((pair, index, all) => all.findIndex((item) => item.jobId === pair.jobId && item.installerId === pair.installerId) === index);

  if (scopedPairs.length === 0) return new Map();

  const jobIds = uniqueNumbers(scopedPairs.map((pair) => pair.jobId));
  const installerIds = uniqueNumbers(scopedPairs.map((pair) => pair.installerId));
  const tenantId = tenantIdFromContext(ctx);

  const installerMap = new Map<number, InstallerContact>(knownInstallers || []);
  const missingInstallerIds = installerIds.filter((installerId) => !installerMap.has(installerId));
  if (missingInstallerIds.length > 0) {
    const installerConditions: any[] = [inArray(constructionInstallers.id, missingInstallerIds)];
    appendTenantScope(installerConditions, constructionInstallers.tenantId, tenantId);
    const installers = await db.select({
      id: constructionInstallers.id,
      phone: constructionInstallers.phone,
      email: constructionInstallers.email,
    }).from(constructionInstallers)
      .where(and(...installerConditions));
    for (const installer of installers) {
      installerMap.set(installer.id, installer);
    }
  }

  const portalConditions: any[] = [
    inArray(tradePortalAccess.installerId, installerIds),
    eq(tradePortalAccess.isActive, true),
  ];
  appendTenantScope(portalConditions, tradePortalAccess.tenantId, tenantId);
  const portalRows = await db.select({
    installerId: tradePortalAccess.installerId,
  }).from(tradePortalAccess)
    .where(and(...portalConditions));
  const portalInstallerIds = new Set(portalRows.map((row: any) => row.installerId));

  const inductionRows = await db.select({
    id: siteInductions.id,
    jobId: siteInductions.jobId,
    installerId: siteInductions.installerId,
    status: siteInductions.status,
    completedAt: siteInductions.completedAt,
    updatedAt: siteInductions.updatedAt,
    createdAt: siteInductions.createdAt,
  }).from(siteInductions)
    .where(and(
      inArray(siteInductions.jobId, jobIds),
      inArray(siteInductions.installerId, installerIds),
    ))
    .orderBy(desc(siteInductions.updatedAt));

  const inductionMap = new Map<string, any>();
  for (const induction of inductionRows) {
    const key = tradeReadinessKey(induction.jobId, induction.installerId);
    inductionMap.set(key, preferInduction(inductionMap.get(key), induction));
  }

  const readinessMap = new Map<string, TradeReadiness>();
  for (const pair of scopedPairs) {
    const key = tradeReadinessKey(pair.jobId, pair.installerId);
    const installer = installerMap.get(pair.installerId);
    const induction = inductionMap.get(key);
    const inductionStatus = induction?.status || "not_started";
    const hasContactDetails = Boolean(hasText(installer?.phone) || hasText(installer?.email));
    const hasTradePortalAccess = portalInstallerIds.has(pair.installerId);
    const hasCompletedInduction = inductionStatus === "completed";
    const warnings: TradeReadinessWarning[] = [];

    if (!hasContactDetails) {
      warnings.push(warning(
        "missing_contact_details",
        "Contact missing",
        "Trade contact details are missing. Add a phone number or email before relying on notifications.",
      ));
    }

    if (!hasTradePortalAccess) {
      warnings.push(warning(
        "missing_trade_portal_access",
        "Portal missing",
        "No active trade portal contact exists for this trade.",
      ));
    }

    if (!induction) {
      warnings.push(warning(
        "missing_site_induction",
        "Induction missing",
        "No site induction has been created for this trade on this client job.",
      ));
    } else if (inductionStatus === "pending") {
      warnings.push(warning(
        "site_induction_pending",
        "Induction pending",
        "The site induction exists but has not been completed.",
      ));
    } else if (inductionStatus === "expired") {
      warnings.push(warning(
        "site_induction_expired",
        "Induction expired",
        "The site induction has expired and needs review.",
      ));
    }

    readinessMap.set(key, {
      jobId: pair.jobId,
      installerId: pair.installerId,
      hasContactDetails,
      hasTradePortalAccess,
      hasCompletedInduction,
      inductionId: induction?.id || null,
      inductionStatus,
      warningTags: warnings.map((item) => item.label),
      warnings,
    });
  }

  return readinessMap;
}
