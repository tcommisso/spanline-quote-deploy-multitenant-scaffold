import { z } from "zod";
import { eq, sql, and, desc, gt, inArray } from "drizzle-orm";
import { tenantProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import {
  chatChannels,
  chatChannelMembers,
  chatMessages,
  chatMessageReactions,
  constructionJobs,
  constructionInstallers,
  constructionAssignments,
  permissionOverrides,
  tenantMemberships,
  users,
} from "../drizzle/schema";
import { TRPCError } from "@trpc/server";
import { storagePut } from "./storage";
import crypto from "crypto";
import { sendPushToUser } from "./push";
import { pushToTradePortalByInstaller } from "./push-triggers";
import { appendTenantScope, tenantIdFromContext } from "./_core/tenant-scope";
import { applyPermissionOverrides, hasEffectivePermission, normalizeUserRole } from "@shared/const";

// ─── Helpers ────────────────────────────────────────────────────────────────

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

const protectedProcedure = tenantProcedure.use(async ({ ctx, next }) => {
  const db = await requireDb();
  const role = normalizeUserRole(ctx.user.role);
  const rows = await db.select({
    role: permissionOverrides.role,
    permissionKey: permissionOverrides.permissionKey,
    allowed: permissionOverrides.allowed,
  }).from(permissionOverrides)
    .where(and(eq(permissionOverrides.tenantId, ctx.tenant!.id), eq(permissionOverrides.role, role)));
  const permissions = applyPermissionOverrides(role, rows);
  if (!hasEffectivePermission(permissions, "chat")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Chat access is not enabled for this role" });
  }
  return next({ ctx });
});

function channelTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, chatChannels.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function memberTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, chatChannelMembers.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function messageTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, chatMessages.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function jobTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

const chatMemberRefSchema = z.object({
  memberType: z.enum(["user", "trade"]),
  memberId: z.number(),
});
type ChatMemberRef = z.infer<typeof chatMemberRefSchema>;

function memberKey(memberType: "user" | "trade", memberId: number) {
  return `${memberType}:${memberId}`;
}

function uniqueMemberRefs(refs: ChatMemberRef[]) {
  const seen = new Set<string>();
  const result: ChatMemberRef[] = [];
  for (const ref of refs) {
    const key = memberKey(ref.memberType, ref.memberId);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(ref);
  }
  return result;
}

function normalizeMemberInput(input: {
  userId?: number | null;
  memberType?: "user" | "trade";
  memberId?: number | null;
}): ChatMemberRef {
  const memberType = input.memberType || "user";
  const memberId = input.memberId ?? input.userId;
  if (!memberId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Member is required" });
  }
  return { memberType, memberId };
}

async function validateMemberRefs(db: any, ctx: any, refs: ChatMemberRef[]) {
  const tenantId = ctx.tenant!.id;
  const userIds = refs.filter((ref) => ref.memberType === "user").map((ref) => ref.memberId);
  const tradeIds = refs.filter((ref) => ref.memberType === "trade").map((ref) => ref.memberId);

  if (userIds.length > 0) {
    const tenantMembers = await db.select({ userId: tenantMemberships.userId })
      .from(tenantMemberships)
      .where(and(eq(tenantMemberships.tenantId, tenantId), inArray(tenantMemberships.userId, userIds)));
    const validUserIds = new Set(tenantMembers.map((member: { userId: number }) => member.userId));
    const invalidUserIds = userIds.filter((userId) => !validUserIds.has(userId));
    if (invalidUserIds.length > 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "One or more selected users are not members of this tenant" });
    }
  }

  if (tradeIds.length > 0) {
    const conditions = [eq(constructionInstallers.active, true), inArray(constructionInstallers.id, tradeIds)];
    appendTenantScope(conditions, constructionInstallers.tenantId, tenantIdFromContext(ctx));
    const trades = await db.select({ id: constructionInstallers.id })
      .from(constructionInstallers)
      .where(and(...conditions));
    const validTradeIds = new Set(trades.map((trade: { id: number }) => trade.id));
    const invalidTradeIds = tradeIds.filter((tradeId) => !validTradeIds.has(tradeId));
    if (invalidTradeIds.length > 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "One or more selected trades are not active for this tenant" });
    }
  }
}

