import { db } from "@/lib/db";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ slug: string }>;
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

export default async function AuditSharePage({ params }: Props) {
  const { slug } = await params;

  const audit = await db.audit.findUnique({
    where: { sharedSlug: slug },
    include: {
      results: { orderBy: { severity: "asc" } },
      project: { select: { domain: true } },
    },
  });

  if (!audit) notFound();

  const issues = audit.results
    .filter((r) => r.severity === "critical" || r.severity === "warning")
    .slice(0, 20);

  const criticalCount = audit.results.filter(
    (r) => r.severity === "critical",
  ).length;
  const warningCount = audit.results.filter(
    (r) => r.severity === "warning",
  ).length;

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      {/* BANNER */}
      <div className="border-b border-white/10 bg-white/5 px-6 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <span className="text-sm font-medium text-white/70">
            Rapport partagé
          </span>
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300">
            Lecture seule
          </span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10 space-y-10">
        {/* URL + DATE + SCORE GLOBAL */}
        <section className="text-center">
          <h1 className="text-xl font-bold truncate">{audit.url}</h1>
          <p className="text-sm text-white/50 mt-1">
            {new Date(audit.createdAt).toLocaleDateString("fr-FR")}
          </p>
          <div className="mt-6">
            <p className="text-sm uppercase tracking-wide text-white/40">
              Score global
            </p>
            <p
              className={`text-7xl font-bold mt-2 ${scoreColor(
                audit.scoreGlobal,
              )}`}
            >
              {audit.scoreGlobal}
              <span className="text-3xl text-white/30">/100</span>
            </p>
          </div>
        </section>

        {/* 6 CARTES MODULES */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Scores par module</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {MODULE_CARDS.map(({ key, label, scoreKey }) => {
              const score = audit[scoreKey as ScoreKey];
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
                  <div className="w-full bg-white/10 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${scoreBarColor(score)}`}
                      style={{ width: `${score}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* PROBLÈMES CRITICAL + WARNING */}
        <section>
          <h2 className="text-lg font-semibold mb-4">
            Problèmes détectés ({criticalCount} critical, {warningCount} warning)
          </h2>
          <div className="space-y-3">
            {issues.map((r) => (
              <div
                key={r.id}
                className="bg-white/5 border border-white/10 rounded-xl p-5"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-bold uppercase shrink-0 ${
                      r.severity === "critical"
                        ? "bg-red-500/20 text-red-400"
                        : "bg-orange-500/20 text-orange-400"
                    }`}
                  >
                    {r.severity}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{r.label}</p>
                    {r.explanation && (
                      <p className="text-sm text-white/60 mt-1">
                        {r.explanation}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {issues.length === 0 && (
              <p className="text-white/50 text-sm">
                Aucun problème critique ou avertissement détecté.
              </p>
            )}
          </div>
        </section>

        {/* FOOTER */}
        <footer className="border-t border-white/10 pt-6 text-center text-sm text-white/40">
          Rapport généré par Mixea
        </footer>
      </div>
    </main>
  );
}
