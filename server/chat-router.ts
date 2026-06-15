import { z } from "zod";
import { eq, sql, and, desc, gt, inArray } from "drizzle-orm";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import {
  chatChannels,
  chatChannelMembers,
  chatMessages,
  chatMessageReactions,
  constructionJobs,
  constructionInstallers,
  constructionAssignments,
  users,
} from "../drizzle/schema";
import { TRPCError } from "@trpc/server";
import { storagePut } from "./storage";
import crypto from "crypto";
import { sendPushToUser } from "./push";
import { pushToTradePortalByInstaller } from "./push-triggers";

// ─── Helpers ────────────────────────────────────────────────────────────────

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

/** Ensure user is a member of the channel (or auto-join system channels) */
async function ensureMembership(db: any, channelId: number, userId: number) {
  const [existing] = await db
    .select()
    .from(chatChannelMembers)
    .where(and(eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, userId)))
    .limit(1);

  if (existing) return existing;

  // Auto-join system channels for any authenticated user
  const [channel] = await db.select().from(chatChannels).where(eq(chatChannels.id, channelId)).limit(1);
  if (!channel) throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found" });

  if (channel.type === "system") {
    const [member] = await db
      .insert(chatChannelMembers)
      .values({ channelId, userId, memberType: "user", memberId: userId, role: "member" })
      .$returningId();
    return { id: member.id, channelId, userId, role: "member", lastReadAt: null };
  }

  throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this channel" });
}

// ─── Chat Router ────────────────────────────────────────────────────────────

