import { z } from "zod";
import { router, tenantProcedure as protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import {
  manufacturingPoReceipts,
  manufacturingSupplierInvoices,
  manufacturingInvoiceLines,
  manufacturingPurchaseOrders,
  manufacturingOrders,
  constructionJobs,
  suppliers,
} from "../drizzle/schema";
import { eq, desc, and, sql, inArray, like } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { appendTenantScope, tenantIdFromContext } from "./_core/tenant-scope";

// PO line item shape (stored as JSON in manufacturingPurchaseOrders.lineItems)
interface POLineItem {
  productName: string;
  productCode?: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  totalPrice: number;
  colour?: string;
  description?: string;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  return db;
}

function jobTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

async function requireManufacturingOrderAccess(db: any, ctx: any, orderId: number) {
  const [order] = await db.select({ order: manufacturingOrders })
    .from(manufacturingOrders)
    .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
    .where(and(...jobTenantConditions(ctx, eq(manufacturingOrders.id, orderId))))
    .limit(1);
  if (!order?.order) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Manufacturing order not found" });
  }
  return order.order;
}

async function requirePurchaseOrderAccess(db: any, ctx: any, purchaseOrderId: number) {
  const [poRow] = await db.select({ po: manufacturingPurchaseOrders })
    .from(manufacturingPurchaseOrders)
    .innerJoin(manufacturingOrders, eq(manufacturingPurchaseOrders.orderId, manufacturingOrders.id))
    .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
    .where(and(...jobTenantConditions(ctx, eq(manufacturingPurchaseOrders.id, purchaseOrderId))))
    .limit(1);
  if (!poRow?.po) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Purchase order not found" });
  }
  return poRow.po;
}

async function requireSupplierInvoiceAccess(db: any, ctx: any, invoiceId: number) {
  const [invoice] = await db.select()
    .from(manufacturingSupplierInvoices)
    .where(eq(manufacturingSupplierInvoices.id, invoiceId))
    .limit(1);
  if (!invoice) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
  }
  if (!invoice.purchaseOrderId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Invoice is not linked to a tenant-scoped purchase order" });
  }
  await requirePurchaseOrderAccess(db, ctx, invoice.purchaseOrderId);
  return invoice;
}

async function visiblePurchaseOrderIds(db: any, ctx: any) {
  const rows = await db.select({ id: manufacturingPurchaseOrders.id })
    .from(manufacturingPurchaseOrders)
    .innerJoin(manufacturingOrders, eq(manufacturingPurchaseOrders.orderId, manufacturingOrders.id))
    .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
    .where(and(...jobTenantConditions(ctx)));
  return rows.map((row: { id: number }) => row.id);
}

