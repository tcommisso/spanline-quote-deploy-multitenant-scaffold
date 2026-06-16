/**
 * Nylas Calendar/Appointments Router
 * Handles OAuth grant flow, calendar listing, and event CRUD.
 * Syncs appointments to the user's connected calendar via Nylas.
 */
import { z } from "zod";
import { tenantProcedure as protectedProcedure, tenantAdminProcedure as adminProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { nylasGrants, crmAppointments } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import {
  buildAuthUrl,
  exchangeCodeForGrant,
  listCalendars,
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  validateApiKey,
} from "./nylas";
import type { NylasEventInput } from "./nylas";
import { buildTrustedAppUrl } from "./_core/url";

function getNylasRedirectUri(ctx: { req: any }, requestedRedirectUri?: string) {
  return buildTrustedAppUrl(ctx.req, "/api/nylas/callback", requestedRedirectUri);
}

function normalizeNylasProvider(provider?: string | null, email?: string | null) {
  const normalized = provider?.trim().toLowerCase();
  if (normalized === "google" || normalized === "microsoft") return normalized;
  const domain = email?.split("@")[1]?.toLowerCase() ?? "";
  if (domain === "gmail.com" || domain === "googlemail.com") return "google";
  return "microsoft";
}

export const nylasRouter = router({
  /**
   * Get all active grants for the current user (supports multiple calendars).
   */
  getMyGrants: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const grants = await db
      .select()
      .from(nylasGrants)
      .where(and(
        eq(nylasGrants.tenantId, ctx.tenant!.id),
        eq(nylasGrants.userId, ctx.user.id),
        eq(nylasGrants.status, "active")
      ));
    return grants;
  }),

  /**
   * Check if the current user has a connected calendar grant.
   */
  getGrant: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;
    const [grant] = await db
      .select()
      .from(nylasGrants)
      .where(and(eq(nylasGrants.tenantId, ctx.tenant!.id), eq(nylasGrants.userId, ctx.user.id)))
      .limit(1);
    return grant || null;
  }),

  /**
   * List all grants (admin only).
   */
  listGrants: adminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const grants = await db
      .select({
        id: nylasGrants.id,
        userId: nylasGrants.userId,
        grantId: nylasGrants.grantId,
        email: nylasGrants.email,
        provider: nylasGrants.provider,
        status: nylasGrants.status,
        createdAt: nylasGrants.createdAt,
      })
      .from(nylasGrants)
      .where(eq(nylasGrants.tenantId, ctx.tenant!.id));
    return grants;
  }),

  /**
   * Get the OAuth authorization URL for connecting a calendar.
   */
  getAuthUrl: protectedProcedure
    .input(z.object({
      redirectUri: z.string(),
      provider: z.string().optional(),
      loginHint: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const state = JSON.stringify({ userId: ctx.user.id, tenantId: ctx.tenant!.id, provider: input.provider ?? null });
      const redirectUri = getNylasRedirectUri(ctx, input.redirectUri);
      const url = await buildAuthUrl(redirectUri, state, {
        tenantId: ctx.tenant!.id,
        provider: input.provider,
        loginHint: input.loginHint,
      });
      return { url };
    }),

  /**
   * Exchange an OAuth code for a grant and store it.
   */
  exchangeCode: protectedProcedure
    .input(z.object({
      code: z.string(),
      redirectUri: z.string(),
      provider: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      // Exchange code for grant
      const redirectUri = getNylasRedirectUri(ctx, input.redirectUri);
      const result = await exchangeCodeForGrant(input.code, redirectUri, ctx.tenant!.id);
      const provider = normalizeNylasProvider(input.provider, result.email);

      // grantId is globally unique in the live schema, so re-auth should update
      // the existing row even if the account was previously linked to another user.
      const [existingByGrant] = await db
        .select()
        .from(nylasGrants)
        .where(eq(nylasGrants.grantId, result.grant_id))
        .limit(1);

      if (existingByGrant) {
        // Re-activate existing grant
        await db.update(nylasGrants)
          .set({
            tenantId: ctx.tenant!.id,
            userId: ctx.user.id,
            email: result.email,
            provider,
            status: "active",
          })
          .where(eq(nylasGrants.id, existingByGrant.id));
      } else {
        // Check if same email already connected (re-auth same account).
        const [existingByEmail] = await db
          .select()
          .from(nylasGrants)
          .where(and(
            eq(nylasGrants.tenantId, ctx.tenant!.id),
            eq(nylasGrants.email, result.email)
          ))
          .limit(1);

        if (existingByEmail) {
          // Update grant ID for existing email connection
          await db.update(nylasGrants)
            .set({
              userId: ctx.user.id,
              grantId: result.grant_id,
              provider,
              status: "active",
            })
            .where(eq(nylasGrants.id, existingByEmail.id));
        } else {
          // New calendar connection - insert
          await db.insert(nylasGrants).values({
            tenantId: ctx.tenant!.id,
            userId: ctx.user.id,
            grantId: result.grant_id,
            email: result.email,
            provider,
            status: "active",
          });
        }
      }

      return { success: true, email: result.email };
    }),

  /**
   * Disconnect (revoke) the user's calendar grant.
   */
  disconnect: protectedProcedure
    .input(z.object({ grantId: z.number().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      if (input?.grantId) {
        // Disconnect a specific grant
        await db.update(nylasGrants)
          .set({ status: "revoked" })
          .where(and(
            eq(nylasGrants.tenantId, ctx.tenant!.id),
            eq(nylasGrants.id, input.grantId),
            eq(nylasGrants.userId, ctx.user.id)
          ));
      } else {
        // Disconnect all grants for this user (backward compat)
        await db.update(nylasGrants)
          .set({ status: "revoked" })
          .where(and(eq(nylasGrants.tenantId, ctx.tenant!.id), eq(nylasGrants.userId, ctx.user.id)));
      }

      return { success: true };
    }),

  /**
   * List calendars for the current user's grant.
   */
  listCalendars: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    const [grant] = await db
      .select()
      .from(nylasGrants)
      .where(and(
        eq(nylasGrants.tenantId, ctx.tenant!.id),
        eq(nylasGrants.userId, ctx.user.id),
        eq(nylasGrants.status, "active")
      ))
      .limit(1);

    if (!grant) return [];

    try {
      const calendars = await listCalendars(grant.grantId, ctx.tenant!.id);
      return calendars.map((c: any) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        isPrimary: c.is_primary,
        readOnly: c.read_only,
      }));
    } catch (err: any) {
      console.error("[Nylas] Failed to list calendars:", err.message);
      // Mark grant as error if auth failed
      if (err.message?.includes("401")) {
        await db.update(nylasGrants)
          .set({ status: "error" })
          .where(eq(nylasGrants.id, grant.id));
      }
      return [];
    }
  }),

  /**
   * List events from the user's calendar within a time range.
   */
  listEvents: protectedProcedure
    .input(z.object({
      start: z.number().optional(),
      end: z.number().optional(),
      calendarId: z.string().default("primary"),
      limit: z.number().default(50),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      const [grant] = await db
        .select()
        .from(nylasGrants)
        .where(and(
          eq(nylasGrants.tenantId, ctx.tenant!.id),
          eq(nylasGrants.userId, ctx.user.id),
          eq(nylasGrants.status, "active")
        ))
        .limit(1);

      if (!grant) return [];

      try {
        const events = await listEvents(grant.grantId, input?.calendarId || "primary", {
          tenantId: ctx.tenant!.id,
          start: input?.start,
          end: input?.end,
          limit: input?.limit,
        });
        return events;
      } catch (err: any) {
        console.error("[Nylas] Failed to list events:", err.message);
        return [];
      }
    }),

  /**
   * Create an appointment and optionally sync to calendar.
   */
  createAppointment: protectedProcedure
    .input(z.object({
      leadId: z.number(),
      appointmentDate: z.string(),
      appointmentTime: z.string(),
      duration: z.number().default(60),
      location: z.string().optional(),
      notes: z.string().optional(),
      assignedUserId: z.number().optional(),
      syncToCalendar: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      // Insert the appointment record
      const [inserted] = await db.insert(crmAppointments).values({
        tenantId: ctx.tenant!.id,
        leadId: input.leadId,
        assignedUserId: input.assignedUserId || ctx.user.id,
        appointmentDate: input.appointmentDate,
        appointmentTime: input.appointmentTime,
        duration: input.duration,
        location: input.location || null,
        notes: input.notes || null,
      });

      const appointmentId = (inserted as any).insertId;
      let nylasEventId: string | null = null;

      // Sync to calendar if requested
      if (input.syncToCalendar) {
        const targetUserId = input.assignedUserId || ctx.user.id;
        const [grant] = await db
          .select()
          .from(nylasGrants)
          .where(and(
            eq(nylasGrants.tenantId, ctx.tenant!.id),
            eq(nylasGrants.userId, targetUserId),
            eq(nylasGrants.status, "active")
          ))
          .limit(1);

        if (grant) {
          try {
            // Parse date and time to unix timestamp
            const startTime = dateTimeToUnix(input.appointmentDate, input.appointmentTime);
            const endTime = startTime + (input.duration * 60);

            const eventInput: NylasEventInput = {
              title: `Site Appointment - Lead #${input.leadId}`,
              description: input.notes || undefined,
              location: input.location || undefined,
              when: {
                start_time: startTime,
                end_time: endTime,
                start_timezone: "Australia/Sydney",
                end_timezone: "Australia/Sydney",
              },
              busy: true,
              metadata: {
                altaspan_lead_id: String(input.leadId),
                altaspan_appointment_id: String(appointmentId),
              },
            };

            const event = await createEvent(grant.grantId, eventInput, "primary", ctx.tenant!.id);
            nylasEventId = event.id;

            // Update the appointment with the Nylas event ID
            await db.update(crmAppointments)
              .set({ nylasEventId: event.id })
              .where(and(eq(crmAppointments.tenantId, ctx.tenant!.id), eq(crmAppointments.id, appointmentId)));
          } catch (err: any) {
            console.error("[Nylas] Failed to create calendar event:", err.message);
            // Appointment is still created, just not synced
          }
        }
      }

      return { id: appointmentId, nylasEventId };
    }),

  /**
   * Update an appointment and sync changes to calendar.
   */
  updateAppointment: protectedProcedure
    .input(z.object({
      id: z.number(),
      appointmentDate: z.string().optional(),
      appointmentTime: z.string().optional(),
      duration: z.number().optional(),
      location: z.string().optional(),
      notes: z.string().optional(),
      outcome: z.string().optional(),
      assignedUserId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const { id, ...updates } = input;

      // Get existing appointment
      const [existing] = await db
        .select()
        .from(crmAppointments)
        .where(and(eq(crmAppointments.tenantId, ctx.tenant!.id), eq(crmAppointments.id, id)))
        .limit(1);

      if (!existing) throw new Error("Appointment not found");

      // Update the appointment record
      await db.update(crmAppointments)
        .set({
          ...(updates.appointmentDate && { appointmentDate: updates.appointmentDate }),
          ...(updates.appointmentTime && { appointmentTime: updates.appointmentTime }),
          ...(updates.duration && { duration: updates.duration }),
          ...(updates.location !== undefined && { location: updates.location || null }),
          ...(updates.notes !== undefined && { notes: updates.notes || null }),
          ...(updates.outcome !== undefined && { outcome: updates.outcome || null }),
          ...(updates.assignedUserId && { assignedUserId: updates.assignedUserId }),
        })
        .where(and(eq(crmAppointments.tenantId, ctx.tenant!.id), eq(crmAppointments.id, id)));

      // Sync to calendar if event exists
      if (existing.nylasEventId) {
        const targetUserId = updates.assignedUserId || existing.assignedUserId || ctx.user.id;
        const [grant] = await db
          .select()
          .from(nylasGrants)
          .where(and(
            eq(nylasGrants.tenantId, ctx.tenant!.id),
            eq(nylasGrants.userId, targetUserId),
            eq(nylasGrants.status, "active")
          ))
          .limit(1);

        if (grant) {
          try {
            const date = updates.appointmentDate || existing.appointmentDate || "";
            const time = updates.appointmentTime || existing.appointmentTime || "";
            const dur = updates.duration || existing.duration || 60;

            if (date && time) {
              const startTime = dateTimeToUnix(date, time);
              const endTime = startTime + (dur * 60);

              await updateEvent(grant.grantId, existing.nylasEventId, {
                when: {
                  start_time: startTime,
                  end_time: endTime,
                  start_timezone: "Australia/Sydney",
                  end_timezone: "Australia/Sydney",
                },
                location: updates.location || existing.location || undefined,
                description: updates.notes || existing.notes || undefined,
              }, "primary", ctx.tenant!.id);
            }
          } catch (err: any) {
            console.error("[Nylas] Failed to update calendar event:", err.message);
          }
        }
      }

      return { success: true };
    }),

  /**
   * Delete an appointment and remove from calendar.
   */
  deleteAppointment: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const [existing] = await db
        .select()
        .from(crmAppointments)
        .where(and(eq(crmAppointments.tenantId, ctx.tenant!.id), eq(crmAppointments.id, input.id)))
        .limit(1);

      if (!existing) throw new Error("Appointment not found");

      // Delete from calendar if synced
      if (existing.nylasEventId) {
        const targetUserId = existing.assignedUserId || ctx.user.id;
        const [grant] = await db
          .select()
          .from(nylasGrants)
          .where(and(
            eq(nylasGrants.tenantId, ctx.tenant!.id),
            eq(nylasGrants.userId, targetUserId),
            eq(nylasGrants.status, "active")
          ))
          .limit(1);

        if (grant) {
          try {
            await deleteEvent(grant.grantId, existing.nylasEventId, "primary", ctx.tenant!.id);
          } catch (err: any) {
            console.error("[Nylas] Failed to delete calendar event:", err.message);
          }
        }
      }

      // Delete the appointment record
      await db.delete(crmAppointments).where(and(eq(crmAppointments.tenantId, ctx.tenant!.id), eq(crmAppointments.id, input.id)));

      return { success: true };
    }),

  /**
   * Check Nylas API connectivity.
   */
  checkConnection: adminProcedure.query(async ({ ctx }) => {
    const valid = await validateApiKey(ctx.tenant!.id);
    return { connected: valid };
  }),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert date string (YYYY-MM-DD) and time string (HH:mm) to Unix timestamp (seconds).
 * Assumes Australia/Sydney timezone.
 */
function dateTimeToUnix(date: string, time: string): number {
  // Create a date in local timezone
  const dateTimeStr = `${date}T${time}:00`;
  // Use a simple approach: parse as UTC then adjust for AEST (+10) or AEDT (+11)
  // For simplicity, we'll use the Date constructor which handles this
  const dt = new Date(dateTimeStr + "+10:00"); // Default to AEST
  return Math.floor(dt.getTime() / 1000);
}
