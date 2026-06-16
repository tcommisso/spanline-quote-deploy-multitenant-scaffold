/**
 * Scheduled Low Stock Alert
 * Sends a daily summary email listing all inventory items below their reorder quantities
 * to admin and procurement staff, enabling proactive replenishment.
 * Triggered by a Heartbeat cron job at /api/scheduled/low-stock-alert
 */
import type { Express, Request, Response } from "express";
import { authenticateScheduledRequest } from "./_core/scheduled-auth";
import { getDb } from "./db";
import { inventoryStockItems, inventoryMovements } from "../drizzle/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { sendNotificationEmail } from "./email";
import { getScheduledTenants, getTenantNotificationRecipients } from "./_core/scheduled-tenants";

export function registerScheduledLowStockAlert(app: Express) {
  app.post("/api/scheduled/low-stock-alert", async (req: Request, res: Response) => {
    const startTime = Date.now();
    try {
      // Authenticate the cron caller
      if (!(await authenticateScheduledRequest(req))) {
        return res.status(403).json({ error: "cron-only" });
      }

      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database unavailable" });
      }

      const tenants = await getScheduledTenants();
      const now = new Date();
      const dateStr = now.toLocaleDateString("en-AU", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
      let itemsChecked = 0;
      let totalAlerts = 0;
      let totalRecipients = 0;
      let sentCount = 0;
      const errors: string[] = [];

      for (const tenant of tenants) {
        const items = await db.select().from(inventoryStockItems)
          .where(and(
            eq(inventoryStockItems.tenantId, tenant.id),
            eq(inventoryStockItems.isActive, true),
            sql`${inventoryStockItems.reorderQty} IS NOT NULL`
          ));

        itemsChecked += items.length;
        if (items.length === 0) {
          continue;
        }

        const alerts: Array<{
          id: number; code: string; name: string; category: string;
          branchId: number | null; onHand: number; reorderQty: number; deficit: number;
        }> = [];

        for (const item of items) {
          const branchConditions: any[] = [
            eq(inventoryMovements.tenantId, tenant.id),
            eq(inventoryMovements.stockItemId, item.id),
          ];
          if (item.branchId) branchConditions.push(eq(inventoryMovements.branchId, item.branchId));

          const [result] = await db.select({
            totalIn: sql<string>`COALESCE(SUM(CASE WHEN ${inventoryMovements.movementType} IN ('purchase', 'transfer_in') THEN ${inventoryMovements.quantity} ELSE 0 END), 0)`,
            totalOut: sql<string>`COALESCE(SUM(CASE WHEN ${inventoryMovements.movementType} IN ('allocation', 'manufacture_use', 'adjustment_waste', 'transfer_out') THEN ${inventoryMovements.quantity} ELSE 0 END), 0)`,
          }).from(inventoryMovements).where(and(...branchConditions));

          const onHand = Number(result.totalIn) - Number(result.totalOut);
          const reorderQty = Number(item.reorderQty);
          if (onHand < reorderQty) {
            alerts.push({
              id: item.id,
              code: item.code,
              name: item.name,
              category: item.category,
              branchId: item.branchId,
              onHand,
              reorderQty,
              deficit: reorderQty - onHand,
            });
          }
        }

        if (alerts.length === 0) {
          continue;
        }

        const recipients = await getTenantNotificationRecipients(tenant.id, {
          appRoles: ["admin", "super_admin", "warehouse"],
        });
        if (recipients.length === 0) {
          errors.push(`${tenant.name}: no recipients`);
          continue;
        }

        alerts.sort((a, b) => b.deficit - a.deficit);
        totalAlerts += alerts.length;
        totalRecipients += recipients.length;
        const htmlBody = buildLowStockEmail(alerts, dateStr);

        for (const recipient of recipients) {
          const result = await sendNotificationEmail({
            tenantId: tenant.id,
            to: recipient.email,
            subject: `Low Stock Alert: ${alerts.length} item${alerts.length > 1 ? "s" : ""} below reorder level (${now.toLocaleDateString("en-AU")})`,
            htmlBody,
            fromName: "AltaSpan Inventory",
            module: "manufacturing",
          });
          if (result.success) {
            sentCount++;
          } else {
            errors.push(`${recipient.email}: ${result.error}`);
          }
        }

        const alertItemIds = alerts.map(a => a.id);
        if (alertItemIds.length) {
          await db.update(inventoryStockItems).set({
            lastLowStockAlertAt: now,
          } as any).where(inArray(inventoryStockItems.id, alertItemIds));
        }
      }

      console.log(`[LowStockAlert] Sent alert to ${sentCount}/${totalRecipients} recipients. ${totalAlerts} items below reorder.`);

      return res.json({
        ok: true,
        alertCount: totalAlerts,
        recipientCount: totalRecipients,
        sentCount,
        skipped: totalAlerts === 0,
        reason: totalAlerts === 0 ? "All tenant items above reorder level" : undefined,
        itemsChecked,
        errors: errors.length > 0 ? errors : undefined,
        duration: Date.now() - startTime,
      });
    } catch (err: any) {
      console.error("[LowStockAlert] Error:", err);
      return res.status(500).json({
        error: err.message || "Unknown error",
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
        context: { url: "/api/scheduled/low-stock-alert", taskUid: (req as any).taskUid },
        timestamp: new Date().toISOString(),
      });
    }
  });
}

