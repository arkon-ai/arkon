import { type Page, type Locator } from "@playwright/test";

export class AgentsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly agentList: Locator;
  readonly agentCards: Locator;
  readonly searchInput: Locator;
  readonly statusFilters: Locator;
  readonly emptyState: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { level: 1 });
    this.agentList = page.locator("[data-testid='agent-list']");
    this.agentCards = page.locator("[data-testid='agent-card']");
    this.searchInput = page.getByPlaceholder(/search/i);
    this.statusFilters = page.locator("[data-testid='status-filter']");
    this.emptyState = page.locator("[data-testid='empty-state']");
  }

  async goto() {
    await this.page.goto("/agents");
    await this.page.waitForLoadState("domcontentloaded");
  }

  async getAgentCount() {
    return this.agentCards.count();
  }

  async search(query: string) {
    await this.searchInput.fill(query);
  }

  async clickAgent(index: number) {
    await this.agentCards.nth(index).click();
  }
}
