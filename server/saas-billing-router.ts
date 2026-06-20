import { TRPCError } from "@trpc/server";
import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  saasAdminAuditLog,
  saasBillingEvents,
  saasBillingPlans,
  saasBillingSubscriptions,
  saasTenantBillingAccounts,
  tenants,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { router, sensitiveSuperAdminProcedure, superAdminProcedure } from "./_core/trpc";
import { getDb } from "./db";

const planStatusSchema = z.enum(["draft", "active", "archived"]);
const billingModelSchema = z.enum(["flat", "seat", "usage", "hybrid", "manual"]);
const billingIntervalSchema = z.enum(["month", "year", "custom"]);
const providerSchema = z.enum(["stripe", "xero", "manual"]);
const accountStatusSchema = z.enum(["trialing", "active", "past_due", "suspended", "cancelled", "manual"]);
const subscriptionStatusSchema = z.enum(["trialing", "active", "paused", "past_due", "cancelled", "expired"]);
const reconcileStatusSchema = z.enum(["unknown", "ok", "attention", "failed"]);
const eventStatusSchema = z.enum(["received", "processed", "failed", "ignored"]);
const eventSeveritySchema = z.enum(["info", "warning", "critical"]);

const planInputSchema = z.object({
  code: z.string().min(2).max(80).regex(/^[a-z0-9_.-]+$/),
  name: z.string().min(1).max(160),
  description: z.string().max(2000).nullable().optional(),
  status: planStatusSchema.default("draft"),
  billingModel: billingModelSchema.default("hybrid"),
  interval: billingIntervalSchema.default("month"),
  basePriceCents: z.number().int().min(0).default(0),
  includedSeats: z.number().int().min(0).default(0),
  includedUsage: z.record(z.string(), z.number()).nullable().optional(),
  overageRates: z.record(z.string(), z.number()).nullable().optional(),
  modules: z.array(z.string().min(1).max(80)).nullable().optional(),
  limits: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  stripeProductId: z.string().max(255).nullable().optional(),
  stripePriceId: z.string().max(255).nullable().optional(),
});

const accountInputSchema = z.object({
  legalName: z.string().max(255).nullable().optional(),
  billingEmail: z.string().email().max(320).nullable().optional(),
  billingOwnerUserId: z.number().int().nullable().optional(),
  currency: z.string().length(3).default("AUD"),
  taxId: z.string().max(80).nullable().optional(),
  paymentProvider: providerSchema.default("manual"),
  providerCustomerId: z.string().max(255).nullable().optional(),
  status: accountStatusSchema.default("manual"),
  trialEndsAt: z.coerce.date().nullable().optional(),
  nextInvoiceAt: z.coerce.date().nullable().optional(),
  reconcileStatus: reconcileStatusSchema.default("unknown"),
  reconcileNotes: z.string().max(5000).nullable().optional(),
  lastSyncedAt: z.coerce.date().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

const subscriptionInputSchema = z.object({
  id: z.number().int().optional(),
  planId: z.number().int().nullable().optional(),
  status: subscriptionStatusSchema.default("trialing"),
  seatQuantity: z.number().int().min(0).default(0),
  usageQuantity: z.number().int().min(0).default(0),
  billingModelOverride: billingModelSchema.nullable().optional(),
  unitAmountCents: z.number().int().min(0).nullable().optional(),
  mrrCents: z.number().int().min(0).default(0),
  provider: providerSchema.default("manual"),
  providerSubscriptionId: z.string().max(255).nullable().optional(),
  providerPriceId: z.string().max(255).nullable().optional(),
  providerStatus: z.string().max(80).nullable().optional(),
  currentPeriodStart: z.coerce.date().nullable().optional(),
  currentPeriodEnd: z.coerce.date().nullable().optional(),
  cancelAtPeriodEnd: z.boolean().default(false),
  cancelledAt: z.coerce.date().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  reconcileStatus: reconcileStatusSchema.default("unknown"),
  reconcileNotes: z.string().max(5000).nullable().optional(),
  lastSyncedAt: z.coerce.date().nullable().optional(),
});

type AuditContext = {
  user: { id: number; name: string | null } | null;
};

function normalizePlanCode(code: string) {
  return code.trim().toLowerCase();
}

function definedPatch<T extends Record<string, any>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;
}

function requireAuditUser(ctx: AuditContext) {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required for billing audit" });
  }
  return ctx.user;
}

