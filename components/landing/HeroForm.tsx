"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function HeroForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [competitorUrl, setCompetitorUrl] = useState("");
  const [showCompetitor, setShowCompetitor] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setIsLoading(true);
    setError("");
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          competitorUrl: competitorUrl.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { auditId?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Une erreur est survenue.");
        return;
      }
      if (data.auditId) {
        router.push(`/audit/${data.auditId}`);
      } else {
        router.push("/sign-in");
      }
    } catch {
      setError("Impossible de contacter le serveur. Réessayez.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl space-y-3">
      <div className="flex gap-3">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://votresite.com"
          required
          className="flex-1 bg-white/5 border border-white/15 rounded-xl px-5 py-4 text-white placeholder-white/30 focus:outline-none focus:border-white/40 text-base"
        />
        <button
          type="submit"
          disabled={isLoading || !url.trim()}
          className="px-8 py-4 rounded-xl bg-white text-black font-semibold text-base hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shrink-0"
        >
          {isLoading ? "Analyse..." : "Auditer →"}
        </button>
      </div>

      <button
        type="button"
        onClick={() => setShowCompetitor(!showCompetitor)}
        className="text-sm text-white/40 hover:text-white/60 transition-colors"
      >
        {showCompetitor ? "− Masquer la comparaison" : "+ Comparer avec un concurrent"}
      </button>

      {showCompetitor && (
        <input
          type="url"
          value={competitorUrl}
          onChange={(e) => setCompetitorUrl(e.target.value)}
          placeholder="https://concurrent.com (optionnel)"
          className="w-full bg-white/5 border border-white/15 rounded-xl px-5 py-4 text-white placeholder-white/30 focus:outline-none focus:border-white/40 text-base"
        />
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}
    </form>
  );
}
