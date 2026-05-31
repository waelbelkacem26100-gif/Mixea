export type CMSConnectorType = "wordpress" | "shopify" | "prestashop";

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

export interface CMSConnector {
  type: CMSConnectorType;
  credentials: Record<string, string>;
  testConnection(): Promise<boolean>;
  updateMeta(data: MetaUpdate): Promise<void>;
  fixAltTexts(images: ImageFix[]): Promise<void>;
  updateTitle(title: string): Promise<void>;
  addSecurityHeaders(headers: SecurityHeader[]): Promise<void>;
}
