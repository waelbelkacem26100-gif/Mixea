import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { auditInputSchema } from "@/lib/validations";
import { scoreAll, getScoreLabel } from "@/lib/scorer";
import {
  generateRecommendations,
  mergeRecommendations,
} from "@/lib/ai-recommendations";
import { runAudit } from "@/lib/crawler/index";
import { runComparisonAudit } from "@/lib/competitor";
import { AUDIT_RATE_LIMIT, PLAN_LIMITS } from "@/lib/constants";
import type {
  AuditResult,
  AuditScores,
  CrawlResult,
  PlanType,
} from "@/lib/types";

export const maxDuration = 60; // Vercel timeout

// ---------------------------------------------------------------------------
// Rate limiting (module-level so it persists between requests in a warm
// serverless instance). 10 requests per minute per IP.
// ---------------------------------------------------------------------------

const RATE_WINDOW_MS = 60_000;

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }

  if (entry.count >= AUDIT_RATE_LIMIT) {
    return false;
  }

  entry.count += 1;
  return true;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when `reference` is in a different calendar month/year than now.
 */
function isNewMonth(reference: Date): boolean {
  const now = new Date();
  return (
    now.getUTCFullYear() !== reference.getUTCFullYear() ||
    now.getUTCMonth() !== reference.getUTCMonth()
  );
}

/**
 * Flattens every module's results from a CrawlResult into a single array.
 */
function flattenCrawl(crawl: CrawlResult): AuditResult[] {
  return Object.values(crawl).flatMap((module) => module.results);
}

type SiteContext = {
  url: string;
  title?: string;
  keyword?: string;
};

/**
 * Extracts an optional title (SEO module, type "title") and keyword
 * (content module, type "keyword_detected") for the AI context.
 */
function buildSiteContext(url: string, results: AuditResult[]): SiteContext {
  const context: SiteContext = { url };

  const titleResult = results.find(
    (r) => r.module === "seo" && r.type === "title",
  );
  if (titleResult && typeof titleResult.value === "string") {
    context.title = titleResult.value;
  }

  const keywordResult = results.find(
    (r) => r.module === "content" && r.type === "keyword_detected",
  );
  if (keywordResult && typeof keywordResult.value === "string") {
    context.keyword = keywordResult.value;
  }

  return context;
}

