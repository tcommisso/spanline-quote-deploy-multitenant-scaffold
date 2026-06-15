/**
 * Nylas Calendar Sync Helper
 * Handles syncing CRM appointments to/from Nylas calendars.
 */
import { getDb } from "./db";
import { nylasGrants, crmAppointments, crmLeads } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { createEvent, updateEvent, deleteEvent } from "./nylas";
import type { NylasEventInput } from "./nylas";

interface SyncAppointmentInput {
  appointmentId: number;
  userId: number;
  leadId: number;
  date: string;
  time: string;
  duration: number;
  location?: string;
  notes?: string;
}

/**
 * Sync a newly created appointment to the user's connected calendar.
 * Updates the appointment record with the Nylas event ID.
 */
export async function syncAppointmentToCalendar(input: SyncAppointmentInput): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;

  // Find the user's active grant
  const [grant] = await db
    .select()
    .from(nylasGrants)
    .where(and(eq(nylasGrants.userId, input.userId), eq(nylasGrants.status, "active")))
    .limit(1);

  if (!grant) return null;

  // Get lead info for the event title
  const [lead] = await db
    .select({ firstName: crmLeads.contactFirstName, lastName: crmLeads.contactLastName, suburb: crmLeads.suburb })
    .from(crmLeads)
    .where(eq(crmLeads.id, input.leadId))
    .limit(1);

  const clientName = lead ? [lead.firstName, lead.lastName].filter(Boolean).join(" ") || `Lead #${input.leadId}` : `Lead #${input.leadId}`;
  const suburb = lead?.suburb ? ` - ${lead.suburb}` : "";

  // Convert date/time to unix timestamp
  const startTime = dateTimeToUnix(input.date, input.time);
  const endTime = startTime + (input.duration * 60);

  const eventInput: NylasEventInput = {
    title: `Site Visit: ${clientName}${suburb}`,
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
      altaspan_appointment_id: String(input.appointmentId),
    },
  };

  try {
    const event = await createEvent(grant.grantId, eventInput);

    // Update the appointment with the Nylas event ID
    await db.update(crmAppointments)
      .set({ nylasEventId: event.id })
      .where(eq(crmAppointments.id, input.appointmentId));

    return event.id;
  } catch (err: any) {
    console.error("[Nylas Sync] Failed to create calendar event:", err.message);
    return null;
  }
}

/**
 * Update an existing calendar event when appointment details change.
 */
export async function updateCalendarEvent(
  appointmentId: number,
  userId: number,
  updates: { date?: string; time?: string; duration?: number; location?: string; notes?: string }
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Get the appointment to find the Nylas event ID
  const [appointment] = await db
    .select()
    .from(crmAppointments)
    .where(eq(crmAppointments.id, appointmentId))
    .limit(1);

  if (!appointment?.nylasEventId) return false;

  // Find the user's active grant
  const targetUserId = appointment.assignedUserId || userId;
  const [grant] = await db
    .select()
    .from(nylasGrants)
    .where(and(eq(nylasGrants.userId, targetUserId), eq(nylasGrants.status, "active")))
    .limit(1);

  if (!grant) return false;

  try {
    const date = updates.date || appointment.appointmentDate || "";
    const time = updates.time || appointment.appointmentTime || "";
    const dur = updates.duration || appointment.duration || 60;

    const eventUpdates: Partial<NylasEventInput> = {};

    if (date && time) {
      const startTime = dateTimeToUnix(date, time);
      const endTime = startTime + (dur * 60);
      eventUpdates.when = {
        start_time: startTime,
        end_time: endTime,
        start_timezone: "Australia/Sydney",
        end_timezone: "Australia/Sydney",
      };
    }

    if (updates.location !== undefined) eventUpdates.location = updates.location;
    if (updates.notes !== undefined) eventUpdates.description = updates.notes;

    await updateEvent(grant.grantId, appointment.nylasEventId, eventUpdates);
    return true;
  } catch (err: any) {
    console.error("[Nylas Sync] Failed to update calendar event:", err.message);
    return false;
  }
}

/**
 * Delete a calendar event when an appointment is removed.
 */
export async function deleteCalendarEvent(appointmentId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const [appointment] = await db
    .select()
    .from(crmAppointments)
    .where(eq(crmAppointments.id, appointmentId))
    .limit(1);

  if (!appointment?.nylasEventId) return false;

  const targetUserId = appointment.assignedUserId || userId;
  const [grant] = await db
    .select()
    .from(nylasGrants)
    .where(and(eq(nylasGrants.userId, targetUserId), eq(nylasGrants.status, "active")))
    .limit(1);

  if (!grant) return false;

  try {
    await deleteEvent(grant.grantId, appointment.nylasEventId);
    return true;
  } catch (err: any) {
    console.error("[Nylas Sync] Failed to delete calendar event:", err.message);
    return false;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert date string (YYYY-MM-DD) and time string (HH:mm) to Unix timestamp (seconds).
 * Assumes Australia/Sydney timezone (AEST +10:00).
 */
function dateTimeToUnix(date: string, time: string): number {
  const dateTimeStr = `${date}T${time}:00+10:00`;
  const dt = new Date(dateTimeStr);
  return Math.floor(dt.getTime() / 1000);
}
