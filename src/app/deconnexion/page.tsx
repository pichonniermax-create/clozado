import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { signOut } from "@/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/session";
import { getTranslations } from "next-intl/server";

/**
 * NOTRE page de déconnexion (correctif du 2026-09-17) — celle qu'Auth.js
 * rendait lui-même (« Are you sure you want to sign out? ») sur un GET de
 * `/api/auth/signout`. Le menu de compte se déconnecte par une action
 * serveur sans passer ici ; cette page ne sert qu'à qui arrive par
 * l'adresse d'Auth.js. Hors du segment /login : une personne connectée doit
 * pouvoir la voir.
 */
export default async function SignOutPage() {
  const [t, session] = await Promise.all([getTranslations("auth.signOutPage"), getSession()]);
  if (!session?.user) redirect("/login");
  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }
  return (
    <AuthShell
      title={t("titre")}
      description={t("description")}
      footer={
        <>
          {t.rich("rester_connecte", { link: (chunks) => <Link href="/dashboard" className="font-medium text-foreground underline underline-offset-4">{chunks}</Link> })}
        </>
      }
    >
      <form action={signOutAction}>
        <Button type="submit" variant="outline" className="w-full">
          <LogOut />
          {t("se_deconnecter")}
        </Button>
      </form>
    </AuthShell>
  );
}