async function writeAudit(args: {
  ctx: AuditContext;
  tenantId?: number | null;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  before?: Record<string, any> | null;
  after?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
}) {
  const db = await getDb();
  if (!db) return;
  const actor = requireAuditUser(args.ctx);
  await db.insert(saasAdminAuditLog).values({
    tenantId: args.tenantId ?? null,
    actorUserId: actor.id,
    actorUserName: actor.name ?? null,
    action: args.action,
    entityType: args.entityType,
    entityId: args.entityId == null ? null : String(args.entityId),
    beforeJson: args.before ?? null,
    afterJson: args.after ?? null,
    metadata: args.metadata ?? null,
  } as any);
}

function billingHealth(account: any | null, subscription: any | null) {
  if (!account) return { state: "attention", reason: "Billing account not configured" };
  if (account.reconcileStatus === "failed") return { state: "blocked", reason: "Billing account reconciliation failed" };
  if (account.status === "past_due" || account.status === "suspended") return { state: "blocked", reason: `Account is ${account.status.replace(/_/g, " ")}` };
  if (!subscription) return { state: "attention", reason: "No active SaaS subscription configured" };
  if (subscription.reconcileStatus === "failed") return { state: "blocked", reason: "Subscription reconciliation failed" };
  if (subscription.status === "past_due" || subscription.status === "expired") return { state: "blocked", reason: `Subscription is ${subscription.status.replace(/_/g, " ")}` };
  if (account.reconcileStatus !== "ok" || subscription.reconcileStatus !== "ok") return { state: "attention", reason: "Reconciliation needs review" };
  return { state: "ok", reason: "Billing is configured and reconciled" };
}

