/**
 * Sign out through the server (transformate WI-3990, deck-main RULING 4124). mc_auth is httpOnly, so
 * clearing cookies from JS never ended the session; POST /api/auth/logout deletes the server session
 * and answers Set-Cookie expiring every auth cookie. Cookie sessions mutate with the double-submit token.
 */
export async function signOut(): Promise<void> {
  const csrf = document.cookie.match(/mc_csrf=([^;]+)/)?.[1];
  await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
    headers: csrf ? { "x-csrf-token": decodeURIComponent(csrf) } : {},
  }).catch(() => {});
}
