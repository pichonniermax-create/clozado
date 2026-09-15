import Link from "next/link";
import { SearchX } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { buttonVariants } from "@/components/ui/button";

/**
 * Une URL qui ne correspond à rien — hors de la coquille de l'application
 * (Next rend ce fichier dans la mise en page racine). Le cadre des écrans
 * publics fait l'affaire : rien à naviguer, juste repartir d'un endroit sûr.
 * Le bon endroit dépend de qui regarde (audit UI du 2026-09-14) : sans
 * session, « Aller au tableau de bord » promettait un écran qui renvoie à
 * la connexion — un visiteur anonyme repart de l'accueil ou se connecte.
 * Le même médaillon que la 404 interne : les deux se ressemblent.
 */
export default async function NotFound() {
  const [t, th, session] = await Promise.all([getTranslations("shell.rootNotFound"), getTranslations("home.page"), auth()]);
  return (
    <AuthShell title={t("cette_page_n_existe_pas")} description={t("l_adresse_est_peut_etre_erronee_cdec")}>
      <span aria-hidden className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-5">
        <SearchX />
      </span>
      <div className="flex flex-wrap gap-2">
        {session?.user ? (
          t.rich("aller_au_tableau_de_bord_accueil", {
            link: (chunks) => (
              <Link href="/dashboard" className={buttonVariants()}>
                {chunks}
              </Link>
            ),
            link2: (chunks) => (
              <Link href="/" className={buttonVariants({ variant: "outline" })}>
                {chunks}
              </Link>
            ),
          })
        ) : (
          <>
            <Link href="/" className={buttonVariants()}>
              {th("accueil")}
            </Link>
            <Link href="/login" className={buttonVariants({ variant: "outline" })}>
              {th("se_connecter")}
            </Link>
          </>
        )}
      </div>
    </AuthShell>
  );
}
