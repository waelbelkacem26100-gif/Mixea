import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // --- 1. Auth Clerk -----------------------------------------------------
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
    }

    const { id } = await params;

    // --- 2. Récupère l'audit + vérifie ownership ---------------------------
    const audit = await db.audit.findUnique({
      where: { id },
      select: {
        id: true,
        sharedSlug: true,
        project: { select: { userId: true } },
      },
    });

    if (!audit) {
      return NextResponse.json({ error: "Audit introuvable." }, { status: 404 });
    }

    const user = await db.user.findUnique({
      where: { clerkId: userId },
      select: { id: true },
    });

    if (!user || audit.project.userId !== user.id) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    // --- 3. Slug déjà existant ? -------------------------------------------
    if (audit.sharedSlug) {
      return NextResponse.json({
        slug: audit.sharedSlug,
        shareUrl: `${appUrl}/audit/share/${audit.sharedSlug}`,
      });
    }

    // --- 4. Génère un slug unique ------------------------------------------
    const slug = `${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    // --- 5. Persiste -------------------------------------------------------
    await db.audit.update({
      where: { id },
      data: { sharedSlug: slug },
    });

    // --- 6. Réponse --------------------------------------------------------
    return NextResponse.json({
      slug,
      shareUrl: `${appUrl}/audit/share/${slug}`,
    });
  } catch {
    return NextResponse.json(
      { error: "Erreur interne du serveur." },
      { status: 500 },
    );
  }
}
