import Stripe from "stripe";

import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";

// The webhook needs the raw request body to verify the Stripe signature, so it
// must run on the Node.js runtime (no edge). This route is PUBLIC — Stripe is
// not authenticated through Clerk; the signature check is the security gate.
export const runtime = "nodejs";

type PaidPlan = "STARTER" | "PRO";

function isPaidPlan(value: string | undefined): value is PaidPlan {
  return value === "STARTER" || value === "PRO";
}

export async function POST(req: Request): Promise<Response> {
  const body = await req.text(); // raw body as string (required for verification)
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return new Response("Missing signature", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook error";
    return new Response(`Webhook Error: ${message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      // --- Checkout completed: provision the purchased plan ----------------
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const { userId, plan } = session.metadata ?? {};

        if (userId && isPaidPlan(plan)) {
          await db.user.update({
            where: { id: userId },
            data: { plan },
          });
        }
        break;
      }

      // --- Subscription updated: sync plan with subscription status --------
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const { userId, plan } = subscription.metadata ?? {};
        const status = subscription.status;

        if (userId) {
          const newPlan: "FREE" | PaidPlan =
            status === "active" || status === "trialing"
              ? isPaidPlan(plan)
                ? plan
                : "FREE"
              : "FREE";

          await db.user.update({
            where: { id: userId },
            data: { plan: newPlan },
          });
        }
        break;
      }

      // --- Subscription deleted: revert to the free plan -------------------
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const { userId } = subscription.metadata ?? {};

        if (userId) {
          await db.user.update({
            where: { id: userId },
            data: { plan: "FREE" },
          });
        }
        break;
      }

      // --- Payment failed: log only, do NOT downgrade immediately ----------
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        // In recent API versions the subscription reference lives under
        // `parent.subscription_details.subscription`, not a top-level field.
        const subRef = invoice.parent?.subscription_details?.subscription;
        const subscriptionId =
          typeof subRef === "string" ? subRef : (subRef?.id ?? null);

        console.error(
          "Payment failed for invoice:",
          invoice.id,
          "subscription:",
          subscriptionId,
        );
        break;
      }

      default:
        // Unhandled event types are acknowledged without action.
        break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Handler error";
    return new Response(`Webhook handler failed: ${message}`, { status: 500 });
  }

  return Response.json({ received: true }, { status: 200 });
}
