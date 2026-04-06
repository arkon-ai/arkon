import { type Page, type Locator } from "@playwright/test";

export class DashboardPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly agentCards: Locator;
  readonly activityFeed: Locator;
  readonly anomalyBanner: Locator;
  readonly costWidget: Locator;
  readonly killSwitchFab: Locator;
  readonly healthGauge: Locator;
  readonly statusSummary: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { level: 1 });
    this.agentCards = page.locator("[data-testid='agent-card']");
    this.activityFeed = page.locator("[data-testid='activity-feed']");
    this.anomalyBanner = page.locator("[data-testid='anomaly-banner']");
    this.costWidget = page.locator("[data-testid='cost-widget']");
    this.killSwitchFab = page.getByRole("button", { name: /kill/i });
    this.healthGauge = page.locator("[data-testid='health-gauge']");
    this.statusSummary = page.locator("[data-testid='status-summary']");
  }

  async goto() {
    await this.page.goto("/");
    await this.page.waitForLoadState("domcontentloaded");
  }

  async getAgentCount() {
    return this.agentCards.count();
  }

  async openKillSwitch() {
    await this.killSwitchFab.click();
  }
}