export const saasBillingRouter = router({
  diagnostics: superAdminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    const [tenantCount] = await db.select({ count: sql<number>`count(*)` }).from(tenants);
    const [planCount] = await db.select({ count: sql<number>`count(*)` }).from(saasBillingPlans);
    const [activeSubCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(saasBillingSubscriptions)
      .where(eq(saasBillingSubscriptions.status, "active"));
    const [failedEventCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(saasBillingEvents)
      .where(eq(saasBillingEvents.status, "failed"));
    const [unreconciledAccounts] = await db
      .select({ count: sql<number>`count(*)` })
      .from(saasTenantBillingAccounts)
      .where(or(
        eq(saasTenantBillingAccounts.reconcileStatus, "unknown"),
        eq(saasTenantBillingAccounts.reconcileStatus, "attention"),
        eq(saasTenantBillingAccounts.reconcileStatus, "failed"),
      ));
    const [mrr] = await db
      .select({ total: sql<number>`coalesce(sum(${saasBillingSubscriptions.mrrCents}), 0)` })
      .from(saasBillingSubscriptions)
      .where(eq(saasBillingSubscriptions.status, "active"));

    return {
      tenantCount: Number(tenantCount?.count || 0),
      planCount: Number(planCount?.count || 0),
      activeSubscriptionCount: Number(activeSubCount?.count || 0),
      failedEventCount: Number(failedEventCount?.count || 0),
      unreconciledAccountCount: Number(unreconciledAccounts?.count || 0),
      monthlyRecurringRevenueCents: Number(mrr?.total || 0),
      stripeConfigured: !!ENV.stripeSecretKey,
      webhookConfigured: !!ENV.stripeWebhookSecret,
    };
  }),

  listPlans: superAdminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    return db.select().from(saasBillingPlans).orderBy(desc(saasBillingPlans.updatedAt));
  }),

  createPlan: sensitiveSuperAdminProcedure
    .input(planInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const actor = requireAuditUser(ctx);

      const [result] = await db.insert(saasBillingPlans).values({
        ...input,
        code: normalizePlanCode(input.code),
        createdBy: actor.id,
        createdByName: actor.name ?? null,
      } as any);
      const id = Number((result as any).insertId);
      const [created] = await db.select().from(saasBillingPlans).where(eq(saasBillingPlans.id, id)).limit(1);
      await writeAudit({ ctx, action: "billing_plan_create", entityType: "saas_billing_plan", entityId: id, after: created as any });
      return created;
    }),

  updatePlan: sensitiveSuperAdminProcedure
    .input(planInputSchema.partial().extend({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [before] = await db.select().from(saasBillingPlans).where(eq(saasBillingPlans.id, input.id)).limit(1);
      if (!before) throw new TRPCError({ code: "NOT_FOUND", message: "Billing plan not found" });

      const { id, ...data } = input;
      const patch = definedPatch({
        ...data,
        code: data.code ? normalizePlanCode(data.code) : undefined,
        updatedAt: new Date(),
      } as any);
      await db.update(saasBillingPlans).set(patch as any).where(eq(saasBillingPlans.id, id));
      const [after] = await db.select().from(saasBillingPlans).where(eq(saasBillingPlans.id, id)).limit(1);
      await writeAudit({ ctx, action: "billing_plan_update", entityType: "saas_billing_plan", entityId: id, before: before as any, after: after as any });
      return after;
    }),

  listTenantBilling: superAdminProcedure
    .input(z.object({
      search: z.string().max(120).optional(),
      health: z.enum(["all", "ok", "attention", "blocked"]).default("all"),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const tenantConditions = input?.search
        ? or(
          like(tenants.name, `%${input.search}%`),
          like(tenants.slug, `%${input.search}%`),
          like(tenants.primaryDomain, `%${input.search}%`),
        )
        : undefined;
      const tenantRows = await db.select().from(tenants).where(tenantConditions).orderBy(tenants.name);
      const accounts = await db.select().from(saasTenantBillingAccounts);
      const subscriptions = await db.select().from(saasBillingSubscriptions).orderBy(desc(saasBillingSubscriptions.updatedAt));
      const plans = await db.select().from(saasBillingPlans);

      const accountByTenant = new Map(accounts.map(account => [account.tenantId, account]));
      const planById = new Map(plans.map(plan => [plan.id, plan]));
      const subscriptionByTenant = new Map<number, any>();
      for (const subscription of subscriptions) {
        if (!subscriptionByTenant.has(subscription.tenantId)) subscriptionByTenant.set(subscription.tenantId, subscription);
      }

      const rows = tenantRows.map((tenant) => {
        const account = accountByTenant.get(tenant.id) || null;
        const subscription = subscriptionByTenant.get(tenant.id) || null;
        const plan = subscription?.planId ? planById.get(subscription.planId) || null : null;
        const health = billingHealth(account, subscription);
        return { tenant, account, subscription, plan, health };
      });

      return input?.health && input.health !== "all"
        ? rows.filter(row => row.health.state === input.health)
        : rows;
    }),

  upsertTenantBilling: sensitiveSuperAdminProcedure
    .input(z.object({
      tenantId: z.number().int(),
      account: accountInputSchema,
      subscription: subscriptionInputSchema.nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, input.tenantId)).limit(1);
      if (!tenant) throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" });

      const [beforeAccount] = await db
        .select()
        .from(saasTenantBillingAccounts)
        .where(eq(saasTenantBillingAccounts.tenantId, input.tenantId))
        .limit(1);
      await db.insert(saasTenantBillingAccounts)
        .values({ tenantId: input.tenantId, ...input.account } as any)
        .onDuplicateKeyUpdate({
          set: {
            ...input.account,
            updatedAt: new Date(),
          } as any,
        });
      const [account] = await db
        .select()
        .from(saasTenantBillingAccounts)
        .where(eq(saasTenantBillingAccounts.tenantId, input.tenantId))
        .limit(1);
      await writeAudit({
        ctx,
        tenantId: input.tenantId,
        action: beforeAccount ? "billing_account_update" : "billing_account_create",
        entityType: "saas_tenant_billing_account",
        entityId: account?.id,
        before: beforeAccount as any,
        after: account as any,
      });

      let subscription: any = null;
      if (input.subscription) {
        if (input.subscription.id) {
          const [beforeSub] = await db
            .select()
            .from(saasBillingSubscriptions)
            .where(and(
              eq(saasBillingSubscriptions.id, input.subscription.id),
              eq(saasBillingSubscriptions.tenantId, input.tenantId),
            ))
            .limit(1);
          if (!beforeSub) throw new TRPCError({ code: "NOT_FOUND", message: "Subscription not found for tenant" });
          const { id, ...subData } = input.subscription;
          await db.update(saasBillingSubscriptions)
            .set({ ...subData, billingAccountId: account.id, updatedAt: new Date() } as any)
            .where(eq(saasBillingSubscriptions.id, id));
          [subscription] = await db.select().from(saasBillingSubscriptions).where(eq(saasBillingSubscriptions.id, id)).limit(1);
          await writeAudit({
            ctx,
            tenantId: input.tenantId,
            action: "billing_subscription_update",
            entityType: "saas_billing_subscription",
            entityId: id,
            before: beforeSub as any,
            after: subscription as any,
          });
        } else {
          const [result] = await db.insert(saasBillingSubscriptions).values({
            tenantId: input.tenantId,
            billingAccountId: account.id,
            ...input.subscription,
          } as any);
          const id = Number((result as any).insertId);
          [subscription] = await db.select().from(saasBillingSubscriptions).where(eq(saasBillingSubscriptions.id, id)).limit(1);
          await writeAudit({
            ctx,
            tenantId: input.tenantId,
            action: "billing_subscription_create",
            entityType: "saas_billing_subscription",
            entityId: id,
            after: subscription as any,
          });
        }
      }

      return { tenant, account, subscription };
    }),

  listEvents: superAdminProcedure
    .input(z.object({
      tenantId: z.number().int().optional(),
      status: eventStatusSchema.optional(),
      severity: eventSeveritySchema.optional(),
      search: z.string().max(160).optional(),
      limit: z.number().int().min(1).max(200).default(50),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const conditions: any[] = [];
      if (input?.tenantId) conditions.push(eq(saasBillingEvents.tenantId, input.tenantId));
      if (input?.status) conditions.push(eq(saasBillingEvents.status, input.status));
      if (input?.severity) conditions.push(eq(saasBillingEvents.severity, input.severity));
      if (input?.search) {
        conditions.push(or(
          like(saasBillingEvents.eventType, `%${input.search}%`),
          like(saasBillingEvents.providerEventId, `%${input.search}%`),
          like(saasBillingEvents.errorMessage, `%${input.search}%`),
        ));
      }
      return db.select()
        .from(saasBillingEvents)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(saasBillingEvents.receivedAt))
        .limit(input?.limit ?? 50);
    }),

  updateEventStatus: sensitiveSuperAdminProcedure
    .input(z.object({
      id: z.number().int(),
      status: eventStatusSchema,
      errorMessage: z.string().max(5000).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [before] = await db.select().from(saasBillingEvents).where(eq(saasBillingEvents.id, input.id)).limit(1);
      if (!before) throw new TRPCError({ code: "NOT_FOUND", message: "Billing event not found" });
      await db.update(saasBillingEvents).set({
        status: input.status,
        errorMessage: input.errorMessage ?? before.errorMessage,
        processedAt: input.status === "processed" || input.status === "ignored" ? new Date() : before.processedAt,
      } as any).where(eq(saasBillingEvents.id, input.id));
      const [after] = await db.select().from(saasBillingEvents).where(eq(saasBillingEvents.id, input.id)).limit(1);
      await writeAudit({
        ctx,
        tenantId: before.tenantId,
        action: "billing_event_status_update",
        entityType: "saas_billing_event",
        entityId: input.id,
        before: before as any,
        after: after as any,
      });
      return after;
    }),

  auditLog: superAdminProcedure
    .input(z.object({
      tenantId: z.number().int().optional(),
      entityType: z.string().max(80).optional(),
      limit: z.number().int().min(1).max(200).default(50),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const conditions: any[] = [];
      if (input?.tenantId) conditions.push(eq(saasAdminAuditLog.tenantId, input.tenantId));
      if (input?.entityType) conditions.push(eq(saasAdminAuditLog.entityType, input.entityType));
      return db.select()
        .from(saasAdminAuditLog)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(saasAdminAuditLog.createdAt))
        .limit(input?.limit ?? 50);
    }),
});
