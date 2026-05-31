import * as cheerio from "cheerio";
import { CRAWLER_USER_AGENT, FETCH_TIMEOUT_MS, STOPWORDS_FR, STOPWORDS_EN, CONTENT_WORD_COUNT, CONTENT_TEXT_RATIO, KEYWORD_DENSITY } from "../constants";
import type { AuditResult, ModuleResult, Severity } from "../types";

const MODULE = "content" as const;

const MAIN_CONTENT_EXCLUDE =
  "nav, header, footer, aside, script, style, noscript, [role=\"navigation\"], [role=\"banner\"], [role=\"contentinfo\"]";

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
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(target, {
      method: "GET",
      headers: { "User-Agent": CRAWLER_USER_AGENT },
      redirect: "follow",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Tokenise un texte : minuscules, retrait de la ponctuation, split sur
 * espaces/ponctuation, filtre des tokens vides et de longueur < 2.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFC")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2);
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function hostOf(raw: string, base: string): string | null {
  try {
    return new URL(raw, base).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export async function auditContent(url: string): Promise<ModuleResult> {
  const results: AuditResult[] = [];
  const push = (severity: Severity, input: Omit<ResultInput, "severity">) =>
    results.push(makeResult({ severity, ...input }));

  try {
    const response = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
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

    // -------- Extraction du contenu principal --------
    const main = $("body").clone();
    main.find(MAIN_CONTENT_EXCLUDE).remove();
    const mainText = main.text().replace(/\s+/g, " ").trim();

    const title = ($("head > title").first().text() ?? "").trim();
    const metaDesc = ($('meta[name="description"]').attr("content") ?? "").trim();
    const h1 = ($("h1").first().text() ?? "").trim();

    const titleLower = title.toLowerCase();
    const metaDescLower = metaDesc.toLowerCase();
    const h1Lower = h1.toLowerCase();

    // ============================================================
    // QUALITÉ
    // ============================================================

    // -------- 1. Nombre de mots du contenu principal --------
    const tokens = tokenize(mainText);
    const wordCount = tokens.length;
    if (wordCount < CONTENT_WORD_COUNT.critical) {
      push("critical", {
        type: "content_too_short",
        label: "Contenu trop court",
        value: wordCount,
        impact:
          "Les pages avec moins de 300 mots sont rarement bien classées par Google",
        explanation: `Le contenu principal ne contient que ${wordCount} mots (recommandé : plus de 600).`,
        action: "Étoffer le contenu de la page avec au moins 600 mots utiles et originaux.",
      });
    } else if (wordCount <= CONTENT_WORD_COUNT.warning) {
      push("warning", {
        type: "content_short",
        label: "Contenu un peu court",
        value: wordCount,
        impact:
          "Les pages avec moins de 300 mots sont rarement bien classées par Google",
        explanation: `Le contenu principal contient ${wordCount} mots (recommandé : plus de 600).`,
        action: "Enrichir le contenu pour dépasser 600 mots.",
      });
    } else {
      push("info", {
        type: "content_ok",
        label: "Volume de contenu suffisant",
        value: wordCount,
        impact:
          "Les pages avec moins de 300 mots sont rarement bien classées par Google",
        explanation: `Le contenu principal contient ${wordCount} mots.`,
      });
    }

    // -------- 2. Ratio texte / HTML --------
    const htmlLength = html.length;
    const textLength = mainText.length;
    const ratio = htmlLength > 0 ? textLength / htmlLength : 0;
    const ratioRounded = round(ratio, 2);
    if (ratio < CONTENT_TEXT_RATIO.poor) {
      push("warning", {
        type: "text_ratio_poor",
        label: "Ratio texte/HTML faible",
        value: ratioRounded,
        impact:
          "Un faible ratio texte/HTML peut signaler à Google une page pauvre en contenu ou trop lourde en code",
        explanation: `Le ratio texte/HTML est de ${ratioRounded} (recommandé : plus de 0,25).`,
        action: "Réduire le code superflu et augmenter la part de contenu textuel.",
      });
    } else if (ratio <= CONTENT_TEXT_RATIO.good) {
      push("info", {
        type: "text_ratio_medium",
        label: "Ratio texte/HTML moyen",
        value: ratioRounded,
        impact:
          "Un ratio texte/HTML moyen reste acceptable mais peut être amélioré",
        explanation: `Le ratio texte/HTML est de ${ratioRounded}.`,
      });
    } else {
      push("info", {
        type: "text_ratio_good",
        label: "Ratio texte/HTML satisfaisant",
        value: ratioRounded,
        impact:
          "Un bon ratio texte/HTML indique une page riche en contenu pertinent",
        explanation: `Le ratio texte/HTML est de ${ratioRounded}.`,
      });
    }

    // -------- 3. Title == meta description (duplication) --------
    if (title && metaDesc && title === metaDesc) {
      push("critical", {
        type: "title_equals_meta_description",
        label: "Title identique à la méta-description",
        value: true,
        impact:
          "Duplication entre title et meta description pénalise le CTR et le SEO",
        explanation:
          "La balise <title> et la méta-description ont exactement le même contenu.",
        action: "Rédiger une méta-description distincte et complémentaire du titre.",
      });
    }

    // -------- 4. Title == H1 --------
    if (title && h1 && title === h1) {
      push("warning", {
        type: "title_equals_h1",
        label: "Title identique au H1",
        value: true,
        impact:
          "Un title strictement identique au H1 gâche une occasion de varier les formulations et mots-clés",
        explanation: "La balise <title> et le H1 sont strictement identiques.",
        action: "Différencier le title et le H1 pour couvrir davantage de requêtes.",
      });
    }

    // ============================================================
    // KEYWORD
    // ============================================================

    // -------- 5. Détection du keyword principal --------
    const stopwords = new Set<string>([...STOPWORDS_FR, ...STOPWORDS_EN]);
    const frequencies = new Map<string, number>();
    for (const token of tokens) {
      if (token.length < 4) continue;
      if (stopwords.has(token)) continue;
      frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    }

    let keyword: string | null = null;
    let keywordCount = 0;
    for (const [word, count] of frequencies) {
      if (count > keywordCount) {
        keyword = word;
        keywordCount = count;
      }
    }
    // Min 2 occurrences (min 4 chars déjà filtré)
    if (keyword === null || keywordCount < 2) {
      keyword = null;
      keywordCount = 0;
    }

    if (keyword !== null) {
      push("info", {
        type: "keyword_detected",
        label: "Keyword principal détecté",
        value: keyword,
        impact:
          "Identifier le mot-clé dominant permet de vérifier sa présence dans les zones SEO clés",
        explanation: `Le mot-clé « ${keyword} » apparaît ${keywordCount} fois dans le contenu principal.`,
      });

      // -------- 6. Densité keyword --------
      const density = wordCount > 0 ? keywordCount / wordCount : 0;
      const densityRounded = round(density, 4);
      if (density < KEYWORD_DENSITY.tooLow) {
        push("warning", {
          type: "keyword_density_low",
          label: "Densité du mot-clé trop faible",
          value: densityRounded,
          impact:
            "Une densité de mot-clé trop faible peut indiquer un contenu mal ciblé pour ce terme",
          explanation: `La densité du mot-clé « ${keyword} » est de ${densityRounded} (recommandé : entre 0,005 et 0,05).`,
          action: "Utiliser le mot-clé principal de manière plus régulière et naturelle.",
        });
      } else if (density > KEYWORD_DENSITY.tooHigh) {
        push("warning", {
          type: "keyword_density_high",
          label: "Densité du mot-clé trop élevée",
          value: densityRounded,
          impact:
            "Une densité de mot-clé trop élevée peut être perçue comme du bourrage de mots-clés (keyword stuffing)",
          explanation: `La densité du mot-clé « ${keyword} » est de ${densityRounded} (recommandé : entre 0,005 et 0,05).`,
          action: "Réduire les répétitions du mot-clé et varier le vocabulaire.",
        });
      } else {
        push("info", {
          type: "keyword_density_ok",
          label: "Densité du mot-clé optimale",
          value: densityRounded,
          impact:
            "Une densité de mot-clé équilibrée favorise un ciblage clair sans sur-optimisation",
          explanation: `La densité du mot-clé « ${keyword} » est de ${densityRounded}.`,
        });
      }

      // -------- 7. Keyword dans le title --------
      if (!titleLower.includes(keyword)) {
        push("critical", {
          type: "keyword_missing_from_title",
          label: "Mot-clé absent du title",
          value: keyword,
          impact:
            "Le keyword absent du title est un signal SEO manqué majeur",
          explanation: `Le mot-clé principal « ${keyword} » n'apparaît pas dans la balise <title>.`,
          action: "Intégrer le mot-clé principal dans le title de la page.",
        });
      }

      // -------- 8. Keyword dans le H1 --------
      if (!h1Lower.includes(keyword)) {
        push("warning", {
          type: "keyword_missing_from_h1",
          label: "Mot-clé absent du H1",
          value: keyword,
          impact:
            "Le keyword absent du H1 affaiblit la cohérence sémantique de la page",
          explanation: `Le mot-clé principal « ${keyword} » n'apparaît pas dans le H1.`,
          action: "Intégrer le mot-clé principal dans le titre H1.",
        });
      }

      // -------- 9. Keyword dans la méta-description --------
      if (!metaDescLower.includes(keyword)) {
        push("warning", {
          type: "keyword_missing_from_meta_description",
          label: "Mot-clé absent de la méta-description",
          value: keyword,
          impact:
            "Le keyword absent de la méta-description réduit la pertinence perçue dans les résultats de recherche",
          explanation: `Le mot-clé principal « ${keyword} » n'apparaît pas dans la méta-description.`,
          action: "Intégrer le mot-clé principal dans la méta-description.",
        });
      }
    }

    // ============================================================
    // STRUCTURE
    // ============================================================

    // -------- 10. Présence de listes --------
    const listCount = $("ul, ol").length;
    if (listCount > 0) {
      push("info", {
        type: "lists_present",
        label: "Listes présentes",
        value: listCount,
        impact:
          "Les listes structurent le contenu et améliorent la lisibilité ainsi que les chances d'extraits enrichis",
        explanation: `${listCount} liste(s) <ul>/<ol> détectée(s).`,
      });
    } else {
      push("info", {
        type: "lists_missing",
        label: "Aucune liste détectée",
        value: false,
        impact:
          "L'absence de listes peut rendre le contenu moins scannable pour les visiteurs",
        action: "Utiliser des listes à puces ou numérotées pour aérer le contenu.",
      });
    }

    // -------- 11. Présence de texte en gras --------
    const boldCount = $("strong, b").length;
    if (boldCount > 0) {
      push("info", {
        type: "bold_text_present",
        label: "Texte en gras présent",
        value: boldCount,
        impact:
          "Le texte en gras met en valeur les points importants et facilite la lecture en diagonale",
        explanation: `${boldCount} élément(s) <strong>/<b> détecté(s).`,
      });
    } else {
      push("info", {
        type: "bold_text_missing",
        label: "Aucun texte en gras",
        value: false,
        impact:
          "L'absence de mise en gras peut nuire à la mise en évidence des informations clés",
        action: "Mettre en gras les passages et mots-clés importants.",
      });
    }

    // -------- 12. Longueur moyenne des paragraphes --------
    const paragraphWordCounts: number[] = [];
    $("p").each((_, el) => {
      const pText = $(el).text().replace(/\s+/g, " ").trim();
      if (pText.length === 0) return;
      const count = tokenize(pText).length;
      if (count > 0) paragraphWordCounts.push(count);
    });
    if (paragraphWordCounts.length > 0) {
      const totalParaWords = paragraphWordCounts.reduce((a, b) => a + b, 0);
      const avgParaWords = totalParaWords / paragraphWordCounts.length;
      if (avgParaWords > 300) {
        push("warning", {
          type: "paragraphs_too_long",
          label: "Paragraphes trop longs",
          value: Math.round(avgParaWords),
          impact:
            "Les paragraphes trop longs réduisent la lisibilité et le temps passé sur la page",
          explanation: `La longueur moyenne des paragraphes est de ${Math.round(
            avgParaWords,
          )} mots (recommandé : moins de 300).`,
          action: "Découper les longs paragraphes en blocs plus courts.",
        });
      }
    }

    // -------- 13. Présence d'un blog / section articles --------
    const hasArticle = $("article").length > 0;
    const hasBlogClass =
      $('[class*="blog" i], [class*="article" i], [id*="blog" i]').length > 0;
    let urlMentionsBlog = false;
    try {
      const path = new URL(finalUrl).pathname.toLowerCase();
      urlMentionsBlog = path.includes("/blog") || path.includes("/articles");
    } catch {
      urlMentionsBlog = false;
    }
    if (hasArticle || hasBlogClass || urlMentionsBlog) {
      push("info", {
        type: "blog_detected",
        label: "Blog / section articles détecté",
        value: true,
        impact:
          "La présence d'un blog ou de contenus éditoriaux renforce le maillage interne et l'autorité thématique",
        explanation: "Des éléments <article> ou une section blog/articles ont été détectés.",
      });
    } else {
      push("info", {
        type: "blog_missing",
        label: "Aucun blog ou section articles",
        value: false,
        impact:
          "L'absence de contenu éditorial régulier limite les opportunités de référencement sur de nouvelles requêtes",
        action: "Envisager la création d'un blog pour publier du contenu régulier.",
      });
    }

    // -------- 14 & 15. Liens externes (count + nofollow/dofollow) --------
    let currentHost: string | null;
    try {
      currentHost = new URL(finalUrl).hostname.toLowerCase();
    } catch {
      currentHost = null;
    }

    let externalCount = 0;
    let externalNofollow = 0;
    $("a[href]").each((_, el) => {
      const href = ($(el).attr("href") ?? "").trim();
      if (
        href === "" ||
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href.startsWith("javascript:")
      ) {
        return;
      }
      const linkHost = hostOf(href, finalUrl);
      if (linkHost === null || currentHost === null) return;
      if (linkHost === currentHost) return;
      externalCount += 1;
      const rel = ($(el).attr("rel") ?? "").toLowerCase();
      if (rel.includes("nofollow")) externalNofollow += 1;
    });

    // -------- 14. Liens externes --------
    push("info", {
      type: "external_links_count",
      label: "Liens externes",
      value: externalCount,
      impact:
        "Les liens externes vers des sources fiables peuvent renforcer la crédibilité du contenu",
      explanation: `${externalCount} lien(s) externe(s) détecté(s).`,
    });

    // -------- 15. Nofollow vs dofollow --------
    if (externalCount > 3) {
      if (externalNofollow === 0) {
        push("info", {
          type: "external_links_all_dofollow",
          label: "Tous les liens externes sont en dofollow",
          value: externalCount,
          impact:
            "Tous les liens externes transmettent de l'autorité ; vérifier qu'aucun ne pointe vers un site indésirable",
          explanation: `Les ${externalCount} liens externes sont tous en dofollow.`,
          action: "Ajouter rel=\"nofollow\" sur les liens commerciaux ou non vérifiés.",
        });
      } else {
        push("info", {
          type: "external_links_mixed",
          label: "Liens externes mixtes (nofollow/dofollow)",
          value: externalNofollow,
          impact:
            "Un mélange de liens nofollow et dofollow reflète une gestion maîtrisée du jus de lien sortant",
          explanation: `${externalNofollow} lien(s) externe(s) en nofollow sur ${externalCount} au total.`,
        });
      }
    }

    return { module: MODULE, score: 0, results };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Erreur inconnue lors de l'audit du contenu.";
    return { module: MODULE, score: 0, results: [], error: message };
  }
}
