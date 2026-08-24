import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { buttonVariants } from "@/components/ui/button";

/**
 * Une URL qui ne correspond à rien — hors de la coquille de l'application
 * (Next rend ce fichier dans la mise en page racine). Le cadre des écrans
 * publics fait l'affaire : rien à naviguer, juste repartir d'un endroit sûr.
 */
export default function NotFound() {
  return (
    <AuthShell
      title="Cette page n'existe pas"
      description="L'adresse est peut-être erronée, ou le lien périmé."
    >
      <div className="flex flex-wrap gap-2">
        <Link href="/dashboard" className={buttonVariants()}>
          Aller au tableau de bord
        </Link>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          Accueil
        </Link>
      </div>
    </AuthShell>
  );
}
