import { z } from "zod";
import { router, tenantProcedure as protectedProcedure, tenantAdminProcedure as adminProcedure } from "./_core/trpc";
import * as daDb from "./design-advisors-db";

export const designAdvisorsRouter = router({
  list: protectedProcedure.input(z.object({
    includeArchived: z.boolean().optional(),
    includePendingInvites: z.boolean().optional(),
  }).optional()).query(async ({ input, ctx }) => {
    return daDb.listDesignAdvisors(
      input?.includeArchived ?? false,
      ctx.tenant!.id,
      input?.includePendingInvites ?? false,
    );
  }),

  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
    return daDb.getDesignAdvisor(input.id, ctx.tenant!.id);
  }),

  getByUserId: protectedProcedure.input(z.object({ userId: z.number() })).query(async ({ input, ctx }) => {
    return daDb.getDesignAdvisorByUserId(input.userId, ctx.tenant!.id);
  }),

  create: adminProcedure.input(z.object({
    name: z.string().min(1),
    email: z.string().optional(),
    phone: z.string().optional(),
    role: z.string().optional(),
    profileDescription: z.string().optional(),
    photoUrl: z.string().nullable().optional(),
    branchId: z.number().nullable().optional(),
  })).mutation(async ({ input, ctx }) => {
    const id = await daDb.createDesignAdvisor({ ...input, tenantId: ctx.tenant!.id });
    return { id };
  }),

  update: adminProcedure.input(z.object({
    id: z.number(),
    name: z.string().min(1).optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    role: z.string().optional(),
    profileDescription: z.string().nullable().optional(),
    photoUrl: z.string().nullable().optional(),
    branchId: z.number().nullable().optional(),
    archived: z.boolean().optional(),
  })).mutation(async ({ input, ctx }) => {
    const { id, ...data } = input;
    await daDb.updateDesignAdvisor(id, data, ctx.tenant!.id);
    return { success: true };
  }),

  delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
    await daDb.deleteDesignAdvisor(input.id, ctx.tenant!.id);
    return { success: true };
  }),

  // Admin: link a design_advisors record to a users record
  linkToUser: adminProcedure
    .input(z.object({
      designAdvisorId: z.number(),
      userId: z.number().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      await daDb.linkDesignAdvisorToUser(input.designAdvisorId, input.userId, ctx.tenant!.id);
      return { success: true };
    }),
});
