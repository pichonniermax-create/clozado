"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUpAction, type AuthFormState } from "@/lib/auth/actions";

const initialState: AuthFormState = { error: null };

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUpAction, initialState);

  // Champs contrôlés à dessein : React 19 réinitialise un formulaire non
  // contrôlé une fois l'action terminée. Sur une erreur de validation, tout
  // ce qui venait d'être saisi disparaissait et il fallait le retaper.
  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState("");

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="organizationName">Nom de ton cabinet</Label>
        <Input
          id="organizationName"
          name="organizationName"
          autoComplete="organization"
          placeholder="Courtier Dupont"
          required
          minLength={2}
          maxLength={120}
          value={organizationName}
          onChange={(e) => setOrganizationName(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          C&apos;est ce nom que verront tes partenaires sur les pages de partage. Tu pourras le
          changer ensuite.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email professionnel</Label>
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
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Création en cours…" : "Créer mon espace"}
      </Button>

      <p className="text-xs text-muted-foreground">
        Tu deviens l&apos;administrateur de cet espace. Pas de mot de passe à retenir : tu
        recevras un lien de connexion par email.
      </p>
    </form>
  );
}
