/**
 * Calendar Views Router
 * Manages calendar view membership (admin) and aggregates availability data
 * from multiple sources: Nylas calendars, internal schedule blocks, time off, job assignments.
 */
import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import {
  calendarViewMembers,
  nylasGrants,
  userScheduleBlocks,
  userTimeOff,
  constructionAssignments,
  constructionJobs,
  users,
  userCalendarSelections,
} from "../drizzle/schema";
import { eq, and, inArray, gte, lte, between } from "drizzle-orm";
import { listEvents } from "./nylas";

const VIEW_TYPES = ["construction_team", "trades", "delivery", "design_advisors", "admin_office"] as const;

export const calendarViewsRouter = router({
  /**
   * List members of a specific calendar view.
   */
  getViewMembers: protectedProcedure
    .input(z.object({ viewType: z.enum(VIEW_TYPES) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const members = await db
        .select({
          id: calendarViewMembers.id,
          viewType: calendarViewMembers.viewType,
          userId: calendarViewMembers.userId,
          sortOrder: calendarViewMembers.sortOrder,
          userName: users.name,
          userEmail: users.email,
          userRole: users.role,
        })
        .from(calendarViewMembers)
        .leftJoin(users, eq(calendarViewMembers.userId, users.id))
        .where(eq(calendarViewMembers.viewType, input.viewType))
        .orderBy(calendarViewMembers.sortOrder);
      return members;
    }),

  /**
   * Add a user to a calendar view (admin only).
   */
  addMember: adminProcedure
    .input(z.object({
      viewType: z.enum(VIEW_TYPES),
      userId: z.number(),
      sortOrder: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      // Check if already a member
      const [existing] = await db
        .select()
        .from(calendarViewMembers)
        .where(and(
          eq(calendarViewMembers.viewType, input.viewType),
          eq(calendarViewMembers.userId, input.userId)
        ))
        .limit(1);

      if (existing) return { success: true, id: existing.id };

      const [result] = await db.insert(calendarViewMembers).values({
        viewType: input.viewType,
        userId: input.userId,
        sortOrder: input.sortOrder ?? 0,
      });
      return { success: true, id: result.insertId };
    }),

  /**
   * Remove a user from a calendar view (admin only).
   */
  removeMember: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.delete(calendarViewMembers).where(eq(calendarViewMembers.id, input.id));
      return { success: true };
    }),

  /**
   * Reorder members in a view (admin only).
   */
  reorderMembers: adminProcedure
    .input(z.object({
      viewType: z.enum(VIEW_TYPES),
      memberIds: z.array(z.number()),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      for (let i = 0; i < input.memberIds.length; i++) {
        await db.update(calendarViewMembers)
          .set({ sortOrder: i })
          .where(eq(calendarViewMembers.id, input.memberIds[i]));
      }
      return { success: true };
    }),

  /**
   * Get availability data for all members of a view within a date range.
   * Merges: Nylas events, internal schedule blocks, time off, job assignments.
   */
  getAvailability: protectedProcedure
    .input(z.object({
      viewType: z.enum(VIEW_TYPES),
      startDate: z.string(), // ISO date string e.g. "2026-06-01"
      endDate: z.string(),   // ISO date string e.g. "2026-06-07"
      selectedUserIds: z.array(z.number()).optional(), // filter to specific people
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      // Get members of this view
      let members = await db
        .select({
          id: calendarViewMembers.id,
          userId: calendarViewMembers.userId,
          sortOrder: calendarViewMembers.sortOrder,
          userName: users.name,
          userEmail: users.email,
        })
        .from(calendarViewMembers)
        .leftJoin(users, eq(calendarViewMembers.userId, users.id))
        .where(eq(calendarViewMembers.viewType, input.viewType))
        .orderBy(calendarViewMembers.sortOrder);

      // Filter to selected users if provided
      if (input.selectedUserIds && input.selectedUserIds.length > 0) {
        members = members.filter(m => input.selectedUserIds!.includes(m.userId));
      }

      if (members.length === 0) return [];

      const userIds = members.map(m => m.userId);
      const startDate = new Date(input.startDate);
      const endDate = new Date(input.endDate);

      // 1. Get Nylas calendar events for members with connected calendars
      const grants = await db
        .select()
        .from(nylasGrants)
        .where(and(
          inArray(nylasGrants.userId, userIds),
          eq(nylasGrants.status, "active")
        ));

      // Fetch Nylas events per grant
      const nylasEvents: Record<number, any[]> = {};
      for (const grant of grants) {
        try {
          const events = await listEvents(grant.grantId, "primary", {
            start: Math.floor(startDate.getTime() / 1000),
            end: Math.floor(endDate.getTime() / 1000),
          });
          if (!nylasEvents[grant.userId]) nylasEvents[grant.userId] = [];
          nylasEvents[grant.userId].push(...(events || []).map((e: any) => ({
            type: "calendar_event" as const,
            id: e.id,
            grantId: grant.grantId,
            title: e.title || "Busy",
            start: e.when?.start_time ? e.when.start_time * 1000 : null,
            end: e.when?.end_time ? e.when.end_time * 1000 : null,
            allDay: e.when?.object === "date",
            email: grant.email,
          })));
        } catch (err) {
          // Skip failed grants silently
          console.error(`[CalendarViews] Failed to fetch events for grant ${grant.grantId}:`, err);
        }
      }

      // 2. Get internal schedule blocks
      const scheduleBlocks = await db
        .select()
        .from(userScheduleBlocks)
        .where(inArray(userScheduleBlocks.userId, userIds));

      // 3. Get time off entries in range
      const timeOffEntries = await db
        .select()
        .from(userTimeOff)
        .where(and(
          inArray(userTimeOff.userId, userIds),
          gte(userTimeOff.date, input.startDate),
          lte(userTimeOff.date, input.endDate)
        ));

      // 4. Get construction job assignments in range (only for construction/delivery views)
      let jobAssignments: any[] = [];
      if (input.viewType === "construction_team" || input.viewType === "delivery") {
        try {
          jobAssignments = await db
            .select({
              id: constructionAssignments.id,
              userId: constructionAssignments.installerId,
              jobId: constructionAssignments.jobId,
              scheduledStart: constructionJobs.scheduledStart,
              jobTitle: constructionJobs.quoteNumber,
              jobStatus: constructionJobs.status,
            })
            .from(constructionAssignments)
            .leftJoin(constructionJobs, eq(constructionAssignments.jobId, constructionJobs.id))
            .where(
              inArray(constructionAssignments.installerId, userIds)
            );
          // Filter by date range in JS since scheduledStart is a timestamp
          jobAssignments = jobAssignments.filter((j: any) => {
            if (!j.scheduledStart) return false;
            const d = new Date(j.scheduledStart);
            return d >= startDate && d <= endDate;
          });
        } catch (err) {
          // constructionAssignments may not have installerId matching userIds
        }
      }

      // Assemble per-member availability
      return members.map(member => ({
        userId: member.userId,
        userName: member.userName || "Unknown",
        userEmail: member.userEmail,
        calendarEvents: nylasEvents[member.userId] || [],
        scheduleBlocks: scheduleBlocks
          .filter(b => b.userId === member.userId)
          .map(b => ({
            dayOfWeek: b.dayOfWeek,
            startTime: b.startTime,
            endTime: b.endTime,
          })),
        timeOff: timeOffEntries
          .filter(t => t.userId === member.userId)
          .map(t => ({
            date: t.date,
            reason: t.reason,
          })),
        jobAssignments: jobAssignments
          .filter((j: any) => j.userId === member.userId)
          .map((j: any) => ({
            jobId: j.jobId,
            assignmentId: j.id,
            date: j.scheduledStart ? new Date(j.scheduledStart).toISOString().split("T")[0] : null,
            jobTitle: j.jobTitle || `Job #${j.jobId}`,
            jobStatus: j.jobStatus,
          })),
      }));
    }),

  /**
   * Get the current user's persisted people picker selections for a view.
   */
  getMySelections: protectedProcedure
    .input(z.object({ viewType: z.enum(VIEW_TYPES) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select({ selectedUserId: userCalendarSelections.selectedUserId })
        .from(userCalendarSelections)
        .where(and(
          eq(userCalendarSelections.userId, ctx.user.id),
          eq(userCalendarSelections.viewType, input.viewType)
        ));
      return rows.map(r => r.selectedUserId);
    }),

  /**
   * Save the current user's people picker selections for a view.
   * Replaces all existing selections for this user+viewType.
   */
  saveMySelections: protectedProcedure
    .input(z.object({
      viewType: z.enum(VIEW_TYPES),
      selectedUserIds: z.array(z.number()),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      // Delete existing selections
      await db.delete(userCalendarSelections).where(and(
        eq(userCalendarSelections.userId, ctx.user.id),
        eq(userCalendarSelections.viewType, input.viewType)
      ));
      // Insert new selections
      if (input.selectedUserIds.length > 0) {
        await db.insert(userCalendarSelections).values(
          input.selectedUserIds.map(selectedUserId => ({
            userId: ctx.user.id,
            viewType: input.viewType,
            selectedUserId,
          }))
        );
      }
      return { success: true };
    }),

  /**
   * Reschedule a Nylas calendar event (drag-and-drop).
   * Updates the event start/end time via Nylas API.
   */
  rescheduleCalendarEvent: protectedProcedure
    .input(z.object({
      grantId: z.string(),
      eventId: z.string(),
      newStartTime: z.number(), // Unix timestamp in seconds
      newEndTime: z.number(),   // Unix timestamp in seconds
    }))
    .mutation(async ({ input }) => {
      const { updateEvent } = await import("./nylas");
      const updated = await updateEvent(input.grantId, input.eventId, {
        when: {
          start_time: input.newStartTime,
          end_time: input.newEndTime,
        },
      } as any);
      return {
        success: true,
        event: {
          id: updated.id,
          title: updated.title,
          start: updated.when.start_time * 1000,
          end: updated.when.end_time * 1000,
        },
      };
    }),

  /**
   * Reschedule a construction job assignment (drag-and-drop).
   * Updates the scheduledStart (and scheduledEnd if present) on the constructionJobs table.
   */
  rescheduleJobAssignment: protectedProcedure
    .input(z.object({
      jobId: z.number(),
      newDate: z.string(), // ISO date string e.g. "2026-06-05"
      durationDays: z.number().min(1).optional(), // For multi-day resize
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      // Get current job to calculate duration
      const [job] = await db
        .select()
        .from(constructionJobs)
        .where(eq(constructionJobs.id, input.jobId))
        .limit(1);

      if (!job) throw new Error("Job not found");

      // Calculate new scheduledStart preserving the time of day (or default 7:00 AM)
      const oldStart = job.scheduledStart ? new Date(job.scheduledStart) : null;
      const newStart = new Date(input.newDate);
      if (oldStart) {
        newStart.setHours(oldStart.getHours(), oldStart.getMinutes(), 0, 0);
      } else {
        newStart.setHours(7, 0, 0, 0);
      }

      // Calculate duration: use durationDays if provided (multi-day resize), else preserve original
      const updates: any = { scheduledStart: newStart };
      if (input.durationDays) {
        // Multi-day: set end to start + durationDays (at end of working day 16:00)
        const endDate = new Date(newStart);
        endDate.setDate(endDate.getDate() + input.durationDays - 1);
        endDate.setHours(16, 0, 0, 0);
        updates.scheduledEnd = endDate;
      } else if (job.scheduledEnd && oldStart) {
        const duration = new Date(job.scheduledEnd).getTime() - oldStart.getTime();
        updates.scheduledEnd = new Date(newStart.getTime() + duration);
      }

      await db.update(constructionJobs)
        .set(updates)
        .where(eq(constructionJobs.id, input.jobId));

      return { success: true, newDate: input.newDate, durationDays: input.durationDays };
    }),
});
