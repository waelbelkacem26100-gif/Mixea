import * as cheerio from "cheerio";
import { CRAWLER_USER_AGENT, FETCH_TIMEOUT_MS } from "../constants";
import type { AuditResult, ModuleResult, Severity } from "../types";

const MODULE = "seo" as const;

const GENERIC_ALT = new Set(["image", "photo", "img", "picture", "logo"]);

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

function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    return u.toString();
  } catch {
    return raw;
  }
}

function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

export async function auditSeo(url: string): Promise<ModuleResult> {
  const results: AuditResult[] = [];
  const push = (severity: Severity, input: Omit<ResultInput, "severity">) =>
    results.push(makeResult({ severity, ...input }));

  try {
    // -------- HTTPS (11) --------
    if (url.startsWith("http://")) {
      push("critical", {
        type: "no_https",
        label: "Connexion non sécurisée (HTTP)",
        value: url,
        impact:
          "Le site n'utilise pas HTTPS, ce qui pénalise le référencement et la confiance des visiteurs.",
        explanation:
          "Google privilégie les sites en HTTPS et les navigateurs affichent un avertissement « Non sécurisé ».",
        action: "Installer un certificat TLS et rediriger HTTP vers HTTPS.",
      });
    }

    // -------- Fetch principal --------
    const response = await fetchWithTimeout(url, FETCH_TIMEOUT_MS, "GET");
    const finalUrl = response.url || url;
    const contentType = response.headers.get("content-type") ?? "";

    if (!contentType.toLowerCase().includes("text/html")) {
      return {
        module: MODULE,
        score: 0,
        results: [],
        error: `Le contenu n'est pas du HTML (Content-Type: ${
          contentType || "inconnu"
        }).`,
      };
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    let origin: string;
    try {
      origin = new URL(finalUrl).origin;
    } catch {
      origin = new URL(url).origin;
    }

    // -------- Redirections (14) --------
    if (normalizeUrl(finalUrl) !== normalizeUrl(url)) {
      push("info", {
        type: "redirect_detected",
        label: "Redirection détectée",
        value: finalUrl,
        impact:
          "L'URL demandée redirige vers une autre adresse, ce qui ajoute de la latence.",
        explanation: `L'URL « ${url} » redirige vers « ${finalUrl} ».`,
        action:
          "Vérifier que la redirection est volontaire et qu'elle est en 301 (permanente).",
      });
    }

    // -------- 1. Title --------
    const titleEl = $("head > title").first();
    const title = (titleEl.text() ?? "").trim();
    if (titleEl.length === 0 || title.length === 0) {
      push("critical", {
        type: "missing_title",
        label: "Balise <title> absente",
        value: false,
        impact:
          "Sans titre, Google ne peut pas comprendre ni afficher correctement la page dans les résultats.",
        explanation:
          "La balise <title> est l'un des facteurs SEO les plus importants.",
        action: "Ajouter une balise <title> unique et descriptive de 50 à 60 caractères.",
      });
    } else if (title.length < 10 || title.length > 70) {
      push("warning", {
        type: "title_length",
        label: "Longueur du titre non optimale",
        value: title.length,
        impact:
          "Un titre trop court ou trop long est tronqué ou peu informatif dans les résultats de recherche.",
        explanation: `Le titre fait ${title.length} caractères. La plage recommandée est de 50 à 60 caractères.`,
        action: "Reformuler le titre pour qu'il fasse entre 50 et 60 caractères.",
      });
    } else if (title.length >= 50 && title.length <= 60) {
      push("info", {
        type: "title_length",
        label: "Longueur du titre optimale",
        value: title.length,
        impact: "Le titre a une longueur idéale pour l'affichage dans Google.",
      });
    }

    // -------- 2. Meta description --------
    const metaDesc = ($('meta[name="description"]').attr("content") ?? "").trim();
    if (!metaDesc) {
      push("warning", {
        type: "missing_meta_description",
        label: "Méta-description absente",
        value: false,
        impact:
          "Sans méta-description, Google génère un extrait automatique souvent moins attractif.",
        explanation:
          "La méta-description influence le taux de clic depuis les résultats de recherche.",
        action: "Ajouter une méta-description engageante de 150 à 160 caractères.",
      });
    } else if (metaDesc.length < 50) {
      push("warning", {
        type: "meta_description_too_short",
        label: "Méta-description trop courte",
        value: metaDesc.length,
        impact:
          "Une méta-description trop courte sous-exploite l'espace disponible dans les résultats.",
        explanation: `La méta-description fait ${metaDesc.length} caractères (recommandé : 150 à 160).`,
        action: "Étoffer la méta-description jusqu'à 150-160 caractères.",
      });
    } else if (metaDesc.length > 160) {
      push("warning", {
        type: "meta_description_too_long",
        label: "Méta-description trop longue",
        value: metaDesc.length,
        impact:
          "Une méta-description trop longue est tronquée par Google dans les résultats.",
        explanation: `La méta-description fait ${metaDesc.length} caractères (recommandé : 150 à 160).`,
        action: "Raccourcir la méta-description à 150-160 caractères maximum.",
      });
    } else if (metaDesc.length >= 150 && metaDesc.length <= 160) {
      push("info", {
        type: "meta_description_optimal",
        label: "Méta-description optimale",
        value: metaDesc.length,
        impact: "La méta-description a une longueur idéale.",
      });
    }

    // -------- 3. H1 --------
    const h1s = $("h1");
    const h1Count = h1s.length;
    if (h1Count === 0) {
      push("critical", {
        type: "missing_h1",
        label: "Titre H1 absent",
        value: false,
        impact:
          "L'absence de H1 empêche Google de comprendre le sujet principal de la page.",
        explanation: "Chaque page doit avoir exactement un titre H1.",
        action: "Ajouter un unique H1 décrivant le sujet principal de la page.",
      });
    } else {
      if (h1Count > 1) {
        push("warning", {
          type: "multiple_h1",
          label: "Plusieurs titres H1",
          value: h1Count,
          impact:
            "Plusieurs H1 diluent le signal sémantique et peuvent perturber l'indexation.",
          explanation: `La page contient ${h1Count} balises H1.`,
          action: "Conserver un seul H1 et convertir les autres en H2.",
        });
      }
      const firstH1 = h1s.first().text().trim();
      if (firstH1.length > 70) {
        push("warning", {
          type: "h1_too_long",
          label: "Titre H1 trop long",
          value: firstH1.length,
          impact:
            "Un H1 trop long dilue le mot-clé principal et nuit à la lisibilité.",
          explanation: `Le H1 fait ${firstH1.length} caractères (recommandé : moins de 70).`,
          action: "Raccourcir le H1 à moins de 70 caractères.",
        });
      }
    }

    // -------- 4. Hiérarchie Hn --------
    const hasH2 = $("h2").length > 0;
    const hasH3 = $("h3").length > 0;
    if (hasH3 && !hasH2) {
      push("warning", {
        type: "heading_hierarchy_skip",
        label: "Hiérarchie de titres incohérente",
        value: true,
        impact:
          "Un H3 sans H2 casse la structure logique du contenu pour les moteurs et lecteurs d'écran.",
        explanation: "La page contient des H3 mais aucun H2.",
        action: "Respecter l'ordre hiérarchique des titres (H1 > H2 > H3).",
      });
    }
    if (hasH2 && h1Count === 0) {
      push("critical", {
        type: "heading_hierarchy_no_h1",
        label: "H2 présent sans H1",
        value: true,
        impact:
          "Une structure de titres sans H1 désoriente les moteurs de recherche.",
        explanation: "La page contient des H2 mais aucun H1.",
        action: "Ajouter un H1 en tête de la hiérarchie de titres.",
      });
    }

    // -------- 5. Images sans alt / alt génériques --------
    let missingAlt = 0;
    let genericAlt = 0;
    $("img").each((_, el) => {
      const altAttr = $(el).attr("alt");
      if (altAttr === undefined || altAttr.trim() === "") {
        missingAlt += 1;
      } else if (GENERIC_ALT.has(altAttr.trim().toLowerCase())) {
        genericAlt += 1;
      }
    });
    if (missingAlt > 0) {
      push("warning", {
        type: "images_missing_alt",
        label: "Images sans attribut alt",
        value: missingAlt,
        impact:
          "Les images sans texte alternatif sont invisibles pour Google Images et les lecteurs d'écran.",
        explanation: `${missingAlt} image(s) n'ont pas d'attribut alt renseigné.`,
        action: "Ajouter un attribut alt descriptif à chaque image.",
      });
    }
    if (genericAlt > 0) {
      push("warning", {
        type: "images_generic_alt",
        label: "Images avec alt générique",
        value: genericAlt,
        impact:
          "Des textes alternatifs génériques n'apportent aucune valeur SEO ou d'accessibilité.",
        explanation: `${genericAlt} image(s) utilisent un alt générique (image, photo, logo...).`,
        action: "Remplacer les alt génériques par des descriptions précises.",
      });
    }

    // -------- 6. Canonical --------
    const canonical = ($('link[rel="canonical"]').attr("href") ?? "").trim();
    if (!canonical) {
      push("warning", {
        type: "missing_canonical",
        label: "Balise canonical absente",
        value: false,
        impact:
          "Sans canonical, Google peut indexer des versions dupliquées de la page.",
        explanation: "La balise <link rel=\"canonical\"> n'est pas présente.",
        action: "Ajouter une balise canonical pointant vers l'URL préférée.",
      });
    } else {
      let canonicalAbsolute = canonical;
      try {
        canonicalAbsolute = new URL(canonical, finalUrl).toString();
      } catch {
        canonicalAbsolute = canonical;
      }
      if (normalizeUrl(canonicalAbsolute) !== normalizeUrl(finalUrl)) {
        push("warning", {
          type: "canonical_mismatch",
          label: "Canonical pointe vers une autre URL",
          value: canonicalAbsolute,
          impact:
            "La page indique qu'une autre URL est la version canonique, elle pourrait ne pas être indexée.",
          explanation: `Canonical : « ${canonicalAbsolute} » ≠ URL : « ${finalUrl} ».`,
          action: "Vérifier que la balise canonical pointe bien vers cette page.",
        });
      }
    }

    // -------- 7. Robots meta --------
    const robotsMeta = ($('meta[name="robots"]').attr("content") ?? "")
      .toLowerCase();
    if (robotsMeta.includes("noindex")) {
      push("critical", {
        type: "noindex_detected",
        label: "Directive noindex détectée",
        value: true,
        impact: "La page demande explicitement à ne pas être indexée par Google.",
        explanation: `La balise meta robots contient « noindex » (valeur : ${robotsMeta}).`,
        action: "Retirer « noindex » si la page doit apparaître dans les résultats.",
      });
    }
    if (robotsMeta.includes("nofollow")) {
      push("warning", {
        type: "nofollow_detected",
        label: "Directive nofollow détectée",
        value: true,
        impact:
          "Les liens de la page ne transmettent pas d'autorité (« jus de lien »).",
        explanation: `La balise meta robots contient « nofollow » (valeur : ${robotsMeta}).`,
        action: "Retirer « nofollow » si les liens doivent être suivis.",
      });
    }

    // -------- 8. Open Graph --------
    const ogTitle = ($('meta[property="og:title"]').attr("content") ?? "").trim();
    const ogDesc = ($('meta[property="og:description"]').attr("content") ?? "").trim();
    const ogImage = ($('meta[property="og:image"]').attr("content") ?? "").trim();
    const ogUrl = ($('meta[property="og:url"]').attr("content") ?? "").trim();
    if (!ogTitle) {
      push("warning", {
        type: "missing_og_title",
        label: "Open Graph og:title absent",
        value: false,
        impact:
          "Sans og:title, le titre affiché lors des partages sur les réseaux sociaux est imprévisible.",
        action: "Ajouter une balise <meta property=\"og:title\">.",
      });
    }
    if (!ogDesc) {
      push("warning", {
        type: "missing_og_description",
        label: "Open Graph og:description absent",
        value: false,
        impact:
          "Sans og:description, l'aperçu des partages sociaux manque de description.",
        action: "Ajouter une balise <meta property=\"og:description\">.",
      });
    }
    if (!ogImage) {
      push("warning", {
        type: "missing_og_image",
        label: "Open Graph og:image absent",
        value: false,
        impact:
          "Sans og:image, les partages sociaux n'affichent pas de visuel, réduisant l'engagement.",
        action: "Ajouter une balise <meta property=\"og:image\"> (1200x630px).",
      });
    }
    if (!ogUrl) {
      push("info", {
        type: "missing_og_url",
        label: "Open Graph og:url absent",
        value: false,
        impact:
          "L'absence d'og:url peut entraîner une URL canonique sociale ambiguë.",
        action: "Ajouter une balise <meta property=\"og:url\">.",
      });
    }
    if (ogTitle && ogDesc && ogImage && ogUrl) {
      push("info", {
        type: "og_complete",
        label: "Open Graph complet",
        value: true,
        impact:
          "Toutes les balises Open Graph principales sont présentes pour un partage social optimal.",
      });
    }

    // -------- 9. Twitter Card --------
    const twitterCard = (
      $('meta[name="twitter:card"]').attr("content") ?? ""
    ).trim();
    if (!twitterCard) {
      push("info", {
        type: "missing_twitter_card",
        label: "Twitter Card absente",
        value: false,
        impact:
          "Sans Twitter Card, l'aperçu des partages sur X/Twitter est moins riche.",
        action: "Ajouter une balise <meta name=\"twitter:card\"> (ex. summary_large_image).",
      });
    } else {
      push("info", {
        type: "twitter_card_present",
        label: "Twitter Card présente",
        value: twitterCard,
        impact: "La page définit un format d'aperçu pour les partages sur X/Twitter.",
      });
    }

    // -------- 10. Hreflang --------
    const htmlLang = ($("html").attr("lang") ?? "").trim();
    const hreflangCount = $('link[rel="alternate"][hreflang]').length;
    if (htmlLang.includes("-")) {
      if (hreflangCount > 0) {
        push("info", {
          type: "hreflang_present",
          label: "Balises hreflang présentes",
          value: hreflangCount,
          impact:
            "Les balises hreflang aident Google à servir la bonne version linguistique aux utilisateurs.",
          explanation: `${hreflangCount} balise(s) hreflang détectée(s) pour la langue « ${htmlLang} ».`,
        });
      } else {
        push("warning", {
          type: "missing_hreflang",
          label: "Balises hreflang absentes",
          value: false,
          impact:
            "Un site régionalisé sans hreflang risque d'afficher la mauvaise version linguistique.",
          explanation: `L'attribut lang « ${htmlLang} » suggère un ciblage régional sans balise hreflang.`,
          action: "Ajouter des balises <link rel=\"alternate\" hreflang=\"...\">.",
        });
      }
    } else if (hreflangCount > 0) {
      push("info", {
        type: "hreflang_present",
        label: "Balises hreflang présentes",
        value: hreflangCount,
        impact:
          "Les balises hreflang aident Google à servir la bonne version linguistique.",
        explanation: `${hreflangCount} balise(s) hreflang détectée(s).`,
      });
    }

    // -------- 16. Schema.org (JSON-LD) --------
    const schemaTypes = new Set<string>();
    $('script[type="application/ld+json"]').each((_, el) => {
      const raw = $(el).contents().text().trim();
      if (!raw) return;
      try {
        const parsed: unknown = JSON.parse(raw);
        collectSchemaTypes(parsed, schemaTypes);
      } catch {
        // JSON-LD invalide : ignoré pour l'extraction des types
      }
    });
    if (schemaTypes.size > 0) {
      push("info", {
        type: "schema_found",
        label: "Données structurées Schema.org détectées",
        value: Array.from(schemaTypes).join(", "),
        impact:
          "Les données structurées permettent d'obtenir des résultats enrichis (rich snippets).",
        explanation: `Types détectés : ${Array.from(schemaTypes).join(", ")}.`,
      });
    } else {
      push("warning", {
        type: "schema_missing",
        label: "Aucune donnée structurée Schema.org",
        value: false,
        impact:
          "Sans données structurées, la page ne peut pas bénéficier des résultats enrichis.",
        action:
          "Ajouter du balisage JSON-LD Schema.org (ex. Organization, WebSite, Article).",
      });
    }

    // -------- 17. URL propre --------
    let parsedUrl: URL | null = null;
    try {
      parsedUrl = new URL(finalUrl);
    } catch {
      parsedUrl = null;
    }
    if (parsedUrl) {
      const hasUtm = Array.from(parsedUrl.searchParams.keys()).some((k) =>
        k.toLowerCase().startsWith("utm_"),
      );
      if (hasUtm) {
        push("warning", {
          type: "url_has_utm_params",
          label: "Paramètres UTM dans l'URL",
          value: parsedUrl.search,
          impact:
            "Les paramètres UTM dans l'URL canonique créent des doublons d'indexation.",
          action: "Retirer les paramètres UTM des URL indexables.",
        });
      }
      if (parsedUrl.pathname.includes("_")) {
        push("warning", {
          type: "url_has_underscores",
          label: "Underscores dans l'URL",
          value: parsedUrl.pathname,
          impact:
            "Google recommande les tirets plutôt que les underscores comme séparateurs de mots.",
          action: "Remplacer les underscores par des tirets dans les URL.",
        });
      }
      const depth = parsedUrl.pathname
        .split("/")
        .filter((seg) => seg.length > 0).length;
      if (depth > 4) {
        push("warning", {
          type: "url_too_deep",
          label: "URL trop profonde",
          value: depth,
          impact:
            "Une URL trop profonde dilue l'autorité et complique l'exploration par les robots.",
          explanation: `L'URL contient ${depth} segments de chemin (recommandé : 4 maximum).`,
          action: "Aplatir l'arborescence des URL.",
        });
      }
    }

    // -------- 12. sitemap.xml & 13. robots.txt & 15. liens internes (en parallèle) --------
    const [sitemap, robotsTxt, brokenLinks] = await Promise.all([
      checkSitemap(origin),
      checkRobotsTxt(origin),
      checkInternalLinks($, finalUrl),
    ]);
    if (sitemap) push(sitemap.severity, sitemap.input);
    for (const r of robotsTxt) push(r.severity, r.input);
    if (brokenLinks) push(brokenLinks.severity, brokenLinks.input);

    return { module: MODULE, score: 0, results };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Erreur inconnue lors de l'audit SEO.";
    return { module: MODULE, score: 0, results: [], error: message };
  }
}

function collectSchemaTypes(node: unknown, acc: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectSchemaTypes(item, acc);
    return;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    const t = obj["@type"];
    if (typeof t === "string") {
      acc.add(t);
    } else if (Array.isArray(t)) {
      for (const v of t) if (typeof v === "string") acc.add(v);
    }
    const graph = obj["@graph"];
    if (graph !== undefined) collectSchemaTypes(graph, acc);
  }
}

