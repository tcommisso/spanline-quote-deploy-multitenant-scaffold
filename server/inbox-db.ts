/**
 * Inbox Database Helpers
 * CRUD operations for the Shared Inbox / Central Email Hub
 */
import { eq, and, desc, like, sql, or, gte, lte, inArray, isNull, isNotNull, asc } from "drizzle-orm";
import { getDb } from "./db";
import {
  inboxMessages, inboxTags, inboxMessageTags, emailSignatures, inboxSettings, inboxSlaRules, inboxAddresses,
  crmLeads, portalAccess, constructionJobs, clientActivities, users,
  type InboxMessage, type InsertInboxMessage,
  type InboxTag, type InsertInboxTag,
  type EmailSignature, type InsertEmailSignature,
  type InboxSetting, type InsertInboxSetting,
  type InboxSlaRule, type InsertInboxSlaRule,
  type InboxAddress, type InsertInboxAddress,
} from "../drizzle/schema";

// ─── Inbox Messages ─────────────────────────────────────────────────────────

export async function createInboxMessage(data: Omit<InsertInboxMessage, "id">) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [result] = await db.insert(inboxMessages).values(data);
  return { id: (result as any).insertId };
}

export async function getInboxMessageById(id: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const conditions: any[] = [eq(inboxMessages.id, id)];
  if (tenantId) conditions.push(eq(inboxMessages.tenantId, tenantId));
  const [msg] = await db.select().from(inboxMessages).where(and(...conditions)).limit(1);
  return msg || null;
}

