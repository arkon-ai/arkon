import { type Page, type Locator } from "@playwright/test";

export class ToolsHubPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly toolCards: Locator;
  readonly searchInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { level: 1 });
    this.toolCards = page.locator("[data-testid='tool-card']")
      .or(page.getByRole("link").filter({ hasText: /task|doc|command|mcp|calendar|approval|agent/i }));
    this.searchInput = page.getByPlaceholder(/search/i);
  }

  async goto() {
    await this.page.goto("/tools");
    await this.page.waitForLoadState("domcontentloaded");
  }
}
