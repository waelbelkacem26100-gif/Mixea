import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { db } from "@/lib/db";
import {
  stripe,
  STRIPE_PLANS,
  isStripePlan,
  hasConfiguredPrice,
} from "@/lib/stripe";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// POST /api/stripe/checkout
// Body: { plan: "STARTER" | "PRO" }
// Creates a Stripe Checkout session for a subscription and returns its URL.
// ---------------------------------------------------------------------------

export async function POST(req: Request): Promise<NextResponse> {
  try {
    // --- 1. Clerk authentication -------------------------------------------
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
    }

    // --- 2. Load the user from the database --------------------------------
    const user = await db.user.findUnique({
      where: { clerkId: userId },
      select: { id: true, email: true, clerkId: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Utilisateur introuvable." },
        { status: 404 },
      );
    }

    // --- 3. Validate the requested plan ------------------------------------
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Corps de requête JSON invalide." },
        { status: 400 },
      );
    }

    const plan =
      typeof body === "object" && body !== null
        ? (body as Record<string, unknown>).plan
        : undefined;

    if (!isStripePlan(plan)) {
      return NextResponse.json(
        { error: "Plan invalide. Attendu : STARTER ou PRO." },
        { status: 400 },
      );
    }

    if (!hasConfiguredPrice(plan)) {
      return NextResponse.json(
        {
          error:
            "Ce plan n'est pas encore disponible (price ID Stripe non configuré).",
        },
        { status: 503 },
      );
    }

    // --- 4. Create the Stripe Checkout session -----------------------------
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: STRIPE_PLANS[plan].priceId, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?upgraded=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
      customer_email: user.email || undefined,
      metadata: {
        userId: user.id,
        plan,
        clerkId: user.clerkId,
      },
      subscription_data: {
        metadata: { userId: user.id, plan, clerkId: user.clerkId },
      },
    });

    // --- 5. Response -------------------------------------------------------
    return NextResponse.json({ url: session.url });
  } catch {
    // Never leak Stripe/internal error details to the client.
    return NextResponse.json(
      { error: "Impossible de créer la session de paiement." },
      { status: 500 },
    );
  }
}
