import {
  CRAWLER_USER_AGENT,
  CWV_THRESHOLDS,
  PAGESPEED_CACHE_TTL_MS,
  PAGESPEED_TIMEOUT_MS,
} from "../constants";
import type {
  AuditResult,
  ModuleResult,
  PageSpeedMetric,
  PageSpeedOpportunity,
  PageSpeedResult,
  Severity,
} from "../types";

const MODULE = "performance" as const;

// ---------------------------------------------------------------------------
// Internal PageSpeed Insights API response types (no `any`)
// ---------------------------------------------------------------------------

interface PSIAuditDetailItem {
  [key: string]: unknown;
}

interface PSIAuditDetails {
  type?: string;
  overallSavingsMs?: number;
  items?: PSIAuditDetailItem[];
}

interface PSIAudit {
  score: number | null;
  numericValue?: number;
  displayValue?: string;
  title?: string;
  description?: string;
  details?: PSIAuditDetails;
}

interface PSIResponse {
  lighthouseResult: {
    categories: { performance: { score: number } };
    audits: Record<string, PSIAudit>;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ResultInput = Omit<AuditResult, "id" | "module">;

function makeResult(input: ResultInput): AuditResult {
  let id: string;
  try {
    id = crypto.randomUUID();
  } catch {
    id = `${MODULE}_${input.type}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}`;
  }
  return { id, module: MODULE, ...input };
}

function ratingFor(
  value: number,
  good: number,
  poor: number,
): PageSpeedMetric["rating"] {
  if (value <= good) return "good";
  if (value <= poor) return "needs-improvement";
  return "poor";
}

function metric(
  value: number,
  thresholds: { good: number; poor: number },
): PageSpeedMetric {
  return { value, rating: ratingFor(value, thresholds.good, thresholds.poor) };
}

function isCacheFresh(cached: PageSpeedResult | null | undefined): boolean {
  if (!cached) return false;
  const fetchedAt = new Date(cached.fetchedAt).getTime();
  if (Number.isNaN(fetchedAt)) return false;
  return Date.now() - fetchedAt < PAGESPEED_CACHE_TTL_MS;
}

async function fetchJsonWithTimeout(
  target: string,
  timeoutMs: number,
): Promise<{ ok: boolean; status: number; data: PSIResponse | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(target, {
      headers: { "User-Agent": CRAWLER_USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, status: res.status, data: null };
    }
    const data = (await res.json()) as PSIResponse;
    return { ok: true, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// PageSpeed parsing
// ---------------------------------------------------------------------------

function num(audit: PSIAudit | undefined, fallback = 0): number {
  return typeof audit?.numericValue === "number"
    ? audit.numericValue
    : fallback;
}

function parseOpportunities(
  audits: Record<string, PSIAudit>,
): PageSpeedOpportunity[] {
  const opportunities: PageSpeedOpportunity[] = [];
  for (const [id, audit] of Object.entries(audits)) {
    if (!audit || !audit.details) continue;
    if (audit.details.type !== "opportunity") continue;
    if (audit.score === null || audit.score >= 1) continue;
    opportunities.push({
      id,
      title: audit.title ?? id,
      description: audit.description ?? "",
      savings: audit.details.overallSavingsMs ?? 0,
    });
  }
  // Heaviest savings first
  opportunities.sort((a, b) => (b.savings ?? 0) - (a.savings ?? 0));
  return opportunities;
}

function parseMobile(data: PSIResponse): PageSpeedResult["mobile"] {
  const audits = data.lighthouseResult.audits;

  const score = Math.round(
    (data.lighthouseResult.categories.performance.score ?? 0) * 100,
  );

  const lcp = num(audits["largest-contentful-paint"]);
  const inp =
    typeof audits["interaction-to-next-paint"]?.numericValue === "number"
      ? num(audits["interaction-to-next-paint"])
      : num(audits["max-potential-fid"]);
  const cls = num(audits["cumulative-layout-shift"]);
  const ttfb = num(audits["server-response-time"]);
  const fcp = num(audits["first-contentful-paint"]);
  const totalBytes = num(audits["total-byte-weight"], 0);
  const requestCount =
    audits["network-requests"]?.details?.items?.length ?? 0;

  return {
    score,
    lcp: metric(lcp, CWV_THRESHOLDS.lcp),
    inp: metric(inp, CWV_THRESHOLDS.inp),
    cls: metric(cls, CWV_THRESHOLDS.cls),
    ttfb: metric(ttfb, CWV_THRESHOLDS.ttfb),
    fcp: metric(fcp, CWV_THRESHOLDS.fcp),
    totalBytes,
    requestCount,
    opportunities: parseOpportunities(audits),
  };
}

function parseDesktop(data: PSIResponse): PageSpeedResult["desktop"] {
  return {
    score: Math.round(
      (data.lighthouseResult.categories.performance.score ?? 0) * 100,
    ),
  };
}

// ---------------------------------------------------------------------------
// Fallback (no API key, quota exceeded, or API failure)
// ---------------------------------------------------------------------------

async function fetchPageSpeedFallback(url: string): Promise<PageSpeedResult> {
  let ttfbMs = 0;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PAGESPEED_TIMEOUT_MS);
  try {
    const start = performance.now();
    const res = await fetch(url, {
      headers: { "User-Agent": CRAWLER_USER_AGENT },
      redirect: "follow",
      signal: controller.signal,
    });
    // Read first chunk to approximate time-to-first-byte.
    const reader = res.body?.getReader();
    if (reader) {
      await reader.read();
      await reader.cancel().catch(() => undefined);
    } else {
      await res.text();
    }
    ttfbMs = Math.round(performance.now() - start);
  } catch {
    ttfbMs = 0;
  } finally {
    clearTimeout(timer);
  }

  return {
    mobile: {
      score: 0,
      lcp: metric(0, CWV_THRESHOLDS.lcp),
      inp: metric(0, CWV_THRESHOLDS.inp),
      cls: metric(0, CWV_THRESHOLDS.cls),
      ttfb: metric(ttfbMs, CWV_THRESHOLDS.ttfb),
      fcp: metric(0, CWV_THRESHOLDS.fcp),
      totalBytes: 0,
      requestCount: 0,
      opportunities: [],
    },
    desktop: { score: 0 },
    fetchedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// fetchPageSpeed
// ---------------------------------------------------------------------------

export async function fetchPageSpeed(
  url: string,
  cached?: PageSpeedResult | null,
): Promise<PageSpeedResult> {
  if (isCacheFresh(cached)) {
    return cached as PageSpeedResult;
  }

  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
  if (!apiKey) {
    return fetchPageSpeedFallback(url);
  }

  const base = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
  const encoded = encodeURIComponent(url);
  const mobileUrl = `${base}?url=${encoded}&strategy=mobile&key=${apiKey}`;
  const desktopUrl = `${base}?url=${encoded}&strategy=desktop&key=${apiKey}`;

  try {
    const [mobileRes, desktopRes] = await Promise.all([
      fetchJsonWithTimeout(mobileUrl, PAGESPEED_TIMEOUT_MS),
      fetchJsonWithTimeout(desktopUrl, PAGESPEED_TIMEOUT_MS),
    ]);

    // Quota exceeded or any non-OK mobile response → silent fallback.
    if (
      mobileRes.status === 429 ||
      desktopRes.status === 429 ||
      !mobileRes.ok ||
      !mobileRes.data
    ) {
      return fetchPageSpeedFallback(url);
    }

    const mobile = parseMobile(mobileRes.data);
    const desktop =
      desktopRes.ok && desktopRes.data
        ? parseDesktop(desktopRes.data)
        : { score: 0 };

    return {
      mobile,
      desktop,
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return fetchPageSpeedFallback(url);
  }
}

// ---------------------------------------------------------------------------
// auditPerformance
// ---------------------------------------------------------------------------

function auditScoreMobile(score: number): AuditResult {
  let severity: Severity;
  if (score < 50) severity = "critical";
  else if (score < 80) severity = "warning";
  else severity = "info";

  return makeResult({
    type: "perf_score_mobile",
    severity,
    label: "Score performance mobile",
    value: score,
    impact:
      "Le score mobile reflète l'expérience de la majorité des visiteurs et influence le classement Google.",
    explanation: `Score Lighthouse mobile de ${score}/100.`,
    action:
      severity === "info"
        ? "Maintenir les bonnes pratiques de performance."
        : "Optimiser les Core Web Vitals, réduire le JavaScript et les images.",
  });
}

function auditScoreDesktop(score: number): AuditResult {
  const severity: Severity = score < 50 ? "warning" : "info";
  return makeResult({
    type: "perf_score_desktop",
    severity,
    label: "Score performance desktop",
    value: score,
    impact:
      "Le score desktop mesure la rapidité du site sur ordinateur.",
    explanation: `Score Lighthouse desktop de ${score}/100.`,
    action:
      severity === "info"
        ? "Maintenir les bonnes pratiques de performance."
        : "Optimiser le rendu serveur et le chargement des ressources.",
  });
}

function auditLcp(m: PageSpeedMetric): AuditResult {
  const value = Math.round(m.value);
  let severity: Severity;
  let type: string;
  if (m.value > CWV_THRESHOLDS.lcp.poor) {
    severity = "critical";
    type = "lcp_poor";
  } else if (m.value >= CWV_THRESHOLDS.lcp.good) {
    severity = "warning";
    type = "lcp_needs_improvement";
  } else {
    severity = "info";
    type = "lcp_good";
  }
  return makeResult({
    type,
    severity,
    label: "LCP (Largest Contentful Paint)",
    value,
    impact: "Un LCP > 4s fait perdre 53% des visiteurs mobiles.",
    explanation: `Le plus gros élément visible se charge en ${value} ms.`,
    action:
      "Optimiser l'image/hero LCP, précharger les ressources critiques et réduire le TTFB.",
  });
}

function auditInp(m: PageSpeedMetric): AuditResult {
  const value = Math.round(m.value);
  let severity: Severity;
  let type: string;
  if (m.value > CWV_THRESHOLDS.inp.poor) {
    severity = "critical";
    type = "inp_poor";
  } else if (m.value >= CWV_THRESHOLDS.inp.good) {
    severity = "warning";
    type = "inp_needs_improvement";
  } else {
    severity = "info";
    type = "inp_good";
  }
  return makeResult({
    type,
    severity,
    label: "INP (Interaction to Next Paint)",
    value,
    impact:
      "Un INP élevé donne une impression de lenteur lors des interactions.",
    explanation: `Le temps de réponse aux interactions est de ${value} ms.`,
    action:
      "Réduire le JavaScript long, découper les tâches longues et différer les scripts non critiques.",
  });
}

function auditCls(m: PageSpeedMetric): AuditResult {
  const value = Math.round(m.value * 1000) / 1000;
  let severity: Severity;
  let type: string;
  if (m.value > CWV_THRESHOLDS.cls.poor) {
    severity = "critical";
    type = "cls_poor";
  } else if (m.value >= CWV_THRESHOLDS.cls.good) {
    severity = "warning";
    type = "cls_needs_improvement";
  } else {
    severity = "info";
    type = "cls_good";
  }
  return makeResult({
    type,
    severity,
    label: "CLS (Cumulative Layout Shift)",
    value,
    impact:
      "Une page qui saute pendant le chargement frustre l'utilisateur et nuit aux conversions.",
    explanation: `Décalage cumulé de mise en page de ${value}.`,
    action:
      "Définir width/height sur les images, réserver l'espace des éléments dynamiques et précharger les polices.",
  });
}

function auditTtfb(m: PageSpeedMetric): AuditResult {
  const value = Math.round(m.value);
  let severity: Severity;
  let type: string;
  if (m.value > CWV_THRESHOLDS.ttfb.poor) {
    severity = "critical";
    type = "ttfb_poor";
  } else if (m.value >= CWV_THRESHOLDS.ttfb.good) {
    severity = "warning";
    type = "ttfb_needs_improvement";
  } else {
    severity = "info";
    type = "ttfb_good";
  }
  return makeResult({
    type,
    severity,
    label: "TTFB (Time to First Byte)",
    value,
    impact:
      "Un TTFB lent retarde tout le chargement de la page et dégrade le LCP.",
    explanation: `Le serveur répond en ${value} ms.`,
    action:
      "Activer la mise en cache, utiliser un CDN et optimiser le temps de traitement serveur.",
  });
}

function auditFcp(m: PageSpeedMetric): AuditResult {
  const value = Math.round(m.value);
  let severity: Severity;
  let type: string;
  if (m.value > CWV_THRESHOLDS.fcp.poor) {
    severity = "warning";
    type = "fcp_poor";
  } else if (m.value >= CWV_THRESHOLDS.fcp.good) {
    severity = "info";
    type = "fcp_needs_improvement";
  } else {
    severity = "info";
    type = "fcp_good";
  }
  return makeResult({
    type,
    severity,
    label: "FCP (First Contentful Paint)",
    value,
    impact:
      "Le FCP indique à quel moment l'utilisateur voit le premier contenu apparaître.",
    explanation: `Premier contenu affiché en ${value} ms.`,
    action:
      "Réduire les ressources bloquant le rendu et optimiser le chemin critique.",
  });
}

function auditPageWeight(totalBytes: number): AuditResult {
  const valueKb = Math.round(totalBytes / 1024);
  let severity: Severity;
  let type: string;
  if (totalBytes > 3_000_000) {
    severity = "critical";
    type = "page_too_heavy";
  } else if (totalBytes > 1_500_000) {
    severity = "warning";
    type = "page_heavy";
  } else {
    severity = "info";
    type = "page_weight_ok";
  }
  return makeResult({
    type,
    severity,
    label: "Poids total de la page",
    value: valueKb,
    impact:
      "Une page lourde consomme de la data et ralentit le chargement, surtout en mobile.",
    explanation: `La page pèse ${valueKb} Ko.`,
    action:
      "Compresser et redimensionner les images, activer Brotli/Gzip et supprimer les ressources inutiles.",
  });
}

function auditRequestCount(count: number): AuditResult | null {
  let severity: Severity;
  let type: string;
  if (count > 100) {
    severity = "warning";
    type = "too_many_requests";
  } else if (count > 50) {
    severity = "info";
    type = "many_requests";
  } else {
    return null;
  }
  return makeResult({
    type,
    severity,
    label: "Nombre de requêtes réseau",
    value: count,
    impact:
      "Trop de requêtes augmentent la latence et le temps de chargement total.",
    explanation: `La page effectue ${count} requêtes réseau.`,
    action:
      "Regrouper les ressources, utiliser HTTP/2, le lazy-loading et limiter les scripts tiers.",
  });
}

function auditOpportunities(
  opportunities: PageSpeedOpportunity[],
): AuditResult[] {
  return opportunities
    .filter((o) => (o.savings ?? 0) > 500)
    .slice(0, 5)
    .map((o) => {
      const savings = Math.round(o.savings ?? 0);
      return makeResult({
        type: `opportunity_${o.id}`,
        severity: "warning",
        label: o.title,
        value: savings,
        impact: `Optimisation potentielle de ${savings} ms sur le temps de chargement.`,
        explanation: o.description,
        action: o.title,
      });
    });
}

export async function auditPerformance(
  url: string,
  cached?: PageSpeedResult | null,
): Promise<ModuleResult> {
  try {
    const ps = await fetchPageSpeed(url, cached);
    const { mobile, desktop } = ps;

    const results: AuditResult[] = [];

    results.push(auditScoreMobile(mobile.score));
    results.push(auditScoreDesktop(desktop.score));
    results.push(auditLcp(mobile.lcp));
    results.push(auditInp(mobile.inp));
    results.push(auditCls(mobile.cls));
    results.push(auditTtfb(mobile.ttfb));
    results.push(auditFcp(mobile.fcp));
    results.push(auditPageWeight(mobile.totalBytes));

    const requests = auditRequestCount(mobile.requestCount);
    if (requests) results.push(requests);

    results.push(...auditOpportunities(mobile.opportunities));

    return { module: MODULE, score: 0, results };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { module: MODULE, score: 0, results: [], error: message };
  }
}