export const chatRouter = router({
  // ─── List channels the user can see ─────────────────────────────────────────
  listChannels: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();

    // Get all system channels + job channels user is a member of
    const systemChannels = await db
      .select()
      .from(chatChannels)
      .where(and(eq(chatChannels.type, "system"), eq(chatChannels.isArchived, false)))
      .orderBy(chatChannels.name);

    const memberChannelIds = await db
      .select({ channelId: chatChannelMembers.channelId })
      .from(chatChannelMembers)
      .where(eq(chatChannelMembers.userId, ctx.user.id));

    const jobChannelIds = memberChannelIds.map((m) => m.channelId);
    let jobChannels: any[] = [];
    if (jobChannelIds.length > 0) {
      jobChannels = await db
        .select()
        .from(chatChannels)
        .where(and(eq(chatChannels.type, "job"), inArray(chatChannels.id, jobChannelIds), eq(chatChannels.isArchived, false)))
        .orderBy(desc(chatChannels.updatedAt));
    }

    // Get unread counts for each channel
    const allChannelIds = [...systemChannels.map((c) => c.id), ...jobChannelIds];
    const unreadCounts: Record<number, number> = {};

    for (const channelId of allChannelIds) {
      const [membership] = await db
        .select({ lastReadAt: chatChannelMembers.lastReadAt })
        .from(chatChannelMembers)
        .where(and(eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, ctx.user.id)))
        .limit(1);

      const lastRead = membership?.lastReadAt;
      const [unread] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(chatMessages)
        .where(
          lastRead
            ? and(eq(chatMessages.channelId, channelId), gt(chatMessages.createdAt, lastRead))
            : eq(chatMessages.channelId, channelId)
        );
      unreadCounts[channelId] = unread?.count || 0;
    }

    // Get last message for each channel
    const channelsWithMeta = [...systemChannels, ...jobChannels].map((ch) => ({
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
      await ensureMembership(db, input.channelId, ctx.user.id);

      let query = db
        .select()
        .from(chatMessages)
        .where(
          input.cursor
            ? and(eq(chatMessages.channelId, input.channelId), sql`${chatMessages.id} < ${input.cursor}`)
            : eq(chatMessages.channelId, input.channelId)
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
      await ensureMembership(db, input.channelId, ctx.user.id);

      const [result] = await db.insert(chatMessages).values({
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
        .where(eq(chatChannels.id, input.channelId));

      // Mark as read for sender
      await db.update(chatChannelMembers)
        .set({ lastReadAt: new Date() })
        .where(and(eq(chatChannelMembers.channelId, input.channelId), eq(chatChannelMembers.userId, ctx.user.id)));

      // Send push notifications for @mentions
      if (input.mentions && input.mentions.length > 0) {
        const [channel] = await db.select({ name: chatChannels.name }).from(chatChannels)
          .where(eq(chatChannels.id, input.channelId)).limit(1);
        const channelName = channel?.name || "Chat";
        const senderName = ctx.user.name || "Someone";
        const preview = input.content.length > 80 ? input.content.slice(0, 80) + "..." : input.content;

        for (const mentionedUserId of input.mentions) {
          if (mentionedUserId === ctx.user.id) continue; // Don't notify self
          sendPushToUser(mentionedUserId, {
            title: `${senderName} mentioned you in ${channelName}`,
            body: preview,
            url: "/construction/chat",
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
      await ensureMembership(db, input.channelId, ctx.user.id);

      await db.update(chatChannelMembers)
        .set({ lastReadAt: new Date() })
        .where(and(eq(chatChannelMembers.channelId, input.channelId), eq(chatChannelMembers.userId, ctx.user.id)));

      return { success: true };
    }),

  // ─── Pin/unpin a message ────────────────────────────────────────────────────
  pinMessage: protectedProcedure
    .input(z.object({ messageId: z.number(), pinned: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();

      const [msg] = await db.select().from(chatMessages).where(eq(chatMessages.id, input.messageId)).limit(1);
      if (!msg) throw new TRPCError({ code: "NOT_FOUND" });

      await ensureMembership(db, msg.channelId, ctx.user.id);

      await db.update(chatMessages)
        .set({ isPinned: input.pinned })
        .where(eq(chatMessages.id, input.messageId));

      return { success: true };
    }),

  // ─── Get pinned messages for a channel ──────────────────────────────────────
  getPinnedMessages: protectedProcedure
    .input(z.object({ channelId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      await ensureMembership(db, input.channelId, ctx.user.id);

      return db
        .select()
        .from(chatMessages)
        .where(and(eq(chatMessages.channelId, input.channelId), eq(chatMessages.isPinned, true)))
        .orderBy(desc(chatMessages.createdAt));
    }),

  // ─── Get total unread count across all channels ─────────────────────────────
  getUnreadTotal: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();

    // System channels (everyone is auto-member)
    const systemChannels = await db
      .select({ id: chatChannels.id })
      .from(chatChannels)
      .where(eq(chatChannels.type, "system"));

    // Job channels user is a member of
    const memberChannels = await db
      .select({ channelId: chatChannelMembers.channelId })
      .from(chatChannelMembers)
      .where(eq(chatChannelMembers.userId, ctx.user.id));

    const allChannelIds = [
      ...systemChannels.map((c) => c.id),
      ...memberChannels.map((m) => m.channelId),
    ];
    const uniqueIds = Array.from(new Set(allChannelIds));

    let totalUnread = 0;
    for (const channelId of uniqueIds) {
      const [membership] = await db
        .select({ lastReadAt: chatChannelMembers.lastReadAt })
        .from(chatChannelMembers)
        .where(and(eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, ctx.user.id)))
        .limit(1);

      const lastRead = membership?.lastReadAt;
      // If user has no membership record for this channel, treat as 0 unread
      // (they haven't joined yet, so don't show historical messages as unread)
      if (!membership) continue;
      if (!lastRead) continue; // No lastReadAt means they haven't opened it yet — don't count as unread
      const [unread] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(chatMessages)
        .where(
          and(eq(chatMessages.channelId, channelId), gt(chatMessages.createdAt, lastRead))
        );
      totalUnread += unread?.count || 0;
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
      await ensureMembership(db, input.channelId, ctx.user.id);

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
      await ensureMembership(db, input.channelId, ctx.user.id);

      const members = await db
        .select({
          userId: chatChannelMembers.userId,
          role: chatChannelMembers.role,
          userName: users.name,
          userEmail: users.email,
        })
        .from(chatChannelMembers)
        .leftJoin(users, eq(chatChannelMembers.userId, users.id))
        .where(eq(chatChannelMembers.channelId, input.channelId));

      return members;
    }),

  // ─── Create a job channel (admin/construction_user) ─────────────────────────
  createJobChannel: protectedProcedure
    .input(z.object({
      jobId: z.number(),
      memberUserIds: z.array(z.number()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();

      // Get job info for channel name
      const [job] = await db.select().from(constructionJobs).where(eq(constructionJobs.id, input.jobId)).limit(1);
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });

      const channelName = `${job.quoteNumber || `JOB-${job.id}`} - ${job.clientName || "Unknown Client"}`;

      // Check if channel already exists for this job
      const [existing] = await db
        .select()
        .from(chatChannels)
        .where(and(eq(chatChannels.type, "job"), eq(chatChannels.jobId, input.jobId)))
        .limit(1);

      if (existing) return { channelId: existing.id, alreadyExisted: true };

      // Create channel
      const [channel] = await db.insert(chatChannels).values({
        name: channelName,
        type: "job",
        jobId: input.jobId,
      }).$returningId();

      // Add creator as admin
      await db.insert(chatChannelMembers).values({
        channelId: channel.id,
        userId: ctx.user.id,
        memberType: "user",
        memberId: ctx.user.id,
        role: "admin",
      });

      // Add specified members
      if (input.memberUserIds?.length) {
        const memberValues = input.memberUserIds
          .filter((uid) => uid !== ctx.user.id)
          .map((uid) => ({ channelId: channel.id, userId: uid, memberType: "user" as const, memberId: uid, role: "member" as const }));
        if (memberValues.length > 0) {
          await db.insert(chatChannelMembers).values(memberValues);
        }
      }

      return { channelId: channel.id, alreadyExisted: false };
    }),

  // ─── Add member to channel ──────────────────────────────────────────────────
  addMember: protectedProcedure
    .input(z.object({ channelId: z.number(), userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();

      // Check existing
      const [existing] = await db
        .select()
        .from(chatChannelMembers)
        .where(and(eq(chatChannelMembers.channelId, input.channelId), eq(chatChannelMembers.userId, input.userId)))
        .limit(1);

      if (existing) return { success: true, alreadyMember: true };

      await db.insert(chatChannelMembers).values({
        channelId: input.channelId,
        userId: input.userId,
        memberType: "user",
        memberId: input.userId,
        role: "member",
      });

      return { success: true, alreadyMember: false };
    }),

  // ─── Remove member from channel ────────────────────────────────────────────
  removeMember: protectedProcedure
    .input(z.object({ channelId: z.number(), userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();

      await db.delete(chatChannelMembers)
        .where(and(eq(chatChannelMembers.channelId, input.channelId), eq(chatChannelMembers.userId, input.userId)));

      return { success: true };
    }),

  // ─── Update member role (promote/demote) ─────────────────────────────────
  updateMemberRole: protectedProcedure
    .input(z.object({ channelId: z.number(), userId: z.number(), role: z.enum(["admin", "member"]) }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();

      await db.update(chatChannelMembers)
        .set({ role: input.role })
        .where(and(eq(chatChannelMembers.channelId, input.channelId), eq(chatChannelMembers.userId, input.userId)));

      return { success: true };
    }),

  // ─── Toggle reaction on a message ────────────────────────────────────
  toggleReaction: protectedProcedure
    .input(z.object({ messageId: z.number(), emoji: z.string().max(16) }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();

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
        .where(inArray(chatMessageReactions.messageId, input.messageIds));

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
      const updates: Record<string, any> = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.description !== undefined) updates.description = input.description;

      if (Object.keys(updates).length > 0) {
        await db.update(chatChannels)
          .set(updates)
          .where(eq(chatChannels.id, input.channelId));
      }
      return { success: true };
    }),

  // ─── Archive/unarchive channel ───────────────────────────────────────
  archiveChannel: protectedProcedure
    .input(z.object({ channelId: z.number(), archived: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await db.update(chatChannels)
        .set({ isArchived: input.archived })
        .where(eq(chatChannels.id, input.channelId));
      return { success: true };
    }),

  // ─── List all users (for add-member picker) ────────────────────────────────
  allUsers: protectedProcedure.query(async () => {
    const db = await requireDb();
    return db.select({ id: users.id, name: users.name, email: users.email, role: users.role })
      .from(users)
      .orderBy(users.name);
  }),
});
