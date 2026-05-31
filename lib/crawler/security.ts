import * as cheerio from "cheerio";
import {
  CRAWLER_USER_AGENT,
  FETCH_TIMEOUT_MS,
  SENSITIVE_FILES,
  CMS_SIGNATURES,
} from "../constants";
import type { AuditResult, ModuleResult, Severity } from "../types";

const MODULE = "security" as const;

const SECONDARY_TIMEOUT_MS = 4000;

type ResultInput = Omit<AuditResult, "id" | "module">;

function makeId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${MODULE}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
}

function makeResult(input: ResultInput): AuditResult {
  return { id: makeId(), module: MODULE, ...input };
}

async function fetchWithTimeout(
  target: string,
  timeoutMs: number,
  method: "GET" | "HEAD" = "GET",
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(target, {
      method,
      headers: { "User-Agent": CRAWLER_USER_AGENT },
      redirect: "follow",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function getOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url.replace(/\/+$/, "");
  }
}

function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return url.startsWith("https://");
  }
}

/**
 * Récupère la liste des Set-Cookie quelle que soit la plateforme.
 * Préfère getSetCookie() (Fetch API moderne / Undici), sinon parse le header brut.
 */
function getSetCookies(headers: Headers): string[] {
  const withGetter = headers as Headers & {
    getSetCookie?: () => string[];
  };
  if (typeof withGetter.getSetCookie === "function") {
    const cookies = withGetter.getSetCookie();
    if (Array.isArray(cookies) && cookies.length > 0) return cookies;
  }
  const raw = headers.get("set-cookie");
  if (!raw) return [];
  return [raw];
}

function cookieName(cookie: string): string {
  const eq = cookie.indexOf("=");
  const namePart = eq === -1 ? cookie : cookie.slice(0, eq);
  return namePart.trim();
}

function summarizeCookies(names: string[]): string {
  if (names.length === 0) return "0";
  if (names.length === 1) return names[0];
  return `${names.length} cookies (${names.join(", ")})`;
}