/** Ensure user is a member of the channel (or auto-join system channels) */
async function ensureMembership(db: any, ctx: any, channelId: number, userId: number) {
  const [existing] = await db
    .select()
    .from(chatChannelMembers)
    .where(and(...memberTenantConditions(ctx, eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, userId))))
    .limit(1);

  if (existing) return existing;

  // Auto-join system channels for any authenticated user
  const [channel] = await db.select().from(chatChannels)
    .where(and(...channelTenantConditions(ctx, eq(chatChannels.id, channelId))))
    .limit(1);
  if (!channel) throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found" });

  if (channel.type === "system") {
    const [member] = await db
      .insert(chatChannelMembers)
      .values({ tenantId: ctx.tenant!.id, channelId, userId, memberType: "user", memberId: userId, role: "member" })
      .$returningId();
    return { id: member.id, tenantId: ctx.tenant!.id, channelId, userId, role: "member", lastReadAt: null };
  }

  throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this channel" });
}

async function getVisibleChannelIdsForUser(db: any, ctx: any, userId: number) {
  const systemChannels = await db
    .select({ id: chatChannels.id })
    .from(chatChannels)
    .where(and(...channelTenantConditions(ctx, eq(chatChannels.type, "system"), eq(chatChannels.isArchived, false))));

  const memberScopedChannels = await db
    .select({ channelId: chatChannelMembers.channelId })
    .from(chatChannelMembers)
    .innerJoin(chatChannels, eq(chatChannelMembers.channelId, chatChannels.id))
    .where(and(
      ...memberTenantConditions(ctx, eq(chatChannelMembers.userId, userId)),
      ...channelTenantConditions(
        ctx,
        inArray(chatChannels.type, ["team", "job"]),
        eq(chatChannels.isArchived, false),
      ),
    ));

  return Array.from(new Set([
    ...systemChannels.map((channel: { id: number }) => channel.id),
    ...memberScopedChannels.map((member: { channelId: number }) => member.channelId),
  ]));
}

async function getUnreadCountForChannel(db: any, ctx: any, channelId: number, userId: number) {
  const [membership] = await db
    .select({ lastReadAt: chatChannelMembers.lastReadAt })
    .from(chatChannelMembers)
    .where(and(...memberTenantConditions(ctx, eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, userId))))
    .limit(1);

  const lastRead = membership?.lastReadAt;
  const [unread] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(chatMessages)
    .where(
      lastRead
        ? and(...messageTenantConditions(ctx, eq(chatMessages.channelId, channelId), gt(chatMessages.createdAt, lastRead)))
        : and(...messageTenantConditions(ctx, eq(chatMessages.channelId, channelId)))
    );

  return Number(unread?.count || 0);
}

// ─── Chat Router ────────────────────────────────────────────────────────────

