#!/usr/bin/env python3
"""Patch admin-trade-portal-router.ts to add reconciliation, contact sync, and trade template procedures."""

filepath = "/home/ubuntu/spanline-quote/server/admin-trade-portal-router.ts"

with open(filepath, "r") as f:
    content = f.read()

# 1. Update imports to include updateXeroContact, smsTemplates
old_import = 'import { getXeroContacts, getXeroInvoices, getXeroPayments, type XeroInvoice } from "./xero-client";'
new_import = 'import { getXeroContacts, getXeroInvoices, getXeroPayments, updateXeroContact, type XeroInvoice, type XeroContact } from "./xero-client";'
content = content.replace(old_import, new_import)

old_schema_import = """import {
  portalNews, tradePortalAccess, tradePortalSessions,
  tradeRemittances, tradeMessages, constructionInstallers,
} from "../drizzle/schema";"""
new_schema_import = """import {
  portalNews, tradePortalAccess, tradePortalSessions,
  tradeRemittances, tradeMessages, constructionInstallers,
  smsTemplates,
} from "../drizzle/schema";"""
content = content.replace(old_schema_import, new_schema_import)

# 2. Add new procedures before the closing `});`
new_procedures = '''
  // ─── Xero Payment Reconciliation ──────────────────────────────────────────
  /** Reconcile Xero payments → auto-create remittance records for paid bills */
  reconcileXeroPayments: adminProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const auth = await getValidAccessToken();
    if (!auth) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active Xero connection. Please connect Xero first." });

    // Get all trades linked to Xero
    const linkedTrades = await db.select({
      id: constructionInstallers.id,
      name: constructionInstallers.name,
      xeroContactId: constructionInstallers.xeroContactId,
    }).from(constructionInstallers)
      .where(and(
        eq(constructionInstallers.active, true),
        sql`${constructionInstallers.xeroContactId} IS NOT NULL`,
      ));

    if (linkedTrades.length === 0) {
      return { created: 0, skipped: 0, errors: 0, message: "No trades linked to Xero. Link trades first." };
    }

    // Get existing Xero-sourced remittances to avoid duplicates
    const existingXeroRemittances = await db.select({
      xeroPaymentId: tradeRemittances.xeroPaymentId,
    }).from(tradeRemittances)
      .where(eq(tradeRemittances.source, "xero"));
    const existingPaymentIds = new Set(
      existingXeroRemittances.map(r => r.xeroPaymentId).filter(Boolean)
    );

    let created = 0;
    let skipped = 0;
    let errors = 0;
    const details: Array<{ trade: string; action: string; amount?: number; ref?: string }> = [];

    for (const trade of linkedTrades) {
      try {
        // Fetch ACCPAY (bills) for this trade's Xero contact
        const invoiceResult = await getXeroInvoices({
          where: `Type=="ACCPAY"&&Contact.ContactID==guid("${trade.xeroContactId}")&&Status=="PAID"`,
        });

        for (const invoice of (invoiceResult.Invoices || [])) {
          // Fetch payments for this invoice
          if (!invoice.InvoiceID) continue;
          try {
            const paymentResult = await getXeroPayments({
              where: `Invoice.InvoiceID==guid("${invoice.InvoiceID}")`,
            });
            for (const payment of (paymentResult.Payments || [])) {
              if (!payment.PaymentID) continue;
              if (existingPaymentIds.has(payment.PaymentID)) {
                skipped++;
                continue;
              }
              // Create remittance record
              await db.insert(tradeRemittances).values({
                installerId: trade.id,
                amount: String(payment.Amount || 0),
                date: payment.Date ? new Date(payment.Date) : new Date(),
                reference: payment.Reference || invoice.InvoiceNumber || null,
                notes: `Auto-synced from Xero. Invoice: ${invoice.InvoiceNumber || invoice.InvoiceID}`,
                source: "xero",
                xeroPaymentId: payment.PaymentID,
                xeroInvoiceId: invoice.InvoiceID,
                xeroInvoiceNumber: invoice.InvoiceNumber || null,
              });
              existingPaymentIds.add(payment.PaymentID);
              created++;
              details.push({
                trade: trade.name,
                action: "created",
                amount: payment.Amount,
                ref: payment.Reference || invoice.InvoiceNumber,
              });
            }
          } catch (payErr: any) {
            console.error(`[Reconcile] Error fetching payments for invoice ${invoice.InvoiceID}:`, payErr.message);
            errors++;
          }
        }
      } catch (err: any) {
        console.error(`[Reconcile] Error processing trade ${trade.name}:`, err.message);
        errors++;
        details.push({ trade: trade.name, action: `error: ${err.message}` });
      }
    }

    return { created, skipped, errors, tradesProcessed: linkedTrades.length, details };
  }),

  /** Get reconciliation summary stats */
  reconciliationStats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const [manualCount] = await db.select({ count: sql<number>`COUNT(*)` })
      .from(tradeRemittances).where(eq(tradeRemittances.source, "manual"));
    const [xeroCount] = await db.select({ count: sql<number>`COUNT(*)` })
      .from(tradeRemittances).where(eq(tradeRemittances.source, "xero"));
    const [lastXeroSync] = await db.select({ latest: sql<Date>`MAX(createdAt)` })
      .from(tradeRemittances).where(eq(tradeRemittances.source, "xero"));
    const [linkedTrades] = await db.select({ count: sql<number>`COUNT(*)` })
      .from(constructionInstallers)
      .where(and(
        eq(constructionInstallers.active, true),
        sql`${constructionInstallers.xeroContactId} IS NOT NULL`,
      ));
    const [totalTrades] = await db.select({ count: sql<number>`COUNT(*)` })
      .from(constructionInstallers)
      .where(eq(constructionInstallers.active, true));

    return {
      manualRemittances: Number(manualCount?.count || 0),
      xeroRemittances: Number(xeroCount?.count || 0),
      lastXeroSyncAt: lastXeroSync?.latest || null,
      linkedTrades: Number(linkedTrades?.count || 0),
      totalActiveTrades: Number(totalTrades?.count || 0),
    };
  }),

  // ─── Xero Contact Sync ───────────────────────────────────────────────────
  /** Pull Xero contact details into local trade record */
  syncContactFromXero: adminProcedure
    .input(z.object({ installerId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const auth = await getValidAccessToken();
      if (!auth) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active Xero connection" });

      const [installer] = await db.select().from(constructionInstallers)
        .where(eq(constructionInstallers.id, input.installerId)).limit(1);
      if (!installer) throw new TRPCError({ code: "NOT_FOUND", message: "Trade not found" });
      if (!installer.xeroContactId) throw new TRPCError({ code: "BAD_REQUEST", message: "Trade not linked to Xero" });

      const result = await getXeroContacts({ where: `ContactID==guid("${installer.xeroContactId}")` });
      if (!result.Contacts?.length) throw new TRPCError({ code: "NOT_FOUND", message: "Xero contact not found" });

      const xc = result.Contacts[0];
      const updates: Record<string, any> = { lastXeroSyncAt: new Date() };

      // Pull email
      if (xc.EmailAddress && xc.EmailAddress !== installer.email) {
        updates.email = xc.EmailAddress;
      }
      // Pull phone (prefer DEFAULT type, fallback to MOBILE)
      const defaultPhone = xc.Phones?.find(p => p.PhoneType === "DEFAULT");
      const mobilePhone = xc.Phones?.find(p => p.PhoneType === "MOBILE");
      const xeroPhone = defaultPhone?.PhoneNumber || mobilePhone?.PhoneNumber;
      if (xeroPhone && xeroPhone !== installer.phone) {
        updates.phone = xeroPhone;
      }
      // Pull address (prefer STREET type)
      const streetAddr = xc.Addresses?.find(a => a.AddressType === "STREET");
      if (streetAddr) {
        const parts = [streetAddr.AddressLine1, streetAddr.AddressLine2, streetAddr.City, streetAddr.Region, streetAddr.PostalCode].filter(Boolean);
        const fullAddress = parts.join(", ");
        if (fullAddress && fullAddress !== installer.address) {
          updates.address = fullAddress;
        }
      }
      // Pull ABN (TaxNumber)
      if (xc.TaxNumber && xc.TaxNumber !== installer.abn) {
        updates.abn = xc.TaxNumber;
      }

      await db.update(constructionInstallers)
        .set(updates)
        .where(eq(constructionInstallers.id, input.installerId));

      return {
        synced: true,
        updatedFields: Object.keys(updates).filter(k => k !== "lastXeroSyncAt"),
        contact: { name: xc.Name, email: xc.EmailAddress, phone: xeroPhone, abn: xc.TaxNumber },
      };
    }),

  /** Push local trade details to Xero contact card */
  pushContactToXero: adminProcedure
    .input(z.object({ installerId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const auth = await getValidAccessToken();
      if (!auth) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active Xero connection" });

      const [installer] = await db.select().from(constructionInstallers)
        .where(eq(constructionInstallers.id, input.installerId)).limit(1);
      if (!installer) throw new TRPCError({ code: "NOT_FOUND", message: "Trade not found" });
      if (!installer.xeroContactId) throw new TRPCError({ code: "BAD_REQUEST", message: "Trade not linked to Xero" });

      const xeroUpdate: Partial<XeroContact> = {
        Name: installer.name,
      };
      if (installer.email) xeroUpdate.EmailAddress = installer.email;
      if (installer.phone) {
        xeroUpdate.Phones = [{ PhoneType: "DEFAULT", PhoneNumber: installer.phone }];
      }
      if (installer.abn) xeroUpdate.TaxNumber = installer.abn;
      if (installer.address) {
        // Try to parse address into components
        const parts = installer.address.split(",").map(s => s.trim());
        xeroUpdate.Addresses = [{
          AddressType: "STREET",
          AddressLine1: parts[0] || "",
          City: parts.length >= 3 ? parts[parts.length - 3] : "",
          Region: parts.length >= 2 ? parts[parts.length - 2] : "",
          PostalCode: parts.length >= 1 ? parts[parts.length - 1] : "",
        }];
      }

      await updateXeroContact(installer.xeroContactId, xeroUpdate);
      await db.update(constructionInstallers)
        .set({ lastXeroSyncAt: new Date() })
        .where(eq(constructionInstallers.id, input.installerId));

      return { pushed: true, contactId: installer.xeroContactId };
    }),

  /** Bulk sync all linked trades' contact details from Xero */
  bulkSyncContactsFromXero: adminProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const auth = await getValidAccessToken();
    if (!auth) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active Xero connection" });

    const linkedTrades = await db.select().from(constructionInstallers)
      .where(and(
        eq(constructionInstallers.active, true),
        sql`${constructionInstallers.xeroContactId} IS NOT NULL`,
      ));

    let synced = 0;
    let failed = 0;
    const results: Array<{ id: number; name: string; status: string; updatedFields?: string[] }> = [];

    for (const trade of linkedTrades) {
      try {
        const result = await getXeroContacts({ where: `ContactID==guid("${trade.xeroContactId}")` });
        if (!result.Contacts?.length) {
          results.push({ id: trade.id, name: trade.name, status: "not_found_in_xero" });
          failed++;
          continue;
        }
        const xc = result.Contacts[0];
        const updates: Record<string, any> = { lastXeroSyncAt: new Date() };
        const updatedFields: string[] = [];

        if (xc.EmailAddress && xc.EmailAddress !== trade.email) {
          updates.email = xc.EmailAddress;
          updatedFields.push("email");
        }
        const defaultPhone = xc.Phones?.find(p => p.PhoneType === "DEFAULT");
        const mobilePhone = xc.Phones?.find(p => p.PhoneType === "MOBILE");
        const xeroPhone = defaultPhone?.PhoneNumber || mobilePhone?.PhoneNumber;
        if (xeroPhone && xeroPhone !== trade.phone) {
          updates.phone = xeroPhone;
          updatedFields.push("phone");
        }
        const streetAddr = xc.Addresses?.find(a => a.AddressType === "STREET");
        if (streetAddr) {
          const parts = [streetAddr.AddressLine1, streetAddr.AddressLine2, streetAddr.City, streetAddr.Region, streetAddr.PostalCode].filter(Boolean);
          const fullAddress = parts.join(", ");
          if (fullAddress && fullAddress !== trade.address) {
            updates.address = fullAddress;
            updatedFields.push("address");
          }
        }
        if (xc.TaxNumber && xc.TaxNumber !== trade.abn) {
          updates.abn = xc.TaxNumber;
          updatedFields.push("abn");
        }

        await db.update(constructionInstallers)
          .set(updates)
          .where(eq(constructionInstallers.id, trade.id));

        synced++;
        results.push({ id: trade.id, name: trade.name, status: "synced", updatedFields });
      } catch (err: any) {
        failed++;
        results.push({ id: trade.id, name: trade.name, status: `error: ${err.message}` });
      }
    }

    return { synced, failed, total: linkedTrades.length, results };
  }),

  // ─── Trade SMS Templates ─────────────────────────────────────────────────
  /** List SMS templates filtered by trade category */
  tradeTemplates: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(smsTemplates)
      .where(like(smsTemplates.category, "Trade%"))
      .orderBy(smsTemplates.category, smsTemplates.sortOrder);
  }),
'''

# Insert before the closing `});`
content = content.rstrip()
if content.endswith("});"):
    content = content[:-3] + new_procedures + "});\n"
else:
    # Find the last `});` and insert before it
    last_idx = content.rfind("});")
    if last_idx >= 0:
        content = content[:last_idx] + new_procedures + "});\n"

with open(filepath, "w") as f:
    f.write(content)

print("Done - patched admin-trade-portal-router.ts")
