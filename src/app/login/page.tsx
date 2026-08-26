import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/sign-in-form";
import { getTranslations } from "next-intl/server";

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
/** Les codes d'erreur d'Auth.js qui ont une phrase (`auth.login.errors.<code>`) ; tout autre code reçoit la phrase générique. */
// eslint-disable-next-line local/no-visible-text -- les codes d'erreur d'Auth.js, pas des textes
const KNOWN_ERRORS = ["AccessDenied", "Verification"] as const;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const t = await getTranslations("auth.login");
  const { error } = await searchParams;
  const errorMessage = error ? ((KNOWN_ERRORS as readonly string[]).includes(error) ? t(`errors.${error as (typeof KNOWN_ERRORS)[number]}`) : t("une_erreur_est_survenue")) : null;

  return (
    <AuthShell
      title={t("se_connecter")}
      description={t("entre_ton_email_professionnel_tu_recevras_8992")}
      footer={
        <>
          {t.rich("pas_encore_d_espace_creer_un_eeb0", { link: (chunks) => <Link href="/inscription"
            className="font-medium text-foreground underline underline-offset-4">{chunks}</Link> })}
        </>
      }
    >
      <SignInForm initialError={errorMessage} />
    </AuthShell>
  );
}
