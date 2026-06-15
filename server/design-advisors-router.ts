import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "./_core/trpc";
import * as daDb from "./design-advisors-db";

export const designAdvisorsRouter = router({
  list: protectedProcedure.input(z.object({ includeArchived: z.boolean().optional() }).optional()).query(async ({ input }) => {
    return daDb.listDesignAdvisors(input?.includeArchived ?? false);
  }),

  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    return daDb.getDesignAdvisor(input.id);
  }),

  getByUserId: protectedProcedure.input(z.object({ userId: z.number() })).query(async ({ input }) => {
    return daDb.getDesignAdvisorByUserId(input.userId);
  }),

  create: protectedProcedure.input(z.object({
    name: z.string().min(1),
    email: z.string().optional(),
    phone: z.string().optional(),
    role: z.string().optional(),
    profileDescription: z.string().optional(),
    photoUrl: z.string().nullable().optional(),
    branchId: z.number().nullable().optional(),
  })).mutation(async ({ input }) => {
    const id = await daDb.createDesignAdvisor(input);
    return { id };
  }),

  update: protectedProcedure.input(z.object({
    id: z.number(),
    name: z.string().min(1).optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    role: z.string().optional(),
    profileDescription: z.string().nullable().optional(),
    photoUrl: z.string().nullable().optional(),
    branchId: z.number().nullable().optional(),
    archived: z.boolean().optional(),
  })).mutation(async ({ input }) => {
    const { id, ...data } = input;
    await daDb.updateDesignAdvisor(id, data);
    return { success: true };
  }),

  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await daDb.deleteDesignAdvisor(input.id);
    return { success: true };
  }),

  // Admin: link a design_advisors record to a users record
  linkToUser: adminProcedure
    .input(z.object({
      designAdvisorId: z.number(),
      userId: z.number().nullable(),
    }))
    .mutation(async ({ input }) => {
      await daDb.linkDesignAdvisorToUser(input.designAdvisorId, input.userId);
      return { success: true };
    }),
});