type CheckOutput = { severity: Severity; input: Omit<ResultInput, "severity"> };

async function checkSitemap(origin: string): Promise<CheckOutput | null> {
  try {
    const res = await fetchWithTimeout(`${origin}/sitemap.xml`, 5000, "GET");
    if (res.ok) {
      return {
        severity: "info",
        input: {
          type: "sitemap_found",
          label: "Sitemap XML trouvé",
          value: `${origin}/sitemap.xml`,
          impact:
            "Le sitemap aide Google à découvrir et explorer toutes les pages du site.",
        },
      };
    }
    return {
      severity: "warning",
      input: {
        type: "sitemap_missing",
        label: "Sitemap XML introuvable",
        value: res.status,
        impact:
          "Sans sitemap, Google peut explorer le site moins efficacement.",
        explanation: `${origin}/sitemap.xml a renvoyé le statut ${res.status}.`,
        action: "Créer un sitemap.xml et le déclarer dans la Search Console.",
      },
    };
  } catch {
    return {
      severity: "warning",
      input: {
        type: "sitemap_missing",
        label: "Sitemap XML introuvable",
        value: false,
        impact:
          "Sans sitemap, Google peut explorer le site moins efficacement.",
        explanation: `Impossible de récupérer ${origin}/sitemap.xml.`,
        action: "Créer un sitemap.xml et le déclarer dans la Search Console.",
      },
    };
  }
}

