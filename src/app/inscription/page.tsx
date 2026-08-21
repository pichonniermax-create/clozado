import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpForm } from "@/components/auth/sign-up-form";

export const metadata: Metadata = {
  title: "Créer un espace — Clozado",
};

export default function SignUpPage() {
  return (
    <AuthShell
      title="Créer un espace Clozado"
      description="Ton espace est isolé : tes affaires, tes partenaires et tes commissions n'appartiennent qu'à toi."
      footer={
        <>
          Tu as déjà un espace ?{" "}
          <Link
            href="/login"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Se connecter
          </Link>
        </>
      }
    >
      <SignUpForm />
    </AuthShell>
  );
}
