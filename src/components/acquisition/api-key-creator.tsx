"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createApiKeyAction, type ApiKeyState } from "@/lib/acquisition/actions";

/**
 * Création d'une clé d'API : la valeur en clair n'existe qu'ici, une fois,
 * dans la réponse de l'action — jamais dans une URL, jamais en base (seule
 * son empreinte y est). Fermer l'écran, c'est la perdre : on le dit.
 */
export function ApiKeyCreator() {
  const [state, action, pending] = useActionState<ApiKeyState, FormData>(createApiKeyAction, {
    key: null,
    prefix: null,
    label: null,
    error: null,
  });

  return (
    <div className="flex flex-col gap-3">
      {state.key && (
        <div className="flex flex-col gap-2 rounded-lg border border-success/40 bg-success/5 p-3">
          <p className="text-sm font-medium">
            Clé « {state.label} » créée — copie-la maintenant, elle ne sera plus jamais affichée.
          </p>
          <code className="rounded-md bg-background px-2 py-1.5 text-xs break-all select-all">{state.key}</code>
          <p className="text-xs text-muted-foreground">
            À transmettre à ton intégrateur, côté serveur uniquement : <code>Authorization: Bearer {state.prefix}…</code>
          </p>
        </div>
      )}
      {state.error && (
        <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">{state.error}</p>
      )}
      <form action={action} className="flex flex-wrap items-end gap-2">
        <Field label="Nouvelle clé d'API" htmlFor="api-key-label" hint="Un nom par intégration (« Simulateur crédit — serveur »), pour savoir quoi révoquer plus tard." className="flex-1">
          <Input id="api-key-label" name="label" required placeholder="Simulateur crédit — serveur" />
        </Field>
        <Button type="submit" variant="outline" disabled={pending}>
          <KeyRound />
          Créer la clé
        </Button>
      </form>
    </div>
  );
}
