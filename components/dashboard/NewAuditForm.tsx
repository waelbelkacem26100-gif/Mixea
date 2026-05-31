"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { AuditScores } from "@/lib/types";

interface AuditResponse {
  auditId: string | null;
  scores: AuditScores;
  duration: number;
  label: string;
}

interface ErrorResponse {
  error: string;
}

export default function NewAuditForm() {
  const router = useRouter();

  const [url, setUrl] = useState("");
  const [competitorUrl, setCompetitorUrl] = useState("");
  const [showCompetitor, setShowCompetitor] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setError("Veuillez saisir une URL.");
      return;
    }

    setIsLoading(true);
    setError(null);

    const trimmedCompetitor = competitorUrl.trim();

    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: trimmedUrl,
          competitorUrl:
            showCompetitor && trimmedCompetitor ? trimmedCompetitor : undefined,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as ErrorResponse | null;
        setError(data?.error ?? "Une erreur est survenue. Réessayez.");
        return;
      }

      const data = (await res.json()) as AuditResponse;

      if (data.auditId) {
        router.push(`/audit/${data.auditId}`);
      } else {
        setError("Audit impossible à enregistrer. Connectez-vous pour sauvegarder vos audits.");
      }
    } catch {
      setError("Impossible de contacter le serveur. Vérifiez votre connexion.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6">
      <div className="space-y-4">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://monsite.com"
          disabled={isLoading}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 focus:border-white/30 focus:outline-none disabled:opacity-50"
        />

        <button
          type="button"
          onClick={() => setShowCompetitor((v) => !v)}
          className="text-sm text-white/40 transition-colors hover:text-white/60"
        >
          {showCompetitor ? "− Masquer" : "+ Comparer avec un concurrent"}
        </button>

        {showCompetitor && (
          <input
            type="url"
            value={competitorUrl}
            onChange={(e) => setCompetitorUrl(e.target.value)}
            placeholder="https://concurrent.com"
            disabled={isLoading}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 focus:border-white/30 focus:outline-none disabled:opacity-50"
          />
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={isLoading || !url.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-white py-3 text-sm font-semibold text-black transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading && (
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black"
              aria-hidden="true"
            />
          )}
          {isLoading ? "Analyse en cours..." : "Lancer l'audit"}
        </button>

        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </div>
  );
}
