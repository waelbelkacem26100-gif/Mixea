import { db } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import ScoreGauge from "@/components/audit/ScoreGauge";
import ResultsList from "@/components/audit/ResultsList";
import ProgressChart from "@/components/audit/ProgressChart";

interface Props {
  params: Promise<{ id: string }>;
}

const MODULE_CARDS = [
  { key: "seo", label: "SEO", scoreKey: "scoreSeo" },
  { key: "performance", label: "Performance", scoreKey: "scorePerf" },
  { key: "ux", label: "UX & Accessibilité", scoreKey: "scoreUx" },
  { key: "content", label: "Contenu", scoreKey: "scoreContent" },
  { key: "security", label: "Sécurité", scoreKey: "scoreSecurity" },
  { key: "social", label: "Présence sociale", scoreKey: "scoreSocial" },
] as const;

type ScoreKey = (typeof MODULE_CARDS)[number]["scoreKey"];

function scoreColor(score: number): string {
  if (score >= 85) return "text-green-400";
  if (score >= 70) return "text-yellow-400";
  if (score >= 50) return "text-orange-400";
  return "text-red-400";
}

function scoreBarColor(score: number): string {
  if (score >= 85) return "bg-green-500";
  if (score >= 70) return "bg-yellow-500";
  if (score >= 50) return "bg-orange-500";
  return "bg-red-500";
}

function DeltaBadge({ delta }: { delta: number }) {
  const positive = delta >= 0;
  return (
    <span
      className={`px-3 py-1 rounded-full text-sm font-bold ${
        positive
          ? "bg-green-500/20 text-green-400"
          : "bg-red-500/20 text-red-400"
      }`}
    >
      {positive ? `+${delta}` : `${delta}`}
    </span>
  );
}

