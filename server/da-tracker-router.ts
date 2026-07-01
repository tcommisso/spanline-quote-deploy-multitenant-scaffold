/**
 * DA Tracker tRPC Router
 * Provides endpoints for listing, filtering, and managing DA tracking subscriptions
 */
import { z } from "zod";
import { router, tenantProcedure as protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { daTrackerApplications, daTrackerWebhookSubscriptions, daTrackerWebhookDeliveries, daTrackerPollLog, approvalLodgements, approvalProjects, clientDas } from "../drizzle/schema";
import { eq, and, isNull, isNotNull, desc, like, sql, inArray, gte, lte, or } from "drizzle-orm";

const DA_TRACKER_DEFAULT_START_DATE = "2022-09-01";
const DAFINDER_LIST_URL = "https://services1.arcgis.com/E5n4f1VY84i0xSjy/arcgis/rest/services/ACTGOV_DAFINDER_LIST_VIEW/FeatureServer/0";
const DAFINDER_BATCH_SIZE = 75;
const APPLICANT_CACHE_TTL_MS = 10 * 60 * 1000;

const daTrackerTenantScope = (tenantId: number) => or(
  eq(daTrackerApplications.tenantId, tenantId),
  isNull(daTrackerApplications.tenantId)
);

const daTrackerPollTenantScope = (tenantId: number) => or(
  eq(daTrackerPollLog.tenantId, tenantId),
  isNull(daTrackerPollLog.tenantId)
);

type ActBlockParcel = {
  address: string | null;
  centroidLat: number | null;
  centroidLng: number | null;
  polygonJson: number[][][] | null;
};

type DaFinderApplicantInfo = {
  daNumber: string;
  companyName: string | null;
  applicantName: string | null;
};

type DaTrackerMapScope = "all" | "entity" | "competitor";

type ClientDaMapRow = {
  id: number;
  daNumber: string;
  companyName: string | null;
  applicantName: string | null;
  streetAddress: string | null;
  suburb: string | null;
  lodgementDate: Date | string | null;
  daStage: string | null;
  matchType: string;
  matchConfidence: string;
  isOurs: boolean;
  centroidLat: number | null;
  centroidLng: number | null;
};

let applicantOptionsCache: { key: string; expiresAt: number; applicants: string[] } | null = null;

function escapeArcgisSql(value: string) {
  return value.replace(/'/g, "''");
}

function normaliseDaNumber(value: string | number | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

function dateFromInput(value?: string | null): Date {
  return new Date(`${value || DA_TRACKER_DEFAULT_START_DATE}T00:00:00.000Z`);
}

function applicantDisplayName(info?: DaFinderApplicantInfo | null): string | null {
  const companyName = info?.companyName?.trim();
  if (companyName) return companyName;
  const applicantName = info?.applicantName?.trim();
  return applicantName || null;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function fetchDaFinderApplicantInfo(where: string, limit = 2000): Promise<DaFinderApplicantInfo[]> {
  const params = new URLSearchParams({
    where,
    outFields: "DA_NUMBER,COMPANYORG_NAME,APPLICANT_NAME",
    returnGeometry: "false",
    resultRecordCount: String(limit),
    orderByFields: "LODGEMENT_DATE DESC",
    f: "json",
  });

  const response = await fetch(`${DAFINDER_LIST_URL}/query?${params.toString()}`);
  if (!response.ok) {
    console.warn(`[DaTracker] DAFINDER applicant lookup failed: ${response.status}`);
    return [];
  }
  const data = await response.json();
  if (data.error) {
    console.warn(`[DaTracker] DAFINDER applicant lookup error: ${data.error.message}`);
    return [];
  }

  return (data.features || []).map((feature: any) => {
    const attributes = feature.attributes || {};
    return {
      daNumber: String(attributes.DA_NUMBER || ""),
      companyName: attributes.COMPANYORG_NAME || null,
      applicantName: attributes.APPLICANT_NAME || null,
    };
  });
}

async function fetchApplicantsByDaNumbers(daNumbers: Array<string | number>): Promise<Map<string, DaFinderApplicantInfo>> {
  const numbers = Array.from(new Set(daNumbers.map(normaliseDaNumber).filter(Boolean)));
  const applicants = new Map<string, DaFinderApplicantInfo>();

  for (const chunk of chunkArray(numbers, DAFINDER_BATCH_SIZE)) {
    const where = `DA_NUMBER IN (${chunk.join(",")})`;
    const rows = await fetchDaFinderApplicantInfo(where, chunk.length * 3);
    for (const row of rows) {
      const daNumber = normaliseDaNumber(row.daNumber);
      if (!daNumber) continue;
      const existing = applicants.get(daNumber);
      if (!existing || (!applicantDisplayName(existing) && applicantDisplayName(row))) {
        applicants.set(daNumber, row);
      }
    }
  }

  return applicants;
}

async function fetchDaNumbersByApplicant(applicant: string): Promise<number[]> {
  const escapedApplicant = escapeArcgisSql(applicant);
  const rows = await fetchDaFinderApplicantInfo(
    `(COMPANYORG_NAME = '${escapedApplicant}' OR APPLICANT_NAME = '${escapedApplicant}')`,
    2000
  );
  return Array.from(new Set(rows.map((row) => Number(normaliseDaNumber(row.daNumber))).filter(Number.isFinite)));
}

async function fetchApplicantOptionsForDaNumbers(daNumbers: Array<string | number>): Promise<string[]> {
  const now = Date.now();
  const numbers = Array.from(new Set(daNumbers.map(normaliseDaNumber).filter(Boolean))).sort();
  const key = `${numbers.length}:${numbers[0] || ""}:${numbers[numbers.length - 1] || ""}`;
  if (applicantOptionsCache && applicantOptionsCache.key === key && applicantOptionsCache.expiresAt > now) {
    return applicantOptionsCache.applicants;
  }

  const applicantsByDa = await fetchApplicantsByDaNumbers(numbers);
  const applicants = Array.from(new Set(
    Array.from(applicantsByDa.values()).map(applicantDisplayName).filter((value): value is string => !!value)
  )).sort((a, b) => a.localeCompare(b));

  applicantOptionsCache = { key, applicants, expiresAt: now + APPLICANT_CACHE_TTL_MS };
  return applicants;
}

function dedupeActDaRows<T extends { daNumber: number | string; lodgementDate: Date | string | null; subclass?: string | null; id: number }>(rows: T[]): T[] {
  const byDaNumber = new Map<string, T>();
  for (const row of rows) {
    const key = normaliseDaNumber(row.daNumber);
    const existing = byDaNumber.get(key);
    if (!existing) {
      byDaNumber.set(key, row);
      continue;
    }

    const rowHasSubclass = !!row.subclass;
    const existingHasSubclass = !!existing.subclass;
    const rowLodged = row.lodgementDate ? new Date(row.lodgementDate).getTime() : 0;
    const existingLodged = existing.lodgementDate ? new Date(existing.lodgementDate).getTime() : 0;
    if (
      (rowHasSubclass && !existingHasSubclass) ||
      rowLodged > existingLodged ||
      (rowLodged === existingLodged && row.id < existing.id)
    ) {
      byDaNumber.set(key, row);
    }
  }
  return Array.from(byDaNumber.values());
}

function clientDaMapKey(row: ClientDaMapRow): string {
  return [
    normaliseDaNumber(row.daNumber),
    String(row.companyName || "").trim().toUpperCase(),
    String(row.streetAddress || "").trim().toUpperCase(),
    String(row.suburb || "").trim().toUpperCase(),
  ].join("|");
}

function dedupeClientDaMapRows<T extends ClientDaMapRow>(rows: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) {
    const key = clientDaMapKey(row);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      continue;
    }
    const rowIsManual = row.matchType === "manual";
    const existingIsManual = existing.matchType === "manual";
    const rowLodged = row.lodgementDate ? new Date(row.lodgementDate).getTime() : 0;
    const existingLodged = existing.lodgementDate ? new Date(existing.lodgementDate).getTime() : 0;
    if ((rowIsManual && !existingIsManual) || rowLodged > existingLodged || (rowLodged === existingLodged && row.id < existing.id)) {
      byKey.set(key, row);
    }
  }
  return Array.from(byKey.values());
}

function calculateRingCentroid(ring: number[][] | undefined): { lat: number; lng: number } | null {
  if (!ring?.length) return null;
  let sumLng = 0;
  let sumLat = 0;
  let count = 0;
  for (const point of ring) {
    const [lng, lat] = point;
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      sumLng += lng;
      sumLat += lat;
      count++;
    }
  }
  if (count === 0) return null;
  return { lng: sumLng / count, lat: sumLat / count };
}

async function lookupActBlockParcel(da: {
  division: string | null;
  section: number | null;
  block: number | null;
}): Promise<ActBlockParcel | null> {
  if (!da.division || da.section == null || da.block == null) return null;

  const where = [
    `BLOCK_NUMBER = ${Number(da.block)}`,
    `SECTION_NUMBER = ${Number(da.section)}`,
    `DIVISION_NAME = '${escapeArcgisSql(da.division.toUpperCase())}'`,
  ].join(" AND ");

  const params = new URLSearchParams({
    where,
    outFields: "BLOCK_NUMBER,SECTION_NUMBER,DIVISION_NAME,ADDRESSES,BLOCK_DERIVED_AREA",
    returnGeometry: "true",
    outSR: "4326",
    f: "json",
    resultRecordCount: "1",
  });

  try {
    const response = await fetch(`https://services1.arcgis.com/E5n4f1VY84i0xSjy/arcgis/rest/services/ACTGOV_BLOCKS/FeatureServer/0/query?${params.toString()}`);
    if (!response.ok) return null;
    const data = await response.json();
    const feature = data.features?.[0];
    if (!feature) return null;

    const rings = Array.isArray(feature.geometry?.rings) ? feature.geometry.rings as number[][][] : null;
    const centroid = calculateRingCentroid(rings?.[0]);
    const rawAddress = typeof feature.attributes?.ADDRESSES === "string" ? feature.attributes.ADDRESSES.trim() : "";

    return {
      address: rawAddress || null,
      centroidLat: centroid?.lat ?? null,
      centroidLng: centroid?.lng ?? null,
      polygonJson: rings,
    };
  } catch (error) {
    console.warn("[DaTracker] ACT block parcel lookup failed:", error);
    return null;
  }
}

export const daTrackerRouter = router({
  // List DAs with filters
  list: protectedProcedure
    .input(z.object({
      district: z.string().optional(),
      division: z.string().optional(),
      subclass: z.string().optional(),
      applicationType: z.string().optional(),
      applicant: z.string().optional(),
      search: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      includeRemoved: z.boolean().optional().default(false),
      limit: z.number().min(1).max(500).optional().default(100),
      offset: z.number().min(0).optional().default(0),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };

      const conditions: any[] = [daTrackerTenantScope(ctx.tenant!.id)];
      conditions.push(gte(daTrackerApplications.lodgementDate, dateFromInput(input.dateFrom)));

      if (!input.includeRemoved) {
        conditions.push(isNull(daTrackerApplications.removedAt));
      }
      if (input.district) {
        conditions.push(eq(daTrackerApplications.district, input.district));
      }
      if (input.division) {
        conditions.push(eq(daTrackerApplications.division, input.division));
      }
      if (input.subclass) {
        conditions.push(eq(daTrackerApplications.subclass, input.subclass));
      }
      if (input.applicationType) {
        conditions.push(eq(daTrackerApplications.applicationType, input.applicationType));
      }
      if (input.search) {
        conditions.push(like(daTrackerApplications.division, `%${input.search}%`));
      }
      if (input.dateTo) {
        conditions.push(lte(daTrackerApplications.lodgementDate, new Date(input.dateTo)));
      }
      if (input.applicant) {
        const daNumbers = await fetchDaNumbersByApplicant(input.applicant);
        if (daNumbers.length === 0) {
          return { items: [], total: 0 };
        }
        conditions.push(inArray(daTrackerApplications.daNumber, daNumbers));
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const rows = await db.select({
          id: daTrackerApplications.id,
          daNumber: daTrackerApplications.daNumber,
          objectId: daTrackerApplications.objectId,
          district: daTrackerApplications.district,
          division: daTrackerApplications.division,
          section: daTrackerApplications.section,
          block: daTrackerApplications.block,
          lodgementDate: daTrackerApplications.lodgementDate,
          applicationType: daTrackerApplications.applicationType,
          subclass: daTrackerApplications.subclass,
          centroidLat: daTrackerApplications.centroidLat,
          centroidLng: daTrackerApplications.centroidLng,
          firstSeenAt: daTrackerApplications.firstSeenAt,
          lastSeenAt: daTrackerApplications.lastSeenAt,
          removedAt: daTrackerApplications.removedAt,
        })
          .from(daTrackerApplications)
          .where(where)
          .orderBy(desc(daTrackerApplications.lodgementDate))
          .limit(5000);

      const deduped = dedupeActDaRows(rows);
      const applicantsByDa = await fetchApplicantsByDaNumbers(deduped.map((da) => da.daNumber));
      const enriched = deduped.map((da) => {
        const applicantInfo = applicantsByDa.get(normaliseDaNumber(da.daNumber));
        return {
          ...da,
          applicantName: applicantInfo?.applicantName ?? null,
          companyName: applicantInfo?.companyName ?? null,
          applicantDisplayName: applicantDisplayName(applicantInfo),
        };
      });
      const items = enriched.slice(input.offset, input.offset + input.limit);

      return { items, total: enriched.length };
    }),

  // Get single DA detail with polygon
  detail: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      const [da] = await db.select()
        .from(daTrackerApplications)
        .where(and(
          eq(daTrackerApplications.id, input.id),
          daTrackerTenantScope(ctx.tenant!.id),
        ))
        .limit(1);
      if (!da) return null;

      const parcel = await lookupActBlockParcel(da);
      return {
        ...da,
        parcelAddress: parcel?.address ?? null,
        parcelCentroidLat: parcel?.centroidLat ?? null,
        parcelCentroidLng: parcel?.centroidLng ?? null,
        parcelPolygonJson: parcel?.polygonJson ?? null,
      };
    }),

  // Get map data (all active DAs with centroid only)
  mapData: protectedProcedure
    .input(z.object({
      scope: z.enum(["all", "entity", "competitor"]).optional(),
      district: z.string().optional(),
      subclass: z.string().optional(),
      myProjectsOnly: z.boolean().optional().default(true),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const scope: DaTrackerMapScope = input.scope || (input.myProjectsOnly ? "entity" : "all");
      const conditions: any[] = [
        daTrackerTenantScope(ctx.tenant!.id),
        isNull(daTrackerApplications.removedAt),
        gte(daTrackerApplications.lodgementDate, dateFromInput()),
        isNotNull(daTrackerApplications.centroidLat),
        isNotNull(daTrackerApplications.centroidLng),
      ];
      if (input.district && input.district !== "all") conditions.push(eq(daTrackerApplications.district, input.district));
      if (input.subclass && input.subclass !== "all") conditions.push(eq(daTrackerApplications.subclass, input.subclass));

      // Filter to only DAs linked to approval projects via lodgement external reference numbers
      if (scope === "entity") {
        const lodgements = await db.select({ ref: approvalLodgements.externalReferenceNumber })
          .from(approvalLodgements)
          .innerJoin(approvalProjects, eq(approvalProjects.id, approvalLodgements.projectId))
          .where(and(
            eq(approvalProjects.tenantId, ctx.tenant!.id),
            isNotNull(approvalLodgements.externalReferenceNumber),
          ));
        const daNumbers = lodgements
          .map(l => l.ref?.replace(/\D/g, ""))
          .filter((n): n is string => !!n && n.length > 0)
          .map(n => Number(n))
          .filter(n => !isNaN(n));
        if (daNumbers.length > 0) {
          conditions.push(inArray(daTrackerApplications.daNumber, daNumbers));
        } else {
          conditions.push(sql`1 = 0`);
        }
      }

      const actRows = scope === "competitor" ? [] : await db.select({
        id: daTrackerApplications.id,
        daNumber: daTrackerApplications.daNumber,
        district: daTrackerApplications.district,
        division: daTrackerApplications.division,
        subclass: daTrackerApplications.subclass,
        centroidLat: daTrackerApplications.centroidLat,
        centroidLng: daTrackerApplications.centroidLng,
        source: sql<string>`'act_tracker'`,
        mapScope: sql<DaTrackerMapScope>`${scope}`,
        companyName: sql<string | null>`NULL`,
        address: sql<string | null>`NULL`,
        lodgementDate: daTrackerApplications.lodgementDate,
      })
        .from(daTrackerApplications)
        .where(and(...conditions))
        .orderBy(desc(daTrackerApplications.lodgementDate))
        .limit(5000);

      if (scope === "all") {
        return dedupeActDaRows(actRows);
      }

      const clientDaConditions: any[] = [
        eq(clientDas.tenantId, ctx.tenant!.id),
        eq(clientDas.isOurs, scope === "entity"),
        isNotNull(clientDas.centroidLat),
        isNotNull(clientDas.centroidLng),
      ];

      const clientRows = await db.select({
        id: clientDas.id,
        daNumber: clientDas.daNumber,
        companyName: clientDas.companyName,
        applicantName: clientDas.applicantName,
        streetAddress: clientDas.streetAddress,
        suburb: clientDas.suburb,
        lodgementDate: clientDas.lodgementDate,
        daStage: clientDas.daStage,
        matchType: clientDas.matchType,
        matchConfidence: clientDas.matchConfidence,
        isOurs: clientDas.isOurs,
        centroidLat: clientDas.centroidLat,
        centroidLng: clientDas.centroidLng,
      })
        .from(clientDas)
        .where(and(...clientDaConditions))
        .orderBy(desc(clientDas.lodgementDate))
        .limit(5000);

      const clientMarkers = dedupeClientDaMapRows(clientRows).map((row) => ({
        id: row.id,
        daNumber: row.daNumber,
        district: null,
        division: row.suburb,
        subclass: scope === "entity" ? "Associated to us" : "Competitor",
        centroidLat: row.centroidLat,
        centroidLng: row.centroidLng,
        source: "client_das",
        mapScope: scope,
        companyName: row.companyName || row.applicantName,
        address: row.streetAddress,
        lodgementDate: row.lodgementDate,
      }));

      return [
        ...dedupeActDaRows(actRows),
        ...clientMarkers,
      ];
    }),

  // Get filter options (distinct values)
  filterOptions: protectedProcedure
    .input(z.object({
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) return { districts: [], divisions: [], subclasses: [], applicationTypes: [], applicants: [], defaultDateFrom: DA_TRACKER_DEFAULT_START_DATE };
    const activeConditions: any[] = [
      daTrackerTenantScope(ctx.tenant!.id),
      isNull(daTrackerApplications.removedAt),
      gte(daTrackerApplications.lodgementDate, dateFromInput(input?.dateFrom)),
    ];
    if (input?.dateTo) {
      activeConditions.push(lte(daTrackerApplications.lodgementDate, new Date(input.dateTo)));
    }
    const activeTenantWhere = and(...activeConditions);

    const [districts, divisions, subclasses, appTypes, daNumbers] = await Promise.all([
      db.selectDistinct({ value: daTrackerApplications.district })
        .from(daTrackerApplications)
        .where(activeTenantWhere),
      db.selectDistinct({ value: daTrackerApplications.division })
        .from(daTrackerApplications)
        .where(activeTenantWhere),
      db.selectDistinct({ value: daTrackerApplications.subclass })
        .from(daTrackerApplications)
        .where(activeTenantWhere),
      db.selectDistinct({ value: daTrackerApplications.applicationType })
        .from(daTrackerApplications)
        .where(activeTenantWhere),
      db.selectDistinct({ value: daTrackerApplications.daNumber })
        .from(daTrackerApplications)
        .where(activeTenantWhere),
    ]);
    const applicants = await fetchApplicantOptionsForDaNumbers(daNumbers.map((d) => d.value));

    return {
      districts: districts.map((d: any) => d.value).filter(Boolean).sort() as string[],
      divisions: divisions.map((d: any) => d.value).filter(Boolean).sort() as string[],
      subclasses: subclasses.map((d: any) => d.value).filter(Boolean).sort() as string[],
      applicationTypes: appTypes.map((d: any) => d.value).filter(Boolean).sort() as string[],
      applicants,
      defaultDateFrom: DA_TRACKER_DEFAULT_START_DATE,
    };
  }),

  // Stats
  stats: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { activeApplications: 0, newThisWeek: 0, lastPoll: null };

    const [activeCount] = await db.select({ count: sql<number>`count(*)` })
      .from(daTrackerApplications)
      .where(and(
        daTrackerTenantScope(ctx.tenant!.id),
        isNull(daTrackerApplications.removedAt),
        gte(daTrackerApplications.lodgementDate, dateFromInput()),
      ));

    const [lastPoll] = await db.select()
      .from(daTrackerPollLog)
      .where(daTrackerPollTenantScope(ctx.tenant!.id))
      .orderBy(desc(daTrackerPollLog.startedAt))
      .limit(1);

    const [newThisWeek] = await db.select({ count: sql<number>`count(*)` })
      .from(daTrackerApplications)
      .where(and(
        daTrackerTenantScope(ctx.tenant!.id),
        gte(daTrackerApplications.lodgementDate, dateFromInput()),
        gte(daTrackerApplications.firstSeenAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
      ));

    return {
      activeApplications: activeCount?.count || 0,
      newThisWeek: newThisWeek?.count || 0,
      lastPoll: lastPoll || null,
    };
  }),

  // ─── Webhook Subscriptions ─────────────────────────────────────────────────

  subscriptions: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select()
        .from(daTrackerWebhookSubscriptions)
        .where(and(
          eq(daTrackerWebhookSubscriptions.tenantId, ctx.tenant!.id),
          eq(daTrackerWebhookSubscriptions.userId, ctx.user.id),
        ))
        .orderBy(desc(daTrackerWebhookSubscriptions.createdAt));
    }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(200),
        filterDistrict: z.string().optional(),
        filterDivision: z.string().optional(),
        filterSubclass: z.string().optional(),
        filterApplicationType: z.string().optional(),
        notifyMethod: z.enum(["in_app", "webhook", "email"]),
        webhookUrl: z.string().url().optional(),
        emailAddress: z.string().email().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const [result] = await db.insert(daTrackerWebhookSubscriptions).values({
          tenantId: ctx.tenant!.id,
          userId: ctx.user.id,
          name: input.name,
          filterDistrict: input.filterDistrict || null,
          filterDivision: input.filterDivision || null,
          filterSubclass: input.filterSubclass || null,
          filterApplicationType: input.filterApplicationType || null,
          notifyMethod: input.notifyMethod,
          webhookUrl: input.webhookUrl || null,
          emailAddress: input.emailAddress || null,
        });
        return { id: (result as any).insertId };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(200).optional(),
        filterDistrict: z.string().nullable().optional(),
        filterDivision: z.string().nullable().optional(),
        filterSubclass: z.string().nullable().optional(),
        filterApplicationType: z.string().nullable().optional(),
        notifyMethod: z.enum(["in_app", "webhook", "email"]).optional(),
        webhookUrl: z.string().url().nullable().optional(),
        emailAddress: z.string().email().nullable().optional(),
        active: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const { id, ...updates } = input;
        await db.update(daTrackerWebhookSubscriptions)
          .set({ ...updates, updatedAt: new Date() } as any)
          .where(and(
            eq(daTrackerWebhookSubscriptions.id, id),
            eq(daTrackerWebhookSubscriptions.tenantId, ctx.tenant!.id),
            eq(daTrackerWebhookSubscriptions.userId, ctx.user.id),
          ));
        return { ok: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        await db.delete(daTrackerWebhookSubscriptions)
          .where(and(
            eq(daTrackerWebhookSubscriptions.id, input.id),
            eq(daTrackerWebhookSubscriptions.tenantId, ctx.tenant!.id),
            eq(daTrackerWebhookSubscriptions.userId, ctx.user.id),
          ));
        return { ok: true };
      }),
  }),

  // ─── Notifications (in-app deliveries for current user) ────────────────────

  notifications: protectedProcedure
    .input(z.object({ limit: z.number().optional().default(50) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      // Get user's subscription IDs
      const subs = await db.select({ id: daTrackerWebhookSubscriptions.id })
        .from(daTrackerWebhookSubscriptions)
        .where(and(
          eq(daTrackerWebhookSubscriptions.tenantId, ctx.tenant!.id),
          eq(daTrackerWebhookSubscriptions.userId, ctx.user.id),
        ));

      if (subs.length === 0) return [];

      const subIds = subs.map((s: any) => s.id);
      return db.select()
        .from(daTrackerWebhookDeliveries)
        .where(and(
          inArray(daTrackerWebhookDeliveries.subscriptionId, subIds),
          eq(daTrackerWebhookDeliveries.tenantId, ctx.tenant!.id),
          eq(daTrackerWebhookDeliveries.status, "delivered"),
        ))
        .orderBy(desc(daTrackerWebhookDeliveries.createdAt))
        .limit(input.limit);
    }),

  // ─── Poll Logs (admin) ─────────────────────────────────────────────────────

  pollLogs: protectedProcedure
    .input(z.object({ limit: z.number().optional().default(20) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select()
        .from(daTrackerPollLog)
        .where(eq(daTrackerPollLog.tenantId, ctx.tenant!.id))
        .orderBy(desc(daTrackerPollLog.startedAt))
        .limit(input.limit);
    }),
});
