import { type Page, type Locator } from "@playwright/test";

export class InfrastructurePage {
  readonly page: Page;
  readonly heading: Locator;
  readonly topologyMap: Locator;
  readonly nodeList: Locator;
  readonly nodeCards: Locator;
  readonly healthScores: Locator;
  readonly nodeActions: Locator;
  readonly refreshButton: Locator;
  readonly emptyState: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { level: 1 });
    this.topologyMap = page.locator("[data-testid='topology-map']")
      .or(page.locator("canvas, svg").first());
    this.nodeList = page.locator("[data-testid='node-list']");
    this.nodeCards = page.locator("[data-testid='node-card']");
    this.healthScores = page.locator("[data-testid='health-score']");
    this.nodeActions = page.getByRole("button", { name: /restart|collect|action/i });
    this.refreshButton = page.getByRole("button", { name: /refresh/i });
    this.emptyState = page.locator("text=No nodes");
  }

  async goto() {
    await this.page.goto("/infrastructure");
    await this.page.waitForLoadState("domcontentloaded");
  }
}
