import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { resolveInvitation } from "@/db/queries/workspace-invitations";
import { INVITATION_PARAM, isInvitationTokenShape } from "@/lib/invitations/token";
import { PRODUCT_NAME } from "@/lib/brand";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.signup");
  return { title: t("creer_un_espace_product", { product: PRODUCT_NAME }) };
}

/**
 * /inscription — l'inscription libre, et l'inscription SUR INVITATION
 * (docs/module-invitations.md §1.2) quand l'adresse porte un jeton : le nom
 * de l'entreprise est pré-rempli, l'adresse réservée est verrouillée, le
 * jeton voyage dans un champ caché jusqu'à l'action. Un jeton qui n'est
 * plus valable ne bloque pas la personne : elle le voit, et le formulaire
 * libre reste là. Rien de l'invitation n'est révélé au-delà de ce que le
 * formulaire montre (jamais l'auteur, jamais la note).
 */
export default async function SignUpPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [t, params] = await Promise.all([getTranslations("auth.signup"), searchParams]);
  const token = params[INVITATION_PARAM];
  const resolved = token ? (isInvitationTokenShape(token) ? await resolveInvitation(token) : { ok: false as const, reason: "not_found" as const }) : null;
  const invitation = resolved?.ok && token ? { token, organizationName: resolved.invitation.organizationName, email: resolved.invitation.email } : null;
  const invalid = resolved !== null && !resolved.ok;

  return (
    <AuthShell
      title={invitation ? t("invitation_titre", { name: invitation.organizationName }) : t("creer_un_espace_clozado")}
      description={invitation ? t("invitation_description", { product: PRODUCT_NAME }) : t("ton_espace_est_isole_tes_affaires_b093")}
      footer={
        <>
          {t.rich("tu_as_deja_un_espace_se_6820", {
            link: (chunks) => (
              <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
                {chunks}
              </Link>
            ),
          })}
        </>
      }
    >
      {invalid && (
        <div role="alert" className="flex flex-col gap-1 rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">
          <p className="font-medium">{t("invitation_invalide_titre")}</p>
          <p className="text-muted-foreground">{t("invitation_invalide")}</p>
        </div>
      )}
      <SignUpForm invitation={invitation} />
    </AuthShell>
  );
}
