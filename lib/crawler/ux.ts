import * as cheerio from "cheerio";
import { CRAWLER_USER_AGENT, FETCH_TIMEOUT_MS } from "../constants";
import type {
  AuditResult,
  ModuleResult,
  PageSpeedResult,
  Severity,
} from "../types";

const MODULE = "ux" as const;

const NON_DESCRIPTIVE_LINK_TEXTS = new Set([
  "cliquez ici",
  "ici",
  "lire la suite",
  "click here",
  "here",
  "read more",
  "en savoir plus",
]);

const SKIP_NAV_TARGETS = new Set(["#main", "#content", "#maincontent"]);

const BACK_TO_TOP_HREFS = new Set(["#top", "#header"]);
const BACK_TO_TOP_TEXTS = ["retour en haut", "back to top"];

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

type CheckOutput = { severity: Severity; input: Omit<ResultInput, "severity"> };

export async function auditUx(
  url: string,
  pagespeed?: PageSpeedResult | null,
): Promise<ModuleResult> {
  const results: AuditResult[] = [];
  const push = (severity: Severity, input: Omit<ResultInput, "severity">) =>
    results.push(makeResult({ severity, ...input }));

  try {
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

    // -------- MOBILE --------

    // 1. Viewport meta
    const viewport = ($('meta[name="viewport"]').attr("content") ?? "").trim();
    if (!viewport) {
      push("critical", {
        type: "missing_viewport",
        label: "Balise viewport absente",
        value: false,
        impact:
          "Sans balise viewport, le site s'affiche en mode bureau sur mobile et devient illisible.",
        explanation:
          "La balise <meta name=\"viewport\"> est indispensable pour un affichage responsive.",
        action:
          "Ajouter <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">.",
      });
    } else if (!viewport.toLowerCase().includes("width=device-width")) {
      push("warning", {
        type: "viewport_incorrect",
        label: "Balise viewport mal configurée",
        value: viewport,
        impact:
          "Un viewport sans width=device-width empêche l'adaptation correcte à la largeur de l'écran.",
        explanation: `La balise viewport (« ${viewport} ») ne contient pas width=device-width.`,
        action: "Ajouter width=device-width à la balise viewport.",
      });
    } else {
      push("info", {
        type: "viewport_ok",
        label: "Balise viewport correcte",
        value: viewport,
        impact:
          "La page est configurée pour un affichage responsive adapté aux mobiles.",
      });
    }

    // 2. Score mobile PageSpeed
    if (pagespeed) {
      const mobileScore = pagespeed.mobile.score;
      if (mobileScore < 50) {
        push("critical", {
          type: "mobile_score_poor",
          label: "Performance mobile très faible",
          value: mobileScore,
          impact:
            "Une performance mobile médiocre fait fuir les visiteurs et pénalise le référencement mobile.",
          explanation: `Le score PageSpeed mobile est de ${mobileScore}/100 (faible : < 50).`,
          action:
            "Optimiser les images, le JavaScript et le temps de réponse serveur pour mobile.",
        });
      } else if (mobileScore < 80) {
        push("warning", {
          type: "mobile_score_needs_improvement",
          label: "Performance mobile à améliorer",
          value: mobileScore,
          impact:
            "Une performance mobile moyenne dégrade l'expérience et le taux de conversion sur mobile.",
          explanation: `Le score PageSpeed mobile est de ${mobileScore}/100 (à améliorer : 50-79).`,
          action:
            "Réduire le poids de la page et différer les ressources non critiques.",
        });
      } else {
        push("info", {
          type: "mobile_score_good",
          label: "Bonne performance mobile",
          value: mobileScore,
          impact:
            "La page offre une bonne expérience de chargement sur les appareils mobiles.",
        });
      }
    }

    // -------- ACCESSIBILITÉ --------

    // 3. Favicon
    const hasFavicon =
      $('link[rel="icon"]').length > 0 ||
      $('link[rel="shortcut icon"]').length > 0;
    if (!hasFavicon) {
      push("warning", {
        type: "missing_favicon",
        label: "Favicon absent",
        value: false,
        impact:
          "L'absence de favicon nuit à l'identité de marque et à la reconnaissance dans les onglets et favoris.",
        explanation:
          "Aucune balise <link rel=\"icon\"> ou <link rel=\"shortcut icon\"> n'a été trouvée.",
        action: "Ajouter un favicon via <link rel=\"icon\" href=\"/favicon.ico\">.",
      });
    } else {
      push("info", {
        type: "favicon_present",
        label: "Favicon présent",
        value: true,
        impact:
          "Le site dispose d'un favicon, renforçant son identité visuelle.",
      });
    }

    // 4. Lang HTML
    const htmlLang = ($("html").attr("lang") ?? "").trim();
    if (!htmlLang) {
      push("warning", {
        type: "missing_lang",
        label: "Attribut lang absent",
        value: false,
        impact:
          "Sans attribut lang, les lecteurs d'écran ne savent pas dans quelle langue lire le contenu.",
        explanation: "La balise <html> ne possède pas d'attribut lang.",
        action: "Ajouter un attribut lang à la balise <html> (ex. lang=\"fr\").",
      });
    } else {
      push("info", {
        type: "lang_set",
        label: "Langue du document définie",
        value: htmlLang,
        impact:
          "La langue du document est déclarée, facilitant la lecture par les technologies d'assistance.",
      });
    }

    // 5. Labels de formulaires
    let inputsMissingLabels = 0;
    $("input").each((_, el) => {
      const $el = $(el);
      const inputType = ($el.attr("type") ?? "").trim().toLowerCase();
      if (
        inputType === "hidden" ||
        inputType === "submit" ||
        inputType === "button"
      ) {
        return;
      }
      const ariaLabel = ($el.attr("aria-label") ?? "").trim();
      const ariaLabelledBy = ($el.attr("aria-labelledby") ?? "").trim();
      if (ariaLabel || ariaLabelledBy) return;

      const id = ($el.attr("id") ?? "").trim();
      let hasLabel = false;
      if (id) {
        const escaped = id.replace(/["\\]/g, "\\$&");
        if ($(`label[for="${escaped}"]`).length > 0) {
          hasLabel = true;
        }
      }
      if (!hasLabel && $el.parents("label").length > 0) {
        hasLabel = true;
      }
      if (!hasLabel) inputsMissingLabels += 1;
    });
    if (inputsMissingLabels > 0) {
      push("warning", {
        type: "inputs_missing_labels",
        label: "Champs de formulaire sans label",
        value: inputsMissingLabels,
        impact:
          "Les champs sans label sont inaccessibles aux lecteurs d'écran et compliquent la saisie.",
        explanation: `${inputsMissingLabels} champ(s) de formulaire n'ont ni <label> associé, ni aria-label, ni aria-labelledby.`,
        action:
          "Associer un <label for=\"id\"> ou ajouter un aria-label à chaque champ.",
      });
    }

    // 6. Liens non descriptifs
    let nonDescriptiveLinks = 0;
    $("a").each((_, el) => {
      const text = $(el).text().trim().toLowerCase();
      if (text && NON_DESCRIPTIVE_LINK_TEXTS.has(text)) {
        nonDescriptiveLinks += 1;
      }
    });
    if (nonDescriptiveLinks > 0) {
      push("warning", {
        type: "non_descriptive_links",
        label: "Liens au texte non descriptif",
        value: nonDescriptiveLinks,
        impact:
          "Des libellés comme « cliquez ici » n'informent pas sur la destination et nuisent à l'accessibilité.",
        explanation: `${nonDescriptiveLinks} lien(s) utilisent un texte non descriptif (« cliquez ici », « en savoir plus »...).`,
        action:
          "Reformuler les libellés de liens pour décrire leur destination.",
      });
    }

    // 7. Contraste basique (styles inline)
    let contrastIssues = 0;
    $("[style]").each((_, el) => {
      const style = ($(el).attr("style") ?? "").toLowerCase();
      const whiteText = /color\s*:\s*(white|#fff|#ffffff)/.test(style);
      const whiteBg = /background(?:-color)?\s*:\s*(white|#fff|#ffffff)/.test(
        style,
      );
      const blackText = /color\s*:\s*(black|#000|#000000)/.test(style);
      const blackBg = /background(?:-color)?\s*:\s*(black|#000|#000000)/.test(
        style,
      );
      if ((whiteText && whiteBg) || (blackText && blackBg)) {
        contrastIssues += 1;
      }
    });
    if (contrastIssues > 0) {
      push("warning", {
        type: "potential_contrast_issue",
        label: "Problème de contraste potentiel",
        value: contrastIssues,
        impact:
          "Un texte de la même couleur que son fond est illisible pour tous les utilisateurs.",
        explanation: `${contrastIssues} élément(s) combinent une couleur de texte et de fond identiques en style inline.`,
        action:
          "Vérifier et corriger les couleurs pour garantir un ratio de contraste suffisant (WCAG AA : 4,5:1).",
      });
    }

    // 8. Boutons sans texte
    let buttonsNoText = 0;
    $("button").each((_, el) => {
      const $el = $(el);
      const text = $el.text().trim();
      const ariaLabel = ($el.attr("aria-label") ?? "").trim();
      const title = ($el.attr("title") ?? "").trim();
      if (!text && !ariaLabel && !title) {
        buttonsNoText += 1;
      }
    });
    if (buttonsNoText > 0) {
      push("critical", {
        type: "buttons_no_text",
        label: "Boutons sans intitulé accessible",
        value: buttonsNoText,
        impact:
          "Un bouton sans texte ni aria-label est inutilisable par les lecteurs d'écran.",
        explanation: `${buttonsNoText} bouton(s) n'ont ni texte, ni aria-label, ni title.`,
        action:
          "Ajouter un texte visible ou un aria-label décrivant l'action du bouton.",
      });
    }

    // 9. Skip navigation
    const firstLink = $("a[href]").first();
    const firstLinkHref = (firstLink.attr("href") ?? "").trim().toLowerCase();
    if (firstLink.length > 0 && SKIP_NAV_TARGETS.has(firstLinkHref)) {
      push("info", {
        type: "skip_nav_present",
        label: "Lien d'évitement présent",
        value: firstLinkHref,
        impact:
          "Le lien d'évitement permet aux utilisateurs au clavier d'accéder directement au contenu principal.",
      });
    } else {
      push("info", {
        type: "skip_nav_missing",
        label: "Lien d'évitement absent",
        value: false,
        impact:
          "Un lien « aller au contenu » améliore la navigation au clavier mais n'est pas obligatoire.",
        action:
          "Ajouter un premier lien pointant vers #main ou #content pour faciliter la navigation au clavier.",
      });
    }

    // 10. Focus visible
    let focusOutlineRemoved = false;
    $("style").each((_, el) => {
      const css = $(el).contents().text().toLowerCase();
      if (/outline\s*:\s*(none|0)\b/.test(css)) {
        focusOutlineRemoved = true;
      }
    });
    if (!focusOutlineRemoved) {
      $("[style]").each((_, el) => {
        const style = ($(el).attr("style") ?? "").toLowerCase();
        if (/outline\s*:\s*(none|0)\b/.test(style)) {
          focusOutlineRemoved = true;
        }
      });
    }
    if (focusOutlineRemoved) {
      push("warning", {
        type: "focus_outline_removed",
        label: "Indicateur de focus supprimé",
        value: true,
        impact:
          "Supprimer le contour de focus rend la navigation au clavier impossible à suivre visuellement.",
        explanation:
          "Une règle outline: none ou outline: 0 a été détectée dans les styles.",
        action:
          "Conserver un indicateur de focus visible ou le remplacer par un style alternatif accessible.",
      });
    }

    // 11. Attributs ARIA sur éléments interactifs
    let ariaMissingLabel = 0;
    $('[role="button"], [role="tab"], [role="dialog"]').each((_, el) => {
      const $el = $(el);
      const ariaLabel = ($el.attr("aria-label") ?? "").trim();
      const ariaLabelledBy = ($el.attr("aria-labelledby") ?? "").trim();
      const text = $el.text().trim();
      if (!ariaLabel && !ariaLabelledBy && !text) {
        ariaMissingLabel += 1;
      }
    });
    if (ariaMissingLabel > 0) {
      push("warning", {
        type: "aria_missing_label",
        label: "Éléments ARIA sans intitulé",
        value: ariaMissingLabel,
        impact:
          "Les éléments interactifs ARIA sans label ne sont pas annoncés correctement par les lecteurs d'écran.",
        explanation: `${ariaMissingLabel} élément(s) avec role button/tab/dialog n'ont ni aria-label, ni aria-labelledby, ni texte.`,
        action:
          "Ajouter un aria-label ou un contenu textuel à chaque élément interactif ARIA.",
      });
    }

    // -------- NAVIGATION --------

    // 12. Menu de navigation
    const hasNav =
      $("nav").length > 0 || $('[role="navigation"]').length > 0;
    if (hasNav) {
      push("info", {
        type: "nav_present",
        label: "Menu de navigation présent",
        value: true,
        impact:
          "Une navigation explicite aide les utilisateurs et les robots à parcourir le site.",
      });
    } else {
      push("warning", {
        type: "nav_missing",
        label: "Menu de navigation absent",
        value: false,
        impact:
          "Sans élément de navigation, les visiteurs peinent à se déplacer dans le site.",
        explanation:
          "Aucun élément <nav> ni role=\"navigation\" n'a été détecté.",
        action: "Structurer le menu principal dans une balise <nav>.",
      });
    }

    // 13. Breadcrumb
    const hasBreadcrumb =
      $('[aria-label*="breadcrumb" i]').length > 0 ||
      $('[role="navigation"][aria-label*="bread" i]').length > 0 ||
      $('[class*="breadcrumb" i]').length > 0;
    if (hasBreadcrumb) {
      push("info", {
        type: "breadcrumb_present",
        label: "Fil d'Ariane présent",
        value: true,
        impact:
          "Le fil d'Ariane facilite la navigation et améliore la compréhension de la structure du site.",
      });
    }

    // 14. Footer
    if ($("footer").length > 0 || $('[role="contentinfo"]').length > 0) {
      push("info", {
        type: "footer_present",
        label: "Pied de page présent",
        value: true,
        impact:
          "Le pied de page regroupe les informations secondaires et les liens utiles.",
      });
    } else {
      push("warning", {
        type: "footer_missing",
        label: "Pied de page absent",
        value: false,
        impact:
          "L'absence de pied de page prive les visiteurs d'accès aux informations légales et liens secondaires.",
        explanation: "Aucune balise <footer> n'a été détectée.",
        action:
          "Ajouter un <footer> contenant mentions légales, contact et liens utiles.",
      });
    }

    // 15. Lien de contact détectable
    let hasContactLink = false;
    $("a[href]").each((_, el) => {
      if (hasContactLink) return;
      const $el = $(el);
      const href = ($el.attr("href") ?? "").toLowerCase();
      const text = $el.text().toLowerCase();
      if (href.includes("contact") || text.includes("contact")) {
        hasContactLink = true;
      }
    });
    if (hasContactLink) {
      push("info", {
        type: "contact_link_present",
        label: "Lien de contact détecté",
        value: true,
        impact:
          "Un lien de contact accessible rassure les visiteurs et favorise la conversion.",
      });
    } else {
      push("info", {
        type: "contact_link_missing",
        label: "Lien de contact non détecté",
        value: false,
        impact:
          "Un lien de contact visible améliore la confiance, mais son absence n'est pas bloquante.",
        action: "Ajouter un lien vers une page ou un formulaire de contact.",
      });
    }

    // 17. Lien retour en haut
    let hasBackToTop = false;
    $("a[href]").each((_, el) => {
      if (hasBackToTop) return;
      const $el = $(el);
      const href = ($el.attr("href") ?? "").trim().toLowerCase();
      const text = $el.text().trim().toLowerCase();
      if (
        BACK_TO_TOP_HREFS.has(href) ||
        BACK_TO_TOP_TEXTS.some((t) => text.includes(t))
      ) {
        hasBackToTop = true;
      }
    });
    if (hasBackToTop) {
      push("info", {
        type: "back_to_top_present",
        label: "Lien « retour en haut » présent",
        value: true,
        impact:
          "Un lien de retour en haut améliore la navigation sur les pages longues.",
      });
    }

    // 16. Page 404 custom (fetch secondaire)
    const notFoundCheck = await checkCustom404(origin);
    if (notFoundCheck) push(notFoundCheck.severity, notFoundCheck.input);

    return { module: MODULE, score: 0, results };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Erreur inconnue lors de l'audit UX.";
    return { module: MODULE, score: 0, results: [], error: message };
  }
}

async function checkCustom404(origin: string): Promise<CheckOutput | null> {
  const testUrl = `${origin}/mixea-test-404-page-inexistante-xyz`;
  try {
    const res = await fetchWithTimeout(testUrl, 5000, "GET");
    if (res.status === 200) {
      return {
        severity: "warning",
        input: {
          type: "soft_404_detected",
          label: "Soft 404 détecté",
          value: 200,
          impact:
            "Une page inexistante renvoyant un statut 200 trompe les moteurs et nuit à l'indexation.",
          explanation: `L'URL inexistante « ${testUrl} » a renvoyé un statut 200 au lieu de 404.`,
          action:
            "Configurer le serveur pour renvoyer un vrai statut 404 sur les pages inexistantes.",
        },
      };
    }
    if (res.status === 404) {
      let body = "";
      try {
        body = await res.text();
      } catch {
        body = "";
      }
      if (body.length > 500) {
        return {
          severity: "info",
          input: {
            type: "custom_404_present",
            label: "Page 404 personnalisée présente",
            value: true,
            impact:
              "Une page 404 personnalisée retient les visiteurs et les guide vers le bon contenu.",
            explanation: `L'URL inexistante renvoie un statut 404 avec une page de ${body.length} caractères.`,
          },
        };
      }
      return {
        severity: "info",
        input: {
          type: "custom_404_missing",
          label: "Page 404 personnalisée absente",
          value: false,
          impact:
            "Une page 404 générique offre une moins bonne expérience qu'une page 404 personnalisée.",
          explanation:
            "L'URL inexistante renvoie bien un 404, mais la page est très courte (non personnalisée).",
          action:
            "Créer une page 404 personnalisée avec des liens utiles et une barre de recherche.",
        },
      };
    }
    return null;
  } catch {
    return null;
  }
}