export async function listInboxMessages(filters: {
  direction?: "inbound" | "outbound";
  status?: string;
  assignedToId?: number;
  isRead?: boolean;
  isStarred?: boolean;
  search?: string;
  tagIds?: number[];
  receivedByAddress?: string;
  tenantId?: number | null;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const conditions: any[] = [];
  if (filters.tenantId) conditions.push(eq(inboxMessages.tenantId, filters.tenantId));
  if (filters.direction) conditions.push(eq(inboxMessages.direction, filters.direction));
  if (filters.status) conditions.push(eq(inboxMessages.status, filters.status as any));
  if (filters.assignedToId !== undefined) conditions.push(eq(inboxMessages.assignedToId, filters.assignedToId));
  if (filters.isRead !== undefined) conditions.push(eq(inboxMessages.isRead, filters.isRead));
  if (filters.isStarred !== undefined) conditions.push(eq(inboxMessages.isStarred, filters.isStarred));
  if (filters.receivedByAddress) conditions.push(eq(inboxMessages.receivedByAddress, filters.receivedByAddress));
  if (filters.search) {
    conditions.push(
      or(
        like(inboxMessages.subject, `%${filters.search}%`),
        like(inboxMessages.fromAddress, `%${filters.search}%`),
        like(inboxMessages.fromName, `%${filters.search}%`),
        like(inboxMessages.textBody, `%${filters.search}%`),
      )
    );
  }

  // If filtering by tags, get message IDs first
  let tagFilteredIds: number[] | null = null;
  if (filters.tagIds && filters.tagIds.length > 0) {
    const taggedMessages = await db
      .select({ messageId: inboxMessageTags.messageId })
      .from(inboxMessageTags)
      .where(inArray(inboxMessageTags.tagId, filters.tagIds));
    tagFilteredIds = taggedMessages.map(t => t.messageId);
    if (tagFilteredIds.length === 0) return { messages: [], total: 0 };
    conditions.push(inArray(inboxMessages.id, tagFilteredIds));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Get latest message per thread for the list view
  const limit = filters.limit || 50;
  const offset = filters.offset || 0;

  const messages = await db
    .select()
    .from(inboxMessages)
    .where(where)
    .orderBy(desc(inboxMessages.createdAt))
    .limit(limit)
    .offset(offset);

  // Count total
  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(inboxMessages)
    .where(where);

  return { messages, total: countResult?.count || 0 };
}

export async function getThreadMessages(threadId: string, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const conditions: any[] = [eq(inboxMessages.threadId, threadId)];
  if (tenantId) conditions.push(eq(inboxMessages.tenantId, tenantId));
  return db
    .select()
    .from(inboxMessages)
    .where(and(...conditions))
    .orderBy(asc(inboxMessages.createdAt));
}

export async function updateInboxMessage(id: number, data: Partial<InsertInboxMessage>, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const conditions: any[] = [eq(inboxMessages.id, id)];
  if (tenantId) conditions.push(eq(inboxMessages.tenantId, tenantId));
  await db.update(inboxMessages).set(data).where(and(...conditions));
}

export async function markAsRead(ids: number[], tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const conditions: any[] = [inArray(inboxMessages.id, ids)];
  if (tenantId) conditions.push(eq(inboxMessages.tenantId, tenantId));
  await db.update(inboxMessages).set({ isRead: true }).where(and(...conditions));
}

export async function markAllAsRead(tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const conditions: any[] = [eq(inboxMessages.isRead, false)];
  if (tenantId) conditions.push(eq(inboxMessages.tenantId, tenantId));
  await db.update(inboxMessages).set({ isRead: true }).where(and(...conditions));
}

export async function markAsUnread(ids: number[], tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const conditions: any[] = [inArray(inboxMessages.id, ids)];
  if (tenantId) conditions.push(eq(inboxMessages.tenantId, tenantId));
  await db.update(inboxMessages).set({ isRead: false }).where(and(...conditions));
}

export async function toggleStar(id: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const conditions: any[] = [eq(inboxMessages.id, id)];
  if (tenantId) conditions.push(eq(inboxMessages.tenantId, tenantId));
  const [msg] = await db.select({ isStarred: inboxMessages.isStarred }).from(inboxMessages).where(and(...conditions)).limit(1);
  if (!msg) throw new Error("Message not found");
  await db.update(inboxMessages).set({ isStarred: !msg.isStarred }).where(and(...conditions));
  return !msg.isStarred;
}

export async function assignMessage(id: number, assignedToId: number | null, assignedToName: string | null, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const conditions: any[] = [eq(inboxMessages.id, id)];
  if (tenantId) conditions.push(eq(inboxMessages.tenantId, tenantId));
  await db.update(inboxMessages).set({
    assignedToId,
    assignedToName,
    assignedAt: assignedToId ? new Date() : null,
  }).where(and(...conditions));
}

export async function getUnreadCount(userId?: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const conditions: any[] = [
    eq(inboxMessages.isRead, false),
    eq(inboxMessages.direction, "inbound"),
  ];
  if (tenantId) conditions.push(eq(inboxMessages.tenantId, tenantId));
  if (userId) conditions.push(eq(inboxMessages.assignedToId, userId));
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(inboxMessages)
    .where(and(...conditions));
  return result?.count || 0;
}

// ─── Auto-routing: match email to client/job ────────────────────────────────

export async function matchEmailToClient(fromEmail: string, tenantId?: number | null): Promise<{
  matchedJobId: number | null;
  matchedLeadId: number | null;
  matchedClientEmail: string | null;
  clientName: string | null;
} | null> {
  const db = await getDb();
  if (!db) return null;
  const email = fromEmail.toLowerCase().trim();

  // 1. Check portal_access (active clients with portal)
  const portalConditions: any[] = [eq(portalAccess.clientEmail, email), eq(portalAccess.isActive, true)];
  if (tenantId) portalConditions.push(eq(portalAccess.tenantId, tenantId));
  const [portalMatch] = await db
    .select({
      jobId: portalAccess.constructionJobId,
      clientEmail: portalAccess.clientEmail,
      clientName: portalAccess.clientName,
    })
    .from(portalAccess)
    .where(and(...portalConditions))
    .limit(1);

  if (portalMatch) {
    // Find the lead linked to this job
    const jobConditions: any[] = [eq(constructionJobs.id, portalMatch.jobId)];
    if (tenantId) jobConditions.push(eq(constructionJobs.tenantId, tenantId));
    const [job] = await db
      .select({ leadId: constructionJobs.leadId })
      .from(constructionJobs)
      .where(and(...jobConditions))
      .limit(1);
    return {
      matchedJobId: portalMatch.jobId,
      matchedLeadId: job?.leadId || null,
      matchedClientEmail: portalMatch.clientEmail,
      clientName: portalMatch.clientName || null,
    };
  }

  // 2. Check crm_leads by contactEmail
  const leadConditions: any[] = [eq(crmLeads.contactEmail, email)];
  if (tenantId) leadConditions.push(eq(crmLeads.tenantId, tenantId));
  const [leadMatch] = await db
    .select({
      id: crmLeads.id,
      contactEmail: crmLeads.contactEmail,
      contactFirstName: crmLeads.contactFirstName,
      contactLastName: crmLeads.contactLastName,
      constructionJobNumber: crmLeads.constructionJobNumber,
    })
    .from(crmLeads)
    .where(and(...leadConditions))
    .orderBy(desc(crmLeads.createdAt))
    .limit(1);

  if (leadMatch) {
    // Try to find a construction job linked to this lead
    const jobConditions: any[] = [eq(constructionJobs.leadId, leadMatch.id)];
    if (tenantId) jobConditions.push(eq(constructionJobs.tenantId, tenantId));
    const [job] = await db
      .select({ id: constructionJobs.id })
      .from(constructionJobs)
      .where(and(...jobConditions))
      .limit(1);
    return {
      matchedJobId: job?.id || null,
      matchedLeadId: leadMatch.id,
      matchedClientEmail: leadMatch.contactEmail,
      clientName: [leadMatch.contactFirstName, leadMatch.contactLastName].filter(Boolean).join(" ") || null,
    };
  }

  return null;
}

// ─── Tags ───────────────────────────────────────────────────────────────────

export async function listTags() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.select().from(inboxTags).where(eq(inboxTags.active, true)).orderBy(asc(inboxTags.sortOrder));
}

export async function createTag(data: Omit<InsertInboxTag, "id">) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [result] = await db.insert(inboxTags).values(data);
  return { id: (result as any).insertId };
}

