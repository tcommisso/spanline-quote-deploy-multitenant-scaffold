import { z } from "zod";
import { protectedProcedure, tenantAdminProcedure as adminProcedure, publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { invitations, tenantMemberships, users } from "../drizzle/schema";
import { and, desc, eq } from "drizzle-orm";
import { sendNotificationEmail } from "./email";
import { randomBytes } from "crypto";
import { buildTrustedAppUrl } from "./_core/url";

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

function assertEmailSent(result: { success: boolean; error?: string }) {
  if (!result.success) {
    throw new Error(result.error || "Invitation email could not be sent");
  }
}

export const invitationsRouter = router({
  // ─── Create Invitation (Admin) ─────────────────────────────────────────────
  create: adminProcedure
    .input(z.object({
      email: z.string().email("Valid email is required"),
      name: z.string().min(1, "Name is required").max(255),
      role: z.enum(["user", "admin", "design_adviser", "office_user", "construction_user", "driver", "warehouse"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Check if there's already a pending invitation for this email
      const existing = await db.select()
        .from(invitations)
        .where(and(
          eq(invitations.tenantId, ctx.tenant!.id),
          eq(invitations.email, input.email),
          eq(invitations.status, "pending")
        ))
        .limit(1);

      if (existing.length > 0) {
        throw new Error("A pending invitation already exists for this email address");
      }

      const token = generateToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const [result] = await db.insert(invitations).values({
        tenantId: ctx.tenant!.id,
        email: input.email,
        name: input.name,
        role: input.role,
        token,
        status: "pending",
        invitedById: ctx.user!.id,
        invitedByName: ctx.user!.name || ctx.user!.email || "Admin",
        expiresAt,
      });

      // Send invitation email
      const inviteUrl = buildTrustedAppUrl(ctx.req, `/invite/${encodeURIComponent(token)}`);

      try {
        const emailResult = await sendNotificationEmail({
          tenantId: ctx.tenant!.id,
          to: input.email,
          subject: `You're invited to join AltaSpan`,
          htmlBody: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #1e293b;">Hi ${input.name},</h2>
              <p style="color: #334155; line-height: 1.6;">
                ${ctx.user!.name || "An administrator"} has invited you to join <strong>AltaSpan</strong> as a <strong>${input.role.replace(/_/g, " ")}</strong>.
              </p>
              <p style="color: #334155; line-height: 1.6;">
                Click the button below to accept your invitation and set up your account:
              </p>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${inviteUrl}" style="background-color: #1e40af; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
                  Accept Invitation
                </a>
              </div>
              <p style="color: #64748b; font-size: 14px; line-height: 1.5;">
                This invitation expires in 7 days. If you didn't expect this email, you can safely ignore it.
              </p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
              <p style="color: #94a3b8; font-size: 12px;">
                If the button doesn't work, copy and paste this link into your browser:<br/>
                <a href="${inviteUrl}" style="color: #3b82f6;">${inviteUrl}</a>
              </p>
            </div>
          `,
        });
        assertEmailSent(emailResult);
      } catch (err) {
        await db.delete(invitations).where(eq(invitations.id, result.insertId));
        throw err;
      }

      return { success: true, id: result.insertId };
    }),

  // ─── List Invitations (Admin) ──────────────────────────────────────────────
  list: adminProcedure
    .input(z.object({
      status: z.enum(["pending", "accepted", "expired", "revoked"]).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      const conditions = [eq(invitations.tenantId, ctx.tenant!.id)];
      if (input?.status) conditions.push(eq(invitations.status, input.status));

      const results = await db.select()
        .from(invitations)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(invitations.createdAt))
        .limit(100);

      return results;
    }),

  // ─── Revoke Invitation (Admin) ─────────────────────────────────────────────
  revoke: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.update(invitations)
        .set({ status: "revoked" })
        .where(and(
          eq(invitations.tenantId, ctx.tenant!.id),
          eq(invitations.id, input.id),
          eq(invitations.status, "pending")
        ));

      return { success: true };
    }),

  // ─── Resend Invitation (Admin) ─────────────────────────────────────────────
  resend: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [invite] = await db.select()
        .from(invitations)
        .where(and(
          eq(invitations.tenantId, ctx.tenant!.id),
          eq(invitations.id, input.id),
        ))
        .limit(1);

      if (!invite) throw new Error("Invitation not found");
      if (invite.status !== "pending") throw new Error("Can only resend pending invitations");

      // Extend expiry
      const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await db.update(invitations)
        .set({ expiresAt: newExpiry })
        .where(and(
          eq(invitations.tenantId, ctx.tenant!.id),
          eq(invitations.id, input.id),
        ));

      const inviteUrl = buildTrustedAppUrl(ctx.req, `/invite/${encodeURIComponent(invite.token)}`);

      const emailResult = await sendNotificationEmail({
        tenantId: invite.tenantId ?? ctx.tenant?.id ?? null,
        to: invite.email,
        subject: `Reminder: You're invited to join AltaSpan`,
        htmlBody: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #1e293b;">Hi ${invite.name || "there"},</h2>
            <p style="color: #334155; line-height: 1.6;">
              This is a reminder that you've been invited to join <strong>AltaSpan</strong> as a <strong>${invite.role.replace(/_/g, " ")}</strong>.
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${inviteUrl}" style="background-color: #1e40af; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
                Accept Invitation
              </a>
            </div>
            <p style="color: #64748b; font-size: 14px;">This invitation expires in 7 days.</p>
          </div>
        `,
      });
      assertEmailSent(emailResult);

      return { success: true };
    }),

  // ─── Bulk Create Invitations (Admin - CSV upload) ─────────────────────────
  bulkCreate: adminProcedure
    .input(z.object({
      invites: z.array(z.object({
        email: z.string().email(),
        name: z.string().min(1).max(255),
        role: z.enum(["user", "admin", "design_adviser", "office_user", "construction_user", "driver", "warehouse"]),
      })).min(1).max(100),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const results: { email: string; success: boolean; error?: string }[] = [];

      for (const invite of input.invites) {
        try {
          // Check for existing pending invitation
          const [existing] = await db.select()
            .from(invitations)
            .where(and(
              eq(invitations.tenantId, ctx.tenant!.id),
              eq(invitations.email, invite.email),
              eq(invitations.status, "pending")
            ))
            .limit(1);

          if (existing) {
            results.push({ email: invite.email, success: false, error: "Pending invitation already exists" });
            continue;
          }

          const token = generateToken();
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

          const [insertResult] = await db.insert(invitations).values({
            tenantId: ctx.tenant!.id,
            email: invite.email,
            name: invite.name,
            role: invite.role,
            token,
            status: "pending",
            invitedById: ctx.user!.id,
            invitedByName: ctx.user!.name || ctx.user!.email || "Admin",
            expiresAt,
          });

          const inviteUrl = buildTrustedAppUrl(ctx.req, `/invite/${encodeURIComponent(token)}`);
          try {
            const emailResult = await sendNotificationEmail({
              tenantId: ctx.tenant!.id,
              to: invite.email,
              subject: `You're invited to join AltaSpan`,
              htmlBody: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                  <h2 style="color: #1e293b;">Hi ${invite.name},</h2>
                  <p style="color: #334155; line-height: 1.6;">
                    ${ctx.user!.name || "An administrator"} has invited you to join <strong>AltaSpan</strong> as a <strong>${invite.role.replace(/_/g, " ")}</strong>.
                  </p>
                  <div style="text-align: center; margin: 32px 0;">
                    <a href="${inviteUrl}" style="background-color: #1e40af; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
                      Accept Invitation
                    </a>
                  </div>
                  <p style="color: #64748b; font-size: 14px;">This invitation expires in 7 days.</p>
                </div>
              `,
            });
            assertEmailSent(emailResult);
          } catch (err) {
            await db.delete(invitations).where(eq(invitations.id, insertResult.insertId));
            throw err;
          }

          results.push({ email: invite.email, success: true });
        } catch (err: any) {
          results.push({ email: invite.email, success: false, error: err.message || "Unknown error" });
        }
      }

      const successCount = results.filter(r => r.success).length;
      return { results, successCount, totalCount: input.invites.length };
    }),

  // ─── Validate Token (Public - for invite landing page) ─────────────────────
  validateToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { valid: false, invitation: null };

      const [invite] = await db.select()
        .from(invitations)
        .where(eq(invitations.token, input.token))
        .limit(1);

      if (!invite) return { valid: false, invitation: null };
      if (invite.status !== "pending") return { valid: false, invitation: null };
      if (new Date() > invite.expiresAt) {
        // Auto-expire
        await db.update(invitations)
          .set({ status: "expired" })
          .where(eq(invitations.id, invite.id));
        return { valid: false, invitation: null };
      }

      return {
        valid: true,
        invitation: {
          id: invite.id,
          email: invite.email,
          name: invite.name,
          role: invite.role,
          invitedByName: invite.invitedByName,
        },
      };
    }),

  // ─── Accept Invitation ─────────────────────────────────────────────────────
  accept: protectedProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [invite] = await db.select()
        .from(invitations)
        .where(eq(invitations.token, input.token))
        .limit(1);

      if (!invite) throw new Error("Invitation not found");
      if (invite.status !== "pending") throw new Error("This invitation is no longer valid");
      if (new Date() > invite.expiresAt) {
        await db.update(invitations)
          .set({ status: "expired" })
          .where(eq(invitations.id, invite.id));
        throw new Error("This invitation has expired");
      }

      // Update invitation status
      await db.update(invitations)
        .set({ status: "accepted", acceptedAt: new Date() })
        .where(eq(invitations.id, invite.id));

      // Update user's role to the pre-assigned role
      await db.update(users)
        .set({ role: invite.role })
        .where(eq(users.id, ctx.user.id));

      if (invite.tenantId) {
        const tenantRole: "owner" | "admin" | "member" =
          invite.role === "super_admin" ? "owner" :
          invite.role === "admin" ? "admin" :
          "member";

        await db.insert(tenantMemberships)
          .values({
            tenantId: invite.tenantId,
            userId: ctx.user.id,
            role: tenantRole,
            isDefault: true,
          })
          .onDuplicateKeyUpdate({
            set: {
              role: tenantRole,
              isDefault: true,
            },
          });
      }

      return { success: true, role: invite.role };
    }),
});
