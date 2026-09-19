import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { getTranslations } from "next-intl/server";

/**
 * Écran d'arrivée après l'envoi du lien — commun à la connexion ET à
 * l'inscription : dans les deux cas la suite est la même (ouvrir sa boîte
 * mail). Il ne dit jamais si un compte vient d'être créé ou s'il existait
 * déjà, sans quoi il suffirait de soumettre une adresse pour le savoir.
 * Depuis l'inscription (`?depuis=inscription`, un flux, pas un fait sur
 * l'adresse), il ajoute que si l'adresse a déjà un espace, le lien y ramène
 * — avant, une personne déjà inscrite qui « créait un espace » arrivait dans
 * son ancien espace sans explication (stabilisation, P8).
 */
export default async function VerifyRequestPage({ searchParams }: { searchParams: Promise<{ depuis?: string }> }) {
  const [t, params] = await Promise.all([getTranslations("auth.verify"), searchParams]);
  const fromSignup = params.depuis === "inscription";
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
      {/* Un filet et une surface, pas une icône : la charte du site ne décore rien. */}
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted px-4 py-3.5 text-base">
        <p className="font-medium">{t("le_lien_est_valable_une_seule_6cb8")}</p>
        {fromSignup && <p className="text-muted-foreground">{t("si_cette_adresse_a_deja_un_espace")}</p>}
        <p className="text-muted-foreground">{t("rien_recu_apres_quelques_minutes_verifie_5bb6")}</p>
      </div>
    </AuthShell>
  );
}
