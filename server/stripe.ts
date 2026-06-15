import Stripe from "stripe";
import { ENV } from "./_core/env";

// ─── Stripe Client ──────────────────────────────────────────────────────────

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!ENV.stripeSecretKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured");
    }
    _stripe = new Stripe(ENV.stripeSecretKey, {
      apiVersion: "2026-04-22.dahlia",
    });
  }
  return _stripe;
}

// ─── CPC Care Plan Products ─────────────────────────────────────────────────
// These are the Stripe Price IDs that will be created dynamically on first use.
// The plans map to the cpc_plans table in the database.

export interface CpcPriceConfig {
  frequency: "annual" | "seasonal" | "premium";
  size: "small" | "medium" | "large";
  interval: "year" | "month";
  intervalCount: number;
}

// Map frequency to billing interval
export function getBillingInterval(frequency: string): { interval: "year" | "month"; intervalCount: number } {
  switch (frequency) {
    case "annual":
      return { interval: "year", intervalCount: 1 };
    case "seasonal":
      return { interval: "year", intervalCount: 1 }; // billed annually, 4 visits
    case "premium":
      return { interval: "year", intervalCount: 1 }; // billed annually, 6 visits
    default:
      return { interval: "year", intervalCount: 1 };
  }
}

// Get the price in cents for a plan + size combination
export function getPriceInCents(plan: { priceSmall: string; priceMedium: string; priceLarge: string }, size: string): number {
  const priceStr = size === "small" ? plan.priceSmall : size === "medium" ? plan.priceMedium : plan.priceLarge;
  return Math.round(parseFloat(priceStr) * 100);
}
