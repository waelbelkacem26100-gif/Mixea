import Stripe from "stripe";

/**
 * Stripe client singleton.
 *
 * The `apiVersion` must match a value accepted by the installed SDK's
 * `LatestApiVersion` type (stripe@22.2.0 → "2026-05-27.dahlia"). Pinning a
 * version the SDK types do not know about would be a compile-time error.
 */
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-05-27.dahlia",
  typescript: true,
});

/**
 * Paid plans mapped to their Stripe price IDs.
 *
 * Price IDs are not created yet, so we fall back to a readable placeholder
 * string when the env var is missing. The checkout route surfaces a clear
 * error if a real price ID has not been configured.
 */
export const STRIPE_PLANS = {
  STARTER: {
    priceId: process.env.STRIPE_PRICE_STARTER ?? "price_starter_not_configured",
    name: "Starter",
    price: 19,
  },
  PRO: {
    priceId: process.env.STRIPE_PRICE_PRO ?? "price_pro_not_configured",
    name: "Pro",
    price: 49,
  },
} as const;

/** Paid plan identifiers usable for a Stripe checkout. */
export type StripePlan = keyof typeof STRIPE_PLANS;

/** Type guard: is the given value a valid paid plan key? */
export function isStripePlan(value: unknown): value is StripePlan {
  return value === "STARTER" || value === "PRO";
}

/** Returns true when the plan's price ID has been configured via env. */
export function hasConfiguredPrice(plan: StripePlan): boolean {
  return (
    STRIPE_PLANS[plan].priceId !== "price_starter_not_configured" &&
    STRIPE_PLANS[plan].priceId !== "price_pro_not_configured"
  );
}
