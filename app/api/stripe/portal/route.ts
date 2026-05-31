import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// POST /api/stripe/portal
// Opens the Stripe billing portal so the user can manage their subscription
// (cancel, switch card, view invoices, etc.) and returns the portal URL.
// ---------------------------------------------------------------------------

export async function POST(): Promise<NextResponse> {
  try {
    // --- 1. Clerk authentication -------------------------------------------
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
    }

    // --- 2. Load the user from the database --------------------------------
    const user = await db.user.findUnique({
      where: { clerkId: userId },
      select: { id: true, email: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Utilisateur introuvable." },
        { status: 404 },
      );
    }

    if (!user.email) {
      return NextResponse.json(
        { error: "Aucun abonnement trouvé." },
        { status: 404 },
      );
    }

    // --- 3. Find the Stripe customer by email ------------------------------
    const customers = await stripe.customers.list({
      email: user.email,
      limit: 1,
    });
    const customerId = customers.data[0]?.id;

    if (!customerId) {
      return NextResponse.json(
        { error: "Aucun abonnement trouvé." },
        { status: 404 },
      );
    }

    // --- 4. Create the billing portal session ------------------------------
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
    });

    // --- 5. Response -------------------------------------------------------
    return NextResponse.json({ url: portalSession.url });
  } catch {
    return NextResponse.json(
      { error: "Impossible d'ouvrir le portail de facturation." },
      { status: 500 },
    );
  }
}
