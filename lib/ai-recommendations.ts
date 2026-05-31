import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { AI_MAX_PROBLEMS, AI_MAX_TOKENS, AI_MODEL } from "./constants";
import type { AIRecommendation, AuditResult, Severity } from "./types";

// Single SDK instance. The API key is read automatically by the SDK from
// process.env.ANTHROPIC_API_KEY — it is never referenced or logged here.
const anthropic = new Anthropic();

const SYSTEM_PROMPT = `Tu es le meilleur expert SEO, performance web, sécurité et UX au monde. Pour chaque problème fourni, génère en français :

1. explanation : explication simple en 1 phrase (zéro jargon, niveau débutant)
2. impact : impact concret et chiffré si possible ('Google déclasse les sites sans HTTPS', 'un LCP > 4s fait perdre 53% des visiteurs mobiles', etc.)
3. action : étapes concrètes et précises à suivre pour corriger le problème maintenant
4. fix : uniquement si applicable :
   - Pour title/meta/alt manquants ou mauvais : génère le texte exact corrigé basé sur le contenu réel de la page fourni
   - Pour headers sécurité manquants : génère la ligne de code exacte selon le CMS détecté (nginx/apache/.htaccess/next.config.js/vercel.json)
   - Pour schema.org absent : génère le JSON-LD complet adapté au type de site
   - Pour robots.txt mal configuré : génère le fichier corrigé complet

Réponds UNIQUEMENT en JSON strict :
[{"id":"string","explanation":"string","impact":"string","action":"string","fix":"string optionnel"}]
Sans texte autour, sans backticks markdown.`;

// Lower number = higher priority (sorted first).
const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

type SiteContext = {
  url: string;
  title?: string;
  description?: string;
  keyword?: string;
};

/**
 * Selects which problems are sent to the AI.
 * - If over the cap, drops info-severity results (keeps critical + warning).
 * - If still over the cap, keeps the first AI_MAX_PROBLEMS sorted by severity.
 */
function selectProblems(results: AuditResult[]): AuditResult[] {
  let selected = results;

  if (selected.length > AI_MAX_PROBLEMS) {
    selected = selected.filter(
      (r) => r.severity === "critical" || r.severity === "warning"
    );
  }

  if (selected.length > AI_MAX_PROBLEMS) {
    selected = [...selected]
      .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
      .slice(0, AI_MAX_PROBLEMS);
  }

  return selected;
}

/**
 * Builds the compact user message: optional site context + filtered problems.
 */
function buildUserMessage(
  problems: AuditResult[],
  siteContext?: SiteContext
): string {
  const compactProblems = problems.map((r) => ({
    id: r.id,
    module: r.module,
    type: r.type,
    severity: r.severity,
    label: r.label,
    value: r.value,
    impact: r.impact,
  }));

  const parts: string[] = [];

  if (siteContext) {
    const contextLines = [`URL: ${siteContext.url}`];
    if (siteContext.title) contextLines.push(`Title: ${siteContext.title}`);
    if (siteContext.description) {
      contextLines.push(`Description: ${siteContext.description}`);
    }
    if (siteContext.keyword) {
      contextLines.push(`Mot-clé détecté: ${siteContext.keyword}`);
    }
    parts.push(`Contexte du site:\n${contextLines.join("\n")}`);
  }

  parts.push(
    `Problèmes à corriger:\n${JSON.stringify(compactProblems)}`
  );

  return parts.join("\n\n");
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Validates and normalizes one parsed item into an AIRecommendation.
 * Returns null when required fields are missing or wrongly typed.
 */
function parseRecommendation(item: unknown): AIRecommendation | null {
  if (typeof item !== "object" || item === null) return null;

  const record = item as Record<string, unknown>;
  const { id, explanation, impact, action, fix } = record;

  if (
    !isNonEmptyString(id) ||
    !isNonEmptyString(explanation) ||
    !isNonEmptyString(impact) ||
    !isNonEmptyString(action)
  ) {
    return null;
  }

  const recommendation: AIRecommendation = {
    id,
    explanation,
    impact,
    action,
  };

  if (typeof fix === "string" && fix.length > 0) {
    recommendation.fix = fix;
  }

  return recommendation;
}

/**
 * Parses the raw model text into a validated list of recommendations.
 * Throws on invalid JSON or a non-array payload (caught by the caller).
 */
function parseResponse(text: string): AIRecommendation[] {
  const clean = text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(clean) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("AI response is not a JSON array");
  }

  const recommendations: AIRecommendation[] = [];
  for (const item of parsed) {
    const recommendation = parseRecommendation(item);
    if (recommendation) recommendations.push(recommendation);
  }

  return recommendations;
}

/**
 * Generates AI corrections for the given audit results.
 *
 * Server-only. Never throws toward the caller: on any network error, rate
 * limit (429), or invalid JSON it logs server-side and returns an empty array.
 */
export async function generateRecommendations(
  results: AuditResult[],
  siteContext?: SiteContext
): Promise<AIRecommendation[]> {
  if (results.length === 0) return [];

  const problems = selectProblems(results);
  if (problems.length === 0) return [];

  const userMessage = buildUserMessage(problems, siteContext);

  try {
    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: AI_MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const first = response.content[0];
    const text = first && first.type === "text" ? first.text : "";

    return parseResponse(text);
  } catch (error) {
    if (error instanceof Anthropic.APIError && error.status === 429) {
      console.error("[ai-recommendations] Rate limited by Anthropic API (429)");
      return [];
    }

    const message =
      error instanceof Error ? error.message : "unknown error";
    console.error(`[ai-recommendations] Generation failed: ${message}`);
    return [];
  }
}

/**
 * Merges AI recommendations into the original audit results by id.
 * Returns a new array — the input results are never mutated. Results without
 * a matching recommendation are returned unchanged.
 */
export function mergeRecommendations(
  results: AuditResult[],
  recommendations: AIRecommendation[]
): AuditResult[] {
  const byId = new Map<string, AIRecommendation>();
  for (const recommendation of recommendations) {
    byId.set(recommendation.id, recommendation);
  }

  return results.map((result) => {
    const recommendation = byId.get(result.id);
    if (!recommendation) return result;

    const merged: AuditResult = {
      ...result,
      explanation: recommendation.explanation,
      action: recommendation.action,
    };

    if (recommendation.fix !== undefined) {
      merged.fix = recommendation.fix;
    }

    return merged;
  });
}