export async function updateTag(id: number, data: Partial<InsertInboxTag>) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(inboxTags).set(data).where(eq(inboxTags.id, id));
}

export async function deleteTag(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(inboxTags).set({ active: false }).where(eq(inboxTags.id, id));
}

export async function getMessageTags(messageId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const rows = await db
    .select({ tag: inboxTags })
    .from(inboxMessageTags)
    .innerJoin(inboxTags, eq(inboxMessageTags.tagId, inboxTags.id))
    .where(eq(inboxMessageTags.messageId, messageId));
  return rows.map(r => r.tag);
}

export async function addTagToMessage(messageId: number, tagId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  // Check if already exists
  const [existing] = await db
    .select()
    .from(inboxMessageTags)
    .where(and(eq(inboxMessageTags.messageId, messageId), eq(inboxMessageTags.tagId, tagId)))
    .limit(1);
  if (existing) return;
  await db.insert(inboxMessageTags).values({ messageId, tagId });
}

export async function removeTagFromMessage(messageId: number, tagId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.delete(inboxMessageTags).where(
    and(eq(inboxMessageTags.messageId, messageId), eq(inboxMessageTags.tagId, tagId))
  );
}

// ─── Email Signatures ───────────────────────────────────────────────────────

export async function getUserSignatures(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.select().from(emailSignatures).where(eq(emailSignatures.userId, userId)).orderBy(desc(emailSignatures.isDefault));
}

export async function getDefaultSignature(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  // Get all user signatures to check schedule-based selection
  const userSigs = await db
    .select()
    .from(emailSignatures)
    .where(eq(emailSignatures.userId, userId));
  
  if (userSigs.length > 0) {
    const isBusinessHours = checkIsBusinessHours();
    // First try to find a schedule-specific signature
    const scheduledSig = userSigs.find(s => {
      if (isBusinessHours && s.schedule === "business_hours") return true;
      if (!isBusinessHours && s.schedule === "out_of_office") return true;
      return false;
    });
    if (scheduledSig) return scheduledSig;
    // Fall back to 'always' default
    const defaultSig = userSigs.find(s => s.isDefault && (s.schedule === "always" || !s.schedule));
    if (defaultSig) return defaultSig;
    // Fall back to any default
    const anyDefault = userSigs.find(s => s.isDefault);
    if (anyDefault) return anyDefault;
  }
  // Fall back to company-wide default signature if user has no personal default
  return getCompanyDefaultSignature();
}

