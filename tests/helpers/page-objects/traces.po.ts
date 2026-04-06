import { type Page, type Locator } from "@playwright/test";

export class TracesPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly statsCards: Locator;
  readonly searchInput: Locator;
  readonly filterButton: Locator;
  readonly filterPanel: Locator;
  readonly statusFilter: Locator;
  readonly agentFilter: Locator;
  readonly traceTable: Locator;
  readonly traceRows: Locator;
  readonly prevButton: Locator;
  readonly nextButton: Locator;
  readonly emptyState: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { level: 1 });
    this.statsCards = page.locator("[data-testid='trace-stat']")
      .or(page.locator("[class*='stat-card']"));
    this.searchInput = page.getByPlaceholder(/search/i);
    this.filterButton = page.getByRole("button", { name: /filter/i });
    this.filterPanel = page.locator("[data-testid='filter-panel']");
    this.statusFilter = page.locator("select").first()
      .or(page.getByRole("combobox").first());
    this.agentFilter = page.locator("select").nth(1)
      .or(page.getByRole("combobox").nth(1));
    this.traceTable = page.locator("table")
      .or(page.locator("[data-testid='trace-table']"));
    this.traceRows = page.locator("table tbody tr")
      .or(page.locator("[data-testid='trace-row']"));
    this.prevButton = page.getByRole("button", { name: /prev|previous/i });
    this.nextButton = page.getByRole("button", { name: /next/i });
    this.emptyState = page.locator("text=No traces");
  }

  async goto() {
    await this.page.goto("/traces");
    await this.page.waitForLoadState("domcontentloaded");
  }

  async search(query: string) {
    await this.searchInput.fill(query);
  }

  async clickTrace(index: number) {
    await this.traceRows.nth(index).click();
  }
}
