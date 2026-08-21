import Link from "next/link";
import { MailCheck } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";

/**
 * Écran d'arrivée après l'envoi du lien — commun à la connexion ET à
 * l'inscription : dans les deux cas la suite est la même (ouvrir sa boîte
 * mail). Il ne dit jamais si un compte vient d'être créé ou s'il existait
 * déjà, sans quoi il suffirait de soumettre une adresse pour le savoir.
 */
export default function VerifyRequestPage() {
  return (
    <AuthShell
      title="Vérifie tes emails"
      description="Un lien de connexion vient de t'être envoyé. Clique dessus pour accéder à ton espace."
      footer={
        <>
          Mauvaise adresse ?{" "}
          <Link
            href="/login"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Recommencer
          </Link>
        </>
      }
    >
      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/50 px-4 py-3">
        <MailCheck className="mt-0.5 size-4 shrink-0 text-success" />
        <div className="flex flex-col gap-1 text-sm">
          <p className="font-medium">Le lien est valable une seule fois.</p>
          <p className="text-muted-foreground">
            Rien reçu après quelques minutes ? Vérifie tes spams, puis retente depuis la page de
            connexion.
          </p>
        </div>
      </div>
    </AuthShell>
  );
}
