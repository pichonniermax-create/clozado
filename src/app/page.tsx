import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Banknote, Share2, Target } from "lucide-react";
import { auth } from "@/auth";
import { BrandMark } from "@/components/app-shell/brand-mark";
import { buttonVariants } from "@/components/ui/button";
import { getTranslations } from "next-intl/server";

/**
 * Porte d'entrée du produit. Remplace le placeholder du scaffold initial
 * (« Fondation technique — le projet est initialisé »), qui n'avait plus de
 * raison d'être maintenant qu'un espace peut se créer tout seul.
 *
 * Quelqu'un de déjà connecté n'a rien à faire ici : on l'envoie directement
 * dans son espace.
 */
export default async function Home() {
  const t = await getTranslations("home.page");
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <header className="flex items-center justify-between px-6 py-5">
        <BrandMark size="lg" />
        <Link href="/login" className={buttonVariants({ variant: "ghost" })}>
          {t("se_connecter")}
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="flex w-full max-w-2xl flex-col items-center gap-8 text-center">
          <div className="flex flex-col gap-4">
            <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              {t("partage_tes_affaires_entre_confreres_sans_a995")}
            </h1>
            <p className="text-base text-muted-foreground text-pretty">
              {t("clozado_n_est_pas_un_crm_f7da")}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/inscription" className={buttonVariants({ size: "lg" })}>
              {t("creer_un_espace")}
              <ArrowRight />
            </Link>
            <Link href="/login" className={buttonVariants({ variant: "outline", size: "lg" })}>
              {t("j_ai_deja_un_compte")}
            </Link>
          </div>

          <ul className="grid w-full grid-cols-1 gap-3 pt-4 text-left sm:grid-cols-3">
            <Argument
              icon={<Share2 />}
              title={t("un_lien_pas_un_compte")}
              body={t("ton_confrere_ouvre_une_page_a_3c43")}
            />
            <Argument
              icon={<Target />}
              title={t("ce_qu_il_faut_relancer")}
              body={t("trois_piles_d_action_plutot_qu_0d19")}
            />
            <Argument
              icon={<Banknote />}
              title={t("les_commissions_dues")}
              body={t("fixees_a_l_envoi_suivies_jusqu_2085")}
            />
          </ul>
        </div>
      </main>
    </div>
  );
}

function Argument({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <li className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4">
      <span className="text-primary [&_svg]:size-4">{icon}</span>
      <span className="text-sm font-medium">{title}</span>
      <span className="text-xs text-muted-foreground">{body}</span>
    </li>
  );
}