/** Check if current time is within business hours (Mon-Fri 8am-6pm Australia/Sydney, DST-aware) */
function checkIsBusinessHours(): boolean {
  const now = new Date();
  // Use Intl to get the correct local time in Australia/Sydney (handles DST)
  const formatter = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const weekday = parts.find(p => p.type === "weekday")?.value || "";
  const hour = parseInt(parts.find(p => p.type === "hour")?.value || "0", 10);
  // Weekend check
  if (weekday === "Sat" || weekday === "Sun") return false;
  // Business hours: 8am-6pm
  if (hour < 8 || hour >= 18) return false;
  return true;
}

export async function getCompanyDefaultSignature() {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(inboxSettings)
    .where(eq(inboxSettings.settingKey, "company_default_signature"))
    .limit(1);
  if (!row || !row.settingValue) return null;
  try {
    const parsed = JSON.parse(row.settingValue);
    return {
      id: 0,
      userId: 0,
      name: parsed.name || "Company Default",
      htmlContent: parsed.htmlContent || "",
      isDefault: true,
      isCompanyDefault: true,
      createdAt: row.updatedAt,
      updatedAt: row.updatedAt,
    };
  } catch {
    return null;
  }
}

export async function setCompanyDefaultSignature(name: string, htmlContent: string, updatedBy: number) {
  await setSetting("company_default_signature", JSON.stringify({ name, htmlContent }), updatedBy);
}

export async function upsertSignature(data: Omit<InsertEmailSignature, "id">) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  // If setting as default, unset other defaults for this user
  if (data.isDefault) {
    await db.update(emailSignatures).set({ isDefault: false }).where(eq(emailSignatures.userId, data.userId));
  }
  const [result] = await db.insert(emailSignatures).values(data);
  return { id: (result as any).insertId };
}

export async function updateSignature(id: number, userId: number, data: Partial<InsertEmailSignature>) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (data.isDefault) {
    await db.update(emailSignatures).set({ isDefault: false }).where(eq(emailSignatures.userId, userId));
  }
  await db.update(emailSignatures).set(data).where(and(eq(emailSignatures.id, id), eq(emailSignatures.userId, userId)));
}

export async function deleteSignature(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.delete(emailSignatures).where(and(eq(emailSignatures.id, id), eq(emailSignatures.userId, userId)));
}

export async function duplicateCompanySignatureToUsers(name: string, htmlContent: string, forceAll = false) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  // Get all staff users
  const staffUsers = await listStaffUsers();
  // Get users who already have at least one signature
  const existingSignatures = await db
    .select({ userId: emailSignatures.userId })
    .from(emailSignatures);
  const usersWithSig = new Set(existingSignatures.map(s => s.userId));
  let created = 0;
  for (const user of staffUsers) {
    if (forceAll || !usersWithSig.has(user.id)) {
      await db.insert(emailSignatures).values({
        userId: user.id,
        name,
        htmlContent,
        isDefault: true,
        schedule: "always",
      });
      created++;
    }
  }
  return { created, skipped: staffUsers.length - created, total: staffUsers.length };
}

export async function getSignatureAnalytics() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const staffUsers = await listStaffUsers();
  const allSignatures = await db.select().from(emailSignatures);
  const sigsByUser = new Map<number, typeof allSignatures>();
  for (const sig of allSignatures) {
    if (!sigsByUser.has(sig.userId)) sigsByUser.set(sig.userId, []);
    sigsByUser.get(sig.userId)!.push(sig);
  }
  const analytics = staffUsers.map(user => {
    const userSigs = sigsByUser.get(user.id) || [];
    const hasPersonal = userSigs.length > 0;
    const defaultSig = userSigs.find(s => s.isDefault);
    return {
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      role: user.role,
      hasPersonalSignature: hasPersonal,
      signatureCount: userSigs.length,
      defaultSignatureName: defaultSig?.name || null,
      usesCompanyDefault: !hasPersonal,
    };
  });
  return {
    totalStaff: staffUsers.length,
    withPersonal: analytics.filter(a => a.hasPersonalSignature).length,
    usingCompanyDefault: analytics.filter(a => a.usesCompanyDefault).length,
    users: analytics,
  };
}

// ─── Inbox Settings ─────────────────────────────────────────────────────────

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(inboxSettings).where(eq(inboxSettings.settingKey, key)).limit(1);
  return row?.settingValue || null;
}

