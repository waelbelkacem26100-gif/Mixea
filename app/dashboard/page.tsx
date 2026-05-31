import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { PLAN_LIMITS } from "@/lib/constants";
import type { PlanType } from "@/lib/types";
import NewAuditForm from "@/components/dashboard/NewAuditForm";
import ProjectCard from "@/components/dashboard/ProjectCard";

function planBadgeColor(plan: string): string {
  switch (plan) {
    case "PRO":
      return "bg-purple-500/20 text-purple-400";
    case "STARTER":
      return "bg-blue-500/20 text-blue-400";
    default:
      return "bg-white/10 text-white/50";
  }
}

function StatCard({
  label,
  value,
  isText,
}: {
  label: string;
  value: string | number;
  isText?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <p className="mb-1 text-xs text-white/50">{label}</p>
      <p className={`font-bold ${isText ? "text-base text-green-400" : "text-2xl"}`}>
        {value}
      </p>
    </div>
  );
}

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // Find or create the user.
  let user = await db.user.findUnique({ where: { clerkId: userId } });
  if (!user) {
    const clerkUser = await currentUser();
    const email =
      clerkUser?.emailAddresses.find(
        (e) => e.id === clerkUser.primaryEmailAddressId,
      )?.emailAddress ??
      clerkUser?.emailAddresses[0]?.emailAddress ??
      "";

    user = await db.user.create({
      data: {
        clerkId: userId,
        email,
        plan: "FREE",
        auditsThisMonth: 0,
        resetDate: new Date(),
      },
    });
  }

  // Fetch all projects with their latest audits.
  const projects = await db.project.findMany({
    where: { userId: user.id },
    include: {
      audits: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          scoreGlobal: true,
          createdAt: true,
          duration: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Stats.
  const totalAudits = projects.reduce((sum, p) => sum + p.audits.length, 0);

  const planLimit = PLAN_LIMITS[user.plan as PlanType].auditsPerMonth;

  // Average of each project's latest audit score.
  const latestScores = projects
    .map((p) => p.audits[0]?.scoreGlobal)
    .filter((s): s is number => typeof s === "number");
  const avgLatestScore =
    latestScores.length > 0
      ? latestScores.reduce((sum, s) => sum + s, 0) / latestScores.length
      : 0;

  const progressBadge =
    latestScores.length > 0 && avgLatestScore >= 85
      ? "Site optimisé ✓"
      : totalAudits >= 4
        ? "En progrès"
        : "Débutant";

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      {/* HEADER */}
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-white/50">
            Gérez vos audits et suivez votre progression
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${planBadgeColor(user.plan)}`}
          >
            {user.plan}
          </span>
          <span className="text-sm text-white/50">
            {user.auditsThisMonth} /{" "}
            {planLimit === Infinity ? "∞" : planLimit} audits ce mois
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-10 px-6 py-8">
        {/* NOUVEAU AUDIT */}
        <section>
          <h2 className="mb-4 text-lg font-semibold">Lancer un audit</h2>
          <NewAuditForm />
        </section>

        {/* STATS GLOBALES */}
        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Projets" value={projects.length} />
          <StatCard label="Audits total" value={totalAudits} />
          <StatCard label="Audits ce mois" value={user.auditsThisMonth} />
          <StatCard label="Progression" value={progressBadge} isText />
        </section>

        {/* PROJETS */}
        {projects.length === 0 ? (
          <div className="py-16 text-center text-white/40">
            <p className="mb-2 text-xl">Aucun projet pour l&apos;instant</p>
            <p className="text-sm">Lancez votre premier audit ci-dessus</p>
          </div>
        ) : (
          <section>
            <h2 className="mb-4 text-lg font-semibold">
              Vos projets ({projects.length})
            </h2>
            <div className="grid gap-4">
              {projects.map((project) => {
                const [latest, previous] = project.audits;
                const delta =
                  latest && previous
                    ? latest.scoreGlobal - previous.scoreGlobal
                    : undefined;
                const historyData = project.audits
                  .slice()
                  .reverse()
                  .map((a) => ({
                    date: a.createdAt.toISOString(),
                    score: a.scoreGlobal,
                  }));
                return (
                  <ProjectCard
                    key={project.id}
                    projectId={project.id}
                    domain={project.domain}
                    latestScore={latest?.scoreGlobal}
                    latestAuditId={latest?.id}
                    delta={delta}
                    auditCount={project.audits.length}
                    lastAuditAt={latest?.createdAt.toISOString()}
                    historyData={historyData}
                  />
                );
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
