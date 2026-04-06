import { type Page, type Locator } from "@playwright/test";

export class SecurityPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly threatList: Locator;
  readonly threatCards: Locator;
  readonly severityFilters: Locator;
  readonly purgeButton: Locator;
  readonly redactButton: Locator;
  readonly dismissButton: Locator;
  readonly sectionDescription: Locator;
  readonly threatClassExplainers: Locator;
  readonly emptyState: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { level: 1 });
    this.threatList = page.locator("[data-testid='threat-list']");
    this.threatCards = page.locator("[data-testid='threat-card']");
    this.severityFilters = page.locator("[data-testid='severity-filter']")
      .or(page.getByRole("button", { name: /critical|high|medium|low/i }));
    this.purgeButton = page.getByRole("button", { name: /purge/i });
    this.redactButton = page.getByRole("button", { name: /redact/i });
    this.dismissButton = page.getByRole("button", { name: /dismiss/i });
    this.sectionDescription = page.locator("text=What is this?")
      .or(page.locator("text=Got it, hide this"));
    this.threatClassExplainers = page.locator("[data-testid='threat-class']");
    this.emptyState = page.locator("text=No threats");
  }

  async goto() {
    await this.page.goto("/security");
    await this.page.waitForLoadState("domcontentloaded");
  }
}
