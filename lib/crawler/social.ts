import * as cheerio from "cheerio";
import { CRAWLER_USER_AGENT, FETCH_TIMEOUT_MS } from "../constants";
import type { AuditResult, ModuleResult, Severity } from "../types";

const MODULE = "social" as const;

const IMAGE_HEAD_TIMEOUT_MS = 5000;

type ResultInput = Omit<AuditResult, "id" | "module">;

type SocialNetwork =
  | "twitter"
  | "linkedin"
  | "instagram"
  | "facebook"
  | "youtube"
  | "tiktok";

const NETWORK_LABELS: Record<SocialNetwork, string> = {
  twitter: "Twitter/X",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  tiktok: "TikTok",
};

const NETWORK_DOMAINS: Record<SocialNetwork, string[]> = {
  twitter: ["twitter.com", "x.com"],
  linkedin: ["linkedin.com"],
  instagram: ["instagram.com"],
  facebook: ["facebook.com"],
  youtube: ["youtube.com"],
  tiktok: ["tiktok.com"],
};

const NETWORK_ORDER: SocialNetwork[] = [
  "twitter",
  "linkedin",
  "instagram",
  "facebook",
  "youtube",
  "tiktok",
];

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

/** Vérifie qu'une URL d'image est accessible via une requête HEAD (statut 200). */
async function isImageAccessible(target: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(target, IMAGE_HEAD_TIMEOUT_MS, "HEAD");
    return res.status === 200;
  } catch {
    return false;
  }
}

/** Résout une URL potentiellement relative en URL absolue par rapport à la page. */
function resolveUrl(raw: string, base: string): string {
  try {
    return new URL(raw, base).href;
  } catch {
    return raw;
  }
}

/** Récupère le hostname (en minuscules, sans « www. ») d'une URL relative ou absolue. */
function hostnameOf(href: string, base: string): string | null {
  try {
    return new URL(href, base).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Indique si un hostname correspond exactement ou en sous-domaine à l'un des domaines fournis. */
function matchesDomain(hostname: string, domains: string[]): boolean {
  return domains.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
}

/**
 * Parcourt récursivement un nœud JSON-LD à la recherche d'un objet
 * dont le @type est « Organization » (y compris dans un @graph ou un tableau).
 */
function findOrganization(node: unknown): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findOrganization(item);
      if (found) return found;
    }
    return null;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    const type = obj["@type"];
    const isOrg =
      (typeof type === "string" && type === "Organization") ||
      (Array.isArray(type) && type.includes("Organization"));
    if (isOrg) return obj;

    const graph = obj["@graph"];
    if (graph !== undefined) {
      const found = findOrganization(graph);
      if (found) return found;
    }
  }
  return null;
}

/** Compte les entrées sameAs (tableau ou chaîne) d'un objet Organization. */
function countSameAs(org: Record<string, unknown>): number {
  const sameAs = org["sameAs"];
  if (Array.isArray(sameAs)) {
    return sameAs.filter((v) => typeof v === "string" && v.trim() !== "").length;
  }
  if (typeof sameAs === "string" && sameAs.trim() !== "") {
    return 1;
  }
  return 0;
}

