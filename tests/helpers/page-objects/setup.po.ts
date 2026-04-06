import { type Page, type Locator } from "@playwright/test";

export class SetupPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly progressBar: Locator;
  readonly backButton: Locator;
  readonly continueButton: Locator;
  readonly errorMessage: Locator;

  // Step 1: Account
  readonly orgNameInput: Locator;
  readonly adminEmailInput: Locator;
  readonly adminPasswordInput: Locator;
  readonly confirmPasswordInput: Locator;

  // Step 2: Agent
  readonly agentNameInput: Locator;
  readonly agentDescriptionInput: Locator;
  readonly frameworkButtons: Locator;

  // Step 3: SDK Install
  readonly tokenDisplay: Locator;
  readonly copyButton: Locator;
  readonly sdkTabs: Locator;
  readonly codeBlock: Locator;

  // Step 4: First Event
  readonly startListeningButton: Locator;
  readonly sendTestEventButton: Locator;

  // Step 5: What's Next
  readonly featureCards: Locator;
  readonly goToDashboardButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { level: 1 })
      .or(page.getByRole("heading", { level: 2 }));
    this.progressBar = page.locator("[data-testid='progress-bar']")
      .or(page.locator("[role='progressbar']"));
    this.backButton = page.getByRole("button", { name: /back/i });
    this.continueButton = page.getByRole("button", { name: /continue|next|create/i });
    this.errorMessage = page.locator("[role='alert']");

    // Step 1
    this.orgNameInput = page.getByLabel(/organization/i)
      .or(page.getByPlaceholder(/organization/i));
    this.adminEmailInput = page.getByLabel(/email/i)
      .or(page.getByPlaceholder(/email/i));
    this.adminPasswordInput = page.getByLabel(/^password/i)
      .or(page.locator("input[type='password']").first());
    this.confirmPasswordInput = page.getByLabel(/confirm/i)
      .or(page.locator("input[type='password']").nth(1));

    // Step 2
    this.agentNameInput = page.getByLabel(/agent name/i)
      .or(page.getByPlaceholder(/agent/i));
    this.agentDescriptionInput = page.getByLabel(/description/i)
      .or(page.getByPlaceholder(/description/i));
    this.frameworkButtons = page.getByRole("button", { name: /openclaw|nemoclaw|crewai|autogen|custom/i });

    // Step 3
    this.tokenDisplay = page.locator("[data-testid='token-display']")
      .or(page.locator("code"));
    this.copyButton = page.getByRole("button", { name: /copy/i });
    this.sdkTabs = page.getByRole("tab")
      .or(page.getByRole("button", { name: /curl|node|python|openclaw|nemoclaw/i }));
    this.codeBlock = page.locator("pre, code");

    // Step 4
    this.startListeningButton = page.getByRole("button", { name: /start listening/i });
    this.sendTestEventButton = page.getByRole("button", { name: /send test/i });

    // Step 5
    this.featureCards = page.locator("[data-testid='feature-card']")
      .or(page.locator("[class*='feature']"));
    this.goToDashboardButton = page.getByRole("button", { name: /dashboard/i })
      .or(page.getByRole("link", { name: /dashboard/i }));
  }

  async goto() {
    await this.page.goto("/setup");
    await this.page.waitForLoadState("domcontentloaded");
  }
}
