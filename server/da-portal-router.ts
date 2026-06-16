/**
 * Design Adviser (DA) Portal Router
 * Provides commission tracking, invoice management, payments, and personal details
 * for users with role 'design_adviser'.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "./db";
import { eq, and, desc, sql, inArray, or } from "drizzle-orm";
import {
  daCommissions, daCommissionAdjustments, daInvoices,
  daPersonalDetails, portalNews, users, designAdvisors,
} from "../drizzle/schema";
import { protectedProcedure, adminProcedure, router, middleware } from "./_core/trpc";

// ─── DA Middleware ──────────────────────────────────────────────────────────
const requireDA = middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  const DA_ROLES = ["design_adviser", "admin", "super_admin"];
  if (!DA_ROLES.includes(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "DA portal access required" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

const daProcedure = protectedProcedure.use(requireDA);

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

export const daPortalRouter = router({
  // ─── Personal Details ─────────────────────────────────────────────────────
  getPersonalDetails: daProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const [details] = await db.select()
      .from(daPersonalDetails)
      .where(eq(daPersonalDetails.userId, ctx.user.id))
      .limit(1);
    if (!details) {
      // Return defaults from user record
      return {
        id: null,
        userId: ctx.user.id,
        fullName: ctx.user.name || "",
        email: ctx.user.email || "",
        phone: "",
        address: "",
        abn: "",
        bankBsb: "",
        bankAccount: "",
        bankName: "",
        paymentTerms: "14 days",
        xeroContactId: null,
      };
    }
    return details;
  }),

  updatePersonalDetails: daProcedure
    .input(z.object({
      fullName: z.string().optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
      abn: z.string().optional(),
      bankBsb: z.string().optional(),
      bankAccount: z.string().optional(),
      bankName: z.string().optional(),
      paymentTerms: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [existing] = await db.select()
        .from(daPersonalDetails)
        .where(eq(daPersonalDetails.userId, ctx.user.id))
        .limit(1);
      if (existing) {
        await db.update(daPersonalDetails)
          .set(input)
          .where(eq(daPersonalDetails.userId, ctx.user.id));
      } else {
        await db.insert(daPersonalDetails).values({
          userId: ctx.user.id,
          ...input,
        });
      }
      return { success: true };
    }),

  // ─── Unclaimed Commissions ────────────────────────────────────────────────
  listCommissions: daProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    // Admin sees all, DA sees only their own
    const isAdmin = ["admin", "super_admin"].includes(ctx.user.role);
    const conditions = isAdmin ? [] : [eq(daCommissions.daUserId, ctx.user.id)];
    const commissions = await db.select()
      .from(daCommissions)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(daCommissions.createdAt));
    return commissions;
  }),

  getCommission: daProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const [commission] = await db.select()
        .from(daCommissions)
        .where(eq(daCommissions.id, input.id))
        .limit(1);
      if (!commission) throw new TRPCError({ code: "NOT_FOUND" });
      const isAdmin = ["admin", "super_admin"].includes(ctx.user.role);
      if (!isAdmin && commission.daUserId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      // Get adjustments
      const adjustments = await db.select()
        .from(daCommissionAdjustments)
        .where(eq(daCommissionAdjustments.commissionId, input.id))
        .orderBy(desc(daCommissionAdjustments.createdAt));
      return { ...commission, adjustments };
    }),

  // Admin: create commission record
  createCommission: adminProcedure
    .input(z.object({
      daUserId: z.number(),
      daName: z.string(),
      constructionJobId: z.number().optional(),
      quoteId: z.number().optional(),
      quoteType: z.string().optional(),
      jobNo: z.string().optional(),
      contractNo: z.string().optional(),
      clientName: z.string(),
      totalCommission: z.string(), // decimal as string
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const totalComm = parseFloat(input.totalCommission) || 0;
      const [result] = await db.insert(daCommissions).values({
        daUserId: input.daUserId,
        daName: input.daName,
        constructionJobId: input.constructionJobId || null,
        quoteId: input.quoteId || null,
        quoteType: input.quoteType || null,
        jobNo: input.jobNo || null,
        contractNo: input.contractNo || null,
        clientName: input.clientName,
        totalCommission: totalComm.toFixed(2),
        amountPaid: "0.00",
        adjustmentsTotal: "0.00",
        balanceDue: totalComm.toFixed(2),
        status: "pending",
        notes: input.notes || null,
      }).$returningId();
      return { id: result.id };
    }),

  // Admin: update commission total or status
  updateCommission: adminProcedure
    .input(z.object({
      id: z.number(),
      totalCommission: z.string().optional(),
      status: z.enum(["pending", "deposit_received", "partial_paid", "fully_paid", "closed"]).optional(),
      depositReceivedAt: z.string().nullable().optional(),
      contractSignedAt: z.string().nullable().optional(),
      completedAt: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      jobNo: z.string().optional(),
      contractNo: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const { id, ...updates } = input;
      const setData: Record<string, any> = {};
      if (updates.totalCommission !== undefined) {
        setData.totalCommission = updates.totalCommission;
      }
      if (updates.status !== undefined) setData.status = updates.status;
      if (updates.depositReceivedAt !== undefined) {
        setData.depositReceivedAt = updates.depositReceivedAt ? new Date(updates.depositReceivedAt) : null;
      }
      if (updates.contractSignedAt !== undefined) {
        setData.contractSignedAt = updates.contractSignedAt ? new Date(updates.contractSignedAt) : null;
      }
      if (updates.completedAt !== undefined) {
        setData.completedAt = updates.completedAt ? new Date(updates.completedAt) : null;
      }
      if (updates.notes !== undefined) setData.notes = updates.notes;
      if (updates.jobNo !== undefined) setData.jobNo = updates.jobNo;
      if (updates.contractNo !== undefined) setData.contractNo = updates.contractNo;

      if (Object.keys(setData).length > 0) {
        await db.update(daCommissions).set(setData).where(eq(daCommissions.id, id));
      }
      // Recalculate balance
      await recalculateBalance(db, id);
      return { success: true };
    }),

  // Admin: add adjustment
  addAdjustment: adminProcedure
    .input(z.object({
      commissionId: z.number(),
      amount: z.string(), // positive or negative
      reason: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await db.insert(daCommissionAdjustments).values({
        commissionId: input.commissionId,
        amount: input.amount,
        reason: input.reason,
        adjustedByUserId: ctx.user.id,
        adjustedByName: ctx.user.name || "Admin",
      });
      // Recalculate adjustments total and balance
      await recalculateBalance(db, input.commissionId);
      return { success: true };
    }),

  // ─── Invoices ─────────────────────────────────────────────────────────────
  listInvoices: daProcedure
    .input(z.object({ status: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const isAdmin = ["admin", "super_admin"].includes(ctx.user.role);
      const conditions: any[] = [];
      if (!isAdmin) conditions.push(eq(daInvoices.daUserId, ctx.user.id));
      if (input?.status) conditions.push(eq(daInvoices.status, input.status as any));
      return db.select()
        .from(daInvoices)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(daInvoices.createdAt));
    }),

  // DA submits invoice
  submitInvoice: daProcedure
    .input(z.object({
      commissionId: z.number(),
      amountExGst: z.string(),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      // Verify the commission belongs to this DA
      const [commission] = await db.select()
        .from(daCommissions)
        .where(eq(daCommissions.id, input.commissionId))
        .limit(1);
      if (!commission) throw new TRPCError({ code: "NOT_FOUND" });
      const isAdmin = ["admin", "super_admin"].includes(ctx.user.role);
      if (!isAdmin && commission.daUserId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      // Check amount doesn't exceed balance due
      const amountExGst = parseFloat(input.amountExGst);
      const balanceDue = parseFloat(commission.balanceDue as any) || 0;
      if (amountExGst > balanceDue + 0.01) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Invoice amount ($${amountExGst.toFixed(2)}) exceeds balance due ($${balanceDue.toFixed(2)})`,
        });
      }
      // Get DA personal details for ABN/bank
      const [details] = await db.select()
        .from(daPersonalDetails)
        .where(eq(daPersonalDetails.userId, ctx.user.id))
        .limit(1);
      const gstAmount = amountExGst * 0.1;
      const totalIncGst = amountExGst + gstAmount;
      // Generate invoice number
      const [countResult] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(daInvoices)
        .where(eq(daInvoices.daUserId, ctx.user.id));
      const invoiceNum = `DA-${ctx.user.id}-${String((countResult?.count || 0) + 1).padStart(4, "0")}`;

      const [result] = await db.insert(daInvoices).values({
        daUserId: ctx.user.id,
        daName: ctx.user.name || "DA",
        invoiceNumber: invoiceNum,
        commissionId: input.commissionId,
        amountExGst: amountExGst.toFixed(2),
        gstAmount: gstAmount.toFixed(2),
        totalIncGst: totalIncGst.toFixed(2),
        description: input.description || `Commission claim - ${commission.clientName} (Job ${commission.jobNo || "N/A"})`,
        abn: details?.abn || null,
        bankBsb: details?.bankBsb || null,
        bankAccount: details?.bankAccount || null,
        bankName: details?.bankName || null,
        paymentTerms: details?.paymentTerms || "14 days",
        status: "submitted",
        submittedAt: new Date(),
      }).$returningId();
      return { id: result.id, invoiceNumber: invoiceNum };
    }),

  // ─── Admin Invoice Approval ───────────────────────────────────────────────
  listPendingInvoices: adminProcedure.query(async () => {
    const db = await requireDb();
    return db.select()
      .from(daInvoices)
      .where(eq(daInvoices.status, "submitted"))
      .orderBy(desc(daInvoices.submittedAt));
  }),

  approveInvoice: adminProcedure
    .input(z.object({ invoiceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [invoice] = await db.select()
        .from(daInvoices)
        .where(eq(daInvoices.id, input.invoiceId))
        .limit(1);
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
      if (invoice.status !== "submitted") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice is not in submitted status" });
      }
      await db.update(daInvoices).set({
        status: "approved",
        approvedAt: new Date(),
        approvedByUserId: ctx.user.id,
        approvedByName: ctx.user.name || "Admin",
      }).where(eq(daInvoices.id, input.invoiceId));
      return { success: true };
    }),

  rejectInvoice: adminProcedure
    .input(z.object({ invoiceId: z.number(), reason: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await db.update(daInvoices).set({
        status: "rejected",
        rejectedAt: new Date(),
        rejectionReason: input.reason,
      }).where(eq(daInvoices.id, input.invoiceId));
      return { success: true };
    }),

  // Push approved invoice to Xero as a bill
  pushToXero: adminProcedure
    .input(z.object({ invoiceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [invoice] = await db.select()
        .from(daInvoices)
        .where(eq(daInvoices.id, input.invoiceId))
        .limit(1);
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
      if (invoice.status !== "approved") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice must be approved first" });
      }
      if (invoice.xeroInvoiceId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Already pushed to Xero" });
      }
      // Get DA's Xero contact ID
      const [details] = await db.select()
        .from(daPersonalDetails)
        .where(eq(daPersonalDetails.userId, invoice.daUserId))
        .limit(1);
      if (!details?.xeroContactId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "DA is not linked to a Xero contact. Please link in Personal Details." });
      }
      const { getValidAccessToken } = await import("./xero-client");
      const auth = await getValidAccessToken({ appTenantId: ctx.tenant?.id, moduleKey: "approvals" });
      if (!auth) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Xero not connected" });

      const billPayload = {
        Type: "ACCPAY",
        Contact: { ContactID: details.xeroContactId },
        InvoiceNumber: invoice.invoiceNumber,
        Date: new Date().toISOString().split("T")[0],
        DueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        LineItems: [{
          Description: invoice.description || `DA Commission - ${invoice.invoiceNumber}`,
          Quantity: 1,
          UnitAmount: parseFloat(invoice.amountExGst as any),
          AccountCode: "200", // Cost of sales
          TaxType: "INPUT",
        }],
        Status: "AUTHORISED",
        Reference: `DA Commission Invoice ${invoice.invoiceNumber}`,
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
        await db.update(daInvoices).set({
          xeroInvoiceId: createdBill.InvoiceID,
        }).where(eq(daInvoices.id, input.invoiceId));
      }
      return { success: true, xeroInvoiceId: createdBill?.InvoiceID };
    }),

  // Mark invoice as paid (after Xero reconciliation or manual)
  markInvoicePaid: adminProcedure
    .input(z.object({ invoiceId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [invoice] = await db.select()
        .from(daInvoices)
        .where(eq(daInvoices.id, input.invoiceId))
        .limit(1);
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
      await db.update(daInvoices).set({
        status: "paid",
        paidAt: new Date(),
      }).where(eq(daInvoices.id, input.invoiceId));
      // Update commission amountPaid
      if (invoice.commissionId) {
        const paidInvoices = await db.select({ total: sql<string>`SUM(amountExGst)` })
          .from(daInvoices)
          .where(and(
            eq(daInvoices.commissionId, invoice.commissionId),
            eq(daInvoices.status, "paid"),
          ));
        const totalPaid = parseFloat(paidInvoices[0]?.total || "0") + parseFloat(invoice.amountExGst as any);
        await db.update(daCommissions).set({
          amountPaid: totalPaid.toFixed(2),
        }).where(eq(daCommissions.id, invoice.commissionId));
        await recalculateBalance(db, invoice.commissionId);
      }
      return { success: true };
    }),

  // ─── News (DA-specific) ───────────────────────────────────────────────────
  listNews: daProcedure.query(async () => {
    const db = await requireDb();
    return db.select()
      .from(portalNews)
      .where(and(
        eq(portalNews.isPublished, true),
        or(
          eq(portalNews.portalType, "da"),
          eq(portalNews.portalType, "all"),
        ),
      ))
      .orderBy(desc(portalNews.publishedAt));
  }),

  getNewsArticle: daProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [article] = await db.select()
        .from(portalNews)
        .where(and(
          eq(portalNews.slug, input.slug),
          eq(portalNews.isPublished, true),
          or(
            eq(portalNews.portalType, "da"),
            eq(portalNews.portalType, "all"),
          ),
        ))
        .limit(1);
      if (!article) throw new TRPCError({ code: "NOT_FOUND" });
      return article;
    }),

  // ─── Payments (from paid invoices) ────────────────────────────────────────
  listPayments: daProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const isAdmin = ["admin", "super_admin"].includes(ctx.user.role);
    const conditions: any[] = [eq(daInvoices.status, "paid")];
    if (!isAdmin) conditions.push(eq(daInvoices.daUserId, ctx.user.id));
    const invoices = await db.select({
      id: daInvoices.id,
      invoiceNumber: daInvoices.invoiceNumber,
      amount: daInvoices.amountExGst,
      paidAt: daInvoices.paidAt,
      xeroPaymentId: daInvoices.xeroInvoiceId,
      commissionId: daInvoices.commissionId,
    }).from(daInvoices)
      .where(and(...conditions))
      .orderBy(desc(daInvoices.paidAt));

    // Enrich with commission client/job info
    if (invoices.length === 0) return [];
    const commIds = Array.from(new Set(invoices.map(i => i.commissionId).filter(Boolean))) as number[];
    const comms = commIds.length > 0
      ? await db.select({ id: daCommissions.id, clientName: daCommissions.clientName, jobNo: daCommissions.jobNo })
          .from(daCommissions).where(inArray(daCommissions.id, commIds))
      : [];
    const commMap = Object.fromEntries(comms.map(c => [c.id, c]));
    return invoices.map(inv => ({
      ...inv,
      clientName: inv.commissionId ? commMap[inv.commissionId]?.clientName || null : null,
      jobNo: inv.commissionId ? commMap[inv.commissionId]?.jobNo || null : null,
    }));
  }),

  // ─── My DA Record (resolved via design_advisors.userId) ───────────────────
  getMyDaRecord: daProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const [record] = await db.select()
      .from(designAdvisors)
      .where(eq(designAdvisors.userId, ctx.user.id))
      .limit(1);
    return record || null;
  }),

  // ─── Dashboard Summary ────────────────────────────────────────────────────
  getDashboardSummary: daProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const isAdmin = ["admin", "super_admin"].includes(ctx.user.role);
    const userCondition = isAdmin ? undefined : eq(daCommissions.daUserId, ctx.user.id);

    // Total unclaimed balance
    const [balanceResult] = await db.select({
      totalBalance: sql<string>`COALESCE(SUM(balanceDue), 0)`,
      totalCommissions: sql<number>`COUNT(*)`,
    }).from(daCommissions)
      .where(userCondition);

    // Pending invoices count
    const invoiceConditions: any[] = [eq(daInvoices.status, "submitted")];
    if (!isAdmin) invoiceConditions.push(eq(daInvoices.daUserId, ctx.user.id));
    const [invoiceResult] = await db.select({
      pendingCount: sql<number>`COUNT(*)`,
    }).from(daInvoices)
      .where(and(...invoiceConditions));

    // Active commissions (not closed/fully_paid)
    const activeConditions: any[] = [
      sql`${daCommissions.status} NOT IN ('fully_paid', 'closed')`,
    ];
    if (!isAdmin) activeConditions.push(eq(daCommissions.daUserId, ctx.user.id));
    const [activeResult] = await db.select({
      activeCount: sql<number>`COUNT(*)`,
    }).from(daCommissions)
      .where(and(...activeConditions));

    return {
      totalUnclaimedBalance: balanceResult?.totalBalance || "0.00",
      totalCommissions: balanceResult?.totalCommissions || 0,
      pendingInvoices: invoiceResult?.pendingCount || 0,
      activeCommissions: activeResult?.activeCount || 0,
    };
  }),
});

// ─── Helper: Recalculate balance ────────────────────────────────────────────
async function recalculateBalance(db: any, commissionId: number) {
  const [commission] = await db.select()
    .from(daCommissions)
    .where(eq(daCommissions.id, commissionId))
    .limit(1);
  if (!commission) return;

  // Sum adjustments
  const [adjResult] = await db.select({
    total: sql<string>`COALESCE(SUM(amount), 0)`,
  }).from(daCommissionAdjustments)
    .where(eq(daCommissionAdjustments.commissionId, commissionId));

  // Sum paid invoices
  const [paidResult] = await db.select({
    total: sql<string>`COALESCE(SUM(amountExGst), 0)`,
  }).from(daInvoices)
    .where(and(
      eq(daInvoices.commissionId, commissionId),
      eq(daInvoices.status, "paid"),
    ));

  const totalCommission = parseFloat(commission.totalCommission as any) || 0;
  const adjustmentsTotal = parseFloat(adjResult?.total || "0");
  const amountPaid = parseFloat(paidResult?.total || "0");
  const balanceDue = totalCommission - amountPaid + adjustmentsTotal;

  await db.update(daCommissions).set({
    adjustmentsTotal: adjustmentsTotal.toFixed(2),
    amountPaid: amountPaid.toFixed(2),
    balanceDue: balanceDue.toFixed(2),
  }).where(eq(daCommissions.id, commissionId));
}
