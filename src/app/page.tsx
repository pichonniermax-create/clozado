import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Banknote, Share2, Target } from "lucide-react";
import { auth } from "@/auth";
import { BrandMark } from "@/components/app-shell/brand-mark";
import { buttonVariants } from "@/components/ui/button";

/**
 * Porte d'entrée du produit. Remplace le placeholder du scaffold initial
 * (« Fondation technique — le projet est initialisé »), qui n'avait plus de
 * raison d'être maintenant qu'un espace peut se créer tout seul.
 *
 * Quelqu'un de déjà connecté n'a rien à faire ici : on l'envoie directement
 * dans son espace.
 */
export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <header className="flex items-center justify-between px-6 py-5">
        <BrandMark size="lg" />
        <Link href="/login" className={buttonVariants({ variant: "ghost" })}>
          Se connecter
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="flex w-full max-w-2xl flex-col items-center gap-8 text-center">
          <div className="flex flex-col gap-4">
            <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Partage tes affaires entre confrères, sans perdre le fil
            </h1>
            <p className="text-base text-muted-foreground text-pretty">
              Clozado n&apos;est pas un CRM : tu gardes le tien. C&apos;est l&apos;outil qui
              suit ce que tu as confié à un apporteur — qui n&apos;a pas répondu, ce qui
              stagne, et quelles commissions te restent dues.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/inscription" className={buttonVariants({ size: "lg" })}>
              Créer un espace
              <ArrowRight />
            </Link>
            <Link href="/login" className={buttonVariants({ variant: "outline", size: "lg" })}>
              J&apos;ai déjà un compte
            </Link>
          </div>

          <ul className="grid w-full grid-cols-1 gap-3 pt-4 text-left sm:grid-cols-3">
            <Argument
              icon={<Share2 />}
              title="Un lien, pas un compte"
              body="Ton confrère ouvre une page à ton nom et répond. Il n'a rien à installer."
            />
            <Argument
              icon={<Target />}
              title="Ce qu'il faut relancer"
              body="Trois piles d'action plutôt qu'une liste triée par date."
            />
            <Argument
              icon={<Banknote />}
              title="Les commissions dues"
              body="Fixées à l'envoi, suivies jusqu'au règlement. L'outil n'encaisse rien."
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
