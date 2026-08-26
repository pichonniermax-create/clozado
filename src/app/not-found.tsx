import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { buttonVariants } from "@/components/ui/button";
import { useTranslations } from "next-intl";

/**
 * Une URL qui ne correspond à rien — hors de la coquille de l'application
 * (Next rend ce fichier dans la mise en page racine). Le cadre des écrans
 * publics fait l'affaire : rien à naviguer, juste repartir d'un endroit sûr.
 */
export default function NotFound() {
  const t = useTranslations("shell.rootNotFound");
  return (
    <AuthShell
      title={t("cette_page_n_existe_pas")}
      description={t("l_adresse_est_peut_etre_erronee_cdec")}
    >
      <div className="flex flex-wrap gap-2">
        {t.rich("aller_au_tableau_de_bord_accueil", { link: (chunks) => <Link href="/dashboard" className={buttonVariants()}>{chunks}</Link>, link2: (chunks) => <Link href="/" className={buttonVariants({ variant: "outline" })}>{chunks}</Link> })}
      </div>
    </AuthShell>
  );
}