// ---------------------------------------------------------------------------
// POST /api/audit
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<NextResponse> {
  try {
    // --- 1. Rate limiting (per IP) -----------------------------------------
    const ip =
      request.headers.get("x-forwarded-for") ??
      request.headers.get("x-real-ip") ??
      "127.0.0.1";

    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: "Trop de requêtes. Réessayez dans une minute." },
        { status: 429 },
      );
    }

    // --- 2. URL validation (Zod) -------------------------------------------
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Corps de requête JSON invalide." },
        { status: 400 },
      );
    }

    const parsed = auditInputSchema.safeParse(rawBody);
    if (!parsed.success) {
      const message =
        parsed.error.issues[0]?.message ?? "Requête invalide.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const { url, competitorUrl } = parsed.data;

    // --- 3. Clerk authentication (optional) --------------------------------
    const { userId } = await auth();

    // BDD user (only when authenticated).
    let dbUser:
      | { id: string; plan: PlanType; auditsThisMonth: number; resetDate: Date }
      | null = null;

    if (userId) {
      const existing = await db.user.findUnique({
        where: { clerkId: userId },
        select: {
          id: true,
          plan: true,
          auditsThisMonth: true,
          resetDate: true,
        },
      });

      if (existing) {
        dbUser = existing as {
          id: string;
          plan: PlanType;
          auditsThisMonth: number;
          resetDate: Date;
        };
      } else {
        const created = await db.user.create({
          data: {
            clerkId: userId,
            email: "",
            plan: "FREE",
            auditsThisMonth: 0,
            resetDate: new Date(),
          },
          select: {
            id: true,
            plan: true,
            auditsThisMonth: true,
            resetDate: true,
          },
        });
        dbUser = created as {
          id: string;
          plan: PlanType;
          auditsThisMonth: number;
          resetDate: Date;
        };
      }

      // --- 4. Quota verification -------------------------------------------
      let auditsThisMonth = dbUser.auditsThisMonth;

      if (isNewMonth(dbUser.resetDate)) {
        await db.user.update({
          where: { id: dbUser.id },
          data: { auditsThisMonth: 0, resetDate: new Date() },
        });
        auditsThisMonth = 0;
        dbUser.auditsThisMonth = 0;
      }

      const planLimit = PLAN_LIMITS[dbUser.plan].auditsPerMonth;
      if (auditsThisMonth >= planLimit) {
        return NextResponse.json(
          { error: "Quota mensuel atteint. Passez à un plan supérieur." },
          { status: 403 },
        );
      }
    }

    // --- 5. PageSpeed cache lookup (BDD) -----------------------------------
    const domain = new URL(url).hostname;

    const lastAudit = await db.audit.findFirst({
      where: { project: { domain } },
      orderBy: { createdAt: "desc" },
      select: { pagespeedCache: true },
    });

    const cachedPagespeed =
      lastAudit && lastAudit.pagespeedCache != null
        ? lastAudit.pagespeedCache
        : null;

    // --- 6. Run the audit --------------------------------------------------
    const startTime = Date.now();

    let crawlResult: CrawlResult;
    let scores: AuditScores;

    if (competitorUrl) {
      const comparison = await runComparisonAudit(
        url,
        competitorUrl,
        cachedPagespeed as never,
      );
      crawlResult = comparison.site;
      // --- 7. Scoring (comparison) ----------------------------------------
      scores = {
        ...comparison.siteScores,
        competitor: comparison.competitorScores.global,
      };
    } else {
      crawlResult = await runAudit(url, cachedPagespeed as never);
      // --- 7. Scoring (single) --------------------------------------------
      scores = scoreAll(crawlResult);
    }

    // --- 8. AI corrections -------------------------------------------------
    const allResults = flattenCrawl(crawlResult);
    const siteContext = buildSiteContext(url, allResults);

    let recommendations: Awaited<ReturnType<typeof generateRecommendations>> =
      [];
    try {
      recommendations = await generateRecommendations(allResults, siteContext);
    } catch {
      recommendations = [];
    }

    const enrichedResults = mergeRecommendations(allResults, recommendations);

    // --- Anonymous mode: skip persistence (steps 9 & 10) -------------------
    if (!dbUser) {
      return NextResponse.json({
        auditId: null,
        scores,
        duration: Date.now() - startTime,
        label: getScoreLabel(scores.global),
      });
    }

    // --- 9. Persist to the database ----------------------------------------
    const project = await db.project.upsert({
      where: { userId_domain: { userId: dbUser.id, domain } },
      create: { userId: dbUser.id, domain },
      update: {},
    });

    const audit = await db.audit.create({
      data: {
        projectId: project.id,
        url,
        competitorUrl: competitorUrl ?? null,
        scoreGlobal: scores.global,
        scoreSeo: scores.seo,
        scorePerf: scores.performance,
        scoreUx: scores.ux,
        scoreContent: scores.content,
        scoreSecurity: scores.security,
        scoreSocial: scores.social,
        scoreCompetitor: scores.competitor ?? null,
        duration: Date.now() - startTime,
        // The raw PageSpeedResult is not exposed by runAudit/runComparisonAudit,
        // so nothing reusable is persisted here.
        pagespeedCache: Prisma.JsonNull,
        results: {
          create: enrichedResults.map((r) => ({
            module: r.module,
            type: r.type,
            severity: r.severity,
            label: r.label,
            value: String(r.value),
            impact: r.impact,
            explanation: r.explanation ?? null,
            action: r.action ?? null,
            fix: r.fix ?? null,
            competitorValue:
              r.competitorValue != null ? String(r.competitorValue) : null,
          })),
        },
      },
    });

    // --- 10. Update quota --------------------------------------------------
    await db.user.update({
      where: { id: dbUser.id },
      data: { auditsThisMonth: { increment: 1 } },
    });

    // --- 11. Response ------------------------------------------------------
    return NextResponse.json({
      auditId: audit.id,
      scores,
      duration: audit.duration,
      label: getScoreLabel(scores.global),
    });
  } catch {
    // Never expose internal error details to the client.
    return NextResponse.json(
      { error: "Erreur interne du serveur." },
      { status: 500 },
    );
  }
}
