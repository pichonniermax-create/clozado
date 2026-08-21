"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { signInAction, type AuthFormState } from "@/lib/auth/actions";

const initialState: AuthFormState = { error: null };

export function SignInForm({ initialError }: { initialError?: string | null }) {
  const [state, action, pending] = useActionState(signInAction, initialState);
  // Contrôlé : React 19 vide un formulaire non contrôlé après l'action, ce
  // qui obligeait à ressaisir son adresse après la moindre erreur.
  const [email, setEmail] = useState("");

  // `initialError` vient de ?error= dans l'URL (retour d'Auth.js) ; `state`
  // vient de la soumission en cours. La seconde prime : elle est plus récente.
  const error = state.error ?? initialError ?? null;

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Email professionnel" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="toi@cabinet.fr"
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
        {pending ? "Envoi en cours…" : "Recevoir le lien de connexion"}
      </Button>

      <p className="text-xs text-muted-foreground">
        Pas de mot de passe : tu reçois un lien qui te connecte en un clic.
      </p>
    </form>
  );
}
