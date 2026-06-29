import { eq } from "drizzle-orm";
import { inboxAddresses, tenantIntegrationSettings, tenants } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { getDb } from "./db";

function titleCase(value: string) {
  return value
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function mailboxModule(address: string) {
  const local = address.split("@")[0].toLowerCase();
  if (local.includes("design")) return "sales";
  if (local.includes("approval")) return "approvals";
  if (local.includes("build")) return "construction";
  if (local.includes("support")) return "support";
  return "admin";
}

function mailboxDisplayName(address: string) {
  const local = address.split("@")[0].toLowerCase();
  if (local === "office") return "Office";
  if (local === "designteam") return "Design Team";
  if (local === "approvals") return "Approvals";
  if (local === "build") return "Build";
  if (local === "support") return "Support";
  return titleCase(local);
}

function publicHost() {
  try {
    return ENV.publicAppUrl ? new URL(ENV.publicAppUrl).host : null;
  } catch {
    return null;
  }
}

function rootCause(error: unknown): { code?: string } | null {
  let current = error;
  while (current && typeof current === "object" && "cause" in current) {
    const cause = (current as { cause?: unknown }).cause;
    if (!cause || cause === current) break;
    current = cause;
  }
  return current && typeof current === "object" ? current as { code?: string } : null;
}

export async function bootstrapO365MailboxesFromEnv() {
  const mailboxes = ENV.msGraphMailboxes
    .map(address => address.toLowerCase())
    .filter(address => address.includes("@"));

  if (mailboxes.length === 0) return;

  try {
    const db = await getDb();
    if (!db) {
      console.warn("[O365 Bootstrap] Database unavailable; shared mailboxes were not seeded");
      return;
    }

    const tenantSlug = ENV.defaultTenantSlug || "default";
    const tenantName = process.env.DEFAULT_TENANT_NAME || "Commisso Group";
    const tenantDomain = process.env.DEFAULT_TENANT_DOMAIN || publicHost();

    await db.insert(tenants)
      .values({
        slug: tenantSlug,
        name: tenantName,
        status: "active",
        primaryDomain: tenantDomain,
        allowedOrigins: ENV.publicAppUrl ? [ENV.publicAppUrl] : [],
      })
      .onDuplicateKeyUpdate({
        set: {
          name: tenantName,
          status: "active",
          primaryDomain: tenantDomain,
          allowedOrigins: ENV.publicAppUrl ? [ENV.publicAppUrl] : [],
          updatedAt: new Date(),
        },
      });

    const [tenant] = await db.select()
      .from(tenants)
      .where(eq(tenants.slug, tenantSlug))
      .limit(1);

    if (!tenant) {
      console.warn(`[O365 Bootstrap] Tenant ${tenantSlug} could not be resolved`);
      return;
    }

    await db.insert(tenantIntegrationSettings)
      .values({
        tenantId: tenant.id,
        service: "email",
        enabled: true,
        config: {
          senderAddress: ENV.emailSenderAddress,
          senderName: ENV.emailSenderName,
          replyTo: ENV.emailReplyTo,
        },
      })
      .onDuplicateKeyUpdate({
        set: {
          enabled: true,
          config: {
            senderAddress: ENV.emailSenderAddress,
            senderName: ENV.emailSenderName,
            replyTo: ENV.emailReplyTo,
          },
          updatedAt: new Date(),
        },
      });

    for (let index = 0; index < mailboxes.length; index += 1) {
      const address = mailboxes[index];
      await db.insert(inboxAddresses)
        .values({
          tenantId: tenant.id,
          address,
          displayName: mailboxDisplayName(address),
          description: "Microsoft 365 shared mailbox",
          provider: "msgraph",
          module: mailboxModule(address),
          active: true,
          sortOrder: index + 1,
        })
        .onDuplicateKeyUpdate({
          set: {
            tenantId: tenant.id,
            displayName: mailboxDisplayName(address),
            description: "Microsoft 365 shared mailbox",
            provider: "msgraph",
            module: mailboxModule(address),
            active: true,
            sortOrder: index + 1,
            updatedAt: new Date(),
          },
        });
    }

    console.info(`[O365 Bootstrap] Seeded ${mailboxes.length} Microsoft 365 mailbox(es) for tenant ${tenantSlug}`);
  } catch (error) {
    const cause = rootCause(error);
    if (!ENV.isProduction && (cause?.code === "ECONNREFUSED" || cause?.code === "ENOTFOUND")) {
      console.warn(
        `[O365 Bootstrap] Shared mailbox bootstrap skipped: database is not reachable (${cause.code}). ` +
        "Set DATABASE_URL/MYSQL_PUBLIC_URL or start local MySQL for DB-backed features."
      );
      return;
    }
    console.warn("[O365 Bootstrap] Shared mailbox bootstrap failed", error);
  }
}