export const chatRouter = router({
  // ─── List channels the user can see ─────────────────────────────────────────
  listChannels: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();

    // Get all system channels + member-scoped team/job channels
    const systemChannels = await db
      .select()
      .from(chatChannels)
      .where(and(...channelTenantConditions(ctx, eq(chatChannels.type, "system"), eq(chatChannels.isArchived, false))))
      .orderBy(chatChannels.name);

    const memberChannelIds = await db
      .select({ channelId: chatChannelMembers.channelId })
      .from(chatChannelMembers)
      .where(and(...memberTenantConditions(ctx, eq(chatChannelMembers.userId, ctx.user.id))));

    const memberScopedChannelIds = memberChannelIds.map((m) => m.channelId);
    let memberScopedChannels: any[] = [];
    if (memberScopedChannelIds.length > 0) {
      memberScopedChannels = await db
        .select()
        .from(chatChannels)
        .where(and(
          ...channelTenantConditions(
            ctx,
            inArray(chatChannels.type, ["team", "job"]),
            inArray(chatChannels.id, memberScopedChannelIds),
            eq(chatChannels.isArchived, false),
          )
        ))
        .orderBy(desc(chatChannels.updatedAt));
    }

    // Get unread counts for each channel
    const allChannelIds = [...systemChannels.map((c) => c.id), ...memberScopedChannelIds];
    const unreadCounts: Record<number, number> = {};

    for (const channelId of allChannelIds) {
      unreadCounts[channelId] = await getUnreadCountForChannel(db, ctx, channelId, ctx.user.id);
    }

    // Get last message for each channel
    const channelsWithMeta = [...systemChannels, ...memberScopedChannels].map((ch) => ({
      ...ch,
      unreadCount: unreadCounts[ch.id] || 0,
    }));

    return channelsWithMeta;
  }),

  // ─── Get messages for a channel (paginated) ─────────────────────────────────
  getMessages: protectedProcedure
    .input(z.object({
      channelId: z.number(),
      cursor: z.number().optional(), // message ID to paginate before
      limit: z.number().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      await ensureMembership(db, ctx, input.channelId, ctx.user.id);

      let query = db
        .select()
        .from(chatMessages)
        .where(
          input.cursor
            ? and(...messageTenantConditions(ctx, eq(chatMessages.channelId, input.channelId), sql`${chatMessages.id} < ${input.cursor}`))
            : and(...messageTenantConditions(ctx, eq(chatMessages.channelId, input.channelId)))
        )
        .orderBy(desc(chatMessages.id))
        .limit(input.limit);

      const messages = await query;
      return messages.reverse(); // Return in chronological order
    }),

  // ─── Send a message ─────────────────────────────────────────────────────────
  sendMessage: protectedProcedure
    .input(z.object({
      channelId: z.number(),
      content: z.string().min(1).max(5000),
      attachments: z.array(z.object({
        url: z.string(),
        filename: z.string(),
        mimeType: z.string(),
        size: z.number(),
      })).optional(),
      mentions: z.array(z.number()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await ensureMembership(db, ctx, input.channelId, ctx.user.id);

      const [result] = await db.insert(chatMessages).values({
        tenantId: ctx.tenant!.id,
        channelId: input.channelId,
        senderId: ctx.user.id,
        senderName: ctx.user.name || "Unknown",
        content: input.content,
        attachments: input.attachments || null,
        mentions: input.mentions || null,
      }).$returningId();

      // Update channel updatedAt
      await db.update(chatChannels)
        .set({ updatedAt: new Date() })
        .where(and(...channelTenantConditions(ctx, eq(chatChannels.id, input.channelId))));

      // Mark as read for sender
      await db.update(chatChannelMembers)
        .set({ lastReadAt: new Date() })
        .where(and(...memberTenantConditions(ctx, eq(chatChannelMembers.channelId, input.channelId), eq(chatChannelMembers.userId, ctx.user.id))));

      // Send push notifications for @mentions
      if (input.mentions && input.mentions.length > 0) {
        const [channel] = await db.select({ name: chatChannels.name }).from(chatChannels)
          .where(and(...channelTenantConditions(ctx, eq(chatChannels.id, input.channelId)))).limit(1);
        const channelName = channel?.name || "Chat";
        const senderName = ctx.user.name || "Someone";
        const preview = input.content.length > 80 ? input.content.slice(0, 80) + "..." : input.content;

        for (const mentionedUserId of input.mentions) {
          if (mentionedUserId === ctx.user.id) continue; // Don't notify self
          sendPushToUser(mentionedUserId, {
            title: `${senderName} mentioned you in ${channelName}`,
            body: preview,
            url: "/chat",
            tag: `chat-mention-${result.id}`,
          }).catch(() => {});
        }
      }

      return { id: result.id };
    }),

  // ─── Mark channel as read ───────────────────────────────────────────────────
  markRead: protectedProcedure
    .input(z.object({ channelId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await ensureMembership(db, ctx, input.channelId, ctx.user.id);

      await db.update(chatChannelMembers)
        .set({ lastReadAt: new Date() })
        .where(and(...memberTenantConditions(ctx, eq(chatChannelMembers.channelId, input.channelId), eq(chatChannelMembers.userId, ctx.user.id))));

      return { success: true };
    }),

  // ─── Pin/unpin a message ────────────────────────────────────────────────────
  pinMessage: protectedProcedure
    .input(z.object({ messageId: z.number(), pinned: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();

      const [msg] = await db.select().from(chatMessages)
        .where(and(...messageTenantConditions(ctx, eq(chatMessages.id, input.messageId))))
        .limit(1);
      if (!msg) throw new TRPCError({ code: "NOT_FOUND" });

      await ensureMembership(db, ctx, msg.channelId, ctx.user.id);

      await db.update(chatMessages)
        .set({ isPinned: input.pinned })
        .where(and(...messageTenantConditions(ctx, eq(chatMessages.id, input.messageId))));

      return { success: true };
    }),

  // ─── Get pinned messages for a channel ──────────────────────────────────────
  getPinnedMessages: protectedProcedure
    .input(z.object({ channelId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      await ensureMembership(db, ctx, input.channelId, ctx.user.id);

      return db
        .select()
        .from(chatMessages)
        .where(and(...messageTenantConditions(ctx, eq(chatMessages.channelId, input.channelId), eq(chatMessages.isPinned, true))))
        .orderBy(desc(chatMessages.createdAt));
    }),

  // ─── Get total unread count across all channels ─────────────────────────────
  getUnreadTotal: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const visibleChannelIds = await getVisibleChannelIdsForUser(db, ctx, ctx.user.id);

    let totalUnread = 0;
    for (const channelId of visibleChannelIds) {
      totalUnread += await getUnreadCountForChannel(db, ctx, channelId, ctx.user.id);
    }

    return { total: totalUnread };
  }),

  // ─── Upload attachment ──────────────────────────────────────────────────────
  uploadAttachment: protectedProcedure
    .input(z.object({
      channelId: z.number(),
      filename: z.string(),
      mimeType: z.string(),
      base64Data: z.string(),
      }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await ensureMembership(db, ctx, input.channelId, ctx.user.id);

      const buffer = Buffer.from(input.base64Data, "base64");
      const suffix = crypto.randomBytes(4).toString("hex");
      const key = `chat/${input.channelId}/${Date.now()}-${suffix}-${input.filename}`;

      const { url } = await storagePut(key, buffer, input.mimeType);
      return { url, filename: input.filename, mimeType: input.mimeType, size: buffer.length };
    }),

  // ─── Get channel members ────────────────────────────────────────────────────
  getMembers: protectedProcedure
    .input(z.object({ channelId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      await ensureMembership(db, ctx, input.channelId, ctx.user.id);

      const members = await db
        .select({
          id: chatChannelMembers.id,
          memberType: chatChannelMembers.memberType,
          memberId: chatChannelMembers.memberId,
          userId: chatChannelMembers.userId,
          role: chatChannelMembers.role,
          userName: users.name,
          userEmail: users.email,
          tradeName: constructionInstallers.name,
          tradeEmail: constructionInstallers.email,
          tradeType: constructionInstallers.tradeType,
        })
        .from(chatChannelMembers)
        .leftJoin(users, eq(chatChannelMembers.userId, users.id))
        .leftJoin(constructionInstallers, and(
          eq(chatChannelMembers.memberType, "trade"),
          eq(chatChannelMembers.memberId, constructionInstallers.id),
          eq(constructionInstallers.tenantId, ctx.tenant!.id),
        ))
        .where(and(...memberTenantConditions(ctx, eq(chatChannelMembers.channelId, input.channelId))));

      return members.map((member: any) => ({
        id: member.id,
        key: memberKey(member.memberType, member.memberId),
        memberType: member.memberType,
        memberId: member.memberId,
        userId: member.userId,
        role: member.role,
        userName: member.memberType === "trade" ? member.tradeName : member.userName,
        userEmail: member.memberType === "trade" ? member.tradeEmail : member.userEmail,
        tradeType: member.memberType === "trade" ? member.tradeType : null,
      }));
    }),

  // ─── Create a team channel ─────────────────────────────────────────────────
  createTeamChannel: protectedProcedure
    .input(z.object({
      name: z.string().trim().min(1).max(255),
      description: z.string().trim().max(500).optional(),
      memberUserIds: z.array(z.number()).optional(),
      members: z.array(chatMemberRefSchema).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const name = input.name.trim();
      const tenantId = ctx.tenant!.id;
      const requestedMembers = uniqueMemberRefs([
        ...(input.memberUserIds || []).map((userId) => ({ memberType: "user" as const, memberId: userId })),
        ...(input.members || []),
      ]).filter((member) => !(member.memberType === "user" && member.memberId === ctx.user.id));

      const [existing] = await db.select({ id: chatChannels.id })
        .from(chatChannels)
        .where(and(
          ...channelTenantConditions(
            ctx,
            eq(chatChannels.type, "team"),
            eq(chatChannels.name, name),
            eq(chatChannels.isArchived, false),
          )
        ))
        .limit(1);
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "A team channel with this name already exists" });
      }

      if (requestedMembers.length > 0) {
        await validateMemberRefs(db, ctx, requestedMembers);
      }

      const [channel] = await db.insert(chatChannels).values({
        tenantId,
        name,
        type: "team",
        description: input.description?.trim() || null,
      }).$returningId();

      await db.insert(chatChannelMembers).values({
        tenantId,
        channelId: channel.id,
        userId: ctx.user.id,
        memberType: "user",
        memberId: ctx.user.id,
        role: "admin",
        lastReadAt: new Date(),
      });

      if (requestedMembers.length > 0) {
        await db.insert(chatChannelMembers).values(
          requestedMembers.map((member) => ({
            tenantId,
            channelId: channel.id,
            userId: member.memberType === "user" ? member.memberId : null,
            memberType: member.memberType,
            memberId: member.memberId,
            role: "member" as const,
          })),
        );
      }

      return { channelId: channel.id };
    }),

  // ─── Create a job channel (admin/construction_user) ─────────────────────────
  createJobChannel: protectedProcedure
    .input(z.object({
      jobId: z.number(),
      memberUserIds: z.array(z.number()).optional(),
      members: z.array(chatMemberRefSchema).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const requestedMembers = uniqueMemberRefs([
        ...(input.memberUserIds || []).map((userId) => ({ memberType: "user" as const, memberId: userId })),
        ...(input.members || []),
      ]).filter((member) => !(member.memberType === "user" && member.memberId === ctx.user.id));

      // Get job info for channel name
      const [job] = await db.select().from(constructionJobs)
        .where(and(...jobTenantConditions(ctx, eq(constructionJobs.id, input.jobId))))
        .limit(1);
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });

      const channelName = `${job.quoteNumber || `JOB-${job.id}`} - ${job.clientName || "Unknown Client"}`;

      // Check if channel already exists for this job
      const [existing] = await db
        .select()
        .from(chatChannels)
        .where(and(...channelTenantConditions(ctx, eq(chatChannels.type, "job"), eq(chatChannels.jobId, input.jobId))))
        .limit(1);

      if (existing) return { channelId: existing.id, alreadyExisted: true };

      // Create channel
      const [channel] = await db.insert(chatChannels).values({
        tenantId: ctx.tenant!.id,
        name: channelName,
        type: "job",
        jobId: input.jobId,
      }).$returningId();

      // Add creator as admin
      await db.insert(chatChannelMembers).values({
        tenantId: ctx.tenant!.id,
        channelId: channel.id,
        userId: ctx.user.id,
        memberType: "user",
        memberId: ctx.user.id,
        role: "admin",
      });

      // Add specified members
      if (requestedMembers.length) {
        await validateMemberRefs(db, ctx, requestedMembers);
        const memberValues = requestedMembers
          .map((member) => ({
            tenantId: ctx.tenant!.id,
            channelId: channel.id,
            userId: member.memberType === "user" ? member.memberId : null,
            memberType: member.memberType,
            memberId: member.memberId,
            role: "member" as const,
          }));
        if (memberValues.length > 0) {
          await db.insert(chatChannelMembers).values(memberValues);
        }
      }

      return { channelId: channel.id, alreadyExisted: false };
    }),

  // ─── Add member to channel ──────────────────────────────────────────────────
  addMember: protectedProcedure
    .input(z.object({
      channelId: z.number(),
      userId: z.number().optional(),
      memberType: z.enum(["user", "trade"]).optional(),
      memberId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await ensureMembership(db, ctx, input.channelId, ctx.user.id);
      const member = normalizeMemberInput(input);
      await validateMemberRefs(db, ctx, [member]);

      // Check existing
      const [existing] = await db
        .select()
        .from(chatChannelMembers)
        .where(and(
          ...memberTenantConditions(
            ctx,
            eq(chatChannelMembers.channelId, input.channelId),
            eq(chatChannelMembers.memberType, member.memberType),
            eq(chatChannelMembers.memberId, member.memberId),
          )
        ))
        .limit(1);

      if (existing) return { success: true, alreadyMember: true };

      await db.insert(chatChannelMembers).values({
        tenantId: ctx.tenant!.id,
        channelId: input.channelId,
        userId: member.memberType === "user" ? member.memberId : null,
        memberType: member.memberType,
        memberId: member.memberId,
        role: "member",
      });

      return { success: true, alreadyMember: false };
    }),

  // ─── Remove member from channel ────────────────────────────────────────────
  removeMember: protectedProcedure
    .input(z.object({
      channelId: z.number(),
      userId: z.number().optional(),
      memberType: z.enum(["user", "trade"]).optional(),
      memberId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await ensureMembership(db, ctx, input.channelId, ctx.user.id);
      const member = normalizeMemberInput(input);

      await db.delete(chatChannelMembers)
        .where(and(
          ...memberTenantConditions(
            ctx,
            eq(chatChannelMembers.channelId, input.channelId),
            eq(chatChannelMembers.memberType, member.memberType),
            eq(chatChannelMembers.memberId, member.memberId),
          )
        ));

      return { success: true };
    }),

  // ─── Update member role (promote/demote) ─────────────────────────────────
  updateMemberRole: protectedProcedure
    .input(z.object({
      channelId: z.number(),
      userId: z.number().optional(),
      memberType: z.enum(["user", "trade"]).optional(),
      memberId: z.number().optional(),
      role: z.enum(["admin", "member"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await ensureMembership(db, ctx, input.channelId, ctx.user.id);
      const member = normalizeMemberInput(input);

      await db.update(chatChannelMembers)
        .set({ role: input.role })
        .where(and(
          ...memberTenantConditions(
            ctx,
            eq(chatChannelMembers.channelId, input.channelId),
            eq(chatChannelMembers.memberType, member.memberType),
            eq(chatChannelMembers.memberId, member.memberId),
          )
        ));

      return { success: true };
    }),

  // ─── Toggle reaction on a message ────────────────────────────────────
  toggleReaction: protectedProcedure
    .input(z.object({ messageId: z.number(), emoji: z.string().max(16) }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();

      const [message] = await db.select({ id: chatMessages.id, channelId: chatMessages.channelId })
        .from(chatMessages)
        .where(and(...messageTenantConditions(ctx, eq(chatMessages.id, input.messageId))))
        .limit(1);
      if (!message) throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
      await ensureMembership(db, ctx, message.channelId, ctx.user.id);

      // Check if user already reacted with this emoji
      const [existing] = await db
        .select()
        .from(chatMessageReactions)
        .where(and(
          eq(chatMessageReactions.messageId, input.messageId),
          eq(chatMessageReactions.userId, ctx.user.id),
          eq(chatMessageReactions.emoji, input.emoji)
        ))
        .limit(1);

      if (existing) {
        // Remove reaction
        await db.delete(chatMessageReactions).where(eq(chatMessageReactions.id, existing.id));
        return { action: "removed" as const };
      } else {
        // Add reaction
        await db.insert(chatMessageReactions).values({
          messageId: input.messageId,
          userId: ctx.user.id,
          emoji: input.emoji,
        });
        return { action: "added" as const };
      }
    }),

  // ─── Get reactions for messages in a channel ─────────────────────────
  getReactions: protectedProcedure
    .input(z.object({ messageIds: z.array(z.number()) }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      if (input.messageIds.length === 0) return [];

      const visibleMessages = await db.select({ id: chatMessages.id })
        .from(chatMessages)
        .where(and(...messageTenantConditions(ctx, inArray(chatMessages.id, input.messageIds))));
      const visibleMessageIds = visibleMessages.map((message) => message.id);
      if (visibleMessageIds.length === 0) return [];

      const reactions = await db
        .select({
          id: chatMessageReactions.id,
          messageId: chatMessageReactions.messageId,
          userId: chatMessageReactions.userId,
          emoji: chatMessageReactions.emoji,
          userName: users.name,
        })
        .from(chatMessageReactions)
        .leftJoin(users, eq(chatMessageReactions.userId, users.id))
        .where(inArray(chatMessageReactions.messageId, visibleMessageIds));

      return reactions;
    }),

  // ─── Update channel settings (rename, description) ───────────────────
  updateChannel: protectedProcedure
    .input(z.object({
      channelId: z.number(),
      name: z.string().min(1).max(255).optional(),
      description: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await ensureMembership(db, ctx, input.channelId, ctx.user.id);
      const updates: Record<string, any> = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.description !== undefined) updates.description = input.description;

      if (Object.keys(updates).length > 0) {
        await db.update(chatChannels)
          .set(updates)
          .where(and(...channelTenantConditions(ctx, eq(chatChannels.id, input.channelId))));
      }
      return { success: true };
    }),

  // ─── Archive/unarchive channel ───────────────────────────────────────
  archiveChannel: protectedProcedure
    .input(z.object({ channelId: z.number(), archived: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await ensureMembership(db, ctx, input.channelId, ctx.user.id);
      await db.update(chatChannels)
        .set({ isArchived: input.archived })
        .where(and(...channelTenantConditions(ctx, eq(chatChannels.id, input.channelId))));
      return { success: true };
    }),

  // ─── List all users (for add-member picker) ────────────────────────────────
  allUsers: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db.select({ id: users.id, name: users.name, email: users.email, role: users.role })
      .from(users)
      .innerJoin(tenantMemberships, eq(users.id, tenantMemberships.userId))
      .where(eq(tenantMemberships.tenantId, ctx.tenant!.id))
      .orderBy(users.name);
  }),

  // ─── List app users and trades for channel member pickers ─────────────────
  allMemberCandidates: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const tenantUsers = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role })
      .from(users)
      .innerJoin(tenantMemberships, eq(users.id, tenantMemberships.userId))
      .where(eq(tenantMemberships.tenantId, ctx.tenant!.id))
      .orderBy(users.name);

    const tradeConditions = [eq(constructionInstallers.active, true)];
    appendTenantScope(tradeConditions, constructionInstallers.tenantId, tenantIdFromContext(ctx));
    const trades = await db.select({
      id: constructionInstallers.id,
      name: constructionInstallers.name,
      email: constructionInstallers.email,
      tradeType: constructionInstallers.tradeType,
    })
      .from(constructionInstallers)
      .where(and(...tradeConditions))
      .orderBy(constructionInstallers.name);

    return [
      ...tenantUsers.map((userRow: any) => ({
        key: memberKey("user", userRow.id),
        memberType: "user" as const,
        memberId: userRow.id,
        userId: userRow.id,
        name: userRow.name,
        email: userRow.email,
        role: userRow.role,
        tradeType: null,
      })),
      ...trades.map((trade: any) => ({
        key: memberKey("trade", trade.id),
        memberType: "trade" as const,
        memberId: trade.id,
        userId: null,
        name: trade.name,
        email: trade.email,
        role: "trade",
        tradeType: trade.tradeType,
      })),
    ].sort((a, b) => String(a.name || a.email || "").localeCompare(String(b.name || b.email || "")));
  }),
});
