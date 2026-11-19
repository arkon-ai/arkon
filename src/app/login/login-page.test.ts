import { describe, it, expect, vi, afterEach } from "vitest";
import { createElement, Suspense, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "fs";
import LoginRoute from "./page";
import LoginPage from "@/components/mission-control/login-page";

/* /login moves the owner to the session road (transformate WI-4493, S4): the route mounts
   src/components/mission-control/login-page.tsx without its passphrase tab, inside a Suspense boundary (the
   component reads useSearchParams), so the owner signs in by email and password (/api/auth/login). The Magic Link
   tab is hidden in production until a mailer exists (magic-link/route.ts sends no mail). Zero key field. */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

const render = (el: ReactElement) => renderToStaticMarkup(el);

describe("/login: the email and password form, zero key field (transformate WI-4493)", () => {
  it("/login renders the email and password form of login-page.tsx", () => {
    const html = render(createElement(LoginRoute));
    expect(html).toMatch(/<input[^>]*type="email"/);
    expect(html).toMatch(/<input[^>]*type="password"[^>]*placeholder="Password"/);
  });

  it("/login shows zero passphrase field and zero passphrase tab", () => {
    const html = render(createElement(LoginRoute));
    expect(html).not.toMatch(/passphrase/i);
  });

  it("/login mounts login-page.tsx inside a Suspense boundary", () => {
    let tree: ReactElement | null = null;
    try {
      tree = (LoginRoute as () => ReactElement)(); // a wrapper calls no hook; a hook form throws here
    } catch {
      tree = null;
    }
    expect(tree?.type).toBe(Suspense);
    expect((tree?.props as { children?: ReactElement } | undefined)?.children?.type).toBe(LoginPage);
  });

  it("neither login page posts to /api/auth/init; the form posts to /api/auth/login", () => {
    const route = readFileSync("src/app/login/page.tsx", "utf8");
    const component = readFileSync("src/components/mission-control/login-page.tsx", "utf8");
    expect(route).not.toContain("/api/auth/init");
    expect(component).not.toContain("/api/auth/init");
    expect(component).toContain('fetch("/api/auth/login"');
  });

  it("the Magic Link tab is hidden when NODE_ENV is production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const html = render(createElement(LoginPage));
    expect(html).not.toContain("Magic Link");
    expect(html).toMatch(/<input[^>]*type="email"/);
  });

  // GREEN at the base by design (S10, named control): outside production the tab still shows.
  it("the Magic Link tab shows outside production (control)", () => {
    vi.stubEnv("NODE_ENV", "test");
    const html = render(createElement(LoginPage));
    expect(html).toContain("Magic Link");
  });
});