async function checkRobotsTxt(origin: string): Promise<CheckOutput[]> {
  try {
    const res = await fetchWithTimeout(`${origin}/robots.txt`, 5000, "GET");
    if (!res.ok) {
      return [
        {
          severity: "warning",
          input: {
            type: "robots_missing",
            label: "Fichier robots.txt introuvable",
            value: res.status,
            impact:
              "Sans robots.txt, vous ne contrôlez pas l'exploration et l'emplacement du sitemap.",
            explanation: `${origin}/robots.txt a renvoyé le statut ${res.status}.`,
            action: "Créer un fichier robots.txt à la racine du domaine.",
          },
        },
      ];
    }
    const body = await res.text();
    const out: CheckOutput[] = [
      {
        severity: "info",
        input: {
          type: "robots_found",
          label: "Fichier robots.txt trouvé",
          value: `${origin}/robots.txt`,
          impact:
            "Le fichier robots.txt contrôle l'exploration du site par les robots.",
        },
      },
    ];
    if (!body.toLowerCase().includes("user-agent:")) {
      out.push({
        severity: "warning",
        input: {
          type: "robots_malformed",
          label: "robots.txt mal formé",
          value: false,
          impact:
            "Un robots.txt sans directive « User-agent: » est invalide et ignoré par les robots.",
          explanation: "Aucune directive « User-agent: » trouvée dans le fichier.",
          action: "Ajouter au moins une directive « User-agent: » dans robots.txt.",
        },
      });
    }
    return out;
  } catch {
    return [
      {
        severity: "warning",
        input: {
          type: "robots_missing",
          label: "Fichier robots.txt introuvable",
          value: false,
          impact:
            "Sans robots.txt, vous ne contrôlez pas l'exploration et l'emplacement du sitemap.",
          explanation: `Impossible de récupérer ${origin}/robots.txt.`,
          action: "Créer un fichier robots.txt à la racine du domaine.",
        },
      },
    ];
  }
}

