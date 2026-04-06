import { type Page, type Locator } from "@playwright/test";

export class WorkflowsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly workflowList: Locator;
  readonly workflowCards: Locator;
  readonly templateGallery: Locator;
  readonly templateCards: Locator;
  readonly createButton: Locator;
  readonly searchInput: Locator;
  readonly emptyState: Locator;
  readonly sectionDescription: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { level: 1 });
    this.workflowList = page.locator("[data-testid='workflow-list']");
    this.workflowCards = page.locator("[data-testid='workflow-card']");
    this.templateGallery = page.locator("[data-testid='template-gallery']");
    this.templateCards = page.locator("[data-testid='template-card']");
    this.createButton = page.getByRole("button", { name: /create|new/i });
    this.searchInput = page.getByPlaceholder(/search/i);
    this.emptyState = page.locator("text=No workflows");
    this.sectionDescription = page.locator("text=What is this?")
      .or(page.locator("text=Got it, hide this"));
  }

  async goto() {
    await this.page.goto("/workflows");
    await this.page.waitForLoadState("domcontentloaded");
  }

  async getWorkflowCount() {
    return this.workflowCards.count();
  }

  async clickCreate() {
    await this.createButton.click();
  }

  async search(query: string) {
    await this.searchInput.fill(query);
  }
}
