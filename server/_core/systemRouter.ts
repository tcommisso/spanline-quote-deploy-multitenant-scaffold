import { z } from "zod";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { notifyOwner } from "./notification";
import { ENV } from "./env";
import { adminProcedure, publicProcedure, router, tenantAdminProcedure } from "./trpc";

const TENANT_ID_TABLES = [
  "branches",
  "crm_dropdown_options",
  "quotes",
  "crm_leads",
  "design_advisors",
  "crm_appointments",
  "sms_messages",
  "call_logs",
  "vocphone_extensions",
  "sms_templates",
  "construction_installers",
  "construction_jobs",
  "construction_schedule_events",
  "construction_kanban_tasks",
  "task_tags",
  "task_tag_assignments",
  "task_comments",
  "task_templates",
  "equipment",
  "equipment_bookings",
  "portal_access",
  "trade_portal_access",
  "permission_audit_log",
  "user_dashboard_config",
  "user_schedule_blocks",
  "user_time_off",
  "calendar_view_members",
  "user_calendar_selections",
  "inbox_messages",
  "inbox_addresses",
  "nylas_grants",
  "suppliers",
  "supplier_categories",
  "inventory_stock_items",
  "inventory_movements",
  "inventory_transfers",
  "stocktakes",
  "manufacturing_drivers",
  "manufacturing_orders",
  "manufacturing_tasks",
  "manufacturing_schedule",
  "manufacturing_purchase_orders",
  "manufacturing_po_audit_trail",
  "manufacturing_po_attachments",
  "manufacturing_po_returns",
  "manufacturing_dispatches",
  "manufacturing_po_receipts",
  "manufacturing_supplier_invoices",
  "driver_locations",
  "user_locations",
  "notification_log",
  "supplier_feedback",
  "checklist_items",
  "chat_channels",
  "chat_channel_members",
  "chat_messages",
  "support_submissions",
  "invitations",
  "rain_days",
  "rain_day_job_impacts",
  "extension_of_time_records",
  "project_plan_templates",
  "approval_projects",
  "approval_integration_credentials",
  "approval_sync_logs",
  "hbcf_builder_profiles",
  "hbcf_certificates",
  "hbcf_policy_matches",
  "da_tracker_applications",
  "da_tracker_webhook_subscriptions",
  "da_tracker_webhook_deliveries",
  "da_tracker_poll_log",
  "da_competitor_watchlist",
  "client_das",
  "nsw_da_applications",
  "nsw_da_poll_log",
] as const;

const APP_TENANT_ID_TABLES = [
  "xero_connections",
  "xero_entity_defaults",
  "xero_routing_rules",
  "xero_accounting_transactions",
  "xero_webhook_events",
  "xero_cost_import_batches",
  "xero_cost_import_items",
  "xero_budget_import_batches",
  "xero_budget_import_items",
] as const;

function quoteIdent(identifier: string) {
  return `\`${identifier.replace(/`/g, "``")}\``;
}

function rowsFromExecuteResult(result: any): any[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0];
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.rows)) return result.rows;
  return [];
}

function affectedRowsFromExecuteResult(result: any) {
  const header = Array.isArray(result) ? result[0] : result;
  return Number(header?.affectedRows ?? header?.rowsAffected ?? 0);
}

async function tableExists(db: any, tableName: string) {
  const result = await db.execute(sql`
    SELECT COUNT(*) AS count
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name = ${tableName}
  `);
  const rows = rowsFromExecuteResult(result);
  return Number(rows?.[0]?.count || 0) > 0;
}

async function columnExists(db: any, tableName: string, columnName: string) {
  const result = await db.execute(sql`
    SELECT COUNT(*) AS count
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = ${tableName}
      AND column_name = ${columnName}
  `);
  const rows = rowsFromExecuteResult(result);
  return Number(rows?.[0]?.count || 0) > 0;
}

async function ensureTenantColumn(db: any, tableName: string, columnName: "tenantId" | "appTenantId") {
  if (!(await tableExists(db, tableName))) return "missing-table" as const;
  if (await columnExists(db, tableName, columnName)) return "exists" as const;

  const table = quoteIdent(tableName);
  const column = quoteIdent(columnName);
  const index = quoteIdent(`idx_${tableName}_${columnName}`);
  await db.execute(sql.raw(`ALTER TABLE ${table} ADD COLUMN ${column} int NULL`));
  await db.execute(sql.raw(`ALTER TABLE ${table} ADD KEY ${index} (${column})`));
  return "created" as const;
}

async function repairTableTenant(db: any, tableName: string, columnName: "tenantId" | "appTenantId", tenantId: number) {
  const ensureStatus = await ensureTenantColumn(db, tableName, columnName);
  if (ensureStatus === "missing-table") {
    return { table: tableName, column: columnName, status: "missing-table", updated: 0, nullRows: 0, otherTenantRows: 0 };
  }

  const table = quoteIdent(tableName);
  const column = quoteIdent(columnName);
  const beforeResult = await db.execute(sql.raw(`
    SELECT
      SUM(CASE WHEN ${column} IS NULL THEN 1 ELSE 0 END) AS nullRows,
      SUM(CASE WHEN ${column} IS NOT NULL AND ${column} <> ${tenantId} THEN 1 ELSE 0 END) AS otherTenantRows
    FROM ${table}
  `));
  const beforeRows = rowsFromExecuteResult(beforeResult);
  const nullRows = Number(beforeRows?.[0]?.nullRows || 0);
  const otherTenantRows = Number(beforeRows?.[0]?.otherTenantRows || 0);
  const where = ENV.tenancyMode === "single"
    ? `${column} IS NULL OR ${column} <> ${tenantId}`
    : `${column} IS NULL`;
  const result = await db.execute(sql.raw(`UPDATE ${table} SET ${column} = ${tenantId} WHERE ${where}`));
  const updated = affectedRowsFromExecuteResult(result);
  return { table: tableName, column: columnName, status: ensureStatus, updated, nullRows, otherTenantRows };
}

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),

  tenantDataRepairPreview: tenantAdminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { tables: [], tenancyMode: ENV.tenancyMode };
    const tables = [];
    for (const table of TENANT_ID_TABLES) {
      const exists = await tableExists(db, table);
      tables.push({ table, column: "tenantId", exists, hasColumn: exists ? await columnExists(db, table, "tenantId") : false });
    }
    for (const table of APP_TENANT_ID_TABLES) {
      const exists = await tableExists(db, table);
      tables.push({ table, column: "appTenantId", exists, hasColumn: exists ? await columnExists(db, table, "appTenantId") : false });
    }
    return { tenantId: ctx.tenant!.id, tenancyMode: ENV.tenancyMode, tables };
  }),

  repairTenantData: tenantAdminProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const tenantId = ctx.tenant!.id;
    const results = [];
    for (const table of TENANT_ID_TABLES) {
      results.push(await repairTableTenant(db, table, "tenantId", tenantId));
    }
    for (const table of APP_TENANT_ID_TABLES) {
      results.push(await repairTableTenant(db, table, "appTenantId", tenantId));
    }
    return {
      tenantId,
      tenancyMode: ENV.tenancyMode,
      updatedRows: results.reduce((sum, row) => sum + row.updated, 0),
      createdColumns: results.filter((row) => row.status === "created").length,
      results,
    };
  }),
});
