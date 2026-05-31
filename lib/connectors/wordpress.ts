import type { CMSConnector, MetaUpdate, ImageFix, SecurityHeader } from "./types";

export class WordPressConnector implements CMSConnector {
  readonly type = "wordpress" as const;
  readonly credentials: Record<string, string>;

  constructor(credentials: Record<string, string>) {
    this.credentials = credentials;
  }

  async testConnection(): Promise<boolean> {
    throw new Error("WordPress connector not yet implemented");
  }

  async updateMeta(_data: MetaUpdate): Promise<void> {
    throw new Error("WordPress connector not yet implemented");
  }

  async fixAltTexts(_images: ImageFix[]): Promise<void> {
    throw new Error("WordPress connector not yet implemented");
  }

  async updateTitle(_title: string): Promise<void> {
    throw new Error("WordPress connector not yet implemented");
  }

  async addSecurityHeaders(_headers: SecurityHeader[]): Promise<void> {
    throw new Error("WordPress connector not yet implemented");
  }
}