export default async function AuditPage({ params }: Props) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { id } = await params;

  const audit = await db.audit.findUnique({
    where: { id },
    include: {
      results: { orderBy: { severity: "asc" } },
      project: true,
    },
  });

  if (!audit) notFound();

  const user = await db.user.findUnique({
    where: { clerkId: userId },
    select: { id: true },
  });

  if (!user || audit.project.userId !== user.id) notFound();

  const history = await db.audit.findMany({
    where: { projectId: audit.projectId },
    orderBy: { createdAt: "asc" },
    select: { scoreGlobal: true, createdAt: true },
    take: 10,
  });

  const previousAudit = await db.audit.findFirst({
    where: { projectId: audit.projectId, id: { not: audit.id } },
    orderBy: { createdAt: "desc" },
    select: {
      scoreGlobal: true,
      scoreSeo: true,
      scorePerf: true,
      scoreUx: true,
      scoreContent: true,
      scoreSecurity: true,
      scoreSocial: true,
    },
  });

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      {/* HEADER */}
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold truncate">{audit.url}</h1>
          <p className="text-sm text-white/50">
            {new Date(audit.createdAt).toLocaleDateString("fr-FR")} ·{" "}
            {audit.duration}ms
          </p>
        </div>
        <div className="flex gap-3 shrink-0">
          <a
            href={`/api/audit`}
            className="px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-white/90 transition-colors"
          >
            Relancer
          </a>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-10">
        {/* SCORE GLOBAL */}
        <ScoreGauge score={audit.scoreGlobal} />

        {/* PROGRESSION vs audit précédent */}
        {previousAudit && (
          <section>
            <h2 className="text-lg font-semibold mb-4">Progression</h2>
            <div className="flex items-center gap-4">
              <DeltaBadge delta={audit.scoreGlobal - previousAudit.scoreGlobal} />
              <span className="text-white/60 text-sm">
                depuis le dernier audit
              </span>
            </div>
            {history.length > 1 && (
              <ProgressChart
                data={history.map((h) => ({
                  date: h.createdAt.toISOString(),
                  score: h.scoreGlobal,
                }))}
              />
            )}
          </section>
        )}

        {/* COMPARAISON CONCURRENT */}
        {audit.scoreCompetitor != null && audit.competitorUrl && (
          <section>
            <h2 className="text-lg font-semibold mb-4">Comparaison concurrent</h2>
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-white/5 rounded-xl p-6 text-center">
                <p className="text-white/50 text-sm mb-2">Votre site</p>
                <p className="text-4xl font-bold">{audit.scoreGlobal}</p>
                <p className="text-white/50 text-xs mt-1 truncate">
                  {audit.url}
                </p>
              </div>
              <div className="bg-white/5 rounded-xl p-6 text-center">
                <p className="text-white/50 text-sm mb-2">Concurrent</p>
                <p className="text-4xl font-bold text-orange-400">
                  {audit.scoreCompetitor}
                </p>
                <p className="text-white/50 text-xs mt-1 truncate">
                  {audit.competitorUrl}
                </p>
              </div>
            </div>
            <p className="mt-3 text-sm text-white/60">
              {audit.scoreGlobal >= audit.scoreCompetitor
                ? `✅ Vous êtes ${
                    audit.scoreGlobal - audit.scoreCompetitor
                  } points devant votre concurrent`
                : `⚠️ Votre concurrent vous dépasse de ${
                    audit.scoreCompetitor - audit.scoreGlobal
                  } points`}
            </p>
          </section>
        )}

        {/* 3 PRIORITÉS IMMÉDIATES */}
        <section>
          <h2 className="text-lg font-semibold mb-4">3 priorités immédiates</h2>
          <div className="space-y-4">
            {audit.results
              .filter((r) => r.severity === "critical")
              .slice(0, 3)
              .map((r) => (
                <div
                  key={r.id}
                  className="bg-red-950/40 border border-red-500/30 rounded-xl p-5"
                >
                  <div className="flex items-start gap-3">
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-500/20 text-red-400 uppercase shrink-0">
                      Critical
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{r.label}</p>
                      {r.explanation && (
                        <p className="text-sm text-white/60 mt-1">
                          {r.explanation}
                        </p>
                      )}
                      {r.action && (
                        <p className="text-sm text-white/80 mt-2">{r.action}</p>
                      )}
                      {r.fix && (
                        <div className="mt-3 bg-black/40 rounded-lg p-3">
                          <pre className="text-xs text-green-400 whitespace-pre-wrap break-words">
                            {r.fix}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </section>

        {/* 6 CARTES MODULES */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Scores par module</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {MODULE_CARDS.map(({ key, label, scoreKey }) => {
              const score = audit[scoreKey as ScoreKey];
              const moduleResults = audit.results.filter(
                (r) => r.module === key
              );
              const criticals = moduleResults.filter(
                (r) => r.severity === "critical"
              ).length;
              const warnings = moduleResults.filter(
                (r) => r.severity === "warning"
              ).length;
              return (
                <div
                  key={key}
                  className="bg-white/5 border border-white/10 rounded-xl p-5"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-white/70">
                      {label}
                    </span>
                    <span className={`text-2xl font-bold ${scoreColor(score)}`}>
                      {score}
                    </span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-1.5 mb-3">
                    <div
                      className={`h-1.5 rounded-full ${scoreBarColor(score)}`}
                      style={{ width: `${score}%` }}
                    />
                  </div>
                  <div className="flex gap-3 text-xs text-white/50">
                    {criticals > 0 && (
                      <span className="text-red-400">{criticals} critical</span>
                    )}
                    {warnings > 0 && (
                      <span className="text-yellow-400">{warnings} warning</span>
                    )}
                    {criticals === 0 && warnings === 0 && (
                      <span className="text-green-400">✓ OK</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* LISTE COMPLÈTE — Client Component */}
        <section>
          <h2 className="text-lg font-semibold mb-4">
            Tous les problèmes ({audit.results.length})
          </h2>
          <ResultsList results={audit.results} />
        </section>

        {/* CORRECTIONS AUTO COMING SOON */}
        <section className="border border-white/10 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-2">Corrections automatiques</h2>
          <p className="text-white/50 text-sm mb-4">
            Connectez votre CMS pour appliquer les corrections en un clic.
          </p>
          <div className="flex flex-wrap gap-3">
            {["WordPress", "Shopify", "PrestaShop"].map((cms) => (
              <button
                key={cms}
                disabled
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white/40 cursor-not-allowed text-sm"
              >
                Connecter {cms}
                <span className="px-1.5 py-0.5 rounded text-xs bg-white/10 text-white/30">
                  Bientôt
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
