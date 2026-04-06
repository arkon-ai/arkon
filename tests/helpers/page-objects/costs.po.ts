import { type Page, type Locator } from "@playwright/test";

export class CostsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly summaryGrid: Locator;
  readonly statCards: Locator;
  readonly timeRangeSelector: Locator;
  readonly agentBreakdown: Locator;
  readonly modelBreakdown: Locator;
  readonly csvExportButton: Locator;
  readonly budgetProgress: Locator;
  readonly emptyState: Locator;
  readonly chartArea: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { level: 1 });
    this.summaryGrid = page.locator("[data-testid='cost-summary']");
    this.statCards = page.locator("[data-testid='stat-card']");
    this.timeRangeSelector = page.locator("select, [data-testid='time-range']")
      .or(page.getByRole("combobox"));
    this.agentBreakdown = page.locator("[data-testid='agent-breakdown']")
      .or(page.locator("text=By Agent").locator(".."));
    this.modelBreakdown = page.locator("[data-testid='model-breakdown']")
      .or(page.locator("text=By Model").locator(".."));
    this.csvExportButton = page.getByRole("button", { name: /export|csv|download/i });
    this.budgetProgress = page.locator("[data-testid='budget-progress']")
      .or(page.locator("text=Budget").locator(".."));
    this.emptyState = page.locator("text=No cost data");
    this.chartArea = page.locator(".recharts-wrapper, canvas, svg.chart");
  }

  async goto() {
    await this.page.goto("/costs");
    await this.page.waitForLoadState("domcontentloaded");
  }
}