async function checkInternalLinks(
  $: cheerio.CheerioAPI,
  baseUrl: string,
): Promise<CheckOutput | null> {
  const seen = new Set<string>();
  const internalLinks: string[] = [];
  $("a[href]").each((_, el) => {
    if (internalLinks.length >= 10) return;
    const href = $(el).attr("href");
    if (!href) return;
    const trimmed = href.trim();
    if (
      trimmed === "" ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("mailto:") ||
      trimmed.startsWith("tel:") ||
      trimmed.startsWith("javascript:")
    ) {
      return;
    }
    let absolute: string;
    try {
      absolute = new URL(trimmed, baseUrl).toString();
    } catch {
      return;
    }
    if (!sameOrigin(absolute, baseUrl)) return;
    const key = normalizeUrl(absolute);
    if (seen.has(key)) return;
    seen.add(key);
    internalLinks.push(absolute);
  });

  if (internalLinks.length === 0) return null;

  const statuses = await Promise.all(
    internalLinks.map(async (link) => {
      try {
        const res = await fetchWithTimeout(link, 4000, "GET");
        return res.status;
      } catch {
        return 0;
      }
    }),
  );

  const broken = statuses.filter((s) => s === 404).length;
  if (broken > 0) {
    return {
      severity: "warning",
      input: {
        type: "broken_internal_links",
        label: "Liens internes brisés",
        value: broken,
        impact:
          "Les liens internes en 404 nuisent à l'expérience utilisateur et gaspillent le budget de crawl.",
        explanation: `${broken} lien(s) interne(s) sur ${internalLinks.length} testés renvoient une erreur 404.`,
        action: "Corriger ou supprimer les liens internes brisés.",
      },
    };
  }
  return null;
}
