import { type Page, type Locator } from "@playwright/test";

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly magicLinkButton: Locator;
  readonly errorMessage: Locator;
  readonly heading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: /sign in|log in|login/i });
    this.emailInput = page.getByLabel(/email/i);
    this.passwordInput = page.getByLabel(/password/i);
    this.submitButton = page.getByRole("button", { name: /sign in|log in|submit/i });
    this.magicLinkButton = page.getByRole("button", { name: /magic link|passwordless/i });
    this.errorMessage = page.locator("[role='alert'], [data-testid='error-message']");
  }

  async goto() {
    await this.page.goto("/login");
    await this.page.waitForLoadState("domcontentloaded");
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async requestMagicLink(email: string) {
    await this.emailInput.fill(email);
    await this.magicLinkButton.click();
  }
}
