import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { xeroConnections, xeroContactMappings, xeroInvoiceMappings, constructionJobs, crmLeads } from "../drizzle/schema";
import { eq, and, desc, isNull, or } from "drizzle-orm";
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
} from "./xero-client";
import { buildTrustedAppUrl } from "./_core/url";

const orgCache = new Map<string, { data: any; ts: number }>();

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

  /** Generate the Xero OAuth authorization URL */
  getAuthUrl: protectedProcedure
    .input(z.object({ origin: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const redirectUri = buildTrustedAppUrl(ctx.req, "/api/xero/callback", input.origin);
      const state = crypto.randomUUID();
      const authUrl = getXeroAuthUrl(redirectUri, state);
      return { authUrl, state };
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

      const redirectUri = buildTrustedAppUrl(ctx.req, "/api/xero/callback", input.origin);

      // Exchange code for tokens
      const tokens = await exchangeCodeForTokens(input.code, redirectUri);
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

      // Get connected tenants
      const tenants = await getXeroTenants(tokens.access_token);

      if (tenants.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No Xero organisations were connected." });
      }

      // Store each tenant connection
      const results = [];
      const appTenantId = ctx.tenant?.id ?? null;
      for (const tenant of tenants) {
        // Check if this tenant already has an active connection
        const existingConditions: any[] = [
          eq(xeroConnections.tenantId, tenant.tenantId),
          eq(xeroConnections.isActive, true),
        ];
        if (appTenantId) {
          existingConditions.push(or(eq(xeroConnections.appTenantId, appTenantId), isNull(xeroConnections.appTenantId)));
        }
        const [existing] = await db.select().from(xeroConnections)
          .where(and(...existingConditions));

        if (existing) {
          // Update existing connection
          await db.update(xeroConnections)
            .set({
              appTenantId,
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token,
              tokenExpiresAt: expiresAt,
              tenantName: tenant.tenantName,
              connectionId: tenant.id,
              scopes: tokens.scope,
            })
            .where(eq(xeroConnections.id, existing.id));
          results.push({ id: existing.id, tenantName: tenant.tenantName, updated: true });
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
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [connection] = await db.select().from(xeroConnections)
        .where(eq(xeroConnections.id, input.connectionId));

      if (!connection) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Connection not found" });
      }

      // Try to revoke the token and disconnect from Xero
      try {
        if (connection.connectionId) {
          await disconnectXeroTenant(connection.accessToken, connection.connectionId);
        }
        await revokeXeroToken(connection.refreshToken);
      } catch (e) {
        // Continue even if revocation fails (token may already be expired)
      }

      // Mark as inactive locally
      await db.update(xeroConnections)
        .set({ isActive: false })
        .where(eq(xeroConnections.id, input.connectionId));

      return { success: true };
    }),

  // ─── Contact Sync ───────────────────────────────────────────────────────────

  /** Sync a local lead/client to Xero as a contact */
  syncContact: protectedProcedure
    .input(z.object({
      localType: z.enum(["lead", "client"]),
      localId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const auth = await getValidAccessToken();
      if (!auth) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active Xero connection" });

      // Get local record
      let contactData: Partial<XeroContact>;
      if (input.localType === "lead") {
        const [lead] = await db.select().from(crmLeads).where(eq(crmLeads.id, input.localId));
        if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" });
        contactData = {
          Name: `${lead.contactFirstName || ""} ${lead.contactLastName || ""}`.trim() || "Unknown",
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
        if (job.leadId) {
          const [lead] = await db.select().from(crmLeads).where(eq(crmLeads.id, job.leadId));
          if (lead) {
            leadEmail = lead.contactEmail || undefined;
            leadPhone = lead.contactPhone || undefined;
            leadFirstName = lead.contactFirstName || undefined;
            leadLastName = lead.contactLastName || undefined;
          }
        }
        
        contactData = {
          Name: job.clientName || "Unknown",
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

      if (existingMapping) {
        // Update existing Xero contact
        const result = await updateXeroContact(existingMapping.xeroContactId, contactData);
        xeroContactId = result.Contacts[0].ContactID;
        xeroContactName = result.Contacts[0].Name;

        await db.update(xeroContactMappings)
          .set({ xeroContactName, lastSyncedAt: new Date() })
          .where(eq(xeroContactMappings.id, existingMapping.id));
      } else {
        // Create new Xero contact
        const result = await createXeroContact(contactData);
        xeroContactId = result.Contacts[0].ContactID;
        xeroContactName = result.Contacts[0].Name;

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
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const auth = await getValidAccessToken();
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
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const auth = await getValidAccessToken();
      if (!auth) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active Xero connection" });

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
        });
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

      const result = await createXeroInvoice(invoice);
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
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const auth = await getValidAccessToken();
      if (!auth) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active Xero connection" });

      // Get or create supplier contact
      let supplierContactId = input.supplierContactId;
      if (!supplierContactId) {
        // Search for existing supplier by name
        const searchResult = await getXeroContacts({ where: `Name=="${input.supplierName}"` });
        if (searchResult.Contacts.length > 0) {
          supplierContactId = searchResult.Contacts[0].ContactID;
        } else {
          // Create supplier contact
          const result = await createXeroContact({
            Name: input.supplierName,
            IsSupplier: true,
          });
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

      const result = await createXeroPurchaseOrder(po);
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
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const auth = await getValidAccessToken();
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
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [mapping] = await db.select().from(xeroInvoiceMappings)
        .where(eq(xeroInvoiceMappings.id, input.mappingId));

      if (!mapping) throw new TRPCError({ code: "NOT_FOUND", message: "Document mapping not found" });

      let status: string;
      let amount: string | undefined;

      if (mapping.invoiceType === "purchase_order") {
        const result = await xeroApiRequest<{ PurchaseOrders: XeroPurchaseOrder[] }>(`/PurchaseOrders/${mapping.xeroInvoiceId}`);
        status = result.PurchaseOrders[0]?.Status || "UNKNOWN";
      } else {
        const result = await getXeroInvoice(mapping.xeroInvoiceId);
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
  getOrganisation: protectedProcedure.query(async () => {
    // Cache org info for 1 hour since it rarely changes
    const cacheKey = 'xero_org_info';
    const cached = orgCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < 3600000) {
      return cached.data;
    }
    try {
      const result = await xeroApiRequest<{ Organisations: Array<{ Name: string; LegalName: string; ShortCode: string }> }>("/Organisation", { timeoutMs: 10000 });
      const org = result.Organisations[0] || null;
      orgCache.set(cacheKey, { data: org, ts: Date.now() });
      return org;
    } catch {
      // Return cached data if available even if expired, otherwise null
      return cached?.data || null;
    }
  }),
});
