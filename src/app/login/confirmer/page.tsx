import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/sign-in-form";
import { Button } from "@/components/ui/button";
import { getAuthSettings } from "@/db/queries/auth-settings";
import { peekVerificationToken } from "@/db/queries/login-codes";
import { isTokenShape, safeCallbackPath, validityLabel } from "@/lib/auth/magic-link";
import { isPlausibleEmail } from "@/lib/email/address";
import type { AppLocale } from "@/i18n/locales";
import { getLocale, getTranslations } from "next-intl/server";

/**
 * LA PAGE DU LIEN REÇU (correctif du 2026-09-17). Le lien de l'email mène
 * ici, et un GET n'y consomme RIEN : le jeton est seulement relu
 * (`peekVerificationToken`) pour dire s'il est encore valable. Un scanner
 * anti-spam ou l'aperçu de lien d'une messagerie peut ouvrir cette page
 * mille fois, la personne se connectera quand même : seul le bouton « Me
 * connecter » — un POST, un geste humain — envoie le navigateur au callback
 * d'Auth.js, qui consomme le jeton et ouvre la session.
 *
 * Un lien expiré ou déjà servi ne montre pas une erreur technique mais une
 * phrase utile et le formulaire pour en recevoir un nouveau, adresse
 * pré-remplie.
 */
export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ token?: string; email?: string; callbackUrl?: string }> }) {
  const [t, params, settings, locale] = await Promise.all([getTranslations("auth.confirm"), searchParams, getAuthSettings(), getLocale()]);
  const token = params.token ?? "";
  const email = (params.email ?? "").trim().toLowerCase();
  const callbackUrl = safeCallbackPath(params.callbackUrl);
  const wellFormed = isTokenShape(token) && isPlausibleEmail(email);
  const state = wellFormed ? await peekVerificationToken(email, token) : "missing";
  const validity = validityLabel(settings.linkValidityMinutes, locale as AppLocale);

  if (state !== "valid") {
    return (
      <AuthShell
        title={t("lien_plus_valable")}
        description={t("les_liens_expirent_apres", { validity })}
        footer={
          <>
            {t.rich("retour_a_la_connexion", { link: (chunks) => <Link href="/login" className="font-medium text-foreground underline underline-offset-4">{chunks}</Link> })}
          </>
        }
      >
        <SignInForm initialEmail={isPlausibleEmail(email) ? email : ""} submitLabel={t("recevoir_un_nouveau_lien")} />
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t("se_connecter")} description={t("tu_vas_ouvrir_ton_espace", { email })} footer={t("pas_toi")}>
      {/* Un formulaire HTML nu vers notre route : le POST répond par une redirection (303) vers le callback d'Auth.js. */}
      <form method="post" action="/login/confirmer/valider" className="flex flex-col gap-4">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <Button type="submit" className="w-full" data-geste="me-connecter">
          {t("me_connecter")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("ce_lien_ne_sert_qu_une_fois", { validity })}</p>
      </form>
    </AuthShell>
  );
}