export async function setSetting(key: string, value: string, updatedBy?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  // Upsert
  const [existing] = await db.select().from(inboxSettings).where(eq(inboxSettings.settingKey, key)).limit(1);
  if (existing) {
    await db.update(inboxSettings).set({ settingValue: value, updatedBy }).where(eq(inboxSettings.id, existing.id));
  } else {
    await db.insert(inboxSettings).values({ settingKey: key, settingValue: value, updatedBy });
  }
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const db = await getDb();
  if (!db) return {};
  const rows = await db.select().from(inboxSettings);
  const result: Record<string, string> = {};
  for (const row of rows) result[row.settingKey] = row.settingValue;
  return result;
}

// ─── SLA Rules ──────────────────────────────────────────────────────────────

export async function listSlaRules() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.select().from(inboxSlaRules).orderBy(asc(inboxSlaRules.id));
}

export async function getActiveSlaRule(): Promise<InboxSlaRule | null> {
  const db = await getDb();
  if (!db) return null;
  const [rule] = await db.select().from(inboxSlaRules).where(eq(inboxSlaRules.active, true)).limit(1);
  return rule || null;
}

export async function upsertSlaRule(data: Omit<InsertInboxSlaRule, "id"> & { id?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (data.id) {
    const { id, ...rest } = data;
    await db.update(inboxSlaRules).set(rest).where(eq(inboxSlaRules.id, id));
    return { id };
  }
  const [result] = await db.insert(inboxSlaRules).values(data);
  return { id: (result as any).insertId };
}

export async function deleteSlaRule(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.delete(inboxSlaRules).where(eq(inboxSlaRules.id, id));
}

// ─── SLA Check: get messages breaching SLA ──────────────────────────────────

export async function getMessagesBreachingSla(): Promise<Array<InboxMessage & { slaLevel: "warning" | "escalation" }>> {
  const db = await getDb();
  if (!db) return [];

  const rule = await getActiveSlaRule();
  if (!rule) return [];

  const now = Date.now();
  const warningCutoff = new Date(now - rule.warningHours * 60 * 60 * 1000);
  const escalationCutoff = new Date(now - rule.escalationHours * 60 * 60 * 1000);

  // Get inbound messages that are not closed/replied/spam
  const openMessages = await db
    .select()
    .from(inboxMessages)
    .where(
      and(
        eq(inboxMessages.direction, "inbound"),
        or(eq(inboxMessages.status, "new"), eq(inboxMessages.status, "open")),
        lte(inboxMessages.createdAt, warningCutoff),
      )
    )
    .orderBy(asc(inboxMessages.createdAt));

  return openMessages.map(msg => {
    const msgTime = new Date(msg.createdAt).getTime();
    const slaLevel = msgTime <= escalationCutoff.getTime() ? "escalation" as const : "warning" as const;
    return { ...msg, slaLevel };
  });
}

// ─── Users list (for assignment picker) ─────────────────────────────────────

export async function listStaffUsers() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(
      or(
        eq(users.role, "admin"),
        eq(users.role, "super_admin"),
        eq(users.role, "office_user"),
        eq(users.role, "design_adviser"),
        eq(users.role, "construction_user"),
      )
    )
    .orderBy(asc(users.name));
}

// ─── Create activity on matched client ──────────────────────────────────────

export async function createEmailActivity(params: {
  jobId: number;
  leadId?: number | null;
  subject: string;
  fromEmail: string;
  snippet: string;
  inboxMessageId: number;
}) {
  const db = await getDb();
  if (!db) return null;
  const content = `Email from ${params.fromEmail}: ${params.subject}\n\n${params.snippet}`;
  const [result] = await db.insert(clientActivities).values({
    jobId: params.jobId,
    leadId: params.leadId || null,
    type: "email",
    title: `Inbound Email: ${params.subject || "(no subject)"}`,
    content: content.slice(0, 2000),
    portalVisible: false,
    createdBy: 0, // system
    createdByName: "System (Inbox)",
  });
  return { id: (result as any).insertId };
}

// ─── Inbox Addresses (multiple receiving addresses) ────────────────────────

export async function listInboxAddresses(activeOnly = true, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const conditions: any[] = [];
  if (tenantId) conditions.push(eq(inboxAddresses.tenantId, tenantId));
  if (activeOnly) conditions.push(eq(inboxAddresses.active, true));
  return db
    .select()
    .from(inboxAddresses)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(inboxAddresses.sortOrder));
}

