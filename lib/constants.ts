import type { AuditModule, PlanType, PlanLimits } from "./types";

// Module weights (must sum to 1.0)
export const MODULE_WEIGHTS: Record<AuditModule, number> = {
  seo: 0.25,
  performance: 0.20,
  ux: 0.15,
  content: 0.15,
  security: 0.15,
  social: 0.10,
};

// Severity penalty per issue
export const SEVERITY_PENALTY = {
  critical: 12,
  warning: 5,
  info: 2,
} as const;

// Global score thresholds
export const SCORE_THRESHOLDS = {
  excellent: 85,
  good: 70,
  needsWork: 50,
} as const;

export type ScoreLabel = "EXCELLENT" | "BON" | "À AMÉLIORER" | "CRITIQUE";

export function getScoreLabel(score: number): ScoreLabel {
  if (score >= SCORE_THRESHOLDS.excellent) return "EXCELLENT";
  if (score >= SCORE_THRESHOLDS.good) return "BON";
  if (score >= SCORE_THRESHOLDS.needsWork) return "À AMÉLIORER";
  return "CRITIQUE";
}

// Core Web Vitals thresholds (ms)
export const CWV_THRESHOLDS = {
  lcp: { good: 2500, poor: 4000 },
  inp: { good: 200, poor: 500 },
  ttfb: { good: 800, poor: 1800 },
  fcp: { good: 1800, poor: 3000 },
  cls: { good: 0.1, poor: 0.25 },
} as const;

// PageSpeed cache duration (ms)
export const PAGESPEED_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Rate limiting
export const AUDIT_RATE_LIMIT = 10; // requests per minute per IP

// Crawler timeouts
export const FETCH_TIMEOUT_MS = 8000;
export const PAGESPEED_TIMEOUT_MS = 15000;

// AI recommendations
export const AI_MAX_PROBLEMS = 25;
export const AI_MODEL = "claude-sonnet-4-20250514";
export const AI_MAX_TOKENS = 2048;

// Content thresholds
export const CONTENT_WORD_COUNT = {
  critical: 300,
  warning: 600,
} as const;

export const CONTENT_TEXT_RATIO = {
  good: 0.25,
  poor: 0.10,
} as const;

export const KEYWORD_DENSITY = {
  tooLow: 0.005,
  tooHigh: 0.05,
} as const;

// Plan limits
export const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  FREE: {
    auditsPerMonth: 3,
    domains: 1,
    aiCorrections: false,
    competitorComparison: 0,
    pdfExport: false,
    shareLink: false,
    history: false,
    apiAccess: false,
  },
  STARTER: {
    auditsPerMonth: 20,
    domains: 5,
    aiCorrections: true,
    competitorComparison: 1,
    pdfExport: true,
    shareLink: true,
    history: true,
    apiAccess: false,
  },
  PRO: {
    auditsPerMonth: Infinity,
    domains: Infinity,
    aiCorrections: true,
    competitorComparison: 3,
    pdfExport: true,
    shareLink: true,
    history: true,
    apiAccess: true,
  },
};

// Stripe price IDs (set actual IDs in env for production)
export const STRIPE_PRICES = {
  STARTER_MONTHLY: process.env.STRIPE_PRICE_STARTER ?? "price_starter",
  PRO_MONTHLY: process.env.STRIPE_PRICE_PRO ?? "price_pro",
} as const;

// Progress badge thresholds
export const BADGE_THRESHOLDS = {
  beginner: 3,
  improving: 10,
  optimized: 85,
} as const;

// French stopwords for keyword detection
export const STOPWORDS_FR = new Set([
  "le","la","les","de","du","des","un","une","et","en","au","aux","par",
  "sur","dans","avec","pour","que","qui","ne","pas","plus","se","ce","sa",
  "son","ses","leur","leurs","mon","ma","mes","ton","ta","tes","nous","vous",
  "ils","elles","je","tu","il","elle","on","est","sont","être","avoir","fait",
  "tout","mais","ou","donc","car","ni","or","si","à","a","y","il","très",
  "bien","comme","plus","cette","ces","cet","dont","où","lors","via",
]);

// English stopwords
export const STOPWORDS_EN = new Set([
  "the","a","an","and","or","but","in","on","at","to","for","of","with",
  "by","from","is","are","was","were","be","been","being","have","has","had",
  "do","does","did","will","would","could","should","may","might","shall",
  "not","no","nor","so","yet","both","either","neither","each","few","more",
  "most","other","some","such","than","then","there","these","they","this",
  "those","through","up","as","if","when","where","who","which","what","how",
  "that","it","its","we","our","your","my","his","her","their","can","into",
]);

// Private IP ranges for SSRF protection
export const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\./,
  /^localhost$/i,
  /^0\.0\.0\.0$/,
] as const;

// Known CMS signatures
export const CMS_SIGNATURES = {
  wordpress: [
    "/wp-login.php",
    "/wp-admin/",
    "/wp-content/",
    "/wp-includes/",
  ],
  shopify: ["cdn.shopify.com", "myshopify.com"],
  webflow: ["webflow.com", "wf-"],
  wix: ["wix.com", "wixsite.com"],
  squarespace: ["squarespace.com", "squarespace-cdn.com"],
} as const;

// Sensitive files to check for exposure
export const SENSITIVE_FILES = [
  "/.env",
  "/.git/config",
  "/wp-config.php",
  "/.htaccess",
  "/config.php",
  "/database.yml",
  "/phpinfo.php",
  "/.DS_Store",
  "/readme.html",
] as const;

// Security headers to check
export const REQUIRED_SECURITY_HEADERS = [
  "strict-transport-security",
  "x-frame-options",
  "x-content-type-options",
  "content-security-policy",
  "referrer-policy",
  "permissions-policy",
] as const;

// User-Agent for crawling
export const CRAWLER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0";
