import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/sign-in-form";
import { Button } from "@/components/ui/button";
import { DetailsCard } from "@/components/ui/details-card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { isPlausibleEmail } from "@/lib/email/address";
import { redirect } from "next/navigation";
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
  searchParams: Promise<{ error?: string; code?: string; email?: string; callbackUrl?: string }>;
}) {
  // Une session en cours ne voit jamais cet écran : le layout du segment la renvoie à son espace (stabilisation, P8).
  const [t, tc, params] = await Promise.all([getTranslations("auth.login"), getTranslations("auth.code"), searchParams]);
  // Auth.js ajoute `?callbackUrl=` quand on arrive par son adresse de connexion ; le produit n'en fait rien (la connexion
  // mène toujours au tableau de bord) : l'adresse est nettoyée pour ne pas montrer un paramètre qui ne sert à personne.
  if (params.callbackUrl !== undefined) redirect("/login");
  const { error } = params;
  const errorMessage = error ? ((KNOWN_ERRORS as readonly string[]).includes(error) ? t(`errors.${error as (typeof KNOWN_ERRORS)[number]}`) : t("une_erreur_est_survenue")) : null;
  // Le retour de la route du code (`?code=invalid|locked`) : une phrase, jamais un fait sur l'adresse.
  const codeMessage = params.code === "locked" ? tc("trop_d_essais") : params.code ? tc("code_incorrect_ou_expire") : null;
  const knownEmail = isPlausibleEmail(params.email ?? "") ? (params.email ?? "").toLowerCase() : "";

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
      <SignInForm initialError={errorMessage} initialEmail={knownEmail} />
      {/* Le code à six chiffres reçu dans le même email (correctif du 2026-09-17) : pour quand le lien pose problème. */}
      <DetailsCard id="code" variant="archive" summary={tc("j_ai_recu_un_code")} defaultOpen={Boolean(codeMessage)}>
        <form method="post" action="/login/code/valider" className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">{tc("description")}</p>
          <Field label={tc("email")} htmlFor="code-email">
            <Input id="code-email" name="email" type="email" autoComplete="email" required defaultValue={knownEmail} />
          </Field>
          <Field label={tc("code")} htmlFor="code-value">
            <Input id="code-value" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required placeholder="123 456" className="w-40 tracking-widest tabular-nums" aria-invalid={codeMessage ? true : undefined} aria-describedby={codeMessage ? "code-error" : undefined} />
          </Field>
          {codeMessage && (
            <p id="code-error" role="alert" className="text-sm text-destructive">
              {codeMessage}
            </p>
          )}
          <Button type="submit" variant="outline" className="w-fit">
            {tc("me_connecter_avec_le_code")}
          </Button>
        </form>
      </DetailsCard>
    </AuthShell>
  );
}
