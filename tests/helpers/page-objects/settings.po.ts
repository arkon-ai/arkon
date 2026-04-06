import { type Page, type Locator } from "@playwright/test";

export class SettingsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly navLinks: Locator;
  readonly appearanceLink: Locator;
  readonly notificationsLink: Locator;
  readonly sessionsLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { level: 1 });
    this.navLinks = page.getByRole("link");
    this.appearanceLink = page.getByRole("link", { name: /appearance/i });
    this.notificationsLink = page.getByRole("link", { name: /notification/i });
    this.sessionsLink = page.getByRole("link", { name: /session/i });
  }

  async goto(subpage?: "appearance" | "notifications" | "sessions") {
    const path = subpage ? `/settings/${subpage}` : "/settings";
    await this.page.goto(path);
    await this.page.waitForLoadState("domcontentloaded");
  }
}

export class AppearancePage {
  readonly page: Page;
  readonly themeButtons: Locator;
  readonly systemButton: Locator;
  readonly lightButton: Locator;
  readonly darkButton: Locator;
  readonly activeIndicator: Locator;

  constructor(page: Page) {
    this.page = page;
    this.themeButtons = page.getByRole("button", { name: /system|light|dark/i });
    this.systemButton = page.getByRole("button", { name: /system/i });
    this.lightButton = page.getByRole("button", { name: /light/i });
    this.darkButton = page.getByRole("button", { name: /dark/i });
    this.activeIndicator = page.locator("[data-active='true'], .active");
  }

  async goto() {
    await this.page.goto("/settings/appearance");
    await this.page.waitForLoadState("domcontentloaded");
  }
}

export class SessionsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly revokeAllButton: Locator;
  readonly sessionCards: Locator;
  readonly revokeButtons: Locator;
  readonly currentBadge: Locator;
  readonly emptyState: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: /session/i });
    this.revokeAllButton = page.getByRole("button", { name: /revoke all/i });
    this.sessionCards = page.locator("[data-testid='session-card']")
      .or(page.locator("[class*='session']"));
    this.revokeButtons = page.getByRole("button", { name: /revoke/i });
    this.currentBadge = page.locator("text=Current")
      .or(page.locator("[data-testid='current-session']"));
    this.emptyState = page.locator("text=No sessions");
  }

  async goto() {
    await this.page.goto("/settings/sessions");
    await this.page.waitForLoadState("domcontentloaded");
  }
}