function buildLowStockEmail(alerts: Array<{ code: string; name: string; category: string; branchId: number | null; onHand: number; reorderQty: number; deficit: number }>, dateStr: string): string {
  const criticalCount = alerts.filter(a => a.onHand <= 0).length;
  const lowCount = alerts.length - criticalCount;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
      <div style="background-color: #fef3c7; border-left: 4px solid #d97706; padding: 16px; margin-bottom: 24px;">
        <h2 style="margin: 0 0 8px 0; color: #92400e;">⚠️ Low Stock Alert</h2>
        <p style="margin: 0; color: #78350f;">${dateStr}</p>
      </div>

      <div style="display: flex; gap: 16px; margin-bottom: 24px;">
        <div style="background: #fef2f2; border-radius: 8px; padding: 12px 16px; flex: 1;">
          <div style="font-size: 24px; font-weight: bold; color: #dc2626;">${criticalCount}</div>
          <div style="font-size: 12px; color: #991b1b;">Out of Stock</div>
        </div>
        <div style="background: #fffbeb; border-radius: 8px; padding: 12px 16px; flex: 1;">
          <div style="font-size: 24px; font-weight: bold; color: #d97706;">${lowCount}</div>
          <div style="font-size: 12px; color: #92400e;">Below Reorder</div>
        </div>
        <div style="background: #f3f4f6; border-radius: 8px; padding: 12px 16px; flex: 1;">
          <div style="font-size: 24px; font-weight: bold; color: #374151;">${alerts.length}</div>
          <div style="font-size: 12px; color: #6b7280;">Total Items</div>
        </div>
      </div>

      <table style="border-collapse: collapse; width: 100%; font-size: 13px;">
        <thead>
          <tr style="background-color: #f3f4f6;">
            <th style="border: 1px solid #e5e7eb; padding: 8px; text-align: left;">Code</th>
            <th style="border: 1px solid #e5e7eb; padding: 8px; text-align: left;">Item</th>
            <th style="border: 1px solid #e5e7eb; padding: 8px; text-align: left;">Category</th>
            <th style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">On Hand</th>
            <th style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">Reorder Qty</th>
            <th style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">Deficit</th>
          </tr>
        </thead>
        <tbody>
          ${alerts.map(a => `
            <tr>
              <td style="border: 1px solid #e5e7eb; padding: 8px; font-weight: 500;">${a.code}</td>
              <td style="border: 1px solid #e5e7eb; padding: 8px;">${a.name}</td>
              <td style="border: 1px solid #e5e7eb; padding: 8px;">${a.category}</td>
              <td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; color: ${a.onHand <= 0 ? '#dc2626' : '#d97706'}; font-weight: bold;">${a.onHand}</td>
              <td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">${a.reorderQty}</td>
              <td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; font-weight: bold; color: #dc2626;">${a.deficit}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>

      <p style="margin-top: 24px; padding: 12px; background: #f9fafb; border-radius: 6px; font-size: 12px; color: #6b7280;">
        This is an automated daily alert from the AltaSpan Inventory Management System. 
        Review these items and place purchase orders as needed. 
        To manage alert settings, visit the Inventory section in the AltaSpan dashboard.
      </p>
    </div>
  `;
}
