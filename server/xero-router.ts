import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router, tenantAdminProcedure } from "./_core/trpc";
import { getDb } from "./db";
import {
  xeroConnections,
  xeroEntityDefaults,
  xeroRoutingRules,
  xeroContactMappings,
  xeroInvoiceMappings,
  xeroProjectMappings,
  xeroAccountingTransactions,
  xeroSyncLogs,
  xeroWebhookEvents,
  constructionJobs,
  crmLeads,
} from "../drizzle/schema";
import { eq, and, asc, desc, isNull, or, ne } from "drizzle-orm";
import {
  getXeroAuthUrl,
  exchangeCodeForTokens,
  getXeroTenants,
  revokeXeroToken,
  disconnectXeroTenant,
  getValidAccessToken,
  xeroApiRequest,
  getXeroContacts,
  createXeroContact,
  updateXeroContact,
  createXeroInvoice,
  getXeroInvoice,
  createXeroPurchaseOrder,
  type XeroContact,
  type XeroInvoice,
  type XeroPurchaseOrder,
  type XeroScopeProfile,
} from "./xero-client";
import { buildTrustedAppUrl } from "./_core/url";
import { ENV } from "./_core/env";
import { XERO_ENTITY_MODULE_LABELS, XERO_ENTITY_MODULES } from "./xero-entity-routing";
import {
  resolveXeroConnectionWithRules,
  XERO_ROUTING_FIELDS,
  XERO_ROUTING_OPERATORS,
} from "./xero-routing-rules";
import {
  createXeroContactReusingAccountNumber,
  findXeroContactByAccountNumber,
  updateXeroContactPreservingAccountNumber,
} from "./xero-contact-account-number";

const orgCache = new Map<string, { data: any; ts: number }>();

const routingConditionSchema = z.object({
  field: z.enum(XERO_ROUTING_FIELDS),
  operator: z.enum(XERO_ROUTING_OPERATORS),
  value: z.string().trim().min(1).max(255),
});

function getXeroRedirectUri(req: any, origin?: string) {
  return ENV.xeroRedirectUri || buildTrustedAppUrl(req, "/api/xero/callback", origin);
}

type XeroDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function connectionTenantScope(xeroTenantId: string, appTenantId: number | null) {
  const conditions: any[] = [eq(xeroConnections.tenantId, xeroTenantId)];
  if (appTenantId) {
    conditions.push(or(eq(xeroConnections.appTenantId, appTenantId), isNull(xeroConnections.appTenantId)));
  }
  return conditions;
}

async function reassignXeroConnectionReferences(
  db: XeroDb,
  fromConnectionId: number,
  toConnectionId: number,
  appTenantId: number | null,
  userId?: number | null,
) {
  const now = new Date();
  const defaultConditions: any[] = [eq(xeroEntityDefaults.xeroConnectionId, fromConnectionId)];
  const ruleConditions: any[] = [eq(xeroRoutingRules.targetXeroConnectionId, fromConnectionId)];
  if (appTenantId) {
    defaultConditions.push(eq(xeroEntityDefaults.appTenantId, appTenantId));
    ruleConditions.push(eq(xeroRoutingRules.appTenantId, appTenantId));
  }

  await db.update(xeroEntityDefaults)
    .set({ xeroConnectionId: toConnectionId, updatedBy: userId || null, updatedAt: now })
    .where(and(...defaultConditions));
  await db.update(xeroRoutingRules)
    .set({ targetXeroConnectionId: toConnectionId, updatedBy: userId || null, updatedAt: now })
    .where(and(...ruleConditions));
  await db.update(xeroContactMappings)
    .set({ xeroConnectionId: toConnectionId, updatedAt: now })
    .where(eq(xeroContactMappings.xeroConnectionId, fromConnectionId));
  await db.update(xeroInvoiceMappings)
    .set({ xeroConnectionId: toConnectionId, updatedAt: now })
    .where(eq(xeroInvoiceMappings.xeroConnectionId, fromConnectionId));
  await db.update(xeroProjectMappings)
    .set({ xeroConnectionId: toConnectionId, updatedAt: now })
    .where(eq(xeroProjectMappings.xeroConnectionId, fromConnectionId));
  await db.update(xeroAccountingTransactions)
    .set({ xeroConnectionId: toConnectionId, updatedAt: now })
    .where(eq(xeroAccountingTransactions.xeroConnectionId, fromConnectionId));
  await db.update(xeroSyncLogs)
    .set({ xeroConnectionId: toConnectionId })
    .where(eq(xeroSyncLogs.xeroConnectionId, fromConnectionId));
  await db.update(xeroWebhookEvents)
    .set({ xeroConnectionId: toConnectionId })
    .where(eq(xeroWebhookEvents.xeroConnectionId, fromConnectionId));
}

