import type {
  AuditModule,
  AuditResult,
  AuditScores,
  CrawlResult,
  PageSpeedResult,
  Severity,
} from "./types";
import { runAudit } from "./crawler/index";
import { scoreAll } from "./scorer";

/**
 * Résultat complet d'un audit comparatif entre le site et un concurrent.
 */
export type ComparisonResult = {
  site: CrawlResult;
  competitor: CrawlResult;
  siteScores: AuditScores;
  competitorScores: AuditScores;
  delta: Record<AuditModule | "global", number>;
  siteWins: AuditModule[];
  competitorWins: AuditModule[];
};

/**
 * Liste ordonnée des modules d'audit.
 */
const MODULES: AuditModule[] = [
  "seo",
  "performance",
  "ux",
  "content",
  "security",
  "social",
];

/**
 * Poids de tri par sévérité (le plus élevé = traité en priorité).
 */
const SEVERITY_RANK: Record<Severity, number> = {
  critical: 2,
  warning: 1,
  info: 0,
};

/**
 * Enrichit les résultats du site avec la valeur correspondante du concurrent.
 *
 * Pour chaque résultat site, on cherche un résultat concurrent partageant le
 * même `type` ET le même `module`. Si trouvé, on ajoute `competitorValue`.
 * Aucune mutation : un nouveau tableau (et de nouveaux objets) est retourné.
 */
export function enrichWithCompetitorValues(
  siteResults: AuditResult[],
  competitorResults: AuditResult[],
): AuditResult[] {
  return siteResults.map((result) => {
    const match = competitorResults.find(
      (competitor) =>
        competitor.type === result.type &&
        competitor.module === result.module,
    );

    if (!match) {
      return result;
    }

    return { ...result, competitorValue: match.value };
  });
}

/**
 * Aplatit tous les résultats des 6 modules d'un CrawlResult en un tableau.
 */
function flattenResults(crawl: CrawlResult): AuditResult[] {
  return MODULES.flatMap((module) => crawl[module].results);
}

/**
 * Lance un audit comparatif complet entre le site et un concurrent.
 *
 * Les deux audits sont exécutés en parallèle. Les scores sont calculés, le
 * delta par module + global est dérivé, les victoires de chaque camp sont
 * déterminées, et les résultats du site sont enrichis avec les valeurs
 * concurrentes (de façon immuable).
 *
 * @throws relaie toute erreur survenue pendant l'audit à l'appelant.
 */
export async function runComparisonAudit(
  siteUrl: string,
  competitorUrl: string,
  cachedPagespeed?: PageSpeedResult | null,
): Promise<ComparisonResult> {
  try {
    // 1. Les deux audits en parallèle (pas de cache pour le concurrent).
    const [siteResult, competitorResult] = await Promise.all([
      runAudit(siteUrl, cachedPagespeed),
      runAudit(competitorUrl, null),
    ]);

    // 2. Scores des deux audits.
    const siteScores = scoreAll(siteResult);
    const competitorScores = scoreAll(competitorResult);

    // 3 & 4. Delta par module + global, et victoires de chaque camp.
    const delta = {} as Record<AuditModule | "global", number>;
    const siteWins: AuditModule[] = [];
    const competitorWins: AuditModule[] = [];

    delta.global = siteScores.global - competitorScores.global;

    for (const module of MODULES) {
      const siteScore = siteScores[module];
      const competitorScore = competitorScores[module];

      delta[module] = siteScore - competitorScore;

      if (siteScore >= competitorScore) {
        siteWins.push(module);
      } else {
        competitorWins.push(module);
      }
    }

    // 5. Enrichit les résultats du site avec les valeurs concurrentes,
    //    module par module, sans muter les objets reçus.
    const competitorFlat = flattenResults(competitorResult);

    const enrichedSite: CrawlResult = {
      seo: {
        ...siteResult.seo,
        results: enrichWithCompetitorValues(
          siteResult.seo.results,
          competitorFlat,
        ),
      },
      performance: {
        ...siteResult.performance,
        results: enrichWithCompetitorValues(
          siteResult.performance.results,
          competitorFlat,
        ),
      },
      ux: {
        ...siteResult.ux,
        results: enrichWithCompetitorValues(
          siteResult.ux.results,
          competitorFlat,
        ),
      },
      content: {
        ...siteResult.content,
        results: enrichWithCompetitorValues(
          siteResult.content.results,
          competitorFlat,
        ),
      },
      security: {
        ...siteResult.security,
        results: enrichWithCompetitorValues(
          siteResult.security.results,
          competitorFlat,
        ),
      },
      social: {
        ...siteResult.social,
        results: enrichWithCompetitorValues(
          siteResult.social.results,
          competitorFlat,
        ),
      },
    };

    // 6. ComparisonResult complet.
    return {
      site: enrichedSite,
      competitor: competitorResult,
      siteScores,
      competitorScores,
      delta,
      siteWins,
      competitorWins,
    };
  } catch (error) {
    // L'appelant gère l'erreur — on la relaie telle quelle.
    throw error;
  }
}

/**
 * Identifie les corrections prioritaires face au concurrent.
 *
 * Renvoie les AuditResults du site situés dans les modules où le concurrent
 * est meilleur (`competitorWins`), filtrés sur les sévérités `critical` et
 * `warning`, triés par sévérité (critical d'abord) puis par delta de module
 * décroissant (plus grand écart en premier). Limité à 10 résultats.
 */
export function getCompetitorPriorities(
  comparison: ComparisonResult,
): AuditResult[] {
  const { site, competitorWins, delta } = comparison;

  // Écart par module : delta négatif => le concurrent gagne. On utilise la
  // valeur absolue pour ordonner du plus grand écart au plus petit.
  const moduleGap = (module: AuditModule): number => Math.abs(delta[module]);

  const candidates = competitorWins.flatMap((module) =>
    site[module].results.filter(
      (result) =>
        result.severity === "critical" || result.severity === "warning",
    ),
  );

  const sorted = [...candidates].sort((a, b) => {
    const severityDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (severityDiff !== 0) {
      return severityDiff;
    }
    return moduleGap(b.module) - moduleGap(a.module);
  });

  return sorted.slice(0, 10);
}
