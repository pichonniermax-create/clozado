"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { signInAction, type AuthFormState } from "@/lib/auth/actions";
import { useTranslations } from "next-intl";

const initialState: AuthFormState = { error: null };

export function SignInForm({
  initialError,
  initialEmail = "",
  submitLabel,
}: {
  initialError?: string | null;
  /** L'adresse déjà connue (un lien expiré, une erreur) : pré-remplie, la personne n'a qu'à cliquer. */
  initialEmail?: string;
  /** Le libellé du bouton quand ce n'est pas la première demande (« Recevoir un nouveau lien »). */
  submitLabel?: string;
}) {
  const t = useTranslations("auth.signInForm");
  const [state, action, pending] = useActionState(signInAction, initialState);
  // Contrôlé : React 19 vide un formulaire non contrôlé après l'action, ce
  // qui obligeait à ressaisir son adresse après la moindre erreur.
  const [email, setEmail] = useState(initialEmail);

  // `initialError` vient de ?error= dans l'URL (retour d'Auth.js) ; `state`
  // vient de la soumission en cours. La seconde prime : elle est plus récente.
  const error = state.error ?? initialError ?? null;

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label={t("email_professionnel")} htmlFor="email">
        {/* Le seul champ de l'écran, rempli surtout depuis un téléphone : 40 px au doigt. L'erreur est RELIÉE au champ. */}
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder={t("toi_cabinet_fr")}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "email-error" : undefined}
          className="pointer-coarse:h-10"
        />
      </Field>

      {error && (
        <p id="email-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? t("envoi_en_cours") : (submitLabel ?? t("recevoir_le_lien_de_connexion"))}
      </Button>
    </form>
  );
}
