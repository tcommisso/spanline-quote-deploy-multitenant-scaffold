/**
 * Trade Invoice Management Router
 * Handles:
 * - AI/OCR extraction of uploaded invoices
 * - Per-line approval workflow with supervisor assignment
 * - Auto-creation of Xero bills on approval
 * - Payment status updates from Xero reconciliation
 */
import { z } from "zod";
import { tenantAdminProcedure as adminProcedure, tenantProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { getDb } from "./db";
import { eq, desc, and, sql, inArray, isNull, or } from "drizzle-orm";
import {
  tradeInvoices, tradeInvoiceLines, tradeInvoiceApprovals,
  tradeInvoicePhotos,
  constructionInstallers, constructionJobs, cmWorkOrders,
  poMilestones, users, tenantMemberships,
} from "../drizzle/schema";
import { TRPCError } from "@trpc/server";
import { triggerPushTradeInvoiceAdjusted, triggerPushTradeInvoiceApproved, triggerPushTradeInvoiceRejected } from "./push-triggers";
import { getValidAccessToken } from "./xero-client";
import { notifyOwner } from "./_core/notification";
import { appendTenantScope, tenantIdFromContext } from "./_core/tenant-scope";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

function jobTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function installerTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, constructionInstallers.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function invoiceTenantCondition(ctx: any) {
  const tenantId = tenantIdFromContext(ctx);
  if (!tenantId) return undefined;
  return or(
    and(
      sql`${tradeInvoices.jobId} IS NOT NULL`,
      or(eq(constructionJobs.tenantId, tenantId), isNull(constructionJobs.tenantId)),
    ),
    and(
      isNull(tradeInvoices.jobId),
      or(eq(constructionInstallers.tenantId, tenantId), isNull(constructionInstallers.tenantId)),
    ),
  );
}

function appendInvoiceTenantScope(ctx: any, conditions: any[]) {
  const condition = invoiceTenantCondition(ctx);
  if (condition) conditions.push(condition);
}

function invoiceWhere(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendInvoiceTenantScope(ctx, conditions);
  return conditions.length > 0 ? and(...conditions) : undefined;
}

async function requireJobVisible(db: any, ctx: any, jobId: number) {
  const [job] = await db.select()
    .from(constructionJobs)
    .where(and(...jobTenantConditions(ctx, eq(constructionJobs.id, jobId))))
    .limit(1);
  if (!job) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
  }
  return job;
}

async function requireInstallerVisible(db: any, ctx: any, installerId: number) {
  const [installer] = await db.select()
    .from(constructionInstallers)
    .where(and(...installerTenantConditions(ctx, eq(constructionInstallers.id, installerId))))
    .limit(1);
  if (!installer) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Trade not found" });
  }
  return installer;
}

async function requireInvoiceAccess(db: any, ctx: any, invoiceId: number) {
  const [invoice] = await db.select()
    .from(tradeInvoices)
    .where(eq(tradeInvoices.id, invoiceId))
    .limit(1);
  if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });

  if (invoice.jobId) {
    await requireJobVisible(db, ctx, invoice.jobId);
  } else {
    await requireInstallerVisible(db, ctx, invoice.installerId);
  }

  return invoice;
}

async function requireInvoiceLineAccess(db: any, ctx: any, lineId: number) {
  const [line] = await db.select()
    .from(tradeInvoiceLines)
    .where(eq(tradeInvoiceLines.id, lineId))
    .limit(1);
  if (!line) throw new TRPCError({ code: "NOT_FOUND" });
  await requireInvoiceAccess(db, ctx, line.invoiceId);
  if (line.jobId) await requireJobVisible(db, ctx, line.jobId);
  return line;
}

async function requireWorkOrderVisible(db: any, ctx: any, workOrderId: number) {
  const [workOrder] = await db.select()
    .from(cmWorkOrders)
    .where(eq(cmWorkOrders.id, workOrderId))
    .limit(1);
  if (!workOrder) throw new TRPCError({ code: "NOT_FOUND", message: "Work order not found" });
  await requireJobVisible(db, ctx, workOrder.jobId);
  return workOrder;
}

async function requireMilestoneVisible(db: any, ctx: any, milestoneId: number) {
  const [milestone] = await db.select()
    .from(poMilestones)
    .where(eq(poMilestones.id, milestoneId))
    .limit(1);
  if (!milestone) throw new TRPCError({ code: "NOT_FOUND", message: "Milestone not found" });
  await requireJobVisible(db, ctx, milestone.jobId);
  return milestone;
}

async function requireInvoicePhotoAccess(db: any, ctx: any, photoId: number) {
  const [photo] = await db.select()
    .from(tradeInvoicePhotos)
    .where(eq(tradeInvoicePhotos.id, photoId))
    .limit(1);
  if (!photo) throw new TRPCError({ code: "NOT_FOUND", message: "Photo not found" });
  await requireInvoiceAccess(db, ctx, photo.invoiceId);
  return photo;
}

function moneyNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : parseFloat(String(value ?? "0"));
  return Number.isFinite(parsed) ? parsed : 0;
}

function moneyString(value: number): string {
  return value.toFixed(2);
}

function hasLineAdjustment(line: any): boolean {
  return (
    line.approvedAmount != null &&
    Math.abs(moneyNumber(line.approvedAmount) - moneyNumber(line.amount)) > 0.005
  ) || (
    line.approvedGstAmount != null &&
    Math.abs(moneyNumber(line.approvedGstAmount) - moneyNumber(line.gstAmount)) > 0.005
  );
}

function lineApprovedAmount(line: any): number {
  return line.approvedAmount != null ? moneyNumber(line.approvedAmount) : moneyNumber(line.amount);
}

