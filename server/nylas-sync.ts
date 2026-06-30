/**
 * Nylas Calendar Sync Helper
 * Handles syncing CRM appointments to/from Nylas calendars.
 */
import { getDb } from "./db";
import { nylasGrants, crmAppointments, crmLeads } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { createEvent, updateEvent, deleteEvent } from "./nylas";
import type { NylasEventInput } from "./nylas";
import { APP_TIME_ZONE, zonedDateTimeToUnixSeconds } from "@shared/timezone";

type AppointmentParticipant = { name?: string; email: string };

interface SyncAppointmentInput {
  tenantId?: number | null;
  appointmentId: number;
  userId: number;
  leadId: number;
  date: string;
  time: string;
  duration: number;
  location?: string;
  notes?: string;
  participants?: AppointmentParticipant[];
}

/**
 * Sync a newly created appointment to the user's connected calendar.
 * Updates the appointment record with the Nylas event ID.
 */
export async function syncAppointmentToCalendar(input: SyncAppointmentInput): Promise<string | null> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  // Find the user's active grant
  const grantConditions: any[] = [
    eq(nylasGrants.userId, input.userId),
    eq(nylasGrants.status, "active"),
  ];
  if (input.tenantId) grantConditions.push(eq(nylasGrants.tenantId, input.tenantId));
  const [grant] = await db
    .select()
    .from(nylasGrants)
    .where(and(...grantConditions))
    .limit(1);

  if (!grant) throw new Error("No connected calendar found for this appointment owner");

  // Get lead info for the event title
  const leadConditions: any[] = [eq(crmLeads.id, input.leadId)];
  if (input.tenantId) leadConditions.push(eq(crmLeads.tenantId, input.tenantId));
  const [lead] = await db
    .select({ firstName: crmLeads.contactFirstName, lastName: crmLeads.contactLastName, suburb: crmLeads.suburb })
    .from(crmLeads)
    .where(and(...leadConditions))
    .limit(1);

  const clientName = lead ? [lead.firstName, lead.lastName].filter(Boolean).join(" ") || `Lead #${input.leadId}` : `Lead #${input.leadId}`;
  const suburb = lead?.suburb ? ` - ${lead.suburb}` : "";

  // Convert date/time to unix timestamp
  const startTime = zonedDateTimeToUnixSeconds(input.date, input.time, APP_TIME_ZONE);
  const endTime = startTime + (input.duration * 60);

  const eventInput: NylasEventInput = {
    title: `Site Visit: ${clientName}${suburb}`,
    description: input.notes || undefined,
    location: input.location || undefined,
    participants: input.participants?.length ? input.participants : undefined,
    when: {
      start_time: startTime,
      end_time: endTime,
      start_timezone: APP_TIME_ZONE,
      end_timezone: APP_TIME_ZONE,
    },
    busy: true,
    metadata: {
      altaspan_lead_id: String(input.leadId),
      altaspan_appointment_id: String(input.appointmentId),
    },
  };

  try {
    const event = await createEvent(grant.grantId, eventInput, "primary", input.tenantId, {
      notifyParticipants: !!input.participants?.length,
    });

    // Update the appointment with the Nylas event ID
    const appointmentConditions: any[] = [eq(crmAppointments.id, input.appointmentId)];
    if (input.tenantId) appointmentConditions.push(eq(crmAppointments.tenantId, input.tenantId));
    await db.update(crmAppointments)
      .set({
        nylasEventId: event.id,
        calendarSyncStatus: "synced",
        calendarSyncError: null,
        calendarSyncedAt: new Date(),
      })
      .where(and(...appointmentConditions));

    return event.id;
  } catch (err: any) {
    console.error("[Nylas Sync] Failed to create calendar event:", err.message);
    throw err;
  }
}

/**
 * Update an existing calendar event when appointment details change.
 */
