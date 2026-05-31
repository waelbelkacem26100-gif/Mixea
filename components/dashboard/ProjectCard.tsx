"use client";

import Link from "next/link";

import ScoreHistoryChart from "./ScoreHistoryChart";

interface Props {
  projectId: string;
  domain: string;
  latestScore?: number;
  latestAuditId?: string;
  delta?: number;
  auditCount: number;
  lastAuditAt?: string;
  historyData: { date: string; score: number }[];
}

function scoreColor(score: number): string {
  if (score >= 85) return "text-green-400";
  if (score >= 70) return "text-yellow-400";
  if (score >= 50) return "text-orange-400";
  return "text-red-400";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export default function ProjectCard({
  projectId,
  domain,
  latestScore,
  latestAuditId,
  delta,
  auditCount,
  lastAuditAt,
  historyData,
}: Props) {
  return (
    <div
      key={projectId}
      className="rounded-xl border border-white/10 bg-white/5 p-5 transition-colors hover:border-white/20"
    >
      <div className="flex items-start justify-between gap-4">
        {/* Left: domain + meta */}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-white">
            {domain}
          </h3>
          <p className="mt-1 text-xs text-white/40">
            {auditCount} audit{auditCount > 1 ? "s" : ""}
            {lastAuditAt ? ` · dernier le ${formatDate(lastAuditAt)}` : ""}
          </p>
        </div>

        {/* Right: score + delta */}
        <div className="flex items-center gap-3">
          {typeof delta === "number" && delta !== 0 && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                delta > 0
                  ? "bg-green-500/20 text-green-400"
                  : "bg-red-500/20 text-red-400"
              }`}
            >
              {delta > 0 ? `+${delta}` : delta}
            </span>
          )}
          {typeof latestScore === "number" ? (
            <span className={`text-3xl font-bold ${scoreColor(latestScore)}`}>
              {latestScore}
            </span>
          ) : (
            <span className="text-3xl font-bold text-white/30">—</span>
          )}
        </div>
      </div>

      {/* History chart */}
      {historyData.length > 1 && (
        <div className="mt-4">
          <ScoreHistoryChart data={historyData} />
        </div>
      )}

      {/* Action */}
      {latestAuditId && (
        <div className="mt-4 flex justify-end">
          <Link
            href={`/audit/${latestAuditId}`}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
          >
            Voir rapport
          </Link>
        </div>
      )}
    </div>
  );
}