function lineApprovedGstAmount(line: any): number {
  return line.approvedGstAmount != null ? moneyNumber(line.approvedGstAmount) : moneyNumber(line.gstAmount);
}

async function finaliseInvoiceIfReady(db: any, ctx: any, invoiceId: number) {
  const allLines = await db.select()
    .from(tradeInvoiceLines)
    .where(eq(tradeInvoiceLines.invoiceId, invoiceId));

  const allApproved = allLines.length > 0 && allLines.every((line: any) => line.approvalStatus === "approved");
  const anyRejected = allLines.some((line: any) => line.approvalStatus === "rejected");

  if (allApproved) {
    const claimedAmount = allLines.reduce((sum: number, line: any) => sum + moneyNumber(line.amount), 0);
    const claimedGstAmount = allLines.reduce((sum: number, line: any) => sum + moneyNumber(line.gstAmount), 0);
    const approvedAmount = allLines.reduce((sum: number, line: any) => sum + lineApprovedAmount(line), 0);
    const approvedGstAmount = allLines.reduce((sum: number, line: any) => sum + lineApprovedGstAmount(line), 0);
    const adjustmentReasons = Array.from(new Set(
      allLines
        .map((line: any) => String(line.approvalAdjustmentReason || "").trim())
        .filter(Boolean)
    ));
    const adjustmentReason = adjustmentReasons.join("; ") || null;

    await db.update(tradeInvoices).set({
      status: "approved",
      approvedAt: new Date(),
      approvedAmount: moneyString(approvedAmount),
      approvedGstAmount: moneyString(approvedGstAmount),
      approvedTotalWithGst: moneyString(approvedAmount + approvedGstAmount),
      approvalAdjustmentReason: adjustmentReason,
    }).where(eq(tradeInvoices.id, invoiceId));

    const [inv] = await db.select({ installerId: tradeInvoices.installerId, invoiceNumber: tradeInvoices.invoiceNumber })
      .from(tradeInvoices).where(eq(tradeInvoices.id, invoiceId)).limit(1);
    if (inv) {
      const adjusted = allLines.some(hasLineAdjustment);
      if (adjusted) {
        triggerPushTradeInvoiceAdjusted(
          inv.installerId,
          inv.invoiceNumber,
          moneyString(claimedAmount + claimedGstAmount),
          moneyString(approvedAmount + approvedGstAmount),
          adjustmentReason
        );
      } else {
        triggerPushTradeInvoiceApproved(inv.installerId, inv.invoiceNumber);
      }
    }
  } else if (anyRejected) {
    await db.update(tradeInvoices).set({
      status: "rejected",
    }).where(eq(tradeInvoices.id, invoiceId));

    const rejectedReason = allLines.find((line: any) => line.approvalStatus === "rejected")?.rejectionReason;
    const [inv] = await db.select({ installerId: tradeInvoices.installerId, invoiceNumber: tradeInvoices.invoiceNumber })
      .from(tradeInvoices).where(eq(tradeInvoices.id, invoiceId)).limit(1);
    if (inv) triggerPushTradeInvoiceRejected(inv.installerId, inv.invoiceNumber, rejectedReason);
  }

  return { allApproved, anyRejected };
}

