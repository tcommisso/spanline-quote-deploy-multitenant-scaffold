import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { aiPrompts, aiKnowledgeChunks, aiFeedback, aiFewShotExamples, aiCorrections } from "../drizzle/schema";
import { eq, desc, and, sql } from "drizzle-orm";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db!;
}

// ─── AI Learning & Improvement Router ────────────────────────────────────────

export const aiLearningRouter = router({
  // ═══════════════════════════════════════════════════════════════════════════
  // PROMPTS — Admin can view/edit all AI system prompts
  // ═══════════════════════════════════════════════════════════════════════════
  prompts: router({
    list: adminProcedure.query(async () => {
      const db = await requireDb();
      return db.select().from(aiPrompts).orderBy(aiPrompts.key);
    }),

    get: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = await requireDb();
        const [row] = await db.select().from(aiPrompts).where(eq(aiPrompts.id, input.id)).limit(1);
        return row || null;
      }),

    upsert: adminProcedure
      .input(z.object({
        id: z.number().optional(),
        key: z.string().min(1).max(128),
        label: z.string().min(1).max(255),
        description: z.string().optional(),
        systemPrompt: z.string().min(1),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await requireDb();
        if (input.id) {
          await db.update(aiPrompts)
            .set({
              key: input.key,
              label: input.label,
              description: input.description || null,
              systemPrompt: input.systemPrompt,
              isActive: input.isActive ?? true,
            })
            .where(eq(aiPrompts.id, input.id));
          return { success: true, id: input.id };
        } else {
          const [result] = await db.insert(aiPrompts).values({
            key: input.key,
            label: input.label,
            description: input.description || null,
            systemPrompt: input.systemPrompt,
            isActive: input.isActive ?? true,
          });
          return { success: true, id: result.insertId };
        }
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await requireDb();
        await db.delete(aiPrompts).where(eq(aiPrompts.id, input.id));
        return { success: true };
      }),

    toggleActive: adminProcedure
      .input(z.object({ id: z.number(), isActive: z.boolean() }))
      .mutation(async ({ input }) => {
        const db = await requireDb();
        await db.update(aiPrompts)
          .set({ isActive: input.isActive })
          .where(eq(aiPrompts.id, input.id));
        return { success: true };
      }),
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // KNOWLEDGE CHUNKS — Editable knowledge pieces injected into AI context
  // ═══════════════════════════════════════════════════════════════════════════
  knowledge: router({
    list: adminProcedure
      .input(z.object({
        search: z.string().optional(),
        category: z.string().optional(),
        activeOnly: z.boolean().optional(),
      }).optional())
      .query(async ({ input }) => {
        const db = await requireDb();
        let query = db.select().from(aiKnowledgeChunks).orderBy(desc(aiKnowledgeChunks.updatedAt));
        // Filtering done post-query for simplicity with drizzle
        const rows = await query;
        let filtered = rows;
        if (input?.search) {
          const s = input.search.toLowerCase();
          filtered = filtered.filter(r =>
            r.title.toLowerCase().includes(s) ||
            r.content.toLowerCase().includes(s) ||
            (r.category || "").toLowerCase().includes(s)
          );
        }
        if (input?.category) {
          filtered = filtered.filter(r => r.category === input.category);
        }
        if (input?.activeOnly) {
          filtered = filtered.filter(r => r.isActive);
        }
        return filtered;
      }),

    categories: adminProcedure.query(async () => {
      const db = await requireDb();
      const rows = await db.selectDistinct({ category: aiKnowledgeChunks.category })
        .from(aiKnowledgeChunks)
        .where(sql`${aiKnowledgeChunks.category} IS NOT NULL`);
      return rows.map(r => r.category).filter(Boolean) as string[];
    }),

    get: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = await requireDb();
        const [row] = await db.select().from(aiKnowledgeChunks).where(eq(aiKnowledgeChunks.id, input.id)).limit(1);
        return row || null;
      }),

    upsert: adminProcedure
      .input(z.object({
        id: z.number().optional(),
        title: z.string().min(1).max(255),
        content: z.string().min(1),
        category: z.string().optional(),
        tags: z.array(z.string()).optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await requireDb();
        const tagsJson = input.tags ? JSON.stringify(input.tags) : null;
        if (input.id) {
          await db.update(aiKnowledgeChunks)
            .set({
              title: input.title,
              content: input.content,
              category: input.category || null,
              tags: tagsJson,
              isActive: input.isActive ?? true,
            })
            .where(eq(aiKnowledgeChunks.id, input.id));
          return { success: true, id: input.id };
        } else {
          const [result] = await db.insert(aiKnowledgeChunks).values({
            title: input.title,
            content: input.content,
            category: input.category || null,
            tags: tagsJson,
            isActive: input.isActive ?? true,
          });
          return { success: true, id: result.insertId };
        }
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await requireDb();
        await db.delete(aiKnowledgeChunks).where(eq(aiKnowledgeChunks.id, input.id));
        return { success: true };
      }),

    toggleActive: adminProcedure
      .input(z.object({ id: z.number(), isActive: z.boolean() }))
      .mutation(async ({ input }) => {
        const db = await requireDb();
        await db.update(aiKnowledgeChunks)
          .set({ isActive: input.isActive })
          .where(eq(aiKnowledgeChunks.id, input.id));
        return { success: true };
      }),

    /** Get all active knowledge chunks for injection into AI prompts */
    getActiveForInjection: protectedProcedure.query(async () => {
      const db = await requireDb();
      return db.select({
        id: aiKnowledgeChunks.id,
        title: aiKnowledgeChunks.title,
        content: aiKnowledgeChunks.content,
        category: aiKnowledgeChunks.category,
      }).from(aiKnowledgeChunks)
        .where(eq(aiKnowledgeChunks.isActive, true))
        .orderBy(aiKnowledgeChunks.category, aiKnowledgeChunks.title);
    }),
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // FEEDBACK — Thumbs up/down on AI responses
  // ═══════════════════════════════════════════════════════════════════════════
  feedback: router({
    /** Submit feedback (any authenticated user) */
    submit: protectedProcedure
      .input(z.object({
        sessionId: z.string().optional(),
        messageContent: z.string().optional(),
        userQuery: z.string().optional(),
        rating: z.enum(["positive", "negative"]),
        comment: z.string().optional(),
        promptKey: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const [result] = await db.insert(aiFeedback).values({
          userId: ctx.user.id,
          sessionId: input.sessionId || null,
          messageContent: input.messageContent || null,
          userQuery: input.userQuery || null,
          rating: input.rating,
          comment: input.comment || null,
          promptKey: input.promptKey || "engini",
        });

        // Auto-tag topic within request lifecycle
        const feedbackId = result.insertId;
        const textToClassify = [input.userQuery, input.messageContent, input.comment].filter(Boolean).join(" ");
        if (textToClassify.length > 10) {
          try {
            const { invokeLLM } = await import("./_core/llm");
            const response = await invokeLLM({
              messages: [
                { role: "system", content: `Classify the following AI chat feedback into exactly one topic category. Respond with ONLY one word: pricing, specs, general, or other.\n\nCategories:\n- pricing: questions about costs, margins, rates, surcharges, delivery fees, deposits, discounts\n- specs: questions about product specifications, dimensions, materials, wind ratings, colours, engineering\n- general: questions about workflow, CRM, scheduling, approvals, jobs, construction process\n- other: anything that doesn't fit the above` },
                { role: "user", content: textToClassify.slice(0, 500) },
              ],
            });
            const rawContent = response.choices?.[0]?.message?.content || "";
            const topic = (typeof rawContent === "string" ? rawContent : "").trim().toLowerCase();
            const validTopics = ["pricing", "specs", "general", "other"] as const;
            const matched = validTopics.find(t => topic.includes(t));
            if (matched) {
              await db.update(aiFeedback).set({ topic: matched }).where(eq(aiFeedback.id, feedbackId));
            }
          } catch (e) {
            console.error("[AI Feedback] Auto-tag failed:", e);
          }
        }

        return { success: true, id: feedbackId };
      }),

    /** Admin: list all feedback with filtering */
    list: adminProcedure
      .input(z.object({
        status: z.enum(["pending", "reviewed", "actioned", "dismissed"]).optional(),
        rating: z.enum(["positive", "negative"]).optional(),
        topic: z.enum(["pricing", "specs", "general", "other"]).optional(),
        limit: z.number().min(1).max(200).optional(),
      }).optional())
      .query(async ({ input }) => {
        const db = await requireDb();
        const rows = await db.select().from(aiFeedback).orderBy(desc(aiFeedback.createdAt)).limit(input?.limit || 100);
        let filtered = rows;
        if (input?.status) filtered = filtered.filter(r => r.status === input.status);
        if (input?.rating) filtered = filtered.filter(r => r.rating === input.rating);
        if (input?.topic) filtered = filtered.filter(r => r.topic === input.topic);
        return filtered;
      }),

    /** Admin: get stats summary */
    stats: adminProcedure.query(async () => {
      const db = await requireDb();
      const rows = await db.select({
        rating: aiFeedback.rating,
        status: aiFeedback.status,
        count: sql<number>`COUNT(*)`,
      }).from(aiFeedback)
        .groupBy(aiFeedback.rating, aiFeedback.status);
      
      let positive = 0, negative = 0, pending = 0, reviewed = 0, actioned = 0;
      for (const r of rows) {
        const c = Number(r.count);
        if (r.rating === "positive") positive += c;
        if (r.rating === "negative") negative += c;
        if (r.status === "pending") pending += c;
        if (r.status === "reviewed") reviewed += c;
        if (r.status === "actioned") actioned += c;
      }
      return { positive, negative, pending, reviewed, actioned, total: positive + negative };
    }),

    /** Admin: update feedback status and notes */
    updateStatus: adminProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["pending", "reviewed", "actioned", "dismissed"]),
        adminNotes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await requireDb();
        await db.update(aiFeedback)
          .set({
            status: input.status,
            adminNotes: input.adminNotes,
          })
          .where(eq(aiFeedback.id, input.id));
        return { success: true };
      }),

    /** Admin: get weekly feedback trends for chart */
    trends: adminProcedure.query(async () => {
      const db = await requireDb();
      const rows = await db.select({
        week: sql<string>`DATE_FORMAT(DATE_SUB(created_at, INTERVAL WEEKDAY(created_at) DAY), '%Y-%m-%d')`,
        rating: aiFeedback.rating,
        count: sql<number>`COUNT(*)`,
      }).from(aiFeedback)
        .where(sql`created_at >= DATE_SUB(NOW(), INTERVAL 12 WEEK)`)
        .groupBy(sql`week`, aiFeedback.rating)
        .orderBy(sql`week`);

      const weekMap = new Map<string, { week: string; positive: number; negative: number }>();
      for (const r of rows) {
        const w = r.week;
        if (!weekMap.has(w)) weekMap.set(w, { week: w, positive: 0, negative: 0 });
        const entry = weekMap.get(w)!;
        if (r.rating === "positive") entry.positive = Number(r.count);
        if (r.rating === "negative") entry.negative = Number(r.count);
      }
      return Array.from(weekMap.values());
    }),

    /** Admin: convert negative feedback to a correction */
    convertToCorrection: adminProcedure
      .input(z.object({
        feedbackId: z.number(),
        correction: z.string().min(1),
        context: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await requireDb();
        // Get the feedback record
        const [fb] = await db.select().from(aiFeedback).where(eq(aiFeedback.id, input.feedbackId)).limit(1);
        if (!fb) return { success: false, error: "Feedback not found" };

        // Create correction
        const [result] = await db.insert(aiCorrections).values({
          userId: fb.userId,
          originalQuery: fb.userQuery || "",
          originalResponse: fb.messageContent || null,
          correction: input.correction,
          context: input.context || null,
          promptKey: fb.promptKey || "engini",
        });

        // Mark feedback as actioned
        await db.update(aiFeedback)
          .set({ status: "actioned", adminNotes: `Converted to correction #${result.insertId}` })
          .where(eq(aiFeedback.id, input.feedbackId));

        return { success: true, correctionId: result.insertId };
      }),
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // FEW-SHOT EXAMPLES — Gold-standard Q&A pairs
  // ═══════════════════════════════════════════════════════════════════════════
  fewShot: router({
    list: adminProcedure
      .input(z.object({ promptKey: z.string().optional() }).optional())
      .query(async ({ input }) => {
        const db = await requireDb();
        const rows = await db.select().from(aiFewShotExamples).orderBy(aiFewShotExamples.promptKey, aiFewShotExamples.sortOrder);
        if (input?.promptKey) return rows.filter(r => r.promptKey === input.promptKey);
        return rows;
      }),

    upsert: adminProcedure
      .input(z.object({
        id: z.number().optional(),
        promptKey: z.string().min(1).max(128),
        userInput: z.string().min(1),
        expectedOutput: z.string().min(1),
        description: z.string().optional(),
        isActive: z.boolean().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await requireDb();
        if (input.id) {
          await db.update(aiFewShotExamples)
            .set({
              promptKey: input.promptKey,
              userInput: input.userInput,
              expectedOutput: input.expectedOutput,
              description: input.description || null,
              isActive: input.isActive ?? true,
              sortOrder: input.sortOrder ?? 0,
            })
            .where(eq(aiFewShotExamples.id, input.id));
          return { success: true, id: input.id };
        } else {
          const [result] = await db.insert(aiFewShotExamples).values({
            promptKey: input.promptKey,
            userInput: input.userInput,
            expectedOutput: input.expectedOutput,
            description: input.description || null,
            isActive: input.isActive ?? true,
            sortOrder: input.sortOrder ?? 0,
          });
          return { success: true, id: result.insertId };
        }
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await requireDb();
        await db.delete(aiFewShotExamples).where(eq(aiFewShotExamples.id, input.id));
        return { success: true };
      }),

    toggleActive: adminProcedure
      .input(z.object({ id: z.number(), isActive: z.boolean() }))
      .mutation(async ({ input }) => {
        const db = await requireDb();
        await db.update(aiFewShotExamples)
          .set({ isActive: input.isActive })
          .where(eq(aiFewShotExamples.id, input.id));
        return { success: true };
      }),

    /** Get active examples for a prompt key (used during LLM calls) */
    getActiveForPrompt: protectedProcedure
      .input(z.object({ promptKey: z.string() }))
      .query(async ({ input }) => {
        const db = await requireDb();
        return db.select({
          userInput: aiFewShotExamples.userInput,
          expectedOutput: aiFewShotExamples.expectedOutput,
        }).from(aiFewShotExamples)
          .where(and(
            eq(aiFewShotExamples.promptKey, input.promptKey),
            eq(aiFewShotExamples.isActive, true),
          ))
          .orderBy(aiFewShotExamples.sortOrder);
      }),
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // CORRECTIONS — Stored corrections injected into future similar queries
  // ═══════════════════════════════════════════════════════════════════════════
  corrections: router({
    list: adminProcedure
      .input(z.object({
        promptKey: z.string().optional(),
        activeOnly: z.boolean().optional(),
      }).optional())
      .query(async ({ input }) => {
        const db = await requireDb();
        const rows = await db.select().from(aiCorrections).orderBy(desc(aiCorrections.updatedAt));
        let filtered = rows;
        if (input?.promptKey) filtered = filtered.filter(r => r.promptKey === input.promptKey);
        if (input?.activeOnly) filtered = filtered.filter(r => r.isActive);
        return filtered;
      }),

    upsert: adminProcedure
      .input(z.object({
        id: z.number().optional(),
        originalQuery: z.string().min(1),
        originalResponse: z.string().optional(),
        correction: z.string().min(1),
        context: z.string().optional(),
        promptKey: z.string().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await requireDb();
        if (input.id) {
          await db.update(aiCorrections)
            .set({
              originalQuery: input.originalQuery,
              originalResponse: input.originalResponse || null,
              correction: input.correction,
              context: input.context || null,
              promptKey: input.promptKey || "engini",
              isActive: input.isActive ?? true,
            })
            .where(eq(aiCorrections.id, input.id));
          return { success: true, id: input.id };
        } else {
          const [result] = await db.insert(aiCorrections).values({
            originalQuery: input.originalQuery,
            originalResponse: input.originalResponse || null,
            correction: input.correction,
            context: input.context || null,
            promptKey: input.promptKey || "engini",
            isActive: input.isActive ?? true,
          });
          return { success: true, id: result.insertId };
        }
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await requireDb();
        await db.delete(aiCorrections).where(eq(aiCorrections.id, input.id));
        return { success: true };
      }),

    toggleActive: adminProcedure
      .input(z.object({ id: z.number(), isActive: z.boolean() }))
      .mutation(async ({ input }) => {
        const db = await requireDb();
        await db.update(aiCorrections)
          .set({ isActive: input.isActive })
          .where(eq(aiCorrections.id, input.id));
        return { success: true };
      }),

    /** Get active corrections for injection into prompts */
    getActiveForPrompt: protectedProcedure
      .input(z.object({ promptKey: z.string() }))
      .query(async ({ input }) => {
        const db = await requireDb();
        return db.select({
          id: aiCorrections.id,
          originalQuery: aiCorrections.originalQuery,
          correction: aiCorrections.correction,
          context: aiCorrections.context,
        }).from(aiCorrections)
          .where(and(
            eq(aiCorrections.promptKey, input.promptKey),
            eq(aiCorrections.isActive, true),
          ))
          .orderBy(desc(aiCorrections.usageCount));
      }),

    /** Increment usage count when a correction is used */
    incrementUsage: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await requireDb();
        await db.update(aiCorrections)
          .set({ usageCount: sql`${aiCorrections.usageCount} + 1` })
          .where(eq(aiCorrections.id, input.id));
        return { success: true };
      }),
  }),
});
