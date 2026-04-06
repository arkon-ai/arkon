import { type Page, type Locator } from "@playwright/test";

export class CompliancePage {
  readonly page: Page;
  readonly heading: Locator;
  readonly auditTable: Locator;
  readonly auditRows: Locator;
  readonly exportButton: Locator;
  readonly purgeButton: Locator;
  readonly dateFilter: Locator;
  readonly searchInput: Locator;
  readonly emptyState: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { level: 1 });
    this.auditTable = page.locator("table")
      .or(page.locator("[data-testid='audit-table']"));
    this.auditRows = page.locator("table tbody tr")
      .or(page.locator("[data-testid='audit-row']"));
    this.exportButton = page.getByRole("button", { name: /export/i });
    this.purgeButton = page.getByRole("button", { name: /purge/i });
    this.dateFilter = page.locator("[data-testid='date-filter']")
      .or(page.getByRole("combobox"));
    this.searchInput = page.getByPlaceholder(/search|filter/i);
    this.emptyState = page.locator("text=No audit");
  }

  async goto() {
    await this.page.goto("/compliance");
    await this.page.waitForLoadState("domcontentloaded");
  }
}
