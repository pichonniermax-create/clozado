import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/sign-in-form";

/**
 * Messages volontairement NEUTRES : aucun ne confirme ni n'infirme
 * l'existence d'un compte pour l'adresse saisie. C'est la même discipline
 * que la page d'erreur du partage (src/app/partage/[token]/page.tsx), qui
 * refuse de distinguer « n'existe pas » de « n'est plus valable ».
 *
 * Avant, `AccessDenied` répondait « Cet email n'est pas reconnu » : il
 * suffisait d'essayer des adresses pour savoir lesquelles avaient un compte.
 * Le message renvoie maintenant vers l'inscription sans rien affirmer — ce
 * qui est aussi plus utile, puisqu'un espace peut désormais se créer seul.
 */
const errorMessages: Record<string, string> = {
  AccessDenied:
    "Connexion impossible avec cette adresse. Si tu n'as pas encore d'espace Clozado, crée-le en quelques secondes.",
  Verification: "Ce lien de connexion a expiré ou a déjà été utilisé. Demande-en un nouveau.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorMessage = error ? (errorMessages[error] ?? "Une erreur est survenue.") : null;

  return (
    <AuthShell
      title="Se connecter"
      description="Entre ton email professionnel, tu recevras un lien de connexion."
      footer={
        <>
          Pas encore d&apos;espace ?{" "}
          <Link
            href="/inscription"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Créer un espace
          </Link>
        </>
      }
    >
      <SignInForm initialError={errorMessage} />
    </AuthShell>
  );
}