export async function updateCalendarEvent(
  appointmentId: number,
  userId: number,
  updates: { date?: string; time?: string; duration?: number; location?: string; notes?: string; participants?: AppointmentParticipant[] },
  tenantId?: number | null
): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  // Get the appointment to find the Nylas event ID
  const appointmentConditions: any[] = [eq(crmAppointments.id, appointmentId)];
  if (tenantId) appointmentConditions.push(eq(crmAppointments.tenantId, tenantId));
  const [appointment] = await db
    .select()
    .from(crmAppointments)
    .where(and(...appointmentConditions))
    .limit(1);

  if (!appointment?.nylasEventId) return false;
  const effectiveTenantId = tenantId ?? appointment.tenantId ?? null;

  // Find the user's active grant
  const targetUserId = appointment.assignedUserId || userId;
  const grantConditions: any[] = [
    eq(nylasGrants.userId, targetUserId),
    eq(nylasGrants.status, "active"),
  ];
  if (effectiveTenantId) grantConditions.push(eq(nylasGrants.tenantId, effectiveTenantId));
  const [grant] = await db
    .select()
    .from(nylasGrants)
    .where(and(...grantConditions))
    .limit(1);

  if (!grant) throw new Error("No connected calendar found for this appointment owner");

  try {
    const date = updates.date || appointment.appointmentDate || "";
    const time = updates.time || appointment.appointmentTime || "";
    const dur = updates.duration || appointment.duration || 60;

    const eventUpdates: Partial<NylasEventInput> = {};

    if (date && time) {
      const startTime = zonedDateTimeToUnixSeconds(date, time, APP_TIME_ZONE);
      const endTime = startTime + (dur * 60);
      eventUpdates.when = {
        start_time: startTime,
        end_time: endTime,
        start_timezone: APP_TIME_ZONE,
        end_timezone: APP_TIME_ZONE,
      };
    }

    if (updates.location !== undefined) eventUpdates.location = updates.location;
    if (updates.notes !== undefined) eventUpdates.description = updates.notes;
    if (updates.participants !== undefined) eventUpdates.participants = updates.participants;

    await updateEvent(grant.grantId, appointment.nylasEventId, eventUpdates, "primary", effectiveTenantId, {
      notifyParticipants: updates.participants !== undefined,
    });
    await db.update(crmAppointments)
      .set({
        calendarSyncStatus: "synced",
        calendarSyncError: null,
        calendarSyncedAt: new Date(),
      })
      .where(and(...appointmentConditions));
    return true;
  } catch (err: any) {
    console.error("[Nylas Sync] Failed to update calendar event:", err.message);
    throw err;
  }
}

/**
 * Delete a calendar event when an appointment is removed.
 */
export async function deleteCalendarEvent(appointmentId: number, userId: number, tenantId?: number | null): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const appointmentConditions: any[] = [eq(crmAppointments.id, appointmentId)];
  if (tenantId) appointmentConditions.push(eq(crmAppointments.tenantId, tenantId));
  const [appointment] = await db
    .select()
    .from(crmAppointments)
    .where(and(...appointmentConditions))
    .limit(1);

  if (!appointment?.nylasEventId) return false;
  const effectiveTenantId = tenantId ?? appointment.tenantId ?? null;

  const targetUserId = appointment.assignedUserId || userId;
  const grantConditions: any[] = [
    eq(nylasGrants.userId, targetUserId),
    eq(nylasGrants.status, "active"),
  ];
  if (effectiveTenantId) grantConditions.push(eq(nylasGrants.tenantId, effectiveTenantId));
  const [grant] = await db
    .select()
    .from(nylasGrants)
    .where(and(...grantConditions))
    .limit(1);

  if (!grant) return false;

  try {
    await deleteEvent(grant.grantId, appointment.nylasEventId, "primary", effectiveTenantId);
    return true;
  } catch (err: any) {
    console.error("[Nylas Sync] Failed to delete calendar event:", err.message);
    return false;
  }
}
