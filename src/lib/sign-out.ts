/**
 * Sign out through the server (transformate WI-3990, deck-main RULING 4124). mc_auth is httpOnly, so
 * clearing cookies from JS never ended the session; POST /api/auth/logout deletes the server session
 * and answers Set-Cookie expiring every auth cookie. Cookie sessions mutate with the double-submit token.
 * Rejects unless the server confirmed it (non-2xx or a failed request): the session may still be live, so the
 * caller must stay on the page and offer a retry (FOLD 1, RULING 4174).
 */
export async function signOut(): Promise<void> {
  const csrf = document.cookie.match(/mc_csrf=([^;]+)/)?.[1];
  const res = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
    headers: csrf ? { "x-csrf-token": decodeURIComponent(csrf) } : {},
  });
  if (!res.ok) throw new Error(`Sign out failed (HTTP ${res.status})`);
}
