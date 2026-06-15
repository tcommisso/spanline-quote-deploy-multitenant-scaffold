import type { Express, Request, Response } from "express";
import express from "express";
import { getStripe } from "./stripe";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { cpcSubscriptions } from "../drizzle/schema";
import { eq } from "drizzle-orm";

export function registerStripeWebhooks(app: Express) {
  // IMPORTANT: raw body parser MUST be registered before express.json() for this route
  // Since express.json() is already applied globally, we use a separate raw parser here
  app.post(
    "/api/stripe/webhook",
    express.raw({ type: "application/json" }),
    async (req: Request, res: Response) => {
      const sig = req.headers["stripe-signature"];
      if (!sig) {
        return res.status(400).json({ error: "Missing stripe-signature header" });
      }

      let event;
      try {
        const stripe = getStripe();
        event = stripe.webhooks.constructEvent(
          req.body,
          sig,
          ENV.stripeWebhookSecret
        );
      } catch (err: any) {
        console.error("[Stripe Webhook] Signature verification failed:", err.message);
        return res.status(400).json({ error: `Webhook Error: ${err.message}` });
      }

      // Handle test events
      if (event.id.startsWith("evt_test_")) {
        console.log("[Stripe Webhook] Test event detected, returning verification response");
        return res.json({ verified: true });
      }

      console.log(`[Stripe Webhook] Received event: ${event.type} (${event.id})`);

      try {
        switch (event.type) {
          case "checkout.session.completed": {
            const session = event.data.object as any;
            const subscriptionId = session.subscription;
            const customerId = session.customer;
            const cpcSubId = session.metadata?.cpc_subscription_id;

            if (cpcSubId && subscriptionId) {
              const db = await getDb();
              if (db) {
                await db.update(cpcSubscriptions)
                  .set({
                    stripeSubscriptionId: subscriptionId,
                    stripeCustomerId: customerId,
                    status: "active",
                  })
                  .where(eq(cpcSubscriptions.id, Number(cpcSubId)));
                console.log(`[Stripe Webhook] Activated CPC subscription #${cpcSubId}`);
              }
            }
            break;
          }

          case "customer.subscription.updated": {
            const subscription = event.data.object as any;
            const stripeSubId = subscription.id;
            const status = subscription.status;

            const db = await getDb();
            if (db) {
              const statusMap: Record<string, string> = {
                active: "active",
                past_due: "active",
                canceled: "cancelled",
                unpaid: "paused",
                paused: "paused",
              };
              const mappedStatus = statusMap[status] || "active";
              await db.update(cpcSubscriptions)
                .set({ status: mappedStatus as any })
                .where(eq(cpcSubscriptions.stripeSubscriptionId, stripeSubId));
              console.log(`[Stripe Webhook] Updated subscription ${stripeSubId} to ${mappedStatus}`);
            }
            break;
          }

          case "customer.subscription.deleted": {
            const subscription = event.data.object as any;
            const stripeSubId = subscription.id;

            const db = await getDb();
            if (db) {
              await db.update(cpcSubscriptions)
                .set({
                  status: "cancelled",
                  cancelledAt: new Date(),
                })
                .where(eq(cpcSubscriptions.stripeSubscriptionId, stripeSubId));
              console.log(`[Stripe Webhook] Cancelled subscription ${stripeSubId}`);
            }
            break;
          }

          case "invoice.paid": {
            console.log(`[Stripe Webhook] Invoice paid: ${(event.data.object as any).id}`);
            break;
          }

          case "invoice.payment_failed": {
            const invoice = event.data.object as any;
            const stripeSubId = invoice.subscription;
            if (stripeSubId) {
              const db = await getDb();
              if (db) {
                await db.update(cpcSubscriptions)
                  .set({ status: "paused" })
                  .where(eq(cpcSubscriptions.stripeSubscriptionId, stripeSubId));
                console.log(`[Stripe Webhook] Payment failed for subscription ${stripeSubId}, paused`);
              }
            }
            break;
          }

          default:
            console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
        }

        res.json({ received: true });
      } catch (err: any) {
        console.error(`[Stripe Webhook] Error processing ${event.type}:`, err);
        res.status(500).json({
          error: err.message,
          stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
          context: { url: req.url, eventType: event.type },
          timestamp: new Date().toISOString(),
        });
      }
    }
  );
}
