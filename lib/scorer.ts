import { MODULE_WEIGHTS, SEVERITY_PENALTY, SCORE_THRESHOLDS } from "./constants";
import type {
  AuditResult,
  CrawlResult,
  AuditScores,
  AuditModule,
} from "./types";

/**
 * Liste ordonnée des modules d'audit (clés de CrawlResult / AuditScores).
 */
const MODULES: readonly AuditModule[] = [
  "seo",
  "performance",
  "ux",
  "content",
  "security",
  "social",
];

/**
 * Borne une valeur dans l'intervalle [0, 100].
 */
function clampScore(value: number): number {
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

/**
 * Calcule le score d'un module à partir de ses résultats.
 * Départ à 100, pénalité par sévérité, plancher à 0.
 */
export function scoreModule(results: AuditResult[]): number {
  let score = 100;
  for (const result of results) {
    score -= SEVERITY_PENALTY[result.severity];
  }
  return clampScore(score);
}

/**
 * Calcule le score global pondéré d'un CrawlResult.
 * Σ (scoreModule(module) * MODULE_WEIGHTS[module]).
 */
function weightedGlobal(crawlResult: CrawlResult): number {
  let total = 0;
  for (const module of MODULES) {
    total += scoreModule(crawlResult[module].results) * MODULE_WEIGHTS[module];
  }
  return Math.round(total);
}

/**
 * Calcule tous les scores d'un audit (et du concurrent si fourni).
 * Aucune mutation des objets en entrée.
 */
export function scoreAll(
  crawlResult: CrawlResult,
  competitorCrawl?: CrawlResult | null,
): AuditScores {
  const scores: AuditScores = {
    global: weightedGlobal(crawlResult),
    seo: scoreModule(crawlResult.seo.results),
    performance: scoreModule(crawlResult.performance.results),
    ux: scoreModule(crawlResult.ux.results),
    content: scoreModule(crawlResult.content.results),
    security: scoreModule(crawlResult.security.results),
    social: scoreModule(crawlResult.social.results),
  };

  if (competitorCrawl) {
    return { ...scores, competitor: weightedGlobal(competitorCrawl) };
  }

  return scores;
}

/**
 * Étiquette qualitative d'un score global.
 */
export function getScoreLabel(
  score: number,
): "EXCELLENT" | "BON" | "À AMÉLIORER" | "CRITIQUE" {
  if (score >= SCORE_THRESHOLDS.excellent) return "EXCELLENT";
  if (score >= SCORE_THRESHOLDS.good) return "BON";
  if (score >= SCORE_THRESHOLDS.needsWork) return "À AMÉLIORER";
  return "CRITIQUE";
}

/**
 * Différence module par module entre deux audits (current - previous).
 * Le champ competitor n'est inclus que si présent dans les deux audits.
 */
export function getModuleDelta(
  current: AuditScores,
  previous: AuditScores,
): Partial<AuditScores> {
  const delta: Partial<AuditScores> = {
    global: current.global - previous.global,
    seo: current.seo - previous.seo,
    performance: current.performance - previous.performance,
    ux: current.ux - previous.ux,
    content: current.content - previous.content,
    security: current.security - previous.security,
    social: current.social - previous.social,
  };

  if (
    typeof current.competitor === "number" &&
    typeof previous.competitor === "number"
  ) {
    delta.competitor = current.competitor - previous.competitor;
  }

  return delta;
}

/**
 * Nombre de problèmes résolus entre deux audits.
 * Un type présent dans `previous` mais absent dans `current` est résolu.
 */
export function countResolvedIssues(
  current: AuditResult[],
  previous: AuditResult[],
): number {
  const currentTypes = new Set<string>();
  for (const result of current) {
    currentTypes.add(result.type);
  }

  const previousTypes = new Set<string>();
  for (const result of previous) {
    previousTypes.add(result.type);
  }

  let resolved = 0;
  for (const type of previousTypes) {
    if (!currentTypes.has(type)) {
      resolved += 1;
    }
  }

  return resolved;
}
