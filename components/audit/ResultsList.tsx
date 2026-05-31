"use client";

import { useMemo, useState } from "react";

interface AuditResultRow {
  id: string;
  module: string;
  type: string;
  severity: string;
  label: string;
  value: string;
  impact: string;
  explanation: string | null;
  action: string | null;
  fix: string | null;
  competitorValue: string | null;
}

interface Props {
  results: AuditResultRow[];
}

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

const SEVERITY_META: Record<
  string,
  { label: string; badge: string }
> = {
  critical: { label: "Critical", badge: "bg-red-500/20 text-red-400" },
  warning: { label: "Warning", badge: "bg-yellow-500/20 text-yellow-400" },
  info: { label: "Info", badge: "bg-blue-500/20 text-blue-400" },
};

const MODULE_LABELS: Record<string, string> = {
  seo: "SEO",
  performance: "Performance",
  ux: "UX & Accessibilité",
  content: "Contenu",
  security: "Sécurité",
  social: "Présence sociale",
};

const SEVERITY_FILTERS = ["critical", "warning", "info"] as const;

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="px-2 py-1 rounded text-xs bg-white/10 hover:bg-white/20 text-white/70 transition-colors"
    >
      {copied ? "Copié ✓" : "Copier"}
    </button>
  );
}

export default function ResultsList({ results }: Props) {
  const [activeModules, setActiveModules] = useState<string[]>([]);
  const [activeSeverities, setActiveSeverities] = useState<string[]>([]);

  const modules = useMemo(() => {
    const set = new Set<string>();
    results.forEach((r) => set.add(r.module));
    return Array.from(set);
  }, [results]);

  function toggleModule(m: string) {
    setActiveModules((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]
    );
  }

  function toggleSeverity(s: string) {
    setActiveSeverities((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  }

  const filtered = useMemo(() => {
    return results
      .filter((r) =>
        activeModules.length === 0 ? true : activeModules.includes(r.module)
      )
      .filter((r) =>
        activeSeverities.length === 0
          ? true
          : activeSeverities.includes(r.severity)
      )
      .slice()
      .sort(
        (a, b) =>
          (SEVERITY_ORDER[a.severity] ?? 99) -
          (SEVERITY_ORDER[b.severity] ?? 99)
      );
  }, [results, activeModules, activeSeverities]);

  return (
    <div>
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="flex flex-wrap gap-2">
          {modules.map((m) => {
            const active = activeModules.includes(m);
            return (
              <button
                key={m}
                type="button"
                onClick={() => toggleModule(m)}
                className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                  active
                    ? "bg-white/15 border-white/30 text-white"
                    : "bg-white/5 border-white/10 text-white/50 hover:text-white/80"
                }`}
              >
                {MODULE_LABELS[m] ?? m}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          {SEVERITY_FILTERS.map((s) => {
            const active = activeSeverities.includes(s);
            const meta = SEVERITY_META[s];
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleSeverity(s)}
                className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                  active
                    ? `${meta.badge} border-white/30`
                    : "bg-white/5 border-white/10 text-white/50 hover:text-white/80"
                }`}
              >
                {meta.label}
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-white/40 text-sm">Aucun résultat pour ces filtres.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const meta = SEVERITY_META[r.severity] ?? {
              label: r.severity,
              badge: "bg-white/10 text-white/60",
            };
            return (
              <div
                key={r.id}
                className="bg-white/5 border border-white/10 rounded-xl p-4"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-bold uppercase shrink-0 ${meta.badge}`}
                  >
                    {meta.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-3 flex-wrap">
                      <p className="font-medium">{r.label}</p>
                      <span className="text-xs text-white/40 shrink-0">
                        {MODULE_LABELS[r.module] ?? r.module}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/70">
                      <span>{r.value}</span>
                      {r.competitorValue && (
                        <span className="text-orange-400">
                          Concurrent : {r.competitorValue}
                        </span>
                      )}
                    </div>

                    {r.explanation && (
                      <p className="text-sm text-white/60 mt-2">
                        {r.explanation}
                      </p>
                    )}

                    {r.impact && (
                      <p className="text-xs text-white/40 mt-2">
                        Impact : {r.impact}
                      </p>
                    )}

                    {r.action && (
                      <p className="text-sm text-white/80 mt-2">{r.action}</p>
                    )}

                    {r.fix && (
                      <div className="mt-3 bg-black/40 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-white/40">Correction</span>
                          <CopyButton value={r.fix} />
                        </div>
                        <pre className="text-xs text-green-400 whitespace-pre-wrap break-words">
                          {r.fix}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
