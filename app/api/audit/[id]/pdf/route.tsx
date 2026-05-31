import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
// @react-pdf/renderer pour générer le PDF côté serveur
import { renderToBuffer } from "@react-pdf/renderer";
import { AuditPDFDocument } from "@/lib/pdf";

export async function GET(
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

    // --- 2. Récupère l'audit avec ses résultats ----------------------------
    const audit = await db.audit.findUnique({
      where: { id },
      include: {
        results: { orderBy: { severity: "asc" } },
        project: { select: { userId: true } },
      },
    });

    if (!audit) {
      return NextResponse.json({ error: "Audit introuvable." }, { status: 404 });
    }

    // --- 3. Vérifie ownership ----------------------------------------------
    const user = await db.user.findUnique({
      where: { clerkId: userId },
      select: { id: true },
    });

    if (!user || audit.project.userId !== user.id) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    // --- 4. Génère le PDF --------------------------------------------------
    const pdfBuffer = await renderToBuffer(
      <AuditPDFDocument
        audit={{
          id: audit.id,
          url: audit.url,
          scoreGlobal: audit.scoreGlobal,
          scoreSeo: audit.scoreSeo,
          scorePerf: audit.scorePerf,
          scoreUx: audit.scoreUx,
          scoreContent: audit.scoreContent,
          scoreSecurity: audit.scoreSecurity,
          scoreSocial: audit.scoreSocial,
          scoreCompetitor: audit.scoreCompetitor,
          competitorUrl: audit.competitorUrl,
          duration: audit.duration,
          createdAt: audit.createdAt,
          results: audit.results.map((r) => ({
            id: r.id,
            module: r.module,
            type: r.type,
            severity: r.severity,
            label: r.label,
            value: r.value,
            impact: r.impact,
            explanation: r.explanation,
            action: r.action,
            fix: r.fix,
          })),
        }}
      />,
    );

    // --- 5. Réponse --------------------------------------------------------
    // `renderToBuffer` renvoie un Buffer Node ; on copie ses octets dans un
    // Uint8Array adossé à un ArrayBuffer, puis on l'enveloppe dans un Blob —
    // un BodyInit garanti valide pour la Response Web.
    const bytes = Uint8Array.from(pdfBuffer);
    const body = new Blob([bytes], { type: "application/pdf" });

    return new Response(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="mixea-audit-${audit.id}.pdf"`,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Erreur interne du serveur." },
      { status: 500 },
    );
  }
}