export async function auditSecurity(url: string): Promise<ModuleResult> {
  const results: AuditResult[] = [];
  const push = (severity: Severity, input: Omit<ResultInput, "severity">) =>
    results.push(makeResult({ severity, ...input }));

  try {
    const https = isHttps(url);
    const origin = getOrigin(url);

    // -------- Fetch principal unique (headers + HTML) --------
    const response = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
    const headers = response.headers;
    const html = await response.text();
    const $ = cheerio.load(html);

    const has = (name: string): boolean => headers.get(name) !== null;

    // ============================================================
    // HEADERS SÉCURITÉ
    // ============================================================

    // 1. Strict-Transport-Security (HSTS) — pertinent uniquement sur HTTPS
    if (https) {
      if (!has("strict-transport-security")) {
        push("critical", {
          type: "missing_hsts",
          label: "En-tête HSTS manquant",
          value: false,
          impact:
            "Sans HSTS, le navigateur peut être forcé en HTTP non chiffré (attaque SSL stripping).",
          explanation:
            "Strict-Transport-Security oblige le navigateur à n'utiliser que HTTPS pour votre domaine.",
          action:
            "Ajoutez l'en-tête Strict-Transport-Security à toutes les réponses HTTPS.",
          fix: "Strict-Transport-Security: max-age=31536000; includeSubDomains",
        });
      } else {
        push("info", {
          type: "hsts_present",
          label: "En-tête HSTS présent",
          value: headers.get("strict-transport-security") ?? true,
          impact: "Le navigateur est forcé d'utiliser HTTPS — bonne pratique.",
        });
      }
    }

    // 2. X-Frame-Options
    if (!has("x-frame-options")) {
      push("warning", {
        type: "missing_x_frame_options",
        label: "En-tête X-Frame-Options manquant",
        value: false,
        impact:
          "Le site peut être inclus dans une iframe malveillante (risque de clickjacking).",
        action: "Ajoutez l'en-tête X-Frame-Options.",
        fix: "X-Frame-Options: SAMEORIGIN",
      });
    } else {
      push("info", {
        type: "x_frame_options_present",
        label: "En-tête X-Frame-Options présent",
        value: headers.get("x-frame-options") ?? true,
        impact: "Protection contre le clickjacking active.",
      });
    }

    // 3. X-Content-Type-Options
    if (!has("x-content-type-options")) {
      push("warning", {
        type: "missing_x_content_type_options",
        label: "En-tête X-Content-Type-Options manquant",
        value: false,
        impact:
          "Le navigateur peut interpréter des fichiers avec un mauvais type MIME (risque XSS).",
        action: "Ajoutez l'en-tête X-Content-Type-Options.",
        fix: "X-Content-Type-Options: nosniff",
      });
    } else {
      push("info", {
        type: "x_content_type_options_present",
        label: "En-tête X-Content-Type-Options présent",
        value: headers.get("x-content-type-options") ?? true,
        impact: "Le sniffing MIME est désactivé — bonne pratique.",
      });
    }

    // 4. Content-Security-Policy
    if (!has("content-security-policy")) {
      push(https ? "critical" : "warning", {
        type: "missing_csp",
        label: "En-tête Content-Security-Policy manquant",
        value: false,
        impact:
          "Sans CSP, le site est plus vulnérable aux injections de scripts (XSS) et aux ressources malveillantes.",
        explanation:
          "Content-Security-Policy contrôle les sources autorisées pour les scripts, styles et autres ressources.",
        action: "Définissez une politique Content-Security-Policy adaptée.",
        fix: "Content-Security-Policy: default-src 'self'",
      });
    } else {
      push("info", {
        type: "csp_present",
        label: "En-tête Content-Security-Policy présent",
        value: headers.get("content-security-policy") ?? true,
        impact: "Une politique de sécurité du contenu est en place.",
      });
    }

    // 5. Referrer-Policy
    if (!has("referrer-policy")) {
      push("warning", {
        type: "missing_referrer_policy",
        label: "En-tête Referrer-Policy manquant",
        value: false,
        impact:
          "Des informations sensibles d'URL peuvent fuiter vers des sites tiers via le referrer.",
        action: "Ajoutez l'en-tête Referrer-Policy.",
        fix: "Referrer-Policy: strict-origin-when-cross-origin",
      });
    } else {
      push("info", {
        type: "referrer_policy_present",
        label: "En-tête Referrer-Policy présent",
        value: headers.get("referrer-policy") ?? true,
        impact: "La politique de referrer limite les fuites d'information.",
      });
    }

    // 6. Permissions-Policy
    if (!has("permissions-policy")) {
      push("warning", {
        type: "missing_permissions_policy",
        label: "En-tête Permissions-Policy manquant",
        value: false,
        impact:
          "Les API navigateur (caméra, micro, géolocalisation…) ne sont pas restreintes.",
        action: "Ajoutez l'en-tête Permissions-Policy.",
        fix: "Permissions-Policy: geolocation=(), microphone=(), camera=()",
      });
    } else {
      push("info", {
        type: "permissions_policy_present",
        label: "En-tête Permissions-Policy présent",
        value: headers.get("permissions-policy") ?? true,
        impact: "L'accès aux API sensibles du navigateur est restreint.",
      });
    }

    // 7. Cross-Origin-Embedder-Policy (info seulement)
    if (!has("cross-origin-embedder-policy")) {
      push("info", {
        type: "missing_coep",
        label: "En-tête Cross-Origin-Embedder-Policy absent",
        value: false,
        impact:
          "COEP renforce l'isolation cross-origin — recommandé mais non critique.",
        action: "Envisagez d'ajouter Cross-Origin-Embedder-Policy: require-corp.",
      });
    } else {
      push("info", {
        type: "coep_present",
        label: "En-tête Cross-Origin-Embedder-Policy présent",
        value: headers.get("cross-origin-embedder-policy") ?? true,
        impact: "Isolation cross-origin renforcée.",
      });
    }

    // 8. Cross-Origin-Opener-Policy (info seulement)
    if (!has("cross-origin-opener-policy")) {
      push("info", {
        type: "missing_coop",
        label: "En-tête Cross-Origin-Opener-Policy absent",
        value: false,
        impact:
          "COOP isole votre fenêtre des autres contextes — recommandé mais non critique.",
        action: "Envisagez d'ajouter Cross-Origin-Opener-Policy: same-origin.",
      });
    } else {
      push("info", {
        type: "coop_present",
        label: "En-tête Cross-Origin-Opener-Policy présent",
        value: headers.get("cross-origin-opener-policy") ?? true,
        impact: "Isolation de la fenêtre de navigation active.",
      });
    }

    // ============================================================
    // EXPOSITION CMS
    // ============================================================

    const lowerHtml = html.toLowerCase();
    const generator = ($('meta[name="generator"]').attr("content") ?? "")
      .toLowerCase();
    const poweredBy = (headers.get("x-powered-by") ?? "").toLowerCase();

    // 9. Détection CMS
    const isWordPress =
      lowerHtml.includes("/wp-content/") ||
      lowerHtml.includes("/wp-includes/") ||
      generator.includes("wordpress") ||
      poweredBy.includes("wordpress");

    if (isWordPress) {
      push("info", {
        type: "cms_detected",
        label: "CMS détecté",
        value: "WordPress",
        impact:
          "WordPress est très répandu et donc une cible fréquente : maintenez-le à jour.",
      });

      // wp-login.php exposé
      try {
        const wpLogin = await fetchWithTimeout(
          `${origin}/wp-login.php`,
          SECONDARY_TIMEOUT_MS,
        );
        if (wpLogin.status === 200) {
          push("warning", {
            type: "wp_login_exposed",
            label: "Page de connexion WordPress exposée",
            value: "/wp-login.php",
            impact:
              "La page /wp-login.php est accessible publiquement (cible d'attaques par force brute).",
            action:
              "Protégez /wp-login.php (limitation d'IP, 2FA, plugin de sécurité).",
          });
        }
      } catch {
        // fetch secondaire échoué — ignoré
      }

      // readme.html exposé
      try {
        const wpReadme = await fetchWithTimeout(
          `${origin}/readme.html`,
          SECONDARY_TIMEOUT_MS,
        );
        if (wpReadme.status === 200) {
          push("warning", {
            type: "wp_readme_exposed",
            label: "Fichier readme.html WordPress exposé",
            value: "/readme.html",
            impact:
              "Le fichier readme.html révèle la version de WordPress, facilitant les attaques ciblées.",
            action: "Supprimez ou bloquez l'accès à /readme.html.",
          });
        }
      } catch {
        // ignoré
      }
    } else if (
      lowerHtml.includes("cdn.shopify.com") ||
      CMS_SIGNATURES.shopify.some((sig) => lowerHtml.includes(sig))
    ) {
      push("info", {
        type: "cms_detected",
        label: "CMS détecté",
        value: "Shopify",
        impact: "Plateforme Shopify détectée (hébergement géré).",
      });
    } else if (
      CMS_SIGNATURES.webflow.some((sig) => lowerHtml.includes(sig))
    ) {
      push("info", {
        type: "cms_detected",
        label: "CMS détecté",
        value: "Webflow",
        impact: "Plateforme Webflow détectée (hébergement géré).",
      });
    } else if (
      lowerHtml.includes("wix.com") ||
      lowerHtml.includes("wixsite.com")
    ) {
      push("info", {
        type: "cms_detected",
        label: "CMS détecté",
        value: "Wix",
        impact: "Plateforme Wix détectée (hébergement géré).",
      });
    } else if (CMS_SIGNATURES.squarespace.some((sig) => lowerHtml.includes(sig))) {
      push("info", {
        type: "cms_detected",
        label: "CMS détecté",
        value: "Squarespace",
        impact: "Plateforme Squarespace détectée (hébergement géré).",
      });
    }

    // 10. Version PHP exposée
    const poweredByRaw = headers.get("x-powered-by");
    if (poweredByRaw && poweredBy.includes("php")) {
      push("warning", {
        type: "php_version_exposed",
        label: "Version de PHP exposée",
        value: poweredByRaw,
        impact:
          "L'en-tête X-Powered-By révèle la version de PHP, facilitant le ciblage de vulnérabilités connues.",
        action: "Masquez l'en-tête X-Powered-By (expose_php = Off).",
      });
    }

    // 11. Directory listing
    try {
      const dirRes = await fetchWithTimeout(
        `${origin}/images/`,
        SECONDARY_TIMEOUT_MS,
      );
      if (dirRes.status === 200) {
        const dirBody = await dirRes.text();
        if (
          dirBody.includes("Index of") ||
          dirBody.includes("Directory listing")
        ) {
          push("critical", {
            type: "directory_listing_enabled",
            label: "Listing de répertoire activé",
            value: "/images/",
            impact:
              "Le listing de répertoire expose la structure des fichiers et des ressources sensibles.",
            action:
              "Désactivez l'indexation des répertoires (Options -Indexes / autoindex off).",
          });
        }
      }
    } catch {
      // ignoré
    }

    // ============================================================
    // FICHIERS SENSIBLES EXPOSÉS (12)
    // ============================================================

    const sensitiveChecks = await Promise.allSettled(
      SENSITIVE_FILES.map(async (file) => {
        const res = await fetchWithTimeout(
          `${origin}${file}`,
          SECONDARY_TIMEOUT_MS,
        );
        return { file, status: res.status };
      }),
    );

    let exposedCount = 0;
    for (const check of sensitiveChecks) {
      if (check.status === "fulfilled" && check.value.status === 200) {
        exposedCount++;
        push("critical", {
          type: "sensitive_file_exposed",
          label: `Fichier sensible exposé : ${check.value.file}`,
          value: check.value.file,
          impact:
            "Ce fichier sensible est accessible publiquement et peut exposer des secrets ou la configuration.",
          action: `Bloquez immédiatement l'accès public à ${check.value.file}.`,
        });
      }
    }

    if (exposedCount === 0) {
      push("info", {
        type: "no_sensitive_files_exposed",
        label: "Aucun fichier sensible exposé",
        value: SENSITIVE_FILES.length,
        impact:
          "Aucun des fichiers sensibles vérifiés n'est accessible publiquement.",
      });
    }

    // ============================================================
    // COOKIES (13, 14, 15)
    // ============================================================

    const cookies = getSetCookies(headers);
    if (cookies.length > 0) {
      const missingSecure: string[] = [];
      const missingHttpOnly: string[] = [];
      const missingSameSite: string[] = [];

      for (const cookie of cookies) {
        const lower = cookie.toLowerCase();
        const name = cookieName(cookie);
        // Secure pertinent uniquement sur HTTPS
        if (https && !/(?:^|;\s*)secure(?:\s*;|\s*$)/.test(lower)) {
          missingSecure.push(name);
        }
        if (!/(?:^|;\s*)httponly(?:\s*;|\s*$)/.test(lower)) {
          missingHttpOnly.push(name);
        }
        if (!lower.includes("samesite")) {
          missingSameSite.push(name);
        }
      }

      if (missingSecure.length > 0) {
        push("warning", {
          type: "cookie_missing_secure",
          label: "Cookie(s) sans attribut Secure",
          value: summarizeCookies(missingSecure),
          impact:
            "Un cookie sans Secure peut être transmis en clair sur une connexion non chiffrée.",
          action: "Ajoutez l'attribut Secure à ces cookies sur HTTPS.",
        });
      }

      if (missingHttpOnly.length > 0) {
        push("warning", {
          type: "cookie_missing_httponly",
          label: "Cookie(s) sans attribut HttpOnly",
          value: summarizeCookies(missingHttpOnly),
          impact:
            "Un cookie sans HttpOnly est accessible via JavaScript (risque de vol via XSS).",
          action:
            "Ajoutez l'attribut HttpOnly aux cookies de session/authentification.",
        });
      }

      if (missingSameSite.length > 0) {
        push("warning", {
          type: "cookie_missing_samesite",
          label: "Cookie(s) sans attribut SameSite",
          value: summarizeCookies(missingSameSite),
          impact:
            "Un cookie sans SameSite est plus vulnérable aux attaques CSRF.",
          action: "Ajoutez l'attribut SameSite (Lax ou Strict) aux cookies.",
        });
      }
    }

    return { module: MODULE, score: 0, results };
  } catch (err) {
    return {
      module: MODULE,
      score: 0,
      results: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