export async function auditSocial(url: string): Promise<ModuleResult> {
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

    // -------- 1. Liens vers réseaux sociaux --------
    const detectedNetworks = new Map<SocialNetwork, string>();
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      const trimmed = href.trim();
      if (trimmed === "") return;
      const hostname = hostnameOf(trimmed, finalUrl);
      if (!hostname) return;
      for (const network of NETWORK_ORDER) {
        if (detectedNetworks.has(network)) continue;
        if (matchesDomain(hostname, NETWORK_DOMAINS[network])) {
          detectedNetworks.set(network, resolveUrl(trimmed, finalUrl));
        }
      }
    });

    for (const network of NETWORK_ORDER) {
      const link = detectedNetworks.get(network);
      if (link === undefined) continue;
      push("info", {
        type: `social_link_${network}`,
        label: `Lien ${NETWORK_LABELS[network]} présent`,
        value: link,
        impact: `Un lien vers le profil ${NETWORK_LABELS[network]} renforce la présence sociale et la crédibilité de la marque.`,
      });
    }

    const networkCount = detectedNetworks.size;
    if (networkCount === 0) {
      push("warning", {
        type: "no_social_links",
        label: "Aucun lien vers les réseaux sociaux",
        value: 0,
        impact:
          "L'absence de liens vers les réseaux sociaux limite la visibilité de la marque et les signaux sociaux.",
        explanation:
          "Aucun lien vers Twitter/X, LinkedIn, Instagram, Facebook, YouTube ou TikTok n'a été détecté.",
        action:
          "Ajouter des liens vers les profils sociaux officiels de la marque (header ou footer).",
      });
    } else if (networkCount <= 2) {
      push("info", {
        type: "few_social_links",
        label: "Présence sociale limitée",
        value: networkCount,
        impact:
          "Une présence sur peu de réseaux sociaux réduit la portée potentielle de la marque.",
        explanation: `${networkCount} réseau(x) social(aux) détecté(s).`,
        action: "Envisager d'élargir la présence à d'autres réseaux pertinents.",
      });
    } else {
      push("info", {
        type: "social_links_present",
        label: "Bonne présence sur les réseaux sociaux",
        value: networkCount,
        impact:
          "Une présence sur plusieurs réseaux sociaux renforce la visibilité et les signaux sociaux de la marque.",
        explanation: `${networkCount} réseaux sociaux détectés.`,
      });
    }

    // -------- 2. Open Graph image accessible --------
    const ogImageRaw = ($('meta[property="og:image"]').attr("content") ?? "").trim();
    if (!ogImageRaw) {
      push("warning", {
        type: "missing_og_image",
        label: "Image Open Graph absente",
        value: false,
        impact:
          "Sans og:image, les partages sur les réseaux sociaux n'affichent aucun visuel, réduisant l'engagement.",
        explanation: "La balise <meta property=\"og:image\"> n'est pas présente.",
        action: "Ajouter une balise <meta property=\"og:image\"> (1200x630px recommandé).",
      });
    } else {
      const ogImage = resolveUrl(ogImageRaw, finalUrl);
      const accessible = await isImageAccessible(ogImage);
      if (accessible) {
        push("info", {
          type: "og_image_accessible",
          label: "Image Open Graph accessible",
          value: ogImage,
          impact:
            "L'image de partage social est définie et accessible, garantissant un aperçu attractif.",
        });
      } else {
        push("warning", {
          type: "og_image_not_accessible",
          label: "Image Open Graph inaccessible",
          value: ogImage,
          impact:
            "L'image de partage est déclarée mais inaccessible, les partages sociaux n'afficheront pas de visuel.",
          explanation: `L'URL « ${ogImage} » ne renvoie pas un statut 200.`,
          action: "Vérifier que l'URL de l'image og:image est valide et accessible publiquement.",
        });
      }
    }

    // -------- 3. Twitter Card image accessible --------
    const twitterImageRaw = (
      $('meta[name="twitter:image"]').attr("content") ?? ""
    ).trim();
    if (!twitterImageRaw) {
      push("info", {
        type: "missing_twitter_image",
        label: "Image Twitter Card absente",
        value: false,
        impact:
          "Sans twitter:image, l'aperçu des partages sur X/Twitter peut être moins riche (souvent og:image utilisée en repli).",
        action: "Ajouter une balise <meta name=\"twitter:image\"> pour un aperçu optimal sur X/Twitter.",
      });
    } else {
      const twitterImage = resolveUrl(twitterImageRaw, finalUrl);
      const accessible = await isImageAccessible(twitterImage);
      if (accessible) {
        push("info", {
          type: "twitter_image_accessible",
          label: "Image Twitter Card accessible",
          value: twitterImage,
          impact:
            "L'image dédiée aux partages X/Twitter est définie et accessible.",
        });
      } else {
        push("warning", {
          type: "twitter_image_not_accessible",
          label: "Image Twitter Card inaccessible",
          value: twitterImage,
          impact:
            "L'image Twitter Card est déclarée mais inaccessible, dégradant l'aperçu des partages sur X/Twitter.",
          explanation: `L'URL « ${twitterImage} » ne renvoie pas un statut 200.`,
          action: "Vérifier que l'URL de l'image twitter:image est valide et accessible publiquement.",
        });
      }
    }

    // -------- 4. Boutons de partage social --------
    let shareButtonsDetected =
      $('[class*="share" i]').length > 0 ||
      $('[class*="social" i]').length > 0;

    if (!shareButtonsDetected) {
      $("*").each((_, el) => {
        if (shareButtonsDetected) return;
        const attribs = (el as { attribs?: Record<string, string> }).attribs;
        if (!attribs) return;
        for (const name of Object.keys(attribs)) {
          if (name.startsWith("data-") && name.toLowerCase().includes("share")) {
            shareButtonsDetected = true;
            return;
          }
        }
      });
    }

    if (!shareButtonsDetected) {
      $("a[href]").each((_, el) => {
        if (shareButtonsDetected) return;
        const href = ($(el).attr("href") ?? "").toLowerCase();
        if (
          href.includes("share.twitter.com") ||
          href.includes("twitter.com/intent/tweet") ||
          href.includes("facebook.com/sharer") ||
          href.includes("linkedin.com/sharing")
        ) {
          shareButtonsDetected = true;
        }
      });
    }

    if (shareButtonsDetected) {
      push("info", {
        type: "social_share_buttons_present",
        label: "Boutons de partage social présents",
        value: true,
        impact:
          "Les boutons de partage facilitent la diffusion du contenu et augmentent sa portée virale.",
      });
    } else {
      push("info", {
        type: "social_share_buttons_missing",
        label: "Boutons de partage social absents",
        value: false,
        impact:
          "L'absence de boutons de partage réduit la diffusion spontanée du contenu sur les réseaux sociaux.",
        action:
          "Ajouter des boutons de partage social sur les articles et pages clés.",
      });
    }

    // -------- 5. Schema.org Organization avec sameAs --------
    let organization: Record<string, unknown> | null = null;
    $('script[type="application/ld+json"]').each((_, el) => {
      if (organization) return;
      const raw = $(el).contents().text().trim();
      if (!raw) return;
      try {
        const parsed: unknown = JSON.parse(raw);
        const found = findOrganization(parsed);
        if (found) organization = found;
      } catch {
        // JSON-LD invalide : on ignore ce script et on continue
      }
    });

    if (!organization) {
      push("info", {
        type: "schema_org_missing_organization",
        label: "Schema.org Organization absent",
        value: false,
        impact:
          "Sans balisage Organization, Google associe moins facilement le site aux profils sociaux de la marque.",
        action:
          "Ajouter un balisage JSON-LD de type Organization avec une propriété sameAs.",
      });
    } else {
      const sameAsCount = countSameAs(organization);
      if (sameAsCount > 0) {
        push("info", {
          type: "schema_org_sameas_present",
          label: "Schema.org Organization avec sameAs",
          value: sameAsCount,
          impact:
            "La propriété sameAs relie officiellement le site à ses profils sociaux, renforçant l'entité de marque pour Google.",
          explanation: `${sameAsCount} profil(s) social(aux) déclaré(s) dans sameAs.`,
        });
      } else {
        push("info", {
          type: "schema_org_no_sameas",
          label: "Schema.org Organization sans sameAs",
          value: false,
          impact:
            "L'objet Organization n'établit pas de lien avec les profils sociaux via sameAs.",
          action:
            "Ajouter une propriété sameAs listant les URL des profils sociaux dans le balisage Organization.",
        });
      }
    }

    // -------- 6. Google Business Profile --------
    let googleBusinessUrl: string | null = null;
    $("a[href]").each((_, el) => {
      if (googleBusinessUrl) return;
      const href = ($(el).attr("href") ?? "").trim();
      if (href === "") return;
      const lower = href.toLowerCase();
      if (
        lower.includes("maps.google.com") ||
        lower.includes("g.page/") ||
        lower.includes("goo.gl/maps") ||
        lower.includes("maps.app.goo.gl")
      ) {
        googleBusinessUrl = resolveUrl(href, finalUrl);
      }
    });

    if (googleBusinessUrl) {
      push("info", {
        type: "google_business_detected",
        label: "Fiche Google Business détectée",
        value: googleBusinessUrl,
        impact:
          "Un lien vers la fiche Google Business renforce le référencement local et la confiance des visiteurs.",
      });
    } else {
      push("info", {
        type: "google_business_not_detected",
        label: "Fiche Google Business non détectée",
        value: false,
        impact:
          "L'absence de lien vers une fiche Google Business peut limiter la visibilité dans le référencement local.",
        action:
          "Créer et lier une fiche Google Business pour améliorer la présence locale.",
      });
    }

    // -------- 7. Open Graph complet pour le partage --------
    const ogTitle = ($('meta[property="og:title"]').attr("content") ?? "").trim();
    const ogDescription = (
      $('meta[property="og:description"]').attr("content") ?? ""
    ).trim();
    const ogImageForCompleteness = ogImageRaw;
    const ogUrl = ($('meta[property="og:url"]').attr("content") ?? "").trim();
    const ogType = ($('meta[property="og:type"]').attr("content") ?? "").trim();

    const missing: string[] = [];
    if (!ogTitle) missing.push("og:title");
    if (!ogDescription) missing.push("og:description");
    if (!ogImageForCompleteness) missing.push("og:image");
    if (!ogUrl) missing.push("og:url");
    if (!ogType) missing.push("og:type");

    if (missing.length === 0) {
      push("info", {
        type: "og_complete_for_social",
        label: "Open Graph complet pour le partage",
        value: true,
        impact:
          "Toutes les balises Open Graph essentielles sont présentes, garantissant un aperçu optimal lors des partages sociaux.",
      });
    } else {
      push("warning", {
        type: "og_incomplete_for_social",
        label: "Open Graph incomplet pour le partage",
        value: missing.join(", "),
        impact:
          "Des balises Open Graph manquantes dégradent l'aperçu des partages sur les réseaux sociaux.",
        explanation: `Balises manquantes : ${missing.join(", ")}.`,
        action: `Ajouter les balises Open Graph manquantes : ${missing.join(", ")}.`,
      });
    }

    return { module: MODULE, score: 0, results };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Erreur inconnue lors de l'audit de présence sociale.";
    return { module: MODULE, score: 0, results: [], error: message };
  }
}