async function clearXeroConnectionAssignments(
  db: XeroDb,
  connectionId: number,
  appTenantId: number,
  userId?: number | null,
) {
  await db.update(xeroEntityDefaults)
    .set({ xeroConnectionId: null, updatedBy: userId || null, updatedAt: new Date() })
    .where(and(
      eq(xeroEntityDefaults.appTenantId, appTenantId),
      eq(xeroEntityDefaults.xeroConnectionId, connectionId),
    ));
  await db.delete(xeroRoutingRules)
    .where(and(
      eq(xeroRoutingRules.appTenantId, appTenantId),
      eq(xeroRoutingRules.targetXeroConnectionId, connectionId),
    ));
}

export const xeroRouter = router({
  // ─── Connection Management ──────────────────────────────────────────────────

  /** Get the current Xero connection status */
  connectionStatus: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { connected: false, connections: [] };

    const conditions: any[] = [eq(xeroConnections.isActive, true)];
    if (ctx.tenant?.id) {
      conditions.push(or(eq(xeroConnections.appTenantId, ctx.tenant.id), isNull(xeroConnections.appTenantId)));
    }

    const connections = await db.select().from(xeroConnections)
      .where(and(...conditions))
      .orderBy(desc(xeroConnections.createdAt));

    return {
      connected: connections.length > 0,
      connections: connections.map(c => ({
        id: c.id,
        tenantId: c.tenantId,
        tenantName: c.tenantName,
        tenantType: c.tenantType,
        tokenExpiresAt: c.tokenExpiresAt,
        isActive: c.isActive,
        createdAt: c.createdAt,
      })),
    };
  }),

  /** Admin view of connected Xero entities and module defaults */
  entityConfig: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db || !ctx.tenant?.id) {
      return { modules: [], connections: [], defaults: [] };
    }

    const conditions: any[] = [];
    conditions.push(or(eq(xeroConnections.appTenantId, ctx.tenant.id), isNull(xeroConnections.appTenantId)));

    const [connections, defaults] = await Promise.all([
      db.select().from(xeroConnections)
        .where(and(...conditions))
        .orderBy(desc(xeroConnections.isActive), desc(xeroConnections.createdAt)),
      db.select().from(xeroEntityDefaults)
        .where(eq(xeroEntityDefaults.appTenantId, ctx.tenant.id)),
    ]);

    return {
      modules: XERO_ENTITY_MODULES.map((key) => ({
        key,
        label: XERO_ENTITY_MODULE_LABELS[key],
      })),
      connections: connections.map((c) => ({
        id: c.id,
        tenantId: c.tenantId,
        tenantName: c.tenantName,
        tenantType: c.tenantType,
        tokenExpiresAt: c.tokenExpiresAt,
        isActive: c.isActive,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
      defaults: defaults.map((d) => ({
        id: d.id,
        moduleKey: d.moduleKey,
        xeroConnectionId: d.xeroConnectionId,
        updatedAt: d.updatedAt,
      })),
    };
  }),

  setEntityDefault: tenantAdminProcedure
    .input(z.object({
      moduleKey: z.enum(XERO_ENTITY_MODULES),
      connectionId: z.number().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = ctx.tenant?.id;
      const userId = ctx.user?.id;
      if (!tenantId || !userId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "A valid tenant context is required." });
      }

      if (input.connectionId !== null) {
        const [connection] = await db.select().from(xeroConnections)
          .where(and(
            eq(xeroConnections.id, input.connectionId),
            eq(xeroConnections.isActive, true),
            or(eq(xeroConnections.appTenantId, tenantId), isNull(xeroConnections.appTenantId)),
          ))
          .limit(1);
        if (!connection) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active Xero entity for this tenant." });
        }
      }

      await db.insert(xeroEntityDefaults)
        .values({
          appTenantId: tenantId,
          moduleKey: input.moduleKey,
          xeroConnectionId: input.connectionId,
          updatedBy: userId,
        })
        .onDuplicateKeyUpdate({
          set: {
            xeroConnectionId: input.connectionId,
            updatedBy: userId,
            updatedAt: new Date(),
          },
        });

      return { success: true };
    }),

  setConnectionActive: tenantAdminProcedure
    .input(z.object({
      connectionId: z.number(),
      isActive: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = ctx.tenant?.id;
      const userId = ctx.user?.id;
      if (!tenantId || !userId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "A valid tenant context is required." });
      }

      const [connection] = await db.select().from(xeroConnections)
        .where(and(
          eq(xeroConnections.id, input.connectionId),
          or(eq(xeroConnections.appTenantId, tenantId), isNull(xeroConnections.appTenantId)),
        ))
        .limit(1);

      if (!connection) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Xero connection not found" });
      }

      if (input.isActive) {
        const duplicateConditions = [
          ...connectionTenantScope(connection.tenantId, tenantId),
          ne(xeroConnections.id, input.connectionId),
        ];
        const duplicates = await db.select().from(xeroConnections)
          .where(and(...duplicateConditions));

        for (const duplicate of duplicates) {
          await reassignXeroConnectionReferences(db, duplicate.id, input.connectionId, tenantId, userId);
        }

        await db.update(xeroConnections)
          .set({ isActive: false, updatedAt: new Date() })
          .where(and(...duplicateConditions));
      }

      await db.update(xeroConnections)
        .set({ isActive: input.isActive, updatedAt: new Date() })
        .where(eq(xeroConnections.id, input.connectionId));

      if (!input.isActive) {
        await clearXeroConnectionAssignments(db, input.connectionId, tenantId, userId);
      }

      return { success: true };
    }),

  deleteConnection: tenantAdminProcedure
    .input(z.object({ connectionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = ctx.tenant?.id;
      const userId = ctx.user?.id;
      if (!tenantId || !userId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "A valid tenant context is required." });
      }

      const [connection] = await db.select().from(xeroConnections)
        .where(and(
          eq(xeroConnections.id, input.connectionId),
          or(eq(xeroConnections.appTenantId, tenantId), isNull(xeroConnections.appTenantId)),
        ))
        .limit(1);

      if (!connection) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Xero connection not found" });
      }
      if (connection.isActive) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Turn this Xero entity off before deleting it." });
      }

      const [replacement] = await db.select().from(xeroConnections)
        .where(and(
          ...connectionTenantScope(connection.tenantId, tenantId),
          ne(xeroConnections.id, input.connectionId),
          eq(xeroConnections.isActive, true),
        ))
        .orderBy(desc(xeroConnections.updatedAt), desc(xeroConnections.createdAt))
        .limit(1);

      if (replacement) {
        await reassignXeroConnectionReferences(db, input.connectionId, replacement.id, tenantId, userId);
      } else {
        await clearXeroConnectionAssignments(db, input.connectionId, tenantId, userId);
      }

      await db.delete(xeroConnections)
        .where(and(
          eq(xeroConnections.id, input.connectionId),
          or(eq(xeroConnections.appTenantId, tenantId), isNull(xeroConnections.appTenantId)),
        ));

      return {
        success: true,
        reassignedTo: replacement ? {
          id: replacement.id,
          tenantName: replacement.tenantName,
        } : null,
      };
    }),

  routingRules: tenantAdminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db || !ctx.tenant?.id) {
      return { fields: XERO_ROUTING_FIELDS, operators: XERO_ROUTING_OPERATORS, rules: [] };
    }

    const rows = await db
      .select({ rule: xeroRoutingRules, target: xeroConnections })
      .from(xeroRoutingRules)
      .leftJoin(xeroConnections, eq(xeroRoutingRules.targetXeroConnectionId, xeroConnections.id))
      .where(eq(xeroRoutingRules.appTenantId, ctx.tenant.id))
      .orderBy(asc(xeroRoutingRules.priority), asc(xeroRoutingRules.id));

    return {
      fields: XERO_ROUTING_FIELDS,
      operators: XERO_ROUTING_OPERATORS,
      rules: rows.map((row) => ({
        ...row.rule,
        conditions: Array.isArray(row.rule.conditions) ? row.rule.conditions : [],
        targetConnection: row.target ? {
          id: row.target.id,
          tenantName: row.target.tenantName,
          tenantId: row.target.tenantId,
          isActive: row.target.isActive,
        } : null,
      })),
    };
  }),

  saveRoutingRule: tenantAdminProcedure
    .input(z.object({
      id: z.number().optional(),
      name: z.string().trim().min(1).max(255),
      moduleKey: z.enum(XERO_ENTITY_MODULES),
      targetXeroConnectionId: z.number(),
      priority: z.number().int().min(1).max(10000).default(100),
      isActive: z.boolean().default(true),
      conditions: z.array(routingConditionSchema).max(8).default([]),
      notes: z.string().trim().max(1000).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = ctx.tenant?.id;
      const userId = ctx.user?.id;
      if (!tenantId || !userId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "A valid tenant context is required." });
      }

      const [connection] = await db.select().from(xeroConnections)
        .where(and(
          eq(xeroConnections.id, input.targetXeroConnectionId),
          eq(xeroConnections.isActive, true),
          or(eq(xeroConnections.appTenantId, tenantId), isNull(xeroConnections.appTenantId)),
        ))
        .limit(1);
      if (!connection) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active Xero entity for this tenant." });
      }

      const values = {
        appTenantId: tenantId,
        name: input.name,
        moduleKey: input.moduleKey,
        targetXeroConnectionId: input.targetXeroConnectionId,
        priority: input.priority,
        isActive: input.isActive,
        conditions: input.conditions,
        notes: input.notes || null,
        updatedBy: userId,
        updatedAt: new Date(),
      };

      if (input.id) {
        await db.update(xeroRoutingRules)
          .set(values)
          .where(and(
            eq(xeroRoutingRules.id, input.id),
            eq(xeroRoutingRules.appTenantId, tenantId),
          ));
        return { success: true, id: input.id };
      }

      const [created] = await db.insert(xeroRoutingRules)
        .values({
          ...values,
          createdBy: userId,
        })
        .$returningId();
      return { success: true, id: created.id };
    }),

  deleteRoutingRule: tenantAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db || !ctx.tenant?.id) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db.delete(xeroRoutingRules)
        .where(and(
          eq(xeroRoutingRules.id, input.id),
          eq(xeroRoutingRules.appTenantId, ctx.tenant.id),
        ));
      return { success: true };
    }),

  dryRunRouting: tenantAdminProcedure
    .input(z.object({
      moduleKey: z.enum(XERO_ENTITY_MODULES),
      context: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      if (!ctx.tenant?.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "A valid tenant context is required." });
      }

      const result = await resolveXeroConnectionWithRules(db, {
        appTenantId: ctx.tenant.id,
        moduleKey: input.moduleKey,
        context: input.context || {},
      });

      return {
        source: result.source,
        connection: result.connection ? {
          id: result.connection.id,
          tenantName: result.connection.tenantName,
          tenantId: result.connection.tenantId,
          isActive: result.connection.isActive,
        } : null,
        matchedRule: result.matchedRule ? {
          id: result.matchedRule.id,
          name: result.matchedRule.name,
          priority: result.matchedRule.priority,
          conditions: result.matchedRule.conditions || [],
        } : null,
      };
    }),

  /** Generate the Xero OAuth authorization URL */
  getAuthUrl: protectedProcedure
    .input(z.object({
      origin: z.string().optional(),
      scopeProfile: z.enum(["accounting_standard", "accounting_read", "sign_in_only"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const redirectUri = getXeroRedirectUri(ctx.req, input.origin);
      const state = crypto.randomUUID();
      const scopeProfile = input.scopeProfile as XeroScopeProfile | undefined;
      const authUrl = getXeroAuthUrl(redirectUri, state, scopeProfile);
      return { authUrl, state, scopeProfile: input.scopeProfile || "default" };
    }),

  /** Handle the OAuth callback - exchange code for tokens and store connection */
  handleCallback: protectedProcedure
    .input(z.object({
      code: z.string(),
      origin: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const redirectUri = getXeroRedirectUri(ctx.req, input.origin);

      // Exchange code for tokens
      const tokens = await exchangeCodeForTokens(input.code, redirectUri);
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

      // Get connected tenants
      const tenants = await getXeroTenants(tokens.access_token);

      if (tenants.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No Xero organisations were connected." });
      }

      // Store each tenant connection. Reconnecting the same Xero tenant updates
      // the existing row, including inactive rows, so duplicates do not build up.
      const results = [];
      const appTenantId = ctx.tenant?.id ?? null;
      for (const tenant of tenants) {
        const existingConditions = connectionTenantScope(tenant.tenantId, appTenantId);
        const [existing] = await db.select().from(xeroConnections)
          .where(and(...existingConditions))
          .orderBy(desc(xeroConnections.isActive), desc(xeroConnections.updatedAt), desc(xeroConnections.createdAt))
          .limit(1);

        if (existing) {
          const duplicateConditions = [
            ...existingConditions,
            ne(xeroConnections.id, existing.id),
          ];
          const duplicates = await db.select().from(xeroConnections)
            .where(and(...duplicateConditions));

          for (const duplicate of duplicates) {
            await reassignXeroConnectionReferences(db, duplicate.id, existing.id, appTenantId, ctx.user.id);
          }

          await db.update(xeroConnections)
            .set({ isActive: false, updatedAt: new Date() })
            .where(and(...duplicateConditions));

          // Update existing connection
          await db.update(xeroConnections)
            .set({
              appTenantId,
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token,
              tokenExpiresAt: expiresAt,
              tenantName: tenant.tenantName,
              tenantType: tenant.tenantType,
              connectionId: tenant.id,
              scopes: tokens.scope,
              isActive: true,
              updatedAt: new Date(),
            })
            .where(eq(xeroConnections.id, existing.id));
          results.push({ id: existing.id, tenantName: tenant.tenantName, updated: true, duplicatesMerged: duplicates.length });
        } else {
          // Create new connection
          const [inserted] = await db.insert(xeroConnections).values({
            appTenantId,
            userId: ctx.user.id,
            tenantId: tenant.tenantId,
            tenantName: tenant.tenantName,
            tenantType: tenant.tenantType,
            connectionId: tenant.id,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            tokenExpiresAt: expiresAt,
            scopes: tokens.scope,
          });
          results.push({ id: inserted.insertId, tenantName: tenant.tenantName, updated: false });
        }
      }

      return { success: true, tenants: results };
    }),

  /** Disconnect from Xero */
  disconnect: protectedProcedure
    .input(z.object({ connectionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const connectionConditions: any[] = [eq(xeroConnections.id, input.connectionId)];
      if (ctx.tenant?.id) {
        connectionConditions.push(or(eq(xeroConnections.appTenantId, ctx.tenant.id), isNull(xeroConnections.appTenantId)));
      }
      const [connection] = await db.select().from(xeroConnections)
        .where(and(...connectionConditions));

      if (!connection) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Connection not found" });
      }

      // Try to revoke the token and disconnect from Xero
      try {
        if (connection.connectionId) {
          await disconnectXeroTenant(connection.accessToken, connection.connectionId);
        }
        const otherGrantConditions: any[] = [
          ne(xeroConnections.id, input.connectionId),
          eq(xeroConnections.refreshToken, connection.refreshToken),
          eq(xeroConnections.isActive, true),
        ];
        if (ctx.tenant?.id) {
          otherGrantConditions.push(or(eq(xeroConnections.appTenantId, ctx.tenant.id), isNull(xeroConnections.appTenantId)));
        }
        const [otherGrantConnection] = await db.select({ id: xeroConnections.id }).from(xeroConnections)
          .where(and(...otherGrantConditions))
          .limit(1);
        if (!otherGrantConnection) {
          await revokeXeroToken(connection.refreshToken);
        }
      } catch (e) {
        // Continue even if revocation fails (token may already be expired)
      }

      // Mark as inactive locally
      await db.update(xeroConnections)
        .set({ isActive: false })
        .where(and(...connectionConditions));
      if (ctx.tenant?.id) {
        await clearXeroConnectionAssignments(db, input.connectionId, ctx.tenant.id, ctx.user?.id);
      } else {
        await db.update(xeroEntityDefaults)
          .set({ xeroConnectionId: null, updatedAt: new Date() })
          .where(eq(xeroEntityDefaults.xeroConnectionId, input.connectionId));
      }

      return { success: true };
    }),

  // ─── Contact Sync ───────────────────────────────────────────────────────────

  /** Sync a local lead/client to Xero as a contact */
  syncContact: protectedProcedure
    .input(z.object({
      localType: z.enum(["lead", "client"]),
      localId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const auth = await getValidAccessToken({ appTenantId: ctx.tenant?.id, moduleKey: "crm" });
      if (!auth) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active Xero connection" });
      const routing = { connectionId: auth.xeroConnectionId };

      // Get local record
      let contactData: Partial<XeroContact>;
      if (input.localType === "lead") {
        const [lead] = await db.select().from(crmLeads).where(eq(crmLeads.id, input.localId));
        if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" });
        contactData = {
          Name: `${lead.contactFirstName || ""} ${lead.contactLastName || ""}`.trim() || "Unknown",
          AccountNumber: lead.clientNumber || undefined,
          FirstName: lead.contactFirstName || undefined,
          LastName: lead.contactLastName || undefined,
          EmailAddress: lead.contactEmail || undefined,
          Phones: lead.contactPhone ? [{ PhoneType: "DEFAULT", PhoneNumber: lead.contactPhone }] : undefined,
          Addresses: lead.suburb ? [{
            AddressType: "STREET",
            AddressLine1: lead.contactAddress || undefined,
            City: lead.suburb || undefined,
            Region: lead.state || undefined,
            PostalCode: lead.postcode || undefined,
          }] : undefined,
        };
      } else {
        // Client = construction job
        const [job] = await db.select().from(constructionJobs).where(eq(constructionJobs.id, input.localId));
        if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Client/job not found" });
        
        // Try to get richer contact details from linked lead
        let leadEmail: string | undefined;
        let leadPhone: string | undefined;
        let leadFirstName: string | undefined;
        let leadLastName: string | undefined;
        let leadClientNumber: string | undefined;
        if (job.leadId) {
          const [lead] = await db.select().from(crmLeads).where(eq(crmLeads.id, job.leadId));
          if (lead) {
            leadEmail = lead.contactEmail || undefined;
            leadPhone = lead.contactPhone || undefined;
            leadFirstName = lead.contactFirstName || undefined;
            leadLastName = lead.contactLastName || undefined;
            leadClientNumber = lead.clientNumber || undefined;
          }
        }
        
        contactData = {
          Name: job.clientName || "Unknown",
          AccountNumber: leadClientNumber || job.quoteNumber || undefined,
          FirstName: leadFirstName,
          LastName: leadLastName,
          EmailAddress: leadEmail,
          Phones: leadPhone ? [{ PhoneType: "DEFAULT", PhoneNumber: leadPhone }] : undefined,
          Addresses: job.siteAddress ? [{
            AddressType: "STREET",
            AddressLine1: job.siteAddress,
          }] : undefined,
        };
      }

      // Check if we already have a mapping
      const [existingMapping] = await db.select().from(xeroContactMappings)
        .where(and(
          eq(xeroContactMappings.xeroConnectionId, auth.xeroConnectionId),
          eq(xeroContactMappings.localType, input.localType),
          eq(xeroContactMappings.localId, input.localId),
        ));

      let xeroContactId: string;
      let xeroContactName: string;
      const accountNumberContact = contactData.AccountNumber
        ? await findXeroContactByAccountNumber(contactData.AccountNumber, routing).catch(() => null)
        : null;

      if (existingMapping) {
        // Prefer the Xero contact that already owns the local account number.
        const result = await updateXeroContactPreservingAccountNumber(
          accountNumberContact?.ContactID || existingMapping.xeroContactId,
          contactData,
          routing,
        );
        xeroContactId = result.contact.ContactID;
        xeroContactName = result.contact.Name;

        await db.update(xeroContactMappings)
          .set({ xeroContactId, xeroContactName, lastSyncedAt: new Date() })
          .where(eq(xeroContactMappings.id, existingMapping.id));
      } else {
        const result = accountNumberContact
          ? await updateXeroContactPreservingAccountNumber(accountNumberContact.ContactID, contactData, routing)
          : await createXeroContactReusingAccountNumber(contactData, routing);
        xeroContactId = result.contact.ContactID;
        xeroContactName = result.contact.Name;

        await db.insert(xeroContactMappings).values({
          xeroConnectionId: auth.xeroConnectionId,
          localType: input.localType,
          localId: input.localId,
          xeroContactId,
          xeroContactName,
          lastSyncedAt: new Date(),
        });
      }

      return { success: true, xeroContactId, xeroContactName };
    }),

  /** Get contact mapping for a local record */
  getContactMapping: protectedProcedure
    .input(z.object({
      localType: z.enum(["lead", "client"]),
      localId: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;

      const auth = await getValidAccessToken({ appTenantId: ctx.tenant?.id, moduleKey: "crm" });
      if (!auth) return null;

      const [mapping] = await db.select().from(xeroContactMappings)
        .where(and(
          eq(xeroContactMappings.xeroConnectionId, auth.xeroConnectionId),
          eq(xeroContactMappings.localType, input.localType),
          eq(xeroContactMappings.localId, input.localId),
        ));

      return mapping || null;
    }),

  // ─── Invoicing ──────────────────────────────────────────────────────────────

  /** Create a progress claim invoice in Xero */
  createProgressInvoice: protectedProcedure
    .input(z.object({
      jobId: z.number(),
      description: z.string(),
      amount: z.number(),
      dueDate: z.string().optional(),
      reference: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const auth = await getValidAccessToken({ appTenantId: ctx.tenant?.id, moduleKey: "construction" });
      if (!auth) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active Xero connection" });
      const routing = { connectionId: auth.xeroConnectionId };

      // Get the job
      const [job] = await db.select().from(constructionJobs).where(eq(constructionJobs.id, input.jobId));
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });

      // Get or create Xero contact for this client
      const [contactMapping] = await db.select().from(xeroContactMappings)
        .where(and(
          eq(xeroContactMappings.xeroConnectionId, auth.xeroConnectionId),
          eq(xeroContactMappings.localType, "client"),
          eq(xeroContactMappings.localId, input.jobId),
        ));

      let xeroContactId: string;
      if (contactMapping) {
        xeroContactId = contactMapping.xeroContactId;
      } else {
        // Auto-create contact
        const result = await createXeroContact({
          Name: job.clientName || "Unknown Client",
          Addresses: job.siteAddress ? [{ AddressType: "STREET", AddressLine1: job.siteAddress }] : undefined,
        }, routing);
        xeroContactId = result.Contacts[0].ContactID;

        await db.insert(xeroContactMappings).values({
          xeroConnectionId: auth.xeroConnectionId,
          localType: "client",
          localId: input.jobId,
          xeroContactId,
          xeroContactName: result.Contacts[0].Name,
          lastSyncedAt: new Date(),
        });
      }

      // Create the invoice
      const invoice: Partial<XeroInvoice> = {
        Type: "ACCREC",
        Contact: { ContactID: xeroContactId },
        LineItems: [{
          Description: input.description,
          Quantity: 1,
          UnitAmount: input.amount,
        }],
        Reference: input.reference || `Job #${job.id} - ${job.clientName}`,
        DueDate: input.dueDate || undefined,
        Status: "DRAFT",
      };

      const result = await createXeroInvoice(invoice, routing);
      const createdInvoice = result.Invoices[0];

      // Store mapping
      await db.insert(xeroInvoiceMappings).values({
        xeroConnectionId: auth.xeroConnectionId,
        jobId: input.jobId,
        xeroInvoiceId: createdInvoice.InvoiceID!,
        xeroInvoiceNumber: createdInvoice.InvoiceNumber,
        invoiceType: "progress_claim",
        amount: input.amount.toFixed(2),
        status: createdInvoice.Status || "DRAFT",
        description: input.description,
        lastSyncedAt: new Date(),
      });

      return {
        success: true,
        invoiceId: createdInvoice.InvoiceID,
        invoiceNumber: createdInvoice.InvoiceNumber,
        status: createdInvoice.Status,
      };
    }),

  // ─── Purchase Orders ────────────────────────────────────────────────────────

  /** Create a purchase order in Xero */
  createPurchaseOrder: protectedProcedure
    .input(z.object({
      jobId: z.number(),
      supplierName: z.string(),
      supplierContactId: z.string().optional(),
      lineItems: z.array(z.object({
        description: z.string(),
        quantity: z.number(),
        unitAmount: z.number(),
      })),
      deliveryDate: z.string().optional(),
      reference: z.string().optional(),
      deliveryAddress: z.string().optional(),
      deliveryInstructions: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const auth = await getValidAccessToken({ appTenantId: ctx.tenant?.id, moduleKey: "construction" });
      if (!auth) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active Xero connection" });
      const routing = { connectionId: auth.xeroConnectionId };

      // Get or create supplier contact
      let supplierContactId = input.supplierContactId;
      if (!supplierContactId) {
        // Search for existing supplier by name
        const searchResult = await getXeroContacts({ where: `Name=="${input.supplierName}"` }, routing);
        if (searchResult.Contacts.length > 0) {
          supplierContactId = searchResult.Contacts[0].ContactID;
        } else {
          // Create supplier contact
          const result = await createXeroContact({
            Name: input.supplierName,
            IsSupplier: true,
          }, routing);
          supplierContactId = result.Contacts[0].ContactID;
        }
      }

      // Get job for reference
      const [job] = await db.select().from(constructionJobs).where(eq(constructionJobs.id, input.jobId));

      const po: Partial<XeroPurchaseOrder> = {
        Contact: { ContactID: supplierContactId },
        LineItems: input.lineItems.map(item => ({
          Description: item.description,
          Quantity: item.quantity,
          UnitAmount: item.unitAmount,
        })),
        Reference: input.reference || (job ? `Job #${job.id} - ${job.clientName}` : undefined),
        DeliveryDate: input.deliveryDate || undefined,
        DeliveryAddress: input.deliveryAddress || (job?.siteAddress || undefined),
        DeliveryInstructions: input.deliveryInstructions || undefined,
        Status: "DRAFT",
      };

      const result = await createXeroPurchaseOrder(po, routing);
      const createdPO = result.PurchaseOrders[0];

      // Store mapping
      const totalAmount = input.lineItems.reduce((sum, item) => sum + item.quantity * item.unitAmount, 0);
      await db.insert(xeroInvoiceMappings).values({
        xeroConnectionId: auth.xeroConnectionId,
        jobId: input.jobId,
        xeroInvoiceId: createdPO.PurchaseOrderID!,
        xeroInvoiceNumber: createdPO.PurchaseOrderNumber,
        invoiceType: "purchase_order",
        amount: totalAmount.toFixed(2),
        status: createdPO.Status || "DRAFT",
        description: `PO to ${input.supplierName}`,
        lastSyncedAt: new Date(),
      });

      return {
        success: true,
        purchaseOrderId: createdPO.PurchaseOrderID,
        purchaseOrderNumber: createdPO.PurchaseOrderNumber,
        status: createdPO.Status,
      };
    }),

  // ─── Invoice/PO Listing ─────────────────────────────────────────────────────

  /** Get all Xero invoices/POs for a job */
  getJobDocuments: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      const auth = await getValidAccessToken({ appTenantId: ctx.tenant?.id, moduleKey: "construction" });
      if (!auth) return [];

      const documents = await db.select().from(xeroInvoiceMappings)
        .where(and(
          eq(xeroInvoiceMappings.xeroConnectionId, auth.xeroConnectionId),
          eq(xeroInvoiceMappings.jobId, input.jobId),
        ))
        .orderBy(desc(xeroInvoiceMappings.createdAt));

      return documents;
    }),

  /** Refresh invoice/PO status from Xero */
  refreshDocumentStatus: protectedProcedure
    .input(z.object({ mappingId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [mapping] = await db.select().from(xeroInvoiceMappings)
        .where(eq(xeroInvoiceMappings.id, input.mappingId));

      if (!mapping) throw new TRPCError({ code: "NOT_FOUND", message: "Document mapping not found" });

      let status: string;
      let amount: string | undefined;

      if (mapping.invoiceType === "purchase_order") {
        const result = await xeroApiRequest<{ PurchaseOrders: XeroPurchaseOrder[] }>(`/PurchaseOrders/${mapping.xeroInvoiceId}`, {
          connectionId: mapping.xeroConnectionId,
          appTenantId: ctx.tenant?.id,
          moduleKey: "construction",
        });
        status = result.PurchaseOrders[0]?.Status || "UNKNOWN";
      } else {
        const result = await getXeroInvoice(mapping.xeroInvoiceId, {
          connectionId: mapping.xeroConnectionId,
          appTenantId: ctx.tenant?.id,
          moduleKey: "construction",
        });
        const inv = result.Invoices[0];
        status = inv?.Status || "UNKNOWN";
        amount = inv?.Total?.toFixed(2);
      }

      await db.update(xeroInvoiceMappings)
        .set({ status, amount: amount || mapping.amount, lastSyncedAt: new Date() })
        .where(eq(xeroInvoiceMappings.id, input.mappingId));

      return { success: true, status };
    }),

  /** Get Xero organisation info (for testing connection) */
  getOrganisation: protectedProcedure.query(async ({ ctx }) => {
    // Cache org info for 1 hour since it rarely changes
    const cacheKey = 'xero_org_info';
    const cached = orgCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < 3600000) {
      return cached.data;
    }
    try {
      const result = await xeroApiRequest<{ Organisations: Array<{ Name: string; LegalName: string; ShortCode: string }> }>("/Organisation", {
        timeoutMs: 10000,
        appTenantId: ctx.tenant?.id,
        moduleKey: "global",
      });
      const org = result.Organisations[0] || null;
      orgCache.set(cacheKey, { data: org, ts: Date.now() });
      return org;
    } catch {
      // Return cached data if available even if expired, otherwise null
      return cached?.data || null;
    }
  }),
});
