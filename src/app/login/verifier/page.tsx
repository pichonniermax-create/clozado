import Link from "next/link";
import { MailCheck } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { useTranslations } from "next-intl";

/**
 * Écran d'arrivée après l'envoi du lien — commun à la connexion ET à
 * l'inscription : dans les deux cas la suite est la même (ouvrir sa boîte
 * mail). Il ne dit jamais si un compte vient d'être créé ou s'il existait
 * déjà, sans quoi il suffirait de soumettre une adresse pour le savoir.
 */
export default function VerifyRequestPage() {
  const t = useTranslations("auth.verify");
  return (
    <AuthShell
      title={t("verifie_tes_emails")}
      description={t("un_lien_de_connexion_vient_de_184e")}
      footer={
        <>
          {t.rich("mauvaise_adresse_recommencer", { link: (chunks) => <Link href="/login"
            className="font-medium text-foreground underline underline-offset-4">{chunks}</Link> })}
        </>
      }
    >
      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/50 px-4 py-3">
        <MailCheck className="mt-0.5 size-4 shrink-0 text-success" />
        <div className="flex flex-col gap-1 text-sm">
          <p className="font-medium">{t("le_lien_est_valable_une_seule_6cb8")}</p>
          <p className="text-muted-foreground">
            {t("rien_recu_apres_quelques_minutes_verifie_5bb6")}
          </p>
        </div>
      </div>
    </AuthShell>
  );
}
