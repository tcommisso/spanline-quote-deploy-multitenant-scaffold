import { router, tenantAdminProcedure as adminProcedure, tenantProcedure as protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import { suppliers, constructionInstallers, tradePortalAccess, manufacturingPurchaseOrders, manufacturingOrders, constructionJobs } from "../drizzle/schema";
import { eq, like, and, or, desc, isNull, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import { appendTenantScope, tenantIdFromContext } from "./_core/tenant-scope";

const supplierScopeSchema = z.enum(["construction", "manufacturing"]);

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

function supplierTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, suppliers.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function installerTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, constructionInstallers.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function tradeAccessTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, tradePortalAccess.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function jobTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function normaliseSupplierKey(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

async function requireSupplierAccess(db: any, ctx: any, supplierId: number) {
  const [supplier] = await db.select()
    .from(suppliers)
    .where(and(...supplierTenantConditions(ctx, eq(suppliers.id, supplierId))))
    .limit(1);
  if (!supplier) throw new TRPCError({ code: "NOT_FOUND", message: "Supplier not found" });
  return supplier;
}

export const supplierRouter = router({
  list: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      category: z.string().optional(),
      supplierScope: supplierScopeSchema.optional(),
      activeOnly: z.boolean().optional().default(true),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const conditions: any[] = [];
      if (input?.activeOnly !== false) {
        conditions.push(eq(suppliers.isActive, true));
      }
      if (input?.search) {
        const s = `%${input.search}%`;
        conditions.push(or(
          like(suppliers.name, s),
          like(suppliers.contactName, s),
          like(suppliers.email, s),
        )!);
      }
      if (input?.category) {
        conditions.push(eq(suppliers.category, input.category));
      }
      if (input?.supplierScope) {
        if (input.supplierScope === "construction") {
          conditions.push(or(
            isNull(suppliers.supplierScope),
            eq(suppliers.supplierScope, ""),
            ne(suppliers.supplierScope, "manufacturing"),
          )!);
        } else {
          conditions.push(eq(suppliers.supplierScope, input.supplierScope));
        }
      }
      appendTenantScope(conditions, suppliers.tenantId, tenantIdFromContext(ctx));
      const supplierRows = await db.select().from(suppliers)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(suppliers.name);

      if (input?.supplierScope !== "construction") {
        return supplierRows;
      }

      const installerConditions: any[] = [];
      if (input?.activeOnly !== false) {
        installerConditions.push(eq(constructionInstallers.active, true));
      }
      if (input?.search) {
        const s = `%${input.search}%`;
        installerConditions.push(or(
          like(constructionInstallers.name, s),
          like(constructionInstallers.email, s),
          like(constructionInstallers.phone, s),
          like(constructionInstallers.speciality, s),
        )!);
      }
      appendTenantScope(installerConditions, constructionInstallers.tenantId, tenantIdFromContext(ctx));

      const installerRows = await db.select().from(constructionInstallers)
        .where(installerConditions.length > 0 ? and(...installerConditions) : undefined)
        .orderBy(constructionInstallers.name);

      const supplierKeys = new Set<string>();
      for (const supplier of supplierRows) {
        const emailKey = normaliseSupplierKey(supplier.email);
        const nameKey = normaliseSupplierKey(supplier.name);
        if (emailKey) supplierKeys.add(`email:${emailKey}`);
        if (nameKey) supplierKeys.add(`name:${nameKey}`);
      }

      const installerSupplierRows = installerRows
        .filter((installer: any) => {
          const emailKey = normaliseSupplierKey(installer.email);
          const nameKey = normaliseSupplierKey(installer.name);
          return !(emailKey && supplierKeys.has(`email:${emailKey}`))
            && !(nameKey && supplierKeys.has(`name:${nameKey}`));
        })
        .map((installer: any) => ({
          id: -installer.id,
          tenantId: installer.tenantId,
          name: installer.name,
          abn: installer.abn || null,
          contactName: installer.name,
          phone: installer.phone || null,
          email: installer.email || null,
          address: installer.address || null,
          category: installer.speciality || installer.tradeType || null,
          supplierScope: "construction",
          paymentTerms: null,
          defaultGlCode: null,
          notes: "Trade portal record. Edit this trade from People & Portals.",
          xeroContactId: installer.xeroContactId || null,
          xeroConnectionId: null,
          xeroTenantId: null,
          lastXeroSyncAt: installer.lastXeroSyncAt || null,
          tradePortalFlashingOrdersEnabled: false,
          isActive: Boolean(installer.active),
          createdBy: null,
          createdAt: installer.createdAt,
          updatedAt: installer.updatedAt,
          isInstallerOnly: true,
          installerId: installer.id,
          tradeType: installer.tradeType,
        }));

      return [...supplierRows, ...installerSupplierRows]
        .sort((a: any, b: any) => normaliseSupplierKey(a.name).localeCompare(normaliseSupplierKey(b.name)));
    }),

  categories: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const rows = await db.selectDistinct({ category: suppliers.category })
      .from(suppliers)
      .where(and(...supplierTenantConditions(ctx, eq(suppliers.isActive, true))));
    return rows.map(r => r.category).filter(Boolean) as string[];
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const supplier = await requireSupplierAccess(db, ctx, input.id);
      // Get PO history for this supplier
      const poRows = await db.select({ po: manufacturingPurchaseOrders }).from(manufacturingPurchaseOrders)
        .innerJoin(manufacturingOrders, eq(manufacturingPurchaseOrders.orderId, manufacturingOrders.id))
        .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
        .where(and(...jobTenantConditions(ctx, like(manufacturingPurchaseOrders.supplier, `%${supplier.name}%`))))
        .orderBy(desc(manufacturingPurchaseOrders.createdAt))
        .limit(50);
      const pos = poRows.map((row: any) => row.po);
      return { ...supplier, purchaseOrders: pos };
    }),

  create: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      abn: z.string().optional(),
      contactName: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      address: z.string().optional(),
      category: z.string().optional(),
      supplierScope: supplierScopeSchema.optional(),
      paymentTerms: z.string().optional(),
      defaultGlCode: z.string().optional(),
      tradePortalFlashingOrdersEnabled: z.boolean().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [result] = await db.insert(suppliers).values({
        ...input,
        supplierScope: input.supplierScope || "construction",
        tenantId: tenantIdFromContext(ctx),
        createdBy: ctx.user!.id,
      });
      return { id: result.insertId };
    }),

  update: adminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      abn: z.string().nullable().optional(),
      contactName: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
      email: z.string().nullable().optional(),
      address: z.string().nullable().optional(),
      category: z.string().nullable().optional(),
      supplierScope: supplierScopeSchema.optional(),
      paymentTerms: z.string().nullable().optional(),
      defaultGlCode: z.string().nullable().optional(),
      tradePortalFlashingOrdersEnabled: z.boolean().optional(),
      notes: z.string().nullable().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const { id, ...data } = input;
      await requireSupplierAccess(db, ctx, id);
      await db.update(suppliers).set(data).where(and(...supplierTenantConditions(ctx, eq(suppliers.id, id))));
      return { success: true };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await requireSupplierAccess(db, ctx, input.id);
      // Soft delete - just deactivate
      await db.update(suppliers).set({ isActive: false }).where(and(...supplierTenantConditions(ctx, eq(suppliers.id, input.id))));
      return { success: true };
    }),

  /** Create a construction installer (trade) from a supplier and grant portal access */
  addAsTradeUser: adminProcedure
    .input(z.object({
      supplierId: z.number(),
      tradeType: z.enum(["installer", "electrician", "plumber", "roofer", "carpenter", "concreter", "painter", "tiler", "fencer", "labourer", "other"]).default("other"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const supplier = await requireSupplierAccess(db, ctx, input.supplierId);

      // Check if an installer with the same name already exists
      const [existingInstaller] = await db.select().from(constructionInstallers)
        .where(and(...installerTenantConditions(ctx, eq(constructionInstallers.name, supplier.name)))).limit(1);
      
      let installerId: number;
      if (existingInstaller) {
        installerId = existingInstaller.id;
      } else {
        // Create the installer from supplier details
        const [result] = await db.insert(constructionInstallers).values({
          tenantId: tenantIdFromContext(ctx),
          name: supplier.name,
          phone: supplier.phone || null,
          email: supplier.email || null,
          speciality: supplier.category || null,
          tradeType: input.tradeType,
          address: supplier.address || null,
          active: true,
        }).$returningId();
        installerId = result.id;
      }

      // Check if portal access already exists
      const [existingAccess] = await db.select().from(tradePortalAccess)
        .where(and(...tradeAccessTenantConditions(ctx, eq(tradePortalAccess.installerId, installerId)))).limit(1);
      if (existingAccess) {
        throw new TRPCError({ code: "CONFLICT", message: "This supplier already has trade portal access" });
      }

      if (!supplier.email) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Supplier must have an email address to create portal access" });
      }

      // Grant portal access
      const accessToken = crypto.randomBytes(32).toString("hex");
      const [accessResult] = await db.insert(tradePortalAccess).values({
        tenantId: tenantIdFromContext(ctx),
        installerId,
        email: supplier.email,
        accessToken,
        isActive: true,
      }).$returningId();

      return { installerId, accessId: accessResult.id, name: supplier.name };
    }),
});