export const procurementRouter = router({
  // ─── Goods Received Notes (GRN) ─────────────────────────────────────────────
  receipts: router({
    // List receipts for a PO
    listByPO: protectedProcedure
      .input(z.object({ purchaseOrderId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        await requirePurchaseOrderAccess(db, ctx, input.purchaseOrderId);
        return db.select().from(manufacturingPoReceipts)
          .where(eq(manufacturingPoReceipts.purchaseOrderId, input.purchaseOrderId))
          .orderBy(desc(manufacturingPoReceipts.receivedAt));
      }),

    // Record goods received against PO line items (by index in JSON array)
    create: protectedProcedure
      .input(z.object({
        purchaseOrderId: z.number(),
        lines: z.array(z.object({
          lineIndex: z.number(), // index into the JSON lineItems array
          receivedQty: z.number().min(0),
          conditionStatus: z.enum(["good", "damaged", "partial_damage"]).default("good"),
          notes: z.string().optional(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        const po = await requirePurchaseOrderAccess(db, ctx, input.purchaseOrderId);

        // Insert receipt records (use lineIndex as poLineItemId for matching)
        for (const line of input.lines) {
          if (line.receivedQty > 0) {
            await db.insert(manufacturingPoReceipts).values({
              purchaseOrderId: input.purchaseOrderId,
              poLineItemId: line.lineIndex,
              receivedQty: String(line.receivedQty),
              receivedBy: ctx.user?.name || "Unknown",
              conditionStatus: line.conditionStatus,
              notes: line.notes || null,
            });
          }
        }

        // Update PO status based on total received vs ordered
        if (po) {
          const lineItems = (po.lineItems as POLineItem[] | null) || [];
          const receipts = await db.select().from(manufacturingPoReceipts)
            .where(eq(manufacturingPoReceipts.purchaseOrderId, input.purchaseOrderId));

          // Sum received per line index
          const receivedByLine = new Map<number, number>();
          for (const r of receipts) {
            const idx = r.poLineItemId ?? -1;
            receivedByLine.set(idx, (receivedByLine.get(idx) || 0) + Number(r.receivedQty));
          }

          // Check if all lines fully received
          const allReceived = lineItems.every((item, idx) => {
            const received = receivedByLine.get(idx) || 0;
            return received >= item.quantity;
          });
          const anyReceived = Array.from(receivedByLine.values()).some(v => v > 0);

          if (allReceived) {
            await db.update(manufacturingPurchaseOrders)
              .set({ status: "received" })
              .where(eq(manufacturingPurchaseOrders.id, input.purchaseOrderId));
          } else if (anyReceived && po.status === "confirmed") {
            // Keep as confirmed but we track partial receipt via the receipts table
          }

          // Look up supplierId from suppliers table by name match
          let supplierId: number | null = null;
          if (allReceived && po.supplier) {
            const [supplierRow] = await db.select({ id: suppliers.id })
              .from(suppliers)
              .where(eq(suppliers.name, po.supplier))
              .limit(1);
            supplierId = supplierRow?.id || null;
          }

          return {
            success: true,
            fullyReceived: allReceived,
            supplierId,
            supplierName: po.supplier || null,
            poId: input.purchaseOrderId,
          };
        }

        return { success: true, fullyReceived: false, supplierId: null, supplierName: null, poId: input.purchaseOrderId };
      }),

    // Get receipt summary for a PO (how much received per line)
    summary: protectedProcedure
      .input(z.object({ purchaseOrderId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        await requirePurchaseOrderAccess(db, ctx, input.purchaseOrderId);

        const receipts = await db.select().from(manufacturingPoReceipts)
          .where(eq(manufacturingPoReceipts.purchaseOrderId, input.purchaseOrderId));

        // Sum by line index
        const byLine = new Map<number, { totalReceived: number; lastReceivedAt: Date | null; condition: string }>();
        for (const r of receipts) {
          const idx = r.poLineItemId ?? -1;
          const existing = byLine.get(idx);
          byLine.set(idx, {
            totalReceived: (existing?.totalReceived || 0) + Number(r.receivedQty),
            lastReceivedAt: r.receivedAt,
            condition: r.conditionStatus,
          });
        }

        return Array.from(byLine.entries()).map(([lineIndex, data]) => ({
          lineIndex,
          ...data,
        }));
      }),
  }),

  // ─── Supplier Invoices ──────────────────────────────────────────────────────
  invoices: router({
    // List all invoices with optional filters
    list: protectedProcedure
      .input(z.object({
        status: z.enum(["draft", "pending_match", "matched", "variance_flagged", "approved", "rejected", "paid"]).optional(),
        purchaseOrderId: z.number().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const db = await requireDb();

        const conditions = [];
        if (input?.status) conditions.push(eq(manufacturingSupplierInvoices.status, input.status));
        if (input?.purchaseOrderId) {
          await requirePurchaseOrderAccess(db, ctx, input.purchaseOrderId);
          conditions.push(eq(manufacturingSupplierInvoices.purchaseOrderId, input.purchaseOrderId));
        } else {
          const poIds = await visiblePurchaseOrderIds(db, ctx);
          if (poIds.length === 0) return [];
          conditions.push(inArray(manufacturingSupplierInvoices.purchaseOrderId, poIds));
        }

        const where = conditions.length > 0 ? and(...conditions) : undefined;
        return db.select().from(manufacturingSupplierInvoices)
          .where(where)
          .orderBy(desc(manufacturingSupplierInvoices.createdAt));
      }),

    // Get invoice detail with lines
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        const invoice = await requireSupplierInvoiceAccess(db, ctx, input.id);

        const lines = await db.select().from(manufacturingInvoiceLines)
          .where(eq(manufacturingInvoiceLines.invoiceId, input.id));

        return { ...invoice, lines };
      }),

    // Create new invoice
    create: protectedProcedure
      .input(z.object({
        invoiceNumber: z.string().min(1),
        supplierName: z.string().min(1),
        supplierEmail: z.string().optional(),
        purchaseOrderId: z.number().optional(),
        invoiceDate: z.string(),
        dueDate: z.string().optional(),
        notes: z.string().optional(),
        lines: z.array(z.object({
          lineIndex: z.number().optional(), // maps to PO line index
          description: z.string().min(1),
          quantity: z.number().min(0),
          unitPrice: z.number().min(0),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        if (!input.purchaseOrderId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Purchase order is required for tenant-scoped supplier invoices" });
        }
        await requirePurchaseOrderAccess(db, ctx, input.purchaseOrderId);

        // Calculate totals
        const subtotal = input.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
        const gst = subtotal * 0.1; // 10% GST (Australia)
        const total = subtotal + gst;

        // Insert invoice header
        const [result] = await db.insert(manufacturingSupplierInvoices).values({
          invoiceNumber: input.invoiceNumber,
          supplierName: input.supplierName,
          supplierEmail: input.supplierEmail || null,
          purchaseOrderId: input.purchaseOrderId || null,
          invoiceDate: new Date(input.invoiceDate),
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          subtotal: String(subtotal.toFixed(2)),
          gst: String(gst.toFixed(2)),
          total: String(total.toFixed(2)),
          status: "draft",
          notes: input.notes || null,
        });

        const invoiceId = result.insertId;

        // Insert line items
        for (const line of input.lines) {
          const lineTotal = line.quantity * line.unitPrice;
          await db.insert(manufacturingInvoiceLines).values({
            invoiceId,
            poLineItemId: line.lineIndex ?? null,
            description: line.description,
            quantity: String(line.quantity),
            unitPrice: String(line.unitPrice),
            lineTotal: String(lineTotal.toFixed(2)),
          });
        }

        return { id: invoiceId };
      }),

    // Update invoice status
    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["draft", "pending_match", "matched", "variance_flagged", "approved", "rejected", "paid"]),
        rejectionReason: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        await requireSupplierInvoiceAccess(db, ctx, input.id);

        const updateData: any = { status: input.status };
        if (input.status === "approved") {
          updateData.approvedBy = ctx.user?.name || "Unknown";
          updateData.approvedAt = new Date();
        }
        if (input.status === "rejected" && input.rejectionReason) {
          updateData.rejectionReason = input.rejectionReason;
        }

        await db.update(manufacturingSupplierInvoices)
          .set(updateData)
          .where(eq(manufacturingSupplierInvoices.id, input.id));

        return { success: true };
      }),
  }),

  // ─── 3-Way Match (PO vs GRN vs Invoice) ────────────────────────────────────
  match: router({
    // Perform 3-way match for an invoice against PO and GRN
    perform: protectedProcedure
      .input(z.object({ invoiceId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();

        // Get invoice and lines
        const invoice = await requireSupplierInvoiceAccess(db, ctx, input.invoiceId);
        if (!invoice.purchaseOrderId) throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice not linked to a PO" });

        const invoiceLines = await db.select().from(manufacturingInvoiceLines)
          .where(eq(manufacturingInvoiceLines.invoiceId, input.invoiceId));

        // Get PO with JSON line items
        const po = await requirePurchaseOrderAccess(db, ctx, invoice.purchaseOrderId);

        const poLineItems = (po.lineItems as POLineItem[] | null) || [];

        // Get total received quantities per line index
        const receipts = await db.select().from(manufacturingPoReceipts)
          .where(eq(manufacturingPoReceipts.purchaseOrderId, invoice.purchaseOrderId));

        const receiptMap = new Map<number, number>();
        for (const r of receipts) {
          const idx = r.poLineItemId ?? -1;
          receiptMap.set(idx, (receiptMap.get(idx) || 0) + Number(r.receivedQty));
        }

        // Match each invoice line against PO line
        let totalVariance = 0;
        let hasVariance = false;
        let allMatched = true;

        for (const invLine of invoiceLines) {
          const lineIndex = invLine.poLineItemId; // stored as line index
          if (lineIndex == null || lineIndex < 0 || lineIndex >= poLineItems.length) {
            await db.update(manufacturingInvoiceLines)
              .set({ matchStatus: "unmatched" })
              .where(eq(manufacturingInvoiceLines.id, invLine.id));
            allMatched = false;
            continue;
          }

          const poLine = poLineItems[lineIndex];
          const poQty = poLine.quantity;
          const poUnitPrice = poLine.unitPrice;
          const receivedQty = receiptMap.get(lineIndex) || 0;
          const invQty = Number(invLine.quantity);
          const invUnitPrice = Number(invLine.unitPrice);

          const qtyVariance = invQty - poQty;
          const priceVariance = invUnitPrice - poUnitPrice;

          let matchStatus: "matched" | "qty_variance" | "price_variance" | "both_variance" = "matched";
          if (Math.abs(qtyVariance) > 0.001 && Math.abs(priceVariance) > 0.001) {
            matchStatus = "both_variance";
            hasVariance = true;
          } else if (Math.abs(qtyVariance) > 0.001) {
            matchStatus = "qty_variance";
            hasVariance = true;
          } else if (Math.abs(priceVariance) > 0.001) {
            matchStatus = "price_variance";
            hasVariance = true;
          }

          const lineVarianceValue = (invQty * invUnitPrice) - (poQty * poUnitPrice);
          totalVariance += lineVarianceValue;

          await db.update(manufacturingInvoiceLines)
            .set({
              poQty: String(poQty),
              poUnitPrice: String(poUnitPrice),
              receivedQty: String(receivedQty),
              qtyVariance: String(qtyVariance),
              priceVariance: String(priceVariance),
              matchStatus,
            })
            .where(eq(manufacturingInvoiceLines.id, invLine.id));
        }

        // Update invoice match status
        let invoiceMatchStatus: "unmatched" | "partial_match" | "full_match" | "variance" = "full_match";
        let invoiceStatus: "pending_match" | "matched" | "variance_flagged" = "matched";

        if (!allMatched) {
          invoiceMatchStatus = "partial_match";
          invoiceStatus = "pending_match";
        } else if (hasVariance) {
          invoiceMatchStatus = "variance";
          const threshold = Number(invoice.varianceThreshold || 100);
          invoiceStatus = Math.abs(totalVariance) > threshold ? "variance_flagged" : "matched";
        }

        await db.update(manufacturingSupplierInvoices)
          .set({
            matchStatus: invoiceMatchStatus,
            status: invoiceStatus,
            varianceAmount: String(totalVariance.toFixed(2)),
          })
          .where(eq(manufacturingSupplierInvoices.id, input.invoiceId));

        return {
          matchStatus: invoiceMatchStatus,
          invoiceStatus,
          totalVariance,
          linesMatched: invoiceLines.length,
          hasVariance,
        };
      }),

    // Get match summary for a PO (PO lines vs receipts vs invoices)
    summary: protectedProcedure
      .input(z.object({ purchaseOrderId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await requireDb();

        // Get PO
        const po = await requirePurchaseOrderAccess(db, ctx, input.purchaseOrderId);

        const poLineItems = (po.lineItems as POLineItem[] | null) || [];

        // Get receipts
        const receipts = await db.select().from(manufacturingPoReceipts)
          .where(eq(manufacturingPoReceipts.purchaseOrderId, input.purchaseOrderId));

        const receiptMap = new Map<number, number>();
        for (const r of receipts) {
          const idx = r.poLineItemId ?? -1;
          receiptMap.set(idx, (receiptMap.get(idx) || 0) + Number(r.receivedQty));
        }

        // Get invoices
        const invoices = await db.select().from(manufacturingSupplierInvoices)
          .where(eq(manufacturingSupplierInvoices.purchaseOrderId, input.purchaseOrderId));

        const poTotal = poLineItems.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
        const invoicedTotal = invoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0);

        return {
          po,
          poLineItems: poLineItems.map((l, idx) => ({
            ...l,
            index: idx,
            received: receiptMap.get(idx) || 0,
          })),
          receipts,
          invoices,
          summary: {
            poTotal,
            invoicedTotal,
            poLineCount: poLineItems.length,
            fullyReceivedCount: poLineItems.filter((l, idx) => {
              const received = receiptMap.get(idx) || 0;
              return received >= l.quantity;
            }).length,
          },
        };
      }),
  }),

  // ─── Approval Workflow ──────────────────────────────────────────────────────
  approval: router({
    // List invoices pending approval (variance flagged)
    pending: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDb();
      const poIds = await visiblePurchaseOrderIds(db, ctx);
      if (poIds.length === 0) return [];
      return db.select().from(manufacturingSupplierInvoices)
        .where(and(
          eq(manufacturingSupplierInvoices.status, "variance_flagged"),
          inArray(manufacturingSupplierInvoices.purchaseOrderId, poIds),
        ))
        .orderBy(desc(manufacturingSupplierInvoices.createdAt));
    }),

    // Approve invoice with variance
    approve: protectedProcedure
      .input(z.object({ invoiceId: z.number(), notes: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        await requireSupplierInvoiceAccess(db, ctx, input.invoiceId);

        await db.update(manufacturingSupplierInvoices)
          .set({
            status: "approved",
            approvedBy: ctx.user?.name || "Unknown",
            approvedAt: new Date(),
            notes: input.notes || null,
          })
          .where(eq(manufacturingSupplierInvoices.id, input.invoiceId));

        return { success: true };
      }),

    // Reject invoice
    reject: protectedProcedure
      .input(z.object({ invoiceId: z.number(), reason: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        await requireSupplierInvoiceAccess(db, ctx, input.invoiceId);

        await db.update(manufacturingSupplierInvoices)
          .set({
            status: "rejected",
            rejectionReason: input.reason,
          })
          .where(eq(manufacturingSupplierInvoices.id, input.invoiceId));

        return { success: true };
      }),
  }),

  // ─── Xero ACCPAY Push ─────────────────────────────────────────────────────
  pushToXero: protectedProcedure
    .input(z.object({ invoiceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();

      // Get invoice with lines
      const invoice = await requireSupplierInvoiceAccess(db, ctx, input.invoiceId);
      if (invoice.status !== "approved" && invoice.status !== "matched") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice must be approved or matched before pushing to Xero" });
      }
      if (invoice.xeroInvoiceId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Already pushed to Xero" });
      }

      const invoiceLines = await db.select().from(manufacturingInvoiceLines)
        .where(eq(manufacturingInvoiceLines.invoiceId, input.invoiceId));

      // Find or create Xero contact for this supplier
      const { getValidAccessToken, createXeroContact, xeroApiRequest } = await import("./xero-client");
      const { suppliers } = await import("../drizzle/schema");

      const auth = await getValidAccessToken();
      if (!auth) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Xero not connected" });

      // Try to find the supplier in our directory to get xeroContactId
      let xeroContactId: string | null = null;
      if (invoice.supplierName) {
        const [supplier] = await db.select().from(suppliers)
          .where(like(suppliers.name, `%${invoice.supplierName}%`)).limit(1);
        if (supplier?.xeroContactId) {
          xeroContactId = supplier.xeroContactId;
        }
      }

      // If no contact found, search Xero or create one
      if (!xeroContactId) {
        try {
          const searchResult = await xeroApiRequest<{ Contacts: Array<{ ContactID: string }> }>(
            `/Contacts?where=Name=="${encodeURIComponent(invoice.supplierName)}"`
          );
          if (searchResult.Contacts?.length > 0) {
            xeroContactId = searchResult.Contacts[0].ContactID;
          }
        } catch { /* ignore search errors */ }

        if (!xeroContactId) {
          const newContact = await createXeroContact({
            Name: invoice.supplierName,
            EmailAddress: invoice.supplierEmail || undefined,
          } as any);
          xeroContactId = newContact.Contacts?.[0]?.ContactID || null;
        }
      }

      if (!xeroContactId) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not find or create Xero contact" });
      }

      // Build ACCPAY bill payload
      const billPayload = {
        Type: "ACCPAY",
        Contact: { ContactID: xeroContactId },
        InvoiceNumber: invoice.invoiceNumber,
        Date: invoice.invoiceDate ? new Date(invoice.invoiceDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
        DueDate: invoice.dueDate ? new Date(invoice.dueDate).toISOString().split("T")[0] : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        LineItems: invoiceLines.map(line => ({
          Description: line.description,
          Quantity: Number(line.quantity),
          UnitAmount: Number(line.unitPrice),
          AccountCode: "300", // Direct costs
          TaxType: "INPUT", // GST on purchases
        })),
        Status: "AUTHORISED",
        Reference: invoice.purchaseOrderId ? `PO-${invoice.purchaseOrderId}` : undefined,
      };

      const response = await fetch("https://api.xero.com/api.xro/2.0/Invoices", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${auth.accessToken}`,
          "Xero-Tenant-Id": auth.tenantId,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({ Invoices: [billPayload] }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Xero API error: ${errorText}` });
      }

      const xeroResult = await response.json();
      const createdBill = xeroResult.Invoices?.[0];
      if (createdBill?.InvoiceID) {
        await db.update(manufacturingSupplierInvoices).set({
          xeroInvoiceId: createdBill.InvoiceID,
          status: "paid", // Mark as pushed/paid in our system
        }).where(eq(manufacturingSupplierInvoices.id, input.invoiceId));
      }

      return { success: true, xeroInvoiceId: createdBill?.InvoiceID };
    }),

  // ─── Invoice PDF Parsing (LLM) ─────────────────────────────────────────────
  parseInvoice: protectedProcedure
    .input(z.object({
      fileUrl: z.string().min(1), // S3 URL of uploaded PDF/image
      fileName: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { invokeLLM } = await import("./_core/llm");

      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are an invoice data extraction assistant. Extract structured data from the supplier invoice document provided. Return JSON matching the schema exactly. For line items, extract each individual line. Amounts should be numbers (not strings). Dates should be in YYYY-MM-DD format. If GST/tax is shown separately, extract it. If not, assume 10% GST (Australia). If you cannot determine a field, use null.`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: `Extract all invoice data from this document: ${input.fileName || "invoice"}` },
              { type: "file_url", file_url: { url: input.fileUrl, mime_type: "application/pdf" } },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "invoice_extraction",
            strict: true,
            schema: {
              type: "object",
              properties: {
                supplierName: { type: ["string", "null"], description: "Company name of the supplier" },
                supplierAbn: { type: ["string", "null"], description: "ABN of the supplier" },
                supplierEmail: { type: ["string", "null"], description: "Email of the supplier" },
                invoiceNumber: { type: ["string", "null"], description: "Invoice number" },
                invoiceDate: { type: ["string", "null"], description: "Invoice date in YYYY-MM-DD" },
                dueDate: { type: ["string", "null"], description: "Due date in YYYY-MM-DD" },
                subtotal: { type: ["number", "null"], description: "Subtotal before tax" },
                gst: { type: ["number", "null"], description: "GST/tax amount" },
                total: { type: ["number", "null"], description: "Total including tax" },
                purchaseOrderReference: { type: ["string", "null"], description: "PO number reference if mentioned" },
                lineItems: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      description: { type: "string", description: "Line item description" },
                      quantity: { type: "number", description: "Quantity" },
                      unitPrice: { type: "number", description: "Unit price excl GST" },
                      lineTotal: { type: ["number", "null"], description: "Line total" },
                    },
                    required: ["description", "quantity", "unitPrice", "lineTotal"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["supplierName", "supplierAbn", "supplierEmail", "invoiceNumber", "invoiceDate", "dueDate", "subtotal", "gst", "total", "purchaseOrderReference", "lineItems"],
              additionalProperties: false,
            },
          },
        },
      });

      const content = response.choices?.[0]?.message?.content;
      if (!content) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "LLM returned no content" });

      let parsed;
      try {
        parsed = JSON.parse(content as string);
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to parse LLM response" });
      }

      // Try to auto-match supplier to our directory
      let matchedSupplierId: number | null = null;
      if (parsed.supplierName) {
        const db = await getDb();
        if (db) {
          const { suppliers } = await import("../drizzle/schema");
          const [match] = await db.select().from(suppliers)
            .where(like(suppliers.name, `%${parsed.supplierName.substring(0, 20)}%`)).limit(1);
          if (match) matchedSupplierId = match.id;
        }
      }

      // Try to auto-match to a PO by reference
      let matchedPurchaseOrderId: number | null = null;
      if (parsed.purchaseOrderReference) {
        const db = await getDb();
        if (db) {
          const [match] = await db.select({ po: manufacturingPurchaseOrders })
            .from(manufacturingPurchaseOrders)
            .innerJoin(manufacturingOrders, eq(manufacturingPurchaseOrders.orderId, manufacturingOrders.id))
            .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
            .where(and(
              ...jobTenantConditions(ctx, like(manufacturingPurchaseOrders.poNumber, `%${parsed.purchaseOrderReference}%`)),
            ))
            .limit(1);
          if (match?.po) matchedPurchaseOrderId = match.po.id;
        }
      }

      return {
        ...parsed,
        matchedSupplierId,
        matchedPurchaseOrderId,
      };
    }),

  // ─── PO Lifecycle ───────────────────────────────────────────────────────────
  closePO: protectedProcedure
    .input(z.object({ purchaseOrderId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();

      // Verify PO is received and all invoices are resolved
      const po = await requirePurchaseOrderAccess(db, ctx, input.purchaseOrderId);

      if (po.status !== "received") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "PO must be fully received before closing" });
      }

      const invoices = await db.select().from(manufacturingSupplierInvoices)
        .where(eq(manufacturingSupplierInvoices.purchaseOrderId, input.purchaseOrderId));

      const allResolved = invoices.length === 0 || invoices.every(inv =>
        ["approved", "paid", "matched"].includes(inv.status)
      );

      if (!allResolved) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "All invoices must be approved/matched/paid before closing PO" });
      }

      // Use 'cancelled' as a proxy for 'closed' since the enum doesn't have 'closed'
      // Actually we'll just keep it as 'received' and mark notes
      // Better: update status to received (already there) - the PO is complete
      // The frontend will show "Closed" based on having matched invoices
      await db.update(manufacturingPurchaseOrders)
        .set({ notes: sql`CONCAT(COALESCE(${manufacturingPurchaseOrders.notes}, ''), '\n[CLOSED] PO closed after invoice reconciliation.')` })
        .where(eq(manufacturingPurchaseOrders.id, input.purchaseOrderId));

      return { success: true };
    }),
});
