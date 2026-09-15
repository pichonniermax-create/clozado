import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";

/**
 * Un lien de désinscription inconnu (ou d'une autre organisation : même
 * réponse, volontairement) — avant, la 404 générique proposait « Aller au
 * tableau de bord » à une personne qui n'a pas de compte (audit UI du
 * 2026-09-14). Les textes prévus pour ce cas existaient déjà ; aucun
 * bouton : la personne peut répondre à l'email reçu.
 */
export default async function UnsubscribeNotFound() {
  const t = await getTranslations("email.unsubscribe");
  return (
    <AuthShell title={t("invalid_title")}>
      <p className="text-sm text-muted-foreground text-pretty">{t("invalid")}</p>
    </AuthShell>
  );
}
