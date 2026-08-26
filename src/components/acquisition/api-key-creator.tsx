"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createApiKeyAction, type ApiKeyState } from "@/lib/acquisition/actions";
import { useTranslations } from "next-intl";

/**
 * Création d'une clé d'API : la valeur en clair n'existe qu'ici, une fois,
 * dans la réponse de l'action — jamais dans une URL, jamais en base (seule
 * son empreinte y est). Fermer l'écran, c'est la perdre : on le dit.
 */
export function ApiKeyCreator() {
  const t = useTranslations("settings.apiKeyCreator");
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
            {t("cle_creee_copie_la_maintenant_elle_0440", { label: (state.label) ?? "" })}
          </p>
          <code className="rounded-md bg-background px-2 py-1.5 text-xs break-all select-all">{state.key}</code>
          <p className="text-xs text-muted-foreground">
            {t.rich("a_transmettre_a_ton_integrateur_cote_a4a1", { prefix: (state.prefix) ?? "", code: (chunks) => <code>{chunks}</code> })}
          </p>
        </div>
      )}
      {state.error && (
        <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">{state.error}</p>
      )}
      <form action={action} className="flex flex-wrap items-end gap-2">
        <Field label={t("nouvelle_cle_d_api")} htmlFor="api-key-label" hint={t("un_nom_par_integration_simulateur_credit_b255")} className="flex-1">
          <Input id="api-key-label" name="label" required placeholder={t("simulateur_credit_serveur")} />
        </Field>
        <Button type="submit" variant="outline" disabled={pending}>
          <KeyRound />
          {t("creer_la_cle")}
        </Button>
      </form>
    </div>
  );
}
