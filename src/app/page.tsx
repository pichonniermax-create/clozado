import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BrandMark } from "@/components/app-shell/brand-mark";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getTranslations } from "next-intl/server";

/**
 * Porte d'entrée du produit, sur app.clozado.fr. Depuis que clozado.fr
 * existe, ce n'est plus la page qui explique le produit : c'est celle où
 * l'on entre. Elle porte donc LA CHARTE DU SITE (globals.css,
 * `data-charte="site"`) — bordeaux, titre d'affiche aligné à gauche,
 * actions en pilule, aucune icône décorative, aucun aplat de couleur.
 *
 * Quelqu'un de déjà connecté n'a rien à faire ici : on l'envoie directement
 * dans son espace.
 */
export default async function Home() {
  const t = await getTranslations("home.page");
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    // `min-h-svh` : sur Safari iOS, 100vh compte la barre d'adresse et la page sautait au défilement.
    <div data-charte="site" className="flex min-h-svh flex-col bg-background">
      {/* La gouttière du site, identique à gauche et à droite. « Se connecter » est un lien de texte, pas un bouton. */}
      <header className="flex items-center justify-between gap-4 px-5 py-5 md:px-10">
        <BrandMark size="lg" />
        <Link href="/login" className="text-base font-medium underline-offset-4 hover:underline">
          {t("se_connecter")}
        </Link>
      </header>

      <main className="flex flex-1 items-start px-5 py-10 md:items-center md:px-10 md:py-16">
        <div className="flex w-full max-w-3xl flex-col gap-10">
          <div className="flex flex-col gap-5">
            <h1 className="titre-public text-balance">
              {t("partage_tes_affaires_entre_confreres_sans_a995")}
            </h1>
            {/* Aucun bloc de texte au-delà de 65 caractères de large : la règle de mesure du site. */}
            <p className="max-w-[65ch] text-base text-muted-foreground text-pretty">
              {t("clozado_n_est_pas_un_crm_f7da")}
            </p>
          </div>

          {/* Sur un téléphone, les deux gestes s'empilent en pleine largeur ; côte à côte dès sm. */}
          <div className="flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center">
            <Link href="/inscription" className={cn(buttonVariants(), "w-full sm:w-auto")}>
              {t("creer_un_espace")}
            </Link>
            <Link href="/login" className={cn(buttonVariants({ variant: "outline" }), "w-full sm:w-auto")}>
              {t("j_ai_deja_un_compte")}
            </Link>
          </div>

          <ul className="grid w-full grid-cols-1 gap-4 text-left sm:grid-cols-3">
            <Argument title={t("un_lien_pas_un_compte")} body={t("ton_confrere_ouvre_une_page_a_3c43")} />
            <Argument title={t("ce_qu_il_faut_relancer")} body={t("trois_piles_d_action_plutot_qu_0d19")} />
            <Argument title={t("les_commissions_dues")} body={t("fixees_a_l_envoi_suivies_jusqu_2085")} />
          </ul>
        </div>
      </main>
    </div>
  );
}

function Argument({ title, body }: { title: string; body: string }) {
  return (
    // Un filet de 1 px, 16 px de rayon, aucune ombre, aucune icône : les trois formes du site.
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-card p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-base text-muted-foreground text-pretty">{body}</p>
    </li>
  );
}
