export type AuditModule =
  | "seo"
  | "performance"
  | "ux"
  | "content"
  | "security"
  | "social";

export type Severity = "critical" | "warning" | "info";

export type AuditResult = {
  id: string;
  module: AuditModule;
  type: string;
  severity: Severity;
  label: string;
  value: string | number | boolean;
  impact: string;
  explanation?: string;
  action?: string;
  fix?: string;
  competitorValue?: string | number | boolean;
};

export type ModuleScore = {
  score: number;
  results: AuditResult[];
};

export type AuditScores = {
  global: number;
  seo: number;
  performance: number;
  ux: number;
  content: number;
  security: number;
  social: number;
  competitor?: number;
};

export type AuditData = {
  id: string;
  url: string;
  competitorUrl?: string;
  scores: AuditScores;
  results: AuditResult[];
  duration: number;
  sharedSlug?: string;
  pagespeedCache?: PageSpeedResult;
  createdAt: Date;
};

export type PageSpeedMetric = {
  value: number;
  rating: "good" | "needs-improvement" | "poor";
};

export type PageSpeedOpportunity = {
  id: string;
  title: string;
  description: string;
  savings?: number;
};

export type PageSpeedResult = {
  mobile: {
    score: number;
    lcp: PageSpeedMetric;
    inp: PageSpeedMetric;
    cls: PageSpeedMetric;
    ttfb: PageSpeedMetric;
    fcp: PageSpeedMetric;
    totalBytes: number;
    requestCount: number;
    opportunities: PageSpeedOpportunity[];
  };
  desktop: {
    score: number;
  };
  fetchedAt: string;
};

export type AIRecommendation = {
  id: string;
  explanation: string;
  impact: string;
  action: string;
  fix?: string;
};

export type ModuleResult = {
  module: AuditModule;
  score: number;
  results: AuditResult[];
  error?: string;
};

export type CrawlResult = {
  seo: ModuleResult;
  performance: ModuleResult;
  ux: ModuleResult;
  content: ModuleResult;
  security: ModuleResult;
  social: ModuleResult;
};

export type AuditProgressEvent = {
  module: AuditModule | "scoring" | "ai" | "done";
  status: "running" | "done" | "error";
};

// CMS Connector interfaces (V2 stubs)
export type MetaUpdate = {
  title?: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
};

export type ImageFix = {
  src: string;
  alt: string;
};

export type SecurityHeader = {
  name: string;
  value: string;
};

export type CMSConnectorType = "wordpress" | "shopify" | "prestashop";

export interface CMSConnector {
  type: CMSConnectorType;
  credentials: Record<string, string>;
  testConnection(): Promise<boolean>;
  updateMeta(data: MetaUpdate): Promise<void>;
  fixAltTexts(images: ImageFix[]): Promise<void>;
  updateTitle(title: string): Promise<void>;
  addSecurityHeaders(headers: SecurityHeader[]): Promise<void>;
}

// Stripe / Plan
export type PlanType = "FREE" | "STARTER" | "PRO";

export type PlanLimits = {
  auditsPerMonth: number;
  domains: number;
  aiCorrections: boolean;
  competitorComparison: number;
  pdfExport: boolean;
  shareLink: boolean;
  history: boolean;
  apiAccess: boolean;
};

// Dashboard
export type ProjectSummary = {
  id: string;
  domain: string;
  latestScore: number;
  previousScore?: number;
  delta?: number;
  auditCount: number;
  lastAuditAt: Date;
};

export type ScoreHistory = {
  date: string;
  score: number;
};
