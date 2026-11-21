import { Suspense } from "react";
import LoginPage from "@/components/mission-control/login-page";

/**
 * /login (transformate WI-4493): everyone, the owner included, signs in by a user session: email and password
 * (/api/auth/login), or a magic link outside production. Zero key field: the init route is retired (WI-4492) and the owner key
 * is a server-to-server Bearer credential only. Suspense: login-page.tsx reads useSearchParams (the ?magic= link).
 */
export default function Login() {
  return (
    <Suspense fallback={null}>
      <LoginPage />
    </Suspense>
  );
}
