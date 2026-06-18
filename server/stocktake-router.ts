import { z } from "zod";
import { router, tenantProcedure as protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import {
  stocktakes,
  stocktakeLines,
  inventoryStockItems,
  inventoryMovements,
} from "../drizzle/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { sendNotificationEmail } from "./email";
import { makeRequest, type DistanceMatrixResult } from "./_core/map";
import { appendTenantScope, tenantIdFromContext } from "./_core/tenant-scope";
import { TRPCError } from "@trpc/server";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  return db;
}

function stocktakeTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, stocktakes.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function stockItemTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, inventoryStockItems.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function movementTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, inventoryMovements.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function decimalToNumber(value: unknown): number | null {
  if (value == null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

async function requireStocktakeAccess(db: any, ctx: any, stocktakeId: number) {
  const [stocktake] = await db.select()
    .from(stocktakes)
    .where(and(...stocktakeTenantConditions(ctx, eq(stocktakes.id, stocktakeId))))
    .limit(1);
  if (!stocktake) throw new TRPCError({ code: "NOT_FOUND", message: "Stocktake not found" });
  return stocktake;
}

async function requireStockItemAccess(db: any, ctx: any, stockItemId: number) {
  const [item] = await db.select()
    .from(inventoryStockItems)
    .where(and(...stockItemTenantConditions(ctx, eq(inventoryStockItems.id, stockItemId))))
    .limit(1);
  if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Stock item not found" });
  return item;
}

export const stocktakeRouter = router({
  // ─── Stocktakes CRUD ─────────────────────────────────────────────────────
  list: protectedProcedure.input(z.object({
    branchId: z.number().optional(),
    status: z.enum(["in_progress", "review", "pending_approval", "finalised", "cancelled"]).optional(),
  }).optional()).query(async ({ input, ctx }) => {
    const db = await requireDb();
    const conditions: any[] = [];
    if (input?.branchId) conditions.push(eq(stocktakes.branchId, input.branchId));
    if (input?.status) conditions.push(eq(stocktakes.status, input.status));

    return db.select().from(stocktakes)
      .where(and(...stocktakeTenantConditions(ctx, ...conditions)))
      .orderBy(desc(stocktakes.createdAt));
  }),

  getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
    const db = await requireDb();
    const stocktake = await requireStocktakeAccess(db, ctx, input.id);

    const lines = await db.select().from(stocktakeLines)
      .where(eq(stocktakeLines.stocktakeId, input.id))
      .orderBy(stocktakeLines.id);

    // Get stock item details for each line
    const itemIds = lines.map(l => l.stockItemId);
    let itemsMap: Record<number, any> = {};
    if (itemIds.length) {
      const items = await db.select().from(inventoryStockItems)
        .where(and(...stockItemTenantConditions(ctx, inArray(inventoryStockItems.id, itemIds))));
      itemsMap = Object.fromEntries(items.map(i => [i.id, i]));
    }

    return {
      ...stocktake,
      lines: lines.map(l => ({
        ...l,
        systemQty: decimalToNumber(l.systemQty) ?? 0,
        countedQty: decimalToNumber(l.countedQty),
        variance: decimalToNumber(l.variance) ?? 0,
        unitCost: decimalToNumber(l.unitCost) ?? 0,
        varianceValue: decimalToNumber(l.varianceValue) ?? 0,
        stockItem: itemsMap[l.stockItemId] || null,
      })),
    };
  }),

  // Create a new stocktake - generates lines from all active stock items for the branch
  create: protectedProcedure.input(z.object({
    branchId: z.number(),
    notes: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await requireDb();

    const stocktakeNumber = `ST-${Date.now().toString(36).toUpperCase()}`;

    // Get all active stock items for this branch
    const items = await db.select().from(inventoryStockItems)
      .where(and(...stockItemTenantConditions(ctx,
        eq(inventoryStockItems.isActive, true),
        eq(inventoryStockItems.branchId, input.branchId)
      )));

    // Calculate system qty for each item
    const lineData: Array<{ stockItemId: number; systemQty: string; unitCost: string }> = [];
    for (const item of items) {
      const [result] = await db.select({
        totalIn: sql<string>`COALESCE(SUM(CASE WHEN ${inventoryMovements.movementType} IN ('purchase', 'transfer_in') THEN ${inventoryMovements.quantity} ELSE 0 END), 0)`,
        totalOut: sql<string>`COALESCE(SUM(CASE WHEN ${inventoryMovements.movementType} IN ('purchase_return', 'allocation', 'manufacture_use', 'adjustment_waste', 'transfer_out') THEN ${inventoryMovements.quantity} ELSE 0 END), 0)`,
      }).from(inventoryMovements)
        .where(and(...movementTenantConditions(ctx,
          eq(inventoryMovements.stockItemId, item.id),
          eq(inventoryMovements.branchId, input.branchId)
        )));

      const onHand = Number(result.totalIn) - Number(result.totalOut);
      lineData.push({
        stockItemId: item.id,
        systemQty: String(onHand),
        unitCost: item.costPrice || "0",
      });
    }

    // Create stocktake
    const [result] = await db.insert(stocktakes).values({
      tenantId: tenantIdFromContext(ctx),
      stocktakeNumber,
      branchId: input.branchId,
      status: "in_progress",
      createdBy: ctx.user?.name || null,
      notes: input.notes || null,
      totalItems: items.length,
      itemsCounted: 0,
    });

    const stocktakeId = Number(result.insertId);

    // Create lines
    if (lineData.length) {
      await db.insert(stocktakeLines).values(lineData.map(l => ({
        stocktakeId,
        stockItemId: l.stockItemId,
        systemQty: l.systemQty,
        unitCost: l.unitCost,
      })));
    }

    return { id: stocktakeId, stocktakeNumber, totalItems: items.length };
  }),

  // Update counted quantities for lines
  updateCounts: protectedProcedure.input(z.object({
    stocktakeId: z.number(),
    counts: z.array(z.object({
      lineId: z.number(),
      countedQty: z.string(),
      notes: z.string().optional(),
    })),
  })).mutation(async ({ input, ctx }) => {
    const db = await requireDb();
    await requireStocktakeAccess(db, ctx, input.stocktakeId);

    for (const count of input.counts) {
      const [line] = await db.select().from(stocktakeLines).where(and(
        eq(stocktakeLines.id, count.lineId),
        eq(stocktakeLines.stocktakeId, input.stocktakeId)
      ));
      if (!line) continue;

      const updates: any = {
        countedQty: count.countedQty,
        countedAt: new Date(),
        countedBy: ctx.user?.name || null,
      };
      if (count.notes !== undefined) {
        updates.notes = count.notes || null;
      }

      await db.update(stocktakeLines).set(updates).where(and(
        eq(stocktakeLines.id, count.lineId),
        eq(stocktakeLines.stocktakeId, input.stocktakeId)
      ));
    }

    // Update items counted
    const [countResult] = await db.select({
      counted: sql<number>`COUNT(CASE WHEN ${stocktakeLines.countedQty} IS NOT NULL THEN 1 END)`,
    }).from(stocktakeLines).where(eq(stocktakeLines.stocktakeId, input.stocktakeId));

    await db.update(stocktakes).set({
      itemsCounted: countResult.counted || 0,
    }).where(and(...stocktakeTenantConditions(ctx, eq(stocktakes.id, input.stocktakeId))));

    return { success: true, itemsCounted: countResult.counted || 0 };
  }),

  // Move to review status - checks variance threshold for approval routing
  submitForReview: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
    const db = await requireDb();
    const stocktake = await requireStocktakeAccess(db, ctx, input.id);

    // Calculate total variance value
    const [totals] = await db.select({
      totalVariance: sql<string>`COALESCE(SUM(ABS(${stocktakeLines.varianceValue})), 0)`,
    }).from(stocktakeLines).where(eq(stocktakeLines.stocktakeId, input.id));

    const totalVariance = Math.abs(parseFloat(totals.totalVariance || "0"));
    const thresholdValue = parseFloat(stocktake.varianceThresholdValue || "500");

    // If variance exceeds threshold, route to pending_approval
    const needsApproval = totalVariance > thresholdValue;

    await db.update(stocktakes).set({
      status: needsApproval ? "pending_approval" : "review",
      totalVarianceValue: String(totalVariance),
      approvalStatus: needsApproval ? "pending" : "not_required",
    } as any).where(and(...stocktakeTenantConditions(ctx, eq(stocktakes.id, input.id))));

    return { success: true, needsApproval, totalVariance, thresholdValue };
  }),

  // Approve a stocktake that exceeded variance threshold
  approve: protectedProcedure.input(z.object({
    id: z.number(),
    notes: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await requireDb();
    const stocktake = await requireStocktakeAccess(db, ctx, input.id);
    if ((stocktake as any).approvalStatus !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Stocktake is not pending approval" });

    await db.update(stocktakes).set({
      status: "review",
      approvalStatus: "approved",
      approvedBy: ctx.user?.id || null,
      approvedAt: new Date(),
      approvalNotes: input.notes || null,
    } as any).where(and(...stocktakeTenantConditions(ctx, eq(stocktakes.id, input.id))));

    return { success: true };
  }),

  // Reject a stocktake that exceeded variance threshold
  reject: protectedProcedure.input(z.object({
    id: z.number(),
    notes: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await requireDb();
    const stocktake = await requireStocktakeAccess(db, ctx, input.id);
    if ((stocktake as any).approvalStatus !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Stocktake is not pending approval" });

    await db.update(stocktakes).set({
      status: "cancelled",
      approvalStatus: "rejected",
      approvedBy: ctx.user?.id || null,
      approvedAt: new Date(),
      approvalNotes: input.notes || null,
    } as any).where(and(...stocktakeTenantConditions(ctx, eq(stocktakes.id, input.id))));

    return { success: true };
  }),

  // Update variance thresholds for a stocktake
  updateThresholds: protectedProcedure.input(z.object({
    id: z.number(),
    varianceThresholdPct: z.number().min(0).max(100).optional(),
    varianceThresholdValue: z.number().min(0).optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await requireDb();
    await requireStocktakeAccess(db, ctx, input.id);

    const updates: any = {};
    if (input.varianceThresholdPct !== undefined) updates.varianceThresholdPct = String(input.varianceThresholdPct);
    if (input.varianceThresholdValue !== undefined) updates.varianceThresholdValue = String(input.varianceThresholdValue);

    await db.update(stocktakes).set(updates).where(and(...stocktakeTenantConditions(ctx, eq(stocktakes.id, input.id))));
    return { success: true };
  }),

  // List stocktakes pending approval
  pendingApprovals: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db.select().from(stocktakes)
      .where(and(...stocktakeTenantConditions(ctx, eq(stocktakes.status, "pending_approval"))))
      .orderBy(desc(stocktakes.createdAt));
  }),

  // Finalise stocktake - creates waste adjustment movements for all variances
  finalise: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
    const db = await requireDb();
    const stocktake = await requireStocktakeAccess(db, ctx, input.id);
    if (stocktake.status !== "review" && stocktake.status !== "pending_approval") throw new TRPCError({ code: "BAD_REQUEST", message: "Stocktake must be in review or approved status to finalise" });
    // If pending approval, check it's been approved
    if (stocktake.status === "pending_approval" && (stocktake as any).approvalStatus !== "approved") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Stocktake requires approval before finalising" });
    }

    // Get all lines with variance
    const lines = await db.select().from(stocktakeLines)
      .where(and(
        eq(stocktakeLines.stocktakeId, input.id),
        sql`${stocktakeLines.variance} != 0`,
        sql`${stocktakeLines.countedQty} IS NOT NULL`
      ));

    // Create adjustment movements for each variance
    for (const line of lines) {
      const variance = parseFloat(line.variance || "0");
      if (variance === 0) continue;

      // Negative variance = stock missing = waste adjustment (subtract)
      // Positive variance = stock found = purchase adjustment (add)
      const movementType = variance < 0 ? "adjustment_waste" : "purchase";
      const quantity = Math.abs(variance);

      await requireStockItemAccess(db, ctx, line.stockItemId);
      await db.insert(inventoryMovements).values({
        tenantId: tenantIdFromContext(ctx),
        stockItemId: line.stockItemId,
        branchId: stocktake.branchId!,
        movementType,
        quantity: String(quantity),
        unitType: "unit",
        referenceType: "stocktake",
        referenceId: stocktake.id,
        notes: `Stocktake ${stocktake.stocktakeNumber} adjustment (variance: ${variance > 0 ? "+" : ""}${variance})`,
        createdBy: ctx.user?.name || null,
      });

      // Mark line as adjustment created
      await db.update(stocktakeLines).set({ adjustmentCreated: true }).where(eq(stocktakeLines.id, line.id));
    }

    // Finalise the stocktake
    await db.update(stocktakes).set({
      status: "finalised",
      completedAt: new Date(),
      finalisedBy: ctx.user?.name || null,
    }).where(and(...stocktakeTenantConditions(ctx, eq(stocktakes.id, input.id))));

    return { success: true, adjustmentsCreated: lines.length };
  }),

  // Cancel a stocktake
  cancel: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
    const db = await requireDb();
    await requireStocktakeAccess(db, ctx, input.id);
    await db.update(stocktakes).set({ status: "cancelled" }).where(and(...stocktakeTenantConditions(ctx, eq(stocktakes.id, input.id))));
    return { success: true };
  }),

  // Permanently delete a stocktake and its count lines. Finalised stocktakes are retained for audit integrity.
  deleteStocktake: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
    if (ctx.user.role !== "super_admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Super Admin access required to delete stocktakes." });
    }

    const db = await requireDb();
    const stocktake = await requireStocktakeAccess(db, ctx, input.id);
    if (stocktake.status === "finalised") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Finalised stocktakes cannot be deleted because they may have posted inventory movements.",
      });
    }

    await db.delete(stocktakeLines).where(eq(stocktakeLines.stocktakeId, input.id));
    await db.delete(stocktakes).where(and(...stocktakeTenantConditions(ctx, eq(stocktakes.id, input.id))));
    return { success: true };
  }),

  // ─── Low Stock Alerts ─────────────────────────────────────────────────────
  lowStockCheck: protectedProcedure.input(z.object({
    sendEmail: z.boolean().optional().default(false),
    recipientEmail: z.string().email().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await requireDb();

    // Get all items with reorder qty set
    const items = await db.select().from(inventoryStockItems)
      .where(and(...stockItemTenantConditions(ctx,
        eq(inventoryStockItems.isActive, true),
        sql`${inventoryStockItems.reorderQty} IS NOT NULL`
      )));

    const alerts: Array<{
      id: number; code: string; name: string; category: string;
      branchId: number | null; onHand: number; reorderQty: number; deficit: number;
    }> = [];

    for (const item of items) {
      const branchConditions: any[] = [eq(inventoryMovements.stockItemId, item.id)];
      if (item.branchId) branchConditions.push(eq(inventoryMovements.branchId, item.branchId));

      const [result] = await db.select({
        totalIn: sql<string>`COALESCE(SUM(CASE WHEN ${inventoryMovements.movementType} IN ('purchase', 'transfer_in') THEN ${inventoryMovements.quantity} ELSE 0 END), 0)`,
        totalOut: sql<string>`COALESCE(SUM(CASE WHEN ${inventoryMovements.movementType} IN ('purchase_return', 'allocation', 'manufacture_use', 'adjustment_waste', 'transfer_out') THEN ${inventoryMovements.quantity} ELSE 0 END), 0)`,
      }).from(inventoryMovements).where(and(...movementTenantConditions(ctx, ...branchConditions)));

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

    // Send email if requested
    if (input.sendEmail && alerts.length > 0 && input.recipientEmail) {
      const htmlBody = `
        <h2>Low Stock Alert - ${alerts.length} items below reorder level</h2>
        <p>The following inventory items are below their reorder quantities and require replenishment:</p>
        <table style="border-collapse: collapse; width: 100%; font-family: Arial, sans-serif;">
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
            ${alerts.sort((a, b) => b.deficit - a.deficit).map(a => `
              <tr>
                <td style="border: 1px solid #e5e7eb; padding: 8px;">${a.code}</td>
                <td style="border: 1px solid #e5e7eb; padding: 8px;">${a.name}</td>
                <td style="border: 1px solid #e5e7eb; padding: 8px;">${a.category}</td>
                <td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; color: ${a.onHand <= 0 ? '#dc2626' : '#d97706'};">${a.onHand}</td>
                <td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">${a.reorderQty}</td>
                <td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; font-weight: bold; color: #dc2626;">${a.deficit}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        <p style="margin-top: 16px; color: #6b7280; font-size: 12px;">This is an automated alert from the AltaSpan Inventory Management System.</p>
      `;

      await sendNotificationEmail({
        to: input.recipientEmail,
        subject: `⚠️ Low Stock Alert: ${alerts.length} items below reorder level`,
        htmlBody,
        fromName: "AltaSpan Inventory",
      });

      // Update last alert sent timestamp
      const alertItemIds = alerts.map(a => a.id);
      if (alertItemIds.length) {
        await db.update(inventoryStockItems).set({
          lastLowStockAlertAt: new Date(),
        } as any).where(and(...stockItemTenantConditions(ctx, inArray(inventoryStockItems.id, alertItemIds))));
      }
    }

    return { alerts, totalAlerts: alerts.length, emailSent: input.sendEmail && alerts.length > 0 };
  }),

  // ─── Route Optimisation ───────────────────────────────────────────────────
  optimiseRoute: protectedProcedure.input(z.object({
    driverToken: z.string().optional(),
    addresses: z.array(z.object({
      id: z.number(),
      address: z.string(),
    })).min(2),
    startAddress: z.string().optional(),
  })).mutation(async ({ input }) => {
    const { addresses, startAddress } = input;

    // Use the first address as origin if no start address provided
    const origin = startAddress || addresses[0].address;
    const destinations = addresses.map(a => a.address);

    try {
      // Get distance matrix from origin to all destinations
      const matrixResult = await makeRequest<DistanceMatrixResult>(
        "/maps/api/distancematrix/json",
        {
          origins: origin,
          destinations: destinations.join("|"),
          mode: "driving",
          units: "metric",
        }
      );

      if (matrixResult.status !== "OK") {
        throw new Error(`Distance Matrix API error: ${matrixResult.status}`);
      }

      // Nearest-neighbour algorithm for route optimisation
      const n = addresses.length;
      const visited = new Set<number>();
      const optimisedOrder: number[] = [];

      // Find the nearest unvisited destination from origin
      let currentRow = matrixResult.rows[0];
      let elements = currentRow.elements;

      // Start with the nearest destination from origin
      let nearestIdx = -1;
      let nearestDist = Infinity;
      for (let i = 0; i < elements.length; i++) {
        if (elements[i].status === "OK" && elements[i].distance.value < nearestDist) {
          nearestDist = elements[i].distance.value;
          nearestIdx = i;
        }
      }

      if (nearestIdx >= 0) {
        optimisedOrder.push(nearestIdx);
        visited.add(nearestIdx);
      }

      // For remaining stops, get inter-destination distances
      // Use a simple greedy approach: from each stop, go to the nearest unvisited
      while (optimisedOrder.length < n) {
        const lastIdx = optimisedOrder[optimisedOrder.length - 1];
        const lastAddress = addresses[lastIdx].address;

        // Get distances from last stop to all remaining
        const remaining = addresses.filter((_, i) => !visited.has(i));
        if (!remaining.length) break;

        const remainingAddresses = remaining.map(a => a.address);
        const subMatrix = await makeRequest<DistanceMatrixResult>(
          "/maps/api/distancematrix/json",
          {
            origins: lastAddress,
            destinations: remainingAddresses.join("|"),
            mode: "driving",
            units: "metric",
          }
        );

        if (subMatrix.status === "OK" && subMatrix.rows[0]) {
          let bestIdx = -1;
          let bestDist = Infinity;
          const subElements = subMatrix.rows[0].elements;

          for (let i = 0; i < subElements.length; i++) {
            if (subElements[i].status === "OK" && subElements[i].distance.value < bestDist) {
              bestDist = subElements[i].distance.value;
              bestIdx = i;
            }
          }

          if (bestIdx >= 0) {
            // Map back to original index
            const originalIdx = addresses.findIndex(a => a.address === remaining[bestIdx].address);
            if (originalIdx >= 0) {
              optimisedOrder.push(originalIdx);
              visited.add(originalIdx);
            }
          }
        } else {
          // If API fails for sub-route, just append remaining in order
          for (let i = 0; i < n; i++) {
            if (!visited.has(i)) {
              optimisedOrder.push(i);
              visited.add(i);
            }
          }
          break;
        }
      }

      // Add any missed items
      for (let i = 0; i < n; i++) {
        if (!visited.has(i)) optimisedOrder.push(i);
      }

      // Build result with distances
      const optimisedAddresses = optimisedOrder.map((idx, pos) => ({
        ...addresses[idx],
        order: pos + 1,
        distanceFromPrevious: pos === 0
          ? matrixResult.rows[0].elements[idx]?.distance?.text || "N/A"
          : undefined,
      }));

      // Calculate total estimated distance/time
      const totalDistance = matrixResult.rows[0].elements
        .filter((_, i) => optimisedOrder.includes(i))
        .reduce((sum, el) => sum + (el.status === "OK" ? el.distance.value : 0), 0);

      return {
        optimisedOrder: optimisedAddresses,
        totalDistanceMeters: totalDistance,
        totalDistanceText: `${(totalDistance / 1000).toFixed(1)} km`,
        stopsCount: n,
      };
    } catch (err: any) {
      console.error("[RouteOptimise] Error:", err.message);
      // Fallback: return original order
      return {
        optimisedOrder: addresses.map((a, i) => ({ ...a, order: i + 1 })),
        totalDistanceMeters: 0,
        totalDistanceText: "Unable to calculate",
        stopsCount: addresses.length,
        error: err.message,
      };
    }
  }),
});