export async function getInboxAddressByEmail(email: string, tenantId?: number | null): Promise<InboxAddress | null> {
  const db = await getDb();
  if (!db) return null;
  const normalized = email.toLowerCase().trim();
  const conditions: any[] = [eq(inboxAddresses.address, normalized)];
  if (tenantId) conditions.push(eq(inboxAddresses.tenantId, tenantId));
  const [row] = await db
    .select()
    .from(inboxAddresses)
    .where(and(...conditions))
    .limit(1);
  return row || null;
}

export async function createInboxAddress(data: Omit<InsertInboxAddress, "id">) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [result] = await db.insert(inboxAddresses).values({ ...data, address: data.address.toLowerCase().trim() });
  return { id: (result as any).insertId };
}

export async function updateInboxAddress(id: number, data: Partial<InsertInboxAddress>, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (data.address) data.address = data.address.toLowerCase().trim();
  const conditions: any[] = [eq(inboxAddresses.id, id)];
  if (tenantId) conditions.push(eq(inboxAddresses.tenantId, tenantId));
  await db.update(inboxAddresses).set(data).where(and(...conditions));
}

export async function deleteInboxAddress(id: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const conditions: any[] = [eq(inboxAddresses.id, id)];
  if (tenantId) conditions.push(eq(inboxAddresses.tenantId, tenantId));
  await db.delete(inboxAddresses).where(and(...conditions));
}

/**
 * Find the inbox address rule that matches a receiving "to" address.
 * Extracts the local part from the full email and matches against configured addresses.
 */
export async function matchReceivingAddress(toAddresses: string[], tenantId?: number | null): Promise<InboxAddress | null> {
  const db = await getDb();
  if (!db) return null;

  const conditions: any[] = [eq(inboxAddresses.active, true)];
  if (tenantId) conditions.push(eq(inboxAddresses.tenantId, tenantId));
  const activeAddresses = await db
    .select()
    .from(inboxAddresses)
    .where(and(...conditions));

  if (activeAddresses.length === 0) return null;

  // Normalize all "to" addresses
  const normalizedTo = toAddresses.map(a => a.toLowerCase().trim());

  // Match against configured addresses
  for (const addr of activeAddresses) {
    const configuredEmail = addr.address.toLowerCase().trim();
    if (normalizedTo.some(to => to === configuredEmail || to.includes(configuredEmail))) {
      return addr;
    }
  }

  return null;
}


// ─── Bulk Operations ──────────────────────────────────────────────────────────

export async function bulkDeleteMessages(ids: number[], tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const messageConditions: any[] = [inArray(inboxMessages.id, ids)];
  if (tenantId) messageConditions.push(eq(inboxMessages.tenantId, tenantId));
  const ownedMessages = await db.select({ id: inboxMessages.id }).from(inboxMessages).where(and(...messageConditions));
  const ownedIds = ownedMessages.map(row => row.id);
  if (ownedIds.length === 0) return;
  // Delete associated tags first
  await db.delete(inboxMessageTags).where(inArray(inboxMessageTags.messageId, ownedIds));
  // Delete messages
  await db.delete(inboxMessages).where(inArray(inboxMessages.id, ownedIds));
}

export async function bulkAssignMessages(ids: number[], assignedToId: number | null, assignedToName: string | null, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const conditions: any[] = [inArray(inboxMessages.id, ids)];
  if (tenantId) conditions.push(eq(inboxMessages.tenantId, tenantId));
  await db.update(inboxMessages).set({
    assignedToId,
    assignedToName,
    assignedAt: assignedToId ? new Date() : null,
  }).where(and(...conditions));
}

export async function bulkAddTag(ids: number[], tagId: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const messageConditions: any[] = [inArray(inboxMessages.id, ids)];
  if (tenantId) messageConditions.push(eq(inboxMessages.tenantId, tenantId));
  const ownedMessages = await db.select({ id: inboxMessages.id }).from(inboxMessages).where(and(...messageConditions));
  for (const { id: messageId } of ownedMessages) {
    const [existing] = await db
      .select()
      .from(inboxMessageTags)
      .where(and(eq(inboxMessageTags.messageId, messageId), eq(inboxMessageTags.tagId, tagId)))
      .limit(1);
    if (!existing) {
      await db.insert(inboxMessageTags).values({ messageId, tagId });
    }
  }
}
