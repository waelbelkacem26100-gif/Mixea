import { auditSeo } from "./seo";
import { auditPerformance, fetchPageSpeed } from "./performance";
import { auditUx } from "./ux";
import { auditContent } from "./content";
import { auditSecurity } from "./security";
import { auditSocial } from "./social";
import type {
  AuditModule,
  CrawlResult,
  ModuleResult,
  PageSpeedResult,
} from "../types";

/**
 * Fallback ModuleResult used when a module rejects or reports an error.
 */
const fallback = (module: AuditModule, error: string): ModuleResult => ({
  module,
  score: 0,
  results: [],
  error,
});

/**
 * Normalise une erreur inconnue en message lisible.
 */
function toErrorMessage(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === "string") return reason;
  return "Erreur inconnue du module d'audit";
}

/**
 * Résout un settled result en ModuleResult sûr.
 * - rejected -> fallback avec le message d'erreur
 * - fulfilled mais avec result.error -> on conserve le ModuleResult tel quel
 */
function settle(
  module: AuditModule,
  outcome: PromiseSettledResult<ModuleResult>,
): ModuleResult {
  if (outcome.status === "rejected") {
    return fallback(module, toErrorMessage(outcome.reason));
  }
  return outcome.value;
}

/**
 * Orchestrateur principal de l'audit.
 *
 * 1. Récupère le résultat PageSpeed (cache si disponible) de façon silencieuse.
 * 2. Lance les 6 modules en parallèle via Promise.allSettled.
 * 3. Convertit chaque échec en ModuleResult vide (score 0, error renseignée).
 * 4. Ne throw jamais : retourne toujours un CrawlResult complet.
 */
export async function runAudit(
  url: string,
  cachedPagespeed?: PageSpeedResult | null,
): Promise<CrawlResult> {
  // 1. PageSpeed d'abord — échec silencieux, null si indisponible.
  let pagespeed: PageSpeedResult | null = null;
  try {
    pagespeed = await fetchPageSpeed(url, cachedPagespeed);
  } catch {
    pagespeed = null;
  }

  // 2. Les 6 modules en parallèle.
  const [seo, performance, ux, content, security, social] =
    await Promise.allSettled([
      auditSeo(url),
      auditPerformance(url, pagespeed),
      auditUx(url, pagespeed),
      auditContent(url),
      auditSecurity(url),
      auditSocial(url),
    ]);

  // 3 & 4. Conversion sûre en CrawlResult complet.
  return {
    seo: settle("seo", seo),
    performance: settle("performance", performance),
    ux: settle("ux", ux),
    content: settle("content", content),
    security: settle("security", security),
    social: settle("social", social),
  };
}
