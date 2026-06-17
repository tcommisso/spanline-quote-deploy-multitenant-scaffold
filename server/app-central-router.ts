import { z } from "zod";
import { eq, sql, and, gte, desc } from "drizzle-orm";
import { tenantProcedure as protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { tenantScoped } from "./_core/tenant-scope";
import {
  userDashboardConfig,
  quotes,
  deckQuotes,
  eclipseQuotes,
  constructionJobs,
  crmLeads,
  inventoryStockItems,
  manufacturingOrders,
  manufacturingPurchaseOrders,
  inboxMessages,
  constructionKanbanTasks,
  constructionInstallers,
  proposals,
  crmBuildingAuthority,
  approvalProjects,
} from "../drizzle/schema";

// ─── Default widget layout ──────────────────────────────────────────────────
const DEFAULT_WIDGETS = [
  { id: "kpi_quotes", visible: true, order: 1 },
  { id: "kpi_jobs", visible: true, order: 2 },
  { id: "kpi_leads", visible: true, order: 3 },
  { id: "kpi_low_stock", visible: true, order: 4 },
  { id: "kpi_approvals", visible: true, order: 5 },
  { id: "recent_activity", visible: true, order: 6 },
  { id: "overdue_pos", visible: true, order: 7 },
  { id: "your_tasks", visible: true, order: 8 },
];

export const appCentralRouter = router({
  // ─── Get user's widget config ─────────────────────────────────────────────
  getWidgetConfig: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    const [config] = await db
      .select()
      .from(userDashboardConfig)
      .where(and(
        eq(userDashboardConfig.userId, ctx.user.id),
        tenantScoped(userDashboardConfig.tenantId, ctx.tenant.id),
      ))
      .limit(1);
    if (config) return config.widgetLayout;
    return { widgets: DEFAULT_WIDGETS };
  }),

  // ─── Save user's widget config ────────────────────────────────────────────
  saveWidgetConfig: protectedProcedure
    .input(
      z.object({
        widgets: z.array(
          z.object({
            id: z.string(),
            visible: z.boolean(),
            order: z.number(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const [existing] = await db
        .select({ id: userDashboardConfig.id })
        .from(userDashboardConfig)
        .where(and(
          eq(userDashboardConfig.userId, ctx.user.id),
          tenantScoped(userDashboardConfig.tenantId, ctx.tenant.id),
        ))
        .limit(1);

      if (existing) {
        await db
          .update(userDashboardConfig)
          .set({ widgetLayout: { widgets: input.widgets } })
          .where(eq(userDashboardConfig.id, existing.id));
      } else {
        await db.insert(userDashboardConfig).values({
          tenantId: ctx.tenant.id,
          userId: ctx.user.id,
          widgetLayout: { widgets: input.widgets },
        });
      }
      return { success: true };
    }),

  // ─── KPI Data: aggregated stats for widgets ───────────────────────────────
  kpiData: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Each KPI is wrapped in try/catch so one failure doesn't break all badges
    let quotesCount = 0;
    let conversionRate = 0;
    let revenueThisMonth = 0;
    let activeJobsCount = 0;
    let leadsCount = 0;
    let lowStockCount = 0;
    let overduePOsCount = 0;

    try {
      // Quotes this month
      const [quotesThisMonth] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(quotes)
        .where(and(
          gte(quotes.createdAt, startOfMonth),
          tenantScoped(quotes.tenantId, ctx.tenant.id),
        ));
      quotesCount = quotesThisMonth?.count || 0;

      // Quote conversion rate (accepted / total non-draft)
      const [conversionData] = await db
        .select({
          total: sql<number>`COUNT(*)`,
          accepted: sql<number>`SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END)`,
        })
        .from(quotes)
        .where(and(
          sql`status != 'draft'`,
          tenantScoped(quotes.tenantId, ctx.tenant.id),
        ));
      conversionRate =
        conversionData.total > 0
          ? Math.round(((conversionData.accepted || 0) / conversionData.total) * 100)
          : 0;
    } catch (e) {
      console.error("[KPI] Quotes query error:", e);
    }

    try {
      // Revenue this month: proposals (structure/OPQ) + deck_quotes + eclipse_quotes accepted this month
      const [proposalRevenue] = await db
        .select({ total: sql<number>`COALESCE(SUM(grandTotalIncGst), 0)` })
        .from(proposals)
        .leftJoin(crmLeads, eq(proposals.clientId, crmLeads.id))
        .where(
          and(
            eq(proposals.status, "accepted"),
            gte(proposals.signedAt, startOfMonth),
            tenantScoped(crmLeads.tenantId, ctx.tenant.id),
          )
        );
      const [deckRevenue] = await db
        .select({ total: sql<number>`COALESCE(SUM(sellPriceIncGst), 0)` })
        .from(deckQuotes)
        .where(
          and(
            eq(deckQuotes.status, "accepted"),
            gte(deckQuotes.createdAt, startOfMonth),
            eq(deckQuotes.userId, ctx.user.id),
          )
        );
      const [eclipseRevenue] = await db
        .select({ total: sql<number>`COALESCE(SUM(totalRRPInc), 0)` })
        .from(eclipseQuotes)
        .where(
          and(
            eq(eclipseQuotes.status, "accepted"),
            gte(eclipseQuotes.createdAt, startOfMonth),
            eq(eclipseQuotes.userId, ctx.user.id),
          )
        );
      revenueThisMonth = Number(proposalRevenue?.total || 0) + Number(deckRevenue?.total || 0) + Number(eclipseRevenue?.total || 0);
    } catch (e) {
      console.error("[KPI] Revenue query error:", e);
    }

    try {
      // Active construction jobs
      const [activeJobs] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(constructionJobs)
        .where(
          and(
            sql`status != 'completed'`,
            sql`status != 'cancelled'`,
            tenantScoped(constructionJobs.tenantId, ctx.tenant.id),
          )
        );
      activeJobsCount = activeJobs?.count || 0;
    } catch (e) {
      console.error("[KPI] Active jobs query error:", e);
    }

    try {
      // New leads this month
      const [leadsThisMonth] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(crmLeads)
        .where(and(
          gte(crmLeads.createdAt, startOfMonth),
          tenantScoped(crmLeads.tenantId, ctx.tenant.id),
        ));
      leadsCount = leadsThisMonth?.count || 0;
    } catch (e) {
      console.error("[KPI] Leads query error:", e);
    }

    try {
      // Low stock items (below min stock level)
      const lowStockResult = await db.execute(sql`
        SELECT COUNT(*) as count FROM inventory_stock_items s
        WHERE s.is_active = 1
          AND (s.tenantId = ${ctx.tenant.id} OR s.tenantId IS NULL)
          AND s.min_stock_level > 0
          AND COALESCE((
            SELECT SUM(quantity)
            FROM inventory_movements
            WHERE stock_item_id = s.id
              AND (tenantId = ${ctx.tenant.id} OR tenantId IS NULL)
          ), 0) <= s.min_stock_level
      `);
      lowStockCount = Number((lowStockResult as any)[0]?.[0]?.count || 0);
    } catch (e) {
      console.error("[KPI] Low stock query error:", e);
    }

    try {
      // Overdue POs (status = issued/confirmed, required-by date in the past)
      const [overduePOs] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(manufacturingPurchaseOrders)
        .innerJoin(manufacturingOrders, eq(manufacturingPurchaseOrders.orderId, manufacturingOrders.id))
        .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
        .where(
          and(
            sql`${manufacturingPurchaseOrders.status} IN ('issued', 'confirmed')`,
            sql`${manufacturingPurchaseOrders.requiredByDate} < NOW()`,
            tenantScoped(constructionJobs.tenantId, ctx.tenant.id),
          )
        );
      overduePOsCount = overduePOs?.count || 0;
    } catch (e) {
      console.error("[KPI] Overdue POs query error:", e);
    }

    let awaitingApprovalsCount = 0;
    try {
      // Count approval projects that are not yet completed or cancelled
      const [awaiting] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(approvalProjects)
        .leftJoin(constructionJobs, eq(approvalProjects.crmJobId, constructionJobs.id))
        .leftJoin(crmLeads, eq(approvalProjects.crmLeadId, crmLeads.id))
        .where(
          and(
            sql`${approvalProjects.overallStatus} IN ('intake', 'active', 'on_hold')`,
            sql`(${constructionJobs.tenantId} = ${ctx.tenant.id} OR ${crmLeads.tenantId} = ${ctx.tenant.id})`,
          )
        );
      awaitingApprovalsCount = awaiting?.count || 0;
    } catch (e) {
      console.error("[KPI] Awaiting approvals query error:", e);
    }

    return {
      quotesThisMonth: quotesCount,
      conversionRate,
      revenueThisMonth,
      activeJobs: activeJobsCount,
      leadsThisMonth: leadsCount,
      lowStockItems: lowStockCount,
      overduePOs: overduePOsCount,
      awaitingApprovals: awaitingApprovalsCount,
    };
  }),

  // ─── Recent Activity (last 10 quotes touched by user) ────────────────────
  recentActivity: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    const recent = await db
      .select({
        id: quotes.id,
        quoteNumber: quotes.quoteNumber,
        clientName: quotes.clientName,
        status: quotes.status,
        updatedAt: quotes.updatedAt,
      })
      .from(quotes)
      .where(and(
        eq(quotes.userId, ctx.user.id),
        tenantScoped(quotes.tenantId, ctx.tenant.id),
      ))
      .orderBy(desc(quotes.updatedAt))
      .limit(8);
    return recent;
  }),

  // ─── Your Tasks (assigned items across sections) ─────────────────────────
  yourTasks: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    const tasks: Array<{ id: number; title: string; section: string; status: string; dueDate: Date | null; path: string }> = [];

    // 1. Inbox messages assigned to this user (open/pending)
    try {
      const inboxTasks = await db
        .select({
          id: inboxMessages.id,
          subject: inboxMessages.subject,
          status: inboxMessages.status,
          createdAt: inboxMessages.createdAt,
        })
        .from(inboxMessages)
        .where(
          and(
            eq(inboxMessages.assignedToId, ctx.user.id),
            sql`${inboxMessages.status} IN ('open', 'pending')`
          )
        )
        .orderBy(desc(inboxMessages.createdAt))
        .limit(5);

      for (const msg of inboxTasks) {
        tasks.push({
          id: msg.id,
          title: msg.subject || "Inbox message",
          section: "Inbox",
          status: msg.status,
          dueDate: null,
          path: `/inbox`,
        });
      }
    } catch { /* inbox table may not exist yet */ }

    // 2. Construction kanban tasks assigned to an installer linked to this user (by name match)
    try {
      const installers = await db
        .select({ id: constructionInstallers.id })
        .from(constructionInstallers)
        .where(and(
          eq(constructionInstallers.name, ctx.user.name || ""),
          tenantScoped(constructionInstallers.tenantId, ctx.tenant.id),
        ))
        .limit(5);

      if (installers.length > 0) {
        const installerIds = installers.map(i => i.id);
        const kanbanTasks = await db
          .select({
            id: constructionKanbanTasks.id,
            title: constructionKanbanTasks.title,
            column: constructionKanbanTasks.column,
            dueDate: constructionKanbanTasks.dueDate,
            jobId: constructionKanbanTasks.jobId,
          })
          .from(constructionKanbanTasks)
          .innerJoin(constructionJobs, eq(constructionKanbanTasks.jobId, constructionJobs.id))
          .where(
            and(
              sql`${constructionKanbanTasks.assignedTo} IN (${sql.join(installerIds.map(id => sql`${id}`), sql`, `)})`,
              sql`${constructionKanbanTasks.column} != 'done'`,
              tenantScoped(constructionJobs.tenantId, ctx.tenant.id),
            )
          )
          .orderBy(desc(constructionKanbanTasks.createdAt))
          .limit(5);

        for (const t of kanbanTasks) {
          tasks.push({
            id: t.id,
            title: t.title,
            section: "Construction",
            status: t.column,
            dueDate: t.dueDate,
            path: `/construction/jobs/${t.jobId}`,
          });
        }
      }
    } catch { /* kanban tables may not exist yet */ }

    // 3. Overdue POs where user is creator (as pseudo-tasks)
    try {
      const overduePOs = await db
        .select({
          id: manufacturingPurchaseOrders.id,
          poNumber: manufacturingPurchaseOrders.poNumber,
          supplier: manufacturingPurchaseOrders.supplier,
          requiredByDate: manufacturingPurchaseOrders.requiredByDate,
        })
        .from(manufacturingPurchaseOrders)
        .innerJoin(manufacturingOrders, eq(manufacturingPurchaseOrders.orderId, manufacturingOrders.id))
        .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
        .where(
          and(
            eq(manufacturingPurchaseOrders.createdBy, ctx.user.id),
            sql`${manufacturingPurchaseOrders.status} IN ('issued', 'confirmed')`,
            sql`${manufacturingPurchaseOrders.requiredByDate} < NOW()`,
            tenantScoped(constructionJobs.tenantId, ctx.tenant.id),
          )
        )
        .orderBy(desc(manufacturingPurchaseOrders.requiredByDate))
        .limit(3);

      for (const po of overduePOs) {
        tasks.push({
          id: po.id,
          title: `Overdue: ${po.poNumber || `PO-${po.id}`} (${po.supplier || "Unknown"})`,
          section: "Procurement",
          status: "overdue",
          dueDate: po.requiredByDate,
          path: `/manufacturing/purchase-orders`,
        });
      }
    } catch { /* PO table may not have createdBy */ }

    return tasks.slice(0, 10);
  }),

  // ─── Complete a task from the Your Tasks widget ────────────────────────────
  completeTask: protectedProcedure
    .input(
      z.object({
        taskId: z.number(),
        section: z.enum(["Inbox", "Construction", "Procurement"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;

      switch (input.section) {
        case "Inbox": {
          await db
            .update(inboxMessages)
            .set({ status: "closed" })
            .where(
              and(
                eq(inboxMessages.id, input.taskId),
                eq(inboxMessages.assignedToId, ctx.user.id)
              )
            );
          break;
        }
        case "Construction": {
          // Verify the task is assigned to an installer linked to this user
          const installers = await db
            .select({ id: constructionInstallers.id })
            .from(constructionInstallers)
            .where(and(
              eq(constructionInstallers.name, ctx.user.name || ""),
              tenantScoped(constructionInstallers.tenantId, ctx.tenant.id),
            ))
            .limit(5);
          if (installers.length > 0) {
            const installerIds = installers.map(i => i.id);
            await db
              .update(constructionKanbanTasks)
              .set({ column: "done" })
              .where(
                and(
                  eq(constructionKanbanTasks.id, input.taskId),
                  sql`${constructionKanbanTasks.assignedTo} IN (${sql.join(installerIds.map(id => sql`${id}`), sql`, `)})`
                )
              );
          }
          break;
        }
        case "Procurement": {
          await db
            .update(manufacturingPurchaseOrders)
            .set({ status: "received", receivedAt: new Date() })
            .where(
              and(
                eq(manufacturingPurchaseOrders.id, input.taskId),
                eq(manufacturingPurchaseOrders.createdBy, ctx.user.id)
              )
            );
          break;
        }
      }

      return { success: true };
    }),
});