export const tradeInvoiceRouter = router({
  // ─── List Invoices (Admin) ─────────────────────────────────────────────────
  listInvoices: adminProcedure
    .input(z.object({
      status: z.enum(["all", "submitted", "under_review", "pending_approval", "approved", "paid", "rejected"]).default("all"),
      installerId: z.number().optional(),
      jobId: z.number().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const conditions: any[] = [];
      if (input.status !== "all") conditions.push(eq(tradeInvoices.status, input.status));
      if (input.installerId) conditions.push(eq(tradeInvoices.installerId, input.installerId));
      if (input.jobId) conditions.push(eq(tradeInvoices.jobId, input.jobId));
      appendInvoiceTenantScope(ctx, conditions);

      // Get photo counts per invoice
      const photoCounts = await db.select({
        invoiceId: tradeInvoicePhotos.invoiceId,
        count: sql<number>`COUNT(*)`,
      })
        .from(tradeInvoicePhotos)
        .groupBy(tradeInvoicePhotos.invoiceId);
      const photoCountMap = new Map(photoCounts.map(p => [p.invoiceId, Number(p.count)]));

      const invoices = await db.select({
        id: tradeInvoices.id,
        installerId: tradeInvoices.installerId,
        jobId: tradeInvoices.jobId,
        workOrderId: tradeInvoices.workOrderId,
        invoiceNumber: tradeInvoices.invoiceNumber,
        invoiceDate: tradeInvoices.invoiceDate,
        amount: tradeInvoices.amount,
        gstAmount: tradeInvoices.gstAmount,
        totalWithGst: tradeInvoices.totalWithGst,
        approvedAmount: tradeInvoices.approvedAmount,
        approvedGstAmount: tradeInvoices.approvedGstAmount,
        approvedTotalWithGst: tradeInvoices.approvedTotalWithGst,
        approvalAdjustmentReason: tradeInvoices.approvalAdjustmentReason,
        description: tradeInvoices.description,
        fileUrl: tradeInvoices.fileUrl,
        ocrStatus: tradeInvoices.ocrStatus,
        ocrConfidence: tradeInvoices.ocrConfidence,
        status: tradeInvoices.status,
        submittedAt: tradeInvoices.submittedAt,
        xeroBillId: tradeInvoices.xeroBillId,
        createdAt: tradeInvoices.createdAt,
        tradeName: constructionInstallers.name,
        tradeEmail: constructionInstallers.email,
      })
        .from(tradeInvoices)
        .leftJoin(constructionInstallers, eq(tradeInvoices.installerId, constructionInstallers.id))
        .leftJoin(constructionJobs, eq(tradeInvoices.jobId, constructionJobs.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(tradeInvoices.submittedAt))
        .limit(input.limit)
        .offset(input.offset);

      const [countResult] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(tradeInvoices)
        .leftJoin(constructionInstallers, eq(tradeInvoices.installerId, constructionInstallers.id))
        .leftJoin(constructionJobs, eq(tradeInvoices.jobId, constructionJobs.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      // Attach photo counts to each invoice
      const invoicesWithPhotos = invoices.map(inv => ({
        ...inv,
        photoCount: photoCountMap.get(inv.id) || 0,
      }));

      return { invoices: invoicesWithPhotos, total: Number(countResult?.count || 0) };
    }),

  // ─── Get Invoice Detail (Admin) ───────────────────────────────────────────
  getInvoiceDetail: adminProcedure
    .input(z.object({ invoiceId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const invoice = await requireInvoiceAccess(db, ctx, input.invoiceId);

      const lines = await db.select()
        .from(tradeInvoiceLines)
        .where(eq(tradeInvoiceLines.invoiceId, input.invoiceId))
        .orderBy(tradeInvoiceLines.lineNumber);

      const approvals = await db.select()
        .from(tradeInvoiceApprovals)
        .where(eq(tradeInvoiceApprovals.invoiceId, input.invoiceId))
        .orderBy(desc(tradeInvoiceApprovals.createdAt));

      const [trade] = await db.select()
        .from(constructionInstallers)
        .where(and(...installerTenantConditions(ctx, eq(constructionInstallers.id, invoice.installerId))))
        .limit(1);

      // Get available jobs for this trade
      const jobs = await db.select({ id: constructionJobs.id, quoteNumber: constructionJobs.quoteNumber, siteAddress: constructionJobs.siteAddress })
        .from(constructionJobs)
        .where(and(...jobTenantConditions(ctx)))
        .limit(100);

      // Get PO milestones if job is linked
      let milestones: any[] = [];
      if (invoice.jobId) {
        milestones = await db.select()
          .from(poMilestones)
          .where(eq(poMilestones.jobId, invoice.jobId))
          .orderBy(poMilestones.sortOrder);
      }

      // Get proof-of-work photos
      const photos = await db.select()
        .from(tradeInvoicePhotos)
        .where(eq(tradeInvoicePhotos.invoiceId, input.invoiceId))
        .orderBy(desc(tradeInvoicePhotos.uploadedAt));

      return { invoice, lines, approvals, trade, jobs, milestones, photos };
    }),

  // ─── AI Invoice Extraction ────────────────────────────────────────────────
  extractInvoiceData: adminProcedure
    .input(z.object({ invoiceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const invoice = await requireInvoiceAccess(db, ctx, input.invoiceId);
      if (!invoice.fileUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "No file attached to invoice" });

      // Update status to extracting
      await db.update(tradeInvoices)
        .set({ ocrStatus: "extracting" })
        .where(eq(tradeInvoices.id, input.invoiceId));

      try {
        // Use LLM with vision to extract invoice data
        const result = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are an invoice data extraction assistant for a construction company. Extract structured data from the invoice image/document. Return JSON with the following structure:
{
  "invoiceNumber": "string",
  "invoiceDate": "YYYY-MM-DD",
  "supplierName": "string",
  "supplierABN": "string or null",
  "subtotal": number,
  "gst": number,
  "total": number,
  "lines": [
    {
      "lineNumber": number,
      "description": "string",
      "quantity": number,
      "unitPrice": number,
      "amount": number,
      "gst": number
    }
  ],
  "confidence": number (0-100),
  "notes": "any observations about the invoice"
}`
            },
            {
              role: "user",
              content: [
                { type: "text", text: "Extract the invoice data from this document:" },
                { type: "image_url", image_url: { url: invoice.fileUrl, detail: "high" } },
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
                  invoiceNumber: { type: "string" },
                  invoiceDate: { type: "string" },
                  supplierName: { type: "string" },
                  supplierABN: { type: ["string", "null"] },
                  subtotal: { type: "number" },
                  gst: { type: "number" },
                  total: { type: "number" },
                  lines: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        lineNumber: { type: "integer" },
                        description: { type: "string" },
                        quantity: { type: "number" },
                        unitPrice: { type: "number" },
                        amount: { type: "number" },
                        gst: { type: "number" },
                      },
                      required: ["lineNumber", "description", "quantity", "unitPrice", "amount", "gst"],
                      additionalProperties: false,
                    },
                  },
                  confidence: { type: "integer" },
                  notes: { type: "string" },
                },
                required: ["invoiceNumber", "invoiceDate", "supplierName", "supplierABN", "subtotal", "gst", "total", "lines", "confidence", "notes"],
                additionalProperties: false,
              },
            },
          },
        });

        const content = result.choices[0]?.message?.content;
        if (!content) throw new Error("No response from LLM");

        const extracted = JSON.parse(typeof content === "string" ? content : "{}");

        // Update invoice with extracted data
        await db.update(tradeInvoices).set({
          ocrStatus: "extracted",
          ocrRawData: extracted,
          ocrConfidence: String(extracted.confidence || 0),
          invoiceNumber: extracted.invoiceNumber || invoice.invoiceNumber,
          amount: String(extracted.subtotal || invoice.amount),
          gstAmount: String(extracted.gst || 0),
          totalWithGst: String(extracted.total || 0),
          invoiceDate: extracted.invoiceDate ? new Date(extracted.invoiceDate) : null,
        }).where(eq(tradeInvoices.id, input.invoiceId));

        // Insert extracted line items
        if (extracted.lines && extracted.lines.length > 0) {
          // Delete existing lines first (re-extraction)
          await db.delete(tradeInvoiceLines).where(eq(tradeInvoiceLines.invoiceId, input.invoiceId));

          for (const line of extracted.lines) {
            await db.insert(tradeInvoiceLines).values({
              invoiceId: input.invoiceId,
              lineNumber: line.lineNumber,
              description: line.description,
              quantity: String(line.quantity),
              unitPrice: String(line.unitPrice),
              amount: String(line.amount),
              gstAmount: String(line.gst),
            });
          }
        }

        return { success: true, extracted, linesCreated: extracted.lines?.length || 0 };
      } catch (err: any) {
        await db.update(tradeInvoices)
          .set({ ocrStatus: "failed", ocrRawData: { error: err.message } })
          .where(eq(tradeInvoices.id, input.invoiceId));
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Extraction failed: ${err.message}` });
      }
    }),

  // ─── Update Invoice Line (Admin edits after AI extraction) ────────────────
  updateInvoiceLine: adminProcedure
    .input(z.object({
      lineId: z.number(),
      description: z.string().optional(),
      quantity: z.string().optional(),
      unitPrice: z.string().optional(),
      amount: z.string().optional(),
      gstAmount: z.string().optional(),
      jobId: z.number().nullable().optional(),
      workOrderId: z.number().nullable().optional(),
      milestoneId: z.number().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const { lineId, ...updates } = input;
      const line = await requireInvoiceLineAccess(db, ctx, lineId);
      const cleanUpdates: any = {};
      if (updates.description !== undefined) cleanUpdates.description = updates.description;
      if (updates.quantity !== undefined) cleanUpdates.quantity = updates.quantity;
      if (updates.unitPrice !== undefined) cleanUpdates.unitPrice = updates.unitPrice;
      if (updates.amount !== undefined) cleanUpdates.amount = updates.amount;
      if (updates.gstAmount !== undefined) cleanUpdates.gstAmount = updates.gstAmount;
      if (updates.jobId !== undefined) {
        if (updates.jobId != null) await requireJobVisible(db, ctx, updates.jobId);
        cleanUpdates.jobId = updates.jobId;
      }
      if (updates.workOrderId !== undefined) {
        if (updates.workOrderId != null) {
          const workOrder = await requireWorkOrderVisible(db, ctx, updates.workOrderId);
          const targetJobId = updates.jobId !== undefined ? updates.jobId : line.jobId;
          if (targetJobId != null && workOrder.jobId !== targetJobId) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Work order does not belong to the selected job" });
          }
          if (targetJobId == null) cleanUpdates.jobId = workOrder.jobId;
        }
        cleanUpdates.workOrderId = updates.workOrderId;
      }
      if (updates.milestoneId !== undefined) {
        if (updates.milestoneId != null) {
          const milestone = await requireMilestoneVisible(db, ctx, updates.milestoneId);
          const targetJobId = cleanUpdates.jobId !== undefined ? cleanUpdates.jobId : line.jobId;
          if (targetJobId != null && milestone.jobId !== targetJobId) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Milestone does not belong to the selected job" });
          }
          if (targetJobId == null) cleanUpdates.jobId = milestone.jobId;
          const targetWorkOrderId = cleanUpdates.workOrderId !== undefined ? cleanUpdates.workOrderId : line.workOrderId;
          if (targetWorkOrderId != null && milestone.workOrderId !== targetWorkOrderId) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Milestone does not belong to the selected work order" });
          }
        }
        cleanUpdates.milestoneId = updates.milestoneId;
      }

      await db.update(tradeInvoiceLines).set(cleanUpdates).where(eq(tradeInvoiceLines.id, lineId));
      return { success: true };
    }),

  // ─── Confirm Extraction (trade confirms AI-extracted data) ────────────────
  confirmExtraction: adminProcedure
    .input(z.object({ invoiceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await requireInvoiceAccess(db, ctx, input.invoiceId);
      await db.update(tradeInvoices).set({
        ocrStatus: "confirmed",
        status: "pending_approval",
      }).where(eq(tradeInvoices.id, input.invoiceId));
      return { success: true };
    }),

  // ─── Approve Invoice Line (Supervisor) ────────────────────────────────────
  approveInvoiceLine: tenantProcedure
    .input(z.object({
      lineId: z.number(),
      action: z.enum(["approved", "rejected", "returned"]),
      comments: z.string().optional(),
      approvedAmount: z.string().optional(),
      approvedGstAmount: z.string().optional(),
      adjustmentReason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const line = await requireInvoiceLineAccess(db, ctx, input.lineId);

      // Check if user is the assigned supervisor for this job (or admin)
      if (line.jobId) {
        const job = await requireJobVisible(db, ctx, line.jobId);
        // If a supervisor is assigned, only they (or admin) can approve
        if (job?.supervisorId && job.supervisorId !== ctx.user.id && ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only the assigned supervisor or admin can approve this line" });
        }
      }

      const cleanApprovedAmount = input.action === "approved" && input.approvedAmount?.trim()
        ? moneyNumber(input.approvedAmount)
        : null;
      const cleanApprovedGstAmount = input.action === "approved" && input.approvedGstAmount?.trim()
        ? moneyNumber(input.approvedGstAmount)
        : null;
      if (
        input.action === "approved" &&
        (cleanApprovedAmount != null && cleanApprovedAmount < 0 || cleanApprovedGstAmount != null && cleanApprovedGstAmount < 0)
      ) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Approved amounts cannot be negative" });
      }

      const amountAdjusted = input.action === "approved" && cleanApprovedAmount != null
        && Math.abs(cleanApprovedAmount - moneyNumber(line.amount)) > 0.005;
      const gstAdjusted = input.action === "approved" && cleanApprovedGstAmount != null
        && Math.abs(cleanApprovedGstAmount - moneyNumber(line.gstAmount)) > 0.005;
      const adjustmentReason = (input.adjustmentReason || input.comments || "").trim();
      if ((amountAdjusted || gstAdjusted) && !adjustmentReason) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Reason is required when approving a different amount" });
      }

      const auditComment = input.action === "approved" && (amountAdjusted || gstAdjusted)
        ? `Approved at $${moneyString((cleanApprovedAmount ?? moneyNumber(line.amount)) + (cleanApprovedGstAmount ?? moneyNumber(line.gstAmount)))} inc GST. Reason: ${adjustmentReason}`
        : input.comments || null;

      // Update line approval status
      await db.update(tradeInvoiceLines).set({
        approvalStatus: input.action === "returned" ? "pending" : input.action,
        approvedBy: input.action === "approved" ? ctx.user.id : null,
        approvedAt: input.action === "approved" ? new Date() : null,
        rejectionReason: input.action === "rejected" ? input.comments || null : null,
        approvedAmount: input.action === "approved" ? (cleanApprovedAmount != null ? moneyString(cleanApprovedAmount) : null) : null,
        approvedGstAmount: input.action === "approved" ? (cleanApprovedGstAmount != null ? moneyString(cleanApprovedGstAmount) : null) : null,
        approvalAdjustmentReason: input.action === "approved" && (amountAdjusted || gstAdjusted) ? adjustmentReason : null,
      }).where(eq(tradeInvoiceLines.id, input.lineId));

      // Create approval audit log
      await db.insert(tradeInvoiceApprovals).values({
        invoiceId: line.invoiceId,
        lineId: input.lineId,
        supervisorId: ctx.user.id,
        supervisorName: ctx.user.name || ctx.user.email,
        action: input.action,
        comments: auditComment,
      });

      const { allApproved, anyRejected } = await finaliseInvoiceIfReady(db, ctx, line.invoiceId);

      return { success: true, allApproved, anyRejected };
    }),

  // ─── Bulk Approve All Lines ───────────────────────────────────────────────
  bulkApproveInvoice: tenantProcedure
    .input(z.object({
      invoiceId: z.number(),
      comments: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await requireInvoiceAccess(db, ctx, input.invoiceId);
      const lines = await db.select()
        .from(tradeInvoiceLines)
        .where(and(
          eq(tradeInvoiceLines.invoiceId, input.invoiceId),
          eq(tradeInvoiceLines.approvalStatus, "pending"),
        ));

      for (const line of lines) {
        if (line.jobId) {
          const job = await requireJobVisible(db, ctx, line.jobId);
          if (job?.supervisorId && job.supervisorId !== ctx.user.id && ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
            throw new TRPCError({ code: "FORBIDDEN", message: "Only the assigned supervisor or admin can approve this invoice" });
          }
        }

        await db.update(tradeInvoiceLines).set({
          approvalStatus: "approved",
          approvedBy: ctx.user.id,
          approvedAt: new Date(),
          approvedAmount: null,
          approvedGstAmount: null,
          approvalAdjustmentReason: null,
        }).where(eq(tradeInvoiceLines.id, line.id));

        await db.insert(tradeInvoiceApprovals).values({
          invoiceId: input.invoiceId,
          lineId: line.id,
          supervisorId: ctx.user.id,
          supervisorName: ctx.user.name || ctx.user.email,
          action: "approved",
          comments: input.comments || "Bulk approved",
        });
      }

      await finaliseInvoiceIfReady(db, ctx, input.invoiceId);

      return { success: true, linesApproved: lines.length };
    }),

  // ─── Create Xero Bill from Approved Invoice ───────────────────────────────
  createXeroBill: adminProcedure
    .input(z.object({ invoiceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const invoice = await requireInvoiceAccess(db, ctx, input.invoiceId);
      if (invoice.status !== "approved") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice must be approved before creating Xero bill" });
      }
      if (invoice.xeroBillId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Xero bill already created for this invoice" });
      }

      // Get trade's Xero contact ID
      const [trade] = await db.select()
        .from(constructionInstallers)
        .where(and(...installerTenantConditions(ctx, eq(constructionInstallers.id, invoice.installerId))))
        .limit(1);
      if (!trade?.xeroContactId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Trade is not linked to a Xero contact. Please sync contacts first." });
      }

      // Get invoice lines
      const lines = await db.select()
        .from(tradeInvoiceLines)
        .where(eq(tradeInvoiceLines.invoiceId, input.invoiceId));
      for (const line of lines) {
        if (line.jobId) await requireJobVisible(db, ctx, line.jobId);
      }

      // Create bill in Xero
      const auth = await getValidAccessToken({ appTenantId: ctx.tenant?.id, moduleKey: "trade_portal" });
      if (!auth) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Xero not connected" });

      const xeroLineItems = lines.map(line => {
        const quantity = moneyNumber(line.quantity || "1") || 1;
        const approvedLineAmount = lineApprovedAmount(line);
        return {
          Description: line.approvalAdjustmentReason
            ? `${line.description}\nApproved adjustment: ${line.approvalAdjustmentReason}`
            : line.description,
          Quantity: quantity,
          UnitAmount: approvedLineAmount / quantity,
          AccountCode: "200", // Default cost of sales account
          TaxType: "INPUT", // GST on purchases
        };
      });

      const billPayload = {
        Type: "ACCPAY",
        Contact: { ContactID: trade.xeroContactId },
        InvoiceNumber: invoice.invoiceNumber,
        Date: invoice.invoiceDate ? new Date(invoice.invoiceDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
        DueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0], // 30 days
        LineItems: xeroLineItems,
        Status: "AUTHORISED",
        Reference: invoice.description || `Trade Invoice ${invoice.invoiceNumber}`,
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
        await db.update(tradeInvoices).set({
          xeroBillId: createdBill.InvoiceID,
          xeroBillNumber: createdBill.InvoiceNumber,
        }).where(eq(tradeInvoices.id, input.invoiceId));
      }

      return {
        success: true,
        xeroBillId: createdBill?.InvoiceID,
        xeroBillNumber: createdBill?.InvoiceNumber,
      };
    }),

  // ─── Mark Invoice as Paid (from Xero reconciliation or manual) ────────────
  markAsPaid: adminProcedure
    .input(z.object({
      invoiceId: z.number(),
      paymentDate: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await requireInvoiceAccess(db, ctx, input.invoiceId);
      await db.update(tradeInvoices).set({
        status: "paid",
      }).where(eq(tradeInvoices.id, input.invoiceId));

      // Also update any linked PO milestones
      const lines = await db.select()
        .from(tradeInvoiceLines)
        .where(eq(tradeInvoiceLines.invoiceId, input.invoiceId));

      for (const line of lines) {
        if (line.milestoneId) {
          await requireMilestoneVisible(db, ctx, line.milestoneId);
          await db.update(poMilestones).set({
            status: "paid",
            paidAt: input.paymentDate ? new Date(input.paymentDate) : new Date(),
          }).where(eq(poMilestones.id, line.milestoneId));
        }
      }

      return { success: true };
    }),

  // ─── Assign Supervisor to Job ─────────────────────────────────────────────
  assignSupervisor: adminProcedure
    .input(z.object({
      jobId: z.number(),
      supervisorId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await requireJobVisible(db, ctx, input.jobId);
      await db.update(constructionJobs).set({
        supervisorId: input.supervisorId,
      }).where(eq(constructionJobs.id, input.jobId));
      return { success: true };
    }),

  // ─── Get Supervisors (users who can approve) ─────────────────────────────
  getSupervisors: adminProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db.select({
      id: users.id,
      name: users.name,
      email: users.email,
    })
      .from(users)
      .innerJoin(tenantMemberships, eq(tenantMemberships.userId, users.id))
      .where(eq(tenantMemberships.tenantId, tenantIdFromContext(ctx)!));
  }),

  // ─── Invoice Stats (Dashboard) ───────────────────────────────────────────
  invoiceStats: adminProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const [submitted] = await db.select({ count: sql<number>`COUNT(*)` })
      .from(tradeInvoices)
      .leftJoin(constructionInstallers, eq(tradeInvoices.installerId, constructionInstallers.id))
      .leftJoin(constructionJobs, eq(tradeInvoices.jobId, constructionJobs.id))
      .where(invoiceWhere(ctx, eq(tradeInvoices.status, "submitted")));
    const [pendingApproval] = await db.select({ count: sql<number>`COUNT(*)` })
      .from(tradeInvoices)
      .leftJoin(constructionInstallers, eq(tradeInvoices.installerId, constructionInstallers.id))
      .leftJoin(constructionJobs, eq(tradeInvoices.jobId, constructionJobs.id))
      .where(invoiceWhere(ctx, eq(tradeInvoices.status, "pending_approval")));
    const [approved] = await db.select({ count: sql<number>`COUNT(*)` })
      .from(tradeInvoices)
      .leftJoin(constructionInstallers, eq(tradeInvoices.installerId, constructionInstallers.id))
      .leftJoin(constructionJobs, eq(tradeInvoices.jobId, constructionJobs.id))
      .where(invoiceWhere(ctx, eq(tradeInvoices.status, "approved")));
    const [paid] = await db.select({ count: sql<number>`COUNT(*)` })
      .from(tradeInvoices)
      .leftJoin(constructionInstallers, eq(tradeInvoices.installerId, constructionInstallers.id))
      .leftJoin(constructionJobs, eq(tradeInvoices.jobId, constructionJobs.id))
      .where(invoiceWhere(ctx, eq(tradeInvoices.status, "paid")));
    const [rejected] = await db.select({ count: sql<number>`COUNT(*)` })
      .from(tradeInvoices)
      .leftJoin(constructionInstallers, eq(tradeInvoices.installerId, constructionInstallers.id))
      .leftJoin(constructionJobs, eq(tradeInvoices.jobId, constructionJobs.id))
      .where(invoiceWhere(ctx, eq(tradeInvoices.status, "rejected")));
    const [totalValue] = await db.select({ total: sql<string>`COALESCE(SUM(CAST(amount AS DECIMAL(12,2))), 0)` })
      .from(tradeInvoices)
      .leftJoin(constructionInstallers, eq(tradeInvoices.installerId, constructionInstallers.id))
      .leftJoin(constructionJobs, eq(tradeInvoices.jobId, constructionJobs.id))
      .where(invoiceWhere(ctx, eq(tradeInvoices.status, "pending_approval")));

    return {
      submitted: Number(submitted?.count || 0),
      pendingApproval: Number(pendingApproval?.count || 0),
      approved: Number(approved?.count || 0),
      paid: Number(paid?.count || 0),
      rejected: Number(rejected?.count || 0),
      pendingValue: totalValue?.total || "0",
    };
  }),

  // ─── Auto-Match Invoice Lines to POs ────────────────────────────────────
  autoMatchInvoiceLines: adminProcedure
    .input(z.object({ invoiceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await requireInvoiceAccess(db, ctx, input.invoiceId);

      const lines = await db.select()
        .from(tradeInvoiceLines)
        .where(eq(tradeInvoiceLines.invoiceId, input.invoiceId));

      // Get all jobs assigned to this trade
      const jobs = await db.select()
        .from(constructionJobs)
        .where(and(...jobTenantConditions(ctx, eq(constructionJobs.status, "in_progress"))));

      // Get all work orders for this trade's jobs
      const jobIds = jobs.map(job => job.id);
      if (jobIds.length === 0) {
        return { success: true, matchedLines: 0, totalLines: lines.length };
      }
      const workOrders = await db.select()
        .from(cmWorkOrders)
        .where(inArray(cmWorkOrders.jobId, jobIds));

      let matchCount = 0;
      for (const line of lines) {
        if (line.jobId && line.workOrderId) continue; // Already matched

        // Try to match by description keywords against job names/addresses
        const desc = (line.description || "").toLowerCase();
        let matchedJob = null;
        let matchedWO = null;

        // Match by work order reference
        for (const wo of workOrders) {
          if (desc.includes((wo.description || "").toLowerCase()) ||
              desc.includes(`wo-${wo.id}`) ||
              desc.includes(`wo${wo.id}`)) {
            matchedWO = wo;
            matchedJob = jobs.find(j => j.id === wo.jobId);
            break;
          }
        }

        // Match by job name/address
        if (!matchedJob) {
          for (const job of jobs) {
            const jobName = (job.clientName || "").toLowerCase();
            const jobAddr = (job.siteAddress || "").toLowerCase();
            const jobNum = (job.quoteNumber || "").toLowerCase();
            if ((jobName && desc.includes(jobName)) ||
                (jobAddr && desc.includes(jobAddr)) ||
                (jobNum && desc.includes(jobNum))) {
              matchedJob = job;
              const relatedWOs = workOrders.filter(wo => wo.jobId === job.id);
              if (relatedWOs.length === 1) matchedWO = relatedWOs[0];
              break;
            }
          }
        }

        if (matchedJob || matchedWO) {
          const updates: any = {};
          if (matchedJob) updates.jobId = matchedJob.id;
          if (matchedWO) updates.workOrderId = matchedWO.id;
          await db.update(tradeInvoiceLines).set(updates).where(eq(tradeInvoiceLines.id, line.id));
          matchCount++;
        }
      }

      return { success: true, matchedLines: matchCount, totalLines: lines.length };
    }),

  // ─── Submit Invoice for Review ──────────────────────────────────────────────
  submitForReview: adminProcedure
    .input(z.object({ invoiceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const invoice = await requireInvoiceAccess(db, ctx, input.invoiceId);
      if (invoice.status !== "submitted" && invoice.status !== "draft") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice must be in submitted or draft status" });
      }

      await db.update(tradeInvoices).set({
        status: "pending_approval",
        reviewedAt: new Date(),
      }).where(eq(tradeInvoices.id, input.invoiceId));

      // Notify supervisor(s) for linked jobs
      const lines = await db.select()
        .from(tradeInvoiceLines)
        .where(eq(tradeInvoiceLines.invoiceId, input.invoiceId));

      const jobIds = Array.from(new Set(lines.map(l => l.jobId).filter(Boolean))) as number[];
      if (jobIds.length > 0) {
        for (const jobId of jobIds) await requireJobVisible(db, ctx, jobId);
        const jobsWithSupervisors = await db.select({
          id: constructionJobs.id,
          clientName: constructionJobs.clientName,
          supervisorId: constructionJobs.supervisorId,
        }).from(constructionJobs).where(and(...jobTenantConditions(ctx, inArray(constructionJobs.id, jobIds))));

        const [trade] = await db.select({ name: constructionInstallers.name })
          .from(constructionInstallers)
          .where(and(...installerTenantConditions(ctx, eq(constructionInstallers.id, invoice.installerId))))
          .limit(1);

        for (const job of jobsWithSupervisors) {
          if (job.supervisorId) {
            notifyOwner({
              title: "Invoice Needs Approval",
              content: `Invoice ${invoice.invoiceNumber} from ${trade?.name || "trade"} for ${job.clientName} requires your approval. Amount: $${invoice.amount}`,
            }).catch(() => {});
          }
        }
      }

      return { success: true };
    }),

  // ─── Retention Release ──────────────────────────────────────────────────────
  releaseRetention: adminProcedure
    .input(z.object({
      milestoneId: z.number(),
      releaseDate: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const milestone = await requireMilestoneVisible(db, ctx, input.milestoneId);
      if (milestone.status !== "paid" && milestone.status !== "retention_held") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Milestone must be paid or retention_held to release retention" });
      }

      await db.update(poMilestones).set({
        status: "retention_released",
        retentionReleasedAt: input.releaseDate ? new Date(input.releaseDate) : new Date(),
      }).where(eq(poMilestones.id, input.milestoneId));

      return { success: true };
    }),

  // ─── Sync Payment Status from Xero ─────────────────────────────────────────
  syncPaymentStatus: adminProcedure
    .input(z.object({ invoiceId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const auth = await getValidAccessToken({ appTenantId: ctx.tenant?.id, moduleKey: "trade_portal" });
      if (!auth) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Xero not connected" });

      // Get invoices with Xero bill IDs that aren't yet paid
      const conditions: any[] = [sql`${tradeInvoices.xeroBillId} IS NOT NULL`];
      if (input.invoiceId) {
        await requireInvoiceAccess(db, ctx, input.invoiceId);
        conditions.push(eq(tradeInvoices.id, input.invoiceId));
      } else {
        conditions.push(sql`${tradeInvoices.status} != 'paid'`);
      }
      appendInvoiceTenantScope(ctx, conditions);

      const invoicesWithBills = await db.select()
        .from(tradeInvoices)
        .leftJoin(constructionInstallers, eq(tradeInvoices.installerId, constructionInstallers.id))
        .leftJoin(constructionJobs, eq(tradeInvoices.jobId, constructionJobs.id))
        .where(and(...conditions));

      let updatedCount = 0;
      for (const invRow of invoicesWithBills) {
        const inv = (invRow as any).trade_invoices ?? invRow;
        try {
          const resp = await fetch(
            `https://api.xero.com/api.xro/2.0/Invoices/${inv.xeroBillId}`,
            {
              headers: {
                "Authorization": `Bearer ${auth.accessToken}`,
                "xero-tenant-id": auth.tenantId,
                "Accept": "application/json",
              },
            }
          );
          if (!resp.ok) continue;
          const data = await resp.json();
          const xeroInvoice = data.Invoices?.[0];
          if (xeroInvoice?.Status === "PAID" && inv.status !== "paid") {
            await db.update(tradeInvoices).set({ status: "paid" })
              .where(eq(tradeInvoices.id, inv.id));

            // Update linked milestones
            const lines = await db.select()
              .from(tradeInvoiceLines)
              .where(eq(tradeInvoiceLines.invoiceId, inv.id));
            for (const line of lines) {
              if (line.milestoneId) {
                await requireMilestoneVisible(db, ctx, line.milestoneId);
                await db.update(poMilestones).set({
                  status: "paid",
                  paidAt: new Date(),
                }).where(eq(poMilestones.id, line.milestoneId));
              }
            }
            updatedCount++;
          }
        } catch (e) {
          console.error(`Failed to sync payment for invoice ${inv.id}:`, e);
        }
      }

      return { success: true, updatedCount, checkedCount: invoicesWithBills.length };
    }),

  // ─── PO Milestone Management ──────────────────────────────────────────────
  getMilestones: adminProcedure
    .input(z.object({ workOrderId: z.number().optional(), jobId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const conditions: any[] = [];
      if (input.workOrderId) {
        await requireWorkOrderVisible(db, ctx, input.workOrderId);
        conditions.push(eq(poMilestones.workOrderId, input.workOrderId));
      }
      if (input.jobId) {
        await requireJobVisible(db, ctx, input.jobId);
        conditions.push(eq(poMilestones.jobId, input.jobId));
      } else {
        const jobs = await db.select({ id: constructionJobs.id })
          .from(constructionJobs)
          .where(and(...jobTenantConditions(ctx)));
        const jobIds = jobs.map(job => job.id);
        if (jobIds.length === 0) return [];
        conditions.push(inArray(poMilestones.jobId, jobIds));
      }
      return db.select()
        .from(poMilestones)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(poMilestones.sortOrder);
    }),

  createMilestone: adminProcedure
    .input(z.object({
      workOrderId: z.number(),
      jobId: z.number(),
      stage: z.string().min(1),
      description: z.string().optional(),
      percentage: z.string(),
      amount: z.string(),
      retentionPercent: z.string().default("5.00"),
      sortOrder: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await requireJobVisible(db, ctx, input.jobId);
      const workOrder = await requireWorkOrderVisible(db, ctx, input.workOrderId);
      if (workOrder.jobId !== input.jobId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Work order does not belong to this job" });
      }
      const retentionAmount = String(parseFloat(input.amount) * parseFloat(input.retentionPercent) / 100);
      const [result] = await db.insert(poMilestones).values({
        ...input,
        retentionAmount,
        description: input.description || null,
      });
      return { id: result.insertId };
    }),

  updateMilestone: adminProcedure
    .input(z.object({
      id: z.number(),
      stage: z.string().optional(),
      description: z.string().nullable().optional(),
      percentage: z.string().optional(),
      amount: z.string().optional(),
      retentionPercent: z.string().optional(),
      sortOrder: z.number().optional(),
      status: z.enum(["pending", "claimed", "approved", "paid", "retention_held", "retention_released"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const { id, ...updates } = input;
      await requireMilestoneVisible(db, ctx, id);
      const cleanUpdates: any = {};
      Object.entries(updates).forEach(([k, v]) => { if (v !== undefined) cleanUpdates[k] = v; });
      if (cleanUpdates.amount && cleanUpdates.retentionPercent) {
        cleanUpdates.retentionAmount = String(parseFloat(cleanUpdates.amount) * parseFloat(cleanUpdates.retentionPercent) / 100);
      }
      await db.update(poMilestones).set(cleanUpdates).where(eq(poMilestones.id, id));
      return { success: true };
    }),

  deleteMilestone: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await requireMilestoneVisible(db, ctx, input.id);
      await db.delete(poMilestones).where(eq(poMilestones.id, input.id));
      return { success: true };
    }),

  // ─── Photo Review Status ─────────────────────────────────────────────────

  markPhotoReviewed: adminProcedure
    .input(z.object({ photoId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await requireInvoicePhotoAccess(db, ctx, input.photoId);
      await db.update(tradeInvoicePhotos)
        .set({ reviewedAt: new Date(), reviewedBy: ctx.user!.name || "Admin" })
        .where(eq(tradeInvoicePhotos.id, input.photoId));
      return { success: true };
    }),

  markAllPhotosReviewed: adminProcedure
    .input(z.object({ invoiceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await requireInvoiceAccess(db, ctx, input.invoiceId);
      await db.update(tradeInvoicePhotos)
        .set({ reviewedAt: new Date(), reviewedBy: ctx.user!.name || "Admin" })
        .where(and(
          eq(tradeInvoicePhotos.invoiceId, input.invoiceId),
          isNull(tradeInvoicePhotos.reviewedAt)
        ));
      return { success: true };
    }),

  unmarkPhotoReviewed: adminProcedure
    .input(z.object({ photoId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await requireInvoicePhotoAccess(db, ctx, input.photoId);
      await db.update(tradeInvoicePhotos)
        .set({ reviewedAt: null, reviewedBy: null })
        .where(eq(tradeInvoicePhotos.id, input.photoId));
      return { success: true };
    }),
});
