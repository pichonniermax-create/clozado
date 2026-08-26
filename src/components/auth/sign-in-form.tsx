"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { signInAction, type AuthFormState } from "@/lib/auth/actions";
import { useTranslations } from "next-intl";

const initialState: AuthFormState = { error: null };

export function SignInForm({ initialError }: { initialError?: string | null }) {
  const t = useTranslations("auth.signInForm");
  const [state, action, pending] = useActionState(signInAction, initialState);
  // Contrôlé : React 19 vide un formulaire non contrôlé après l'action, ce
  // qui obligeait à ressaisir son adresse après la moindre erreur.
  const [email, setEmail] = useState("");

  // `initialError` vient de ?error= dans l'URL (retour d'Auth.js) ; `state`
  // vient de la soumission en cours. La seconde prime : elle est plus récente.
  const error = state.error ?? initialError ?? null;

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label={t("email_professionnel")} htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder={t("toi_cabinet_fr")}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? t("envoi_en_cours") : t("recevoir_le_lien_de_connexion")}
      </Button>

      <p className="text-xs text-muted-foreground">
        {t("pas_de_mot_de_passe_tu_3f5a")}
      </p>
    </form>
  );
}
