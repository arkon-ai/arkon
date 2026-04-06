import { type Page, type Locator } from "@playwright/test";

export class AdminPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly tabs: Locator;
  readonly tenantSection: Locator;
  readonly agentConfigSection: Locator;
  readonly pricingSection: Locator;
  readonly cronSection: Locator;
  readonly budgetSection: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { level: 1 });
    this.tabs = page.getByRole("tab");
    this.tenantSection = page.locator("text=Tenant").first()
      .or(page.locator("[data-testid='tenant-section']"));
    this.agentConfigSection = page.locator("text=Agent").first()
      .or(page.locator("[data-testid='agent-config']"));
    this.pricingSection = page.locator("text=Pricing").first()
      .or(page.locator("[data-testid='pricing-section']"));
    this.cronSection = page.locator("text=Cron").first()
      .or(page.locator("[data-testid='cron-section']"));
    this.budgetSection = page.locator("text=Budget").first()
      .or(page.locator("[data-testid='budget-section']"));
    this.saveButton = page.getByRole("button", { name: /save|update/i });
  }

  async goto() {
    await this.page.goto("/admin");
    await this.page.waitForLoadState("domcontentloaded");
  }
}
