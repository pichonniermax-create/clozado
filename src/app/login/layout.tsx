import type { ReactNode } from "react";
import { redirectIfSignedIn } from "@/lib/auth/signed-in";

/** /login et /login/verifier : une session en cours est renvoyée à son espace (stabilisation, P8). */
export default async function LoginLayout({ children }: { children: ReactNode }) {
  await redirectIfSignedIn("/dashboard");
  return children;
}
