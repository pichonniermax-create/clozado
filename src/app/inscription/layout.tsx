import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { redirectIfSignedIn } from "@/lib/auth/signed-in";
import { withError } from "@/lib/form-actions";

/**
 * /inscription : une session en cours est renvoyée à son espace, avec la
 * phrase qui le dit (stabilisation, P8) — « créer un espace » depuis une
 * session menait à l'ancien espace sans explication, y compris sur un lien
 * d'invitation, qu'il faut rouvrir une fois déconnecté.
 */
export default async function SignUpLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("auth.signup");
  await redirectIfSignedIn(withError("/dashboard", t("deja_connecte_deconnecte_toi_pour_un_autre_espace"), "info"));
  return children;
}
