import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/sign-in-form";
import { getAuthSettings } from "@/db/queries/auth-settings";
import { validityLabel } from "@/lib/auth/magic-link";
import { isPlausibleEmail } from "@/lib/email/address";
import type { AppLocale } from "@/i18n/locales";
import { getLocale, getTranslations } from "next-intl/server";

/**
 * NOTRE page d'erreur d'Auth.js (correctif du 2026-09-17) — à la place de
 * « Unable to sign in », en anglais, hors de notre design. Les quatre codes
 * qu'Auth.js peut poser (`?error=`) reçoivent une phrase utile et une
 * action : un lien qui n'est plus valable (`Verification`) explique la
 * règle et propose d'en recevoir un nouveau, adresse pré-remplie quand
 * elle est connue ; un accès refusé (`AccessDenied`) renvoie vers
 * l'inscription sans rien affirmer de l'adresse ; un problème de
 * configuration (`Configuration`) dit que c'est de notre côté. Tout autre
 * code reçoit la phrase générique.
 */
// eslint-disable-next-line local/no-visible-text -- les codes d'erreur d'Auth.js, pas des textes
const KNOWN = ["Verification", "AccessDenied", "Configuration"] as const;
type Known = (typeof KNOWN)[number];

export default async function AuthErrorPage({ searchParams }: { searchParams: Promise<{ error?: string; email?: string }> }) {
  const [t, params, settings, locale] = await Promise.all([getTranslations("auth.errorPage"), searchParams, getAuthSettings(), getLocale()]);
  // eslint-disable-next-line local/no-visible-text -- un code d'Auth.js, pas un texte
  const code: Known | "Default" = (KNOWN as readonly string[]).includes(params.error ?? "") ? (params.error as Known) : "Default";
  const email = (params.email ?? "").trim().toLowerCase();
  const validity = validityLabel(settings.linkValidityMinutes, locale as AppLocale);
  const footer = (
    <>
      {code === "AccessDenied"
        ? t.rich("pas_encore_d_espace", { link: (chunks) => <Link href="/inscription" className="font-medium text-foreground underline underline-offset-4">{chunks}</Link> })
        : t.rich("retour_a_la_connexion", { link: (chunks) => <Link href="/login" className="font-medium text-foreground underline underline-offset-4">{chunks}</Link> })}
    </>
  );
  return (
    <AuthShell title={t(`${code}.titre`)} description={t(`${code}.description`, { validity })} footer={footer}>
      <SignInForm initialEmail={isPlausibleEmail(email) ? email : ""} submitLabel={t("recevoir_un_nouveau_lien")} />
    </AuthShell>
  );
}
