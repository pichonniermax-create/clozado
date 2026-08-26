"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { signUpAction, type AuthFormState } from "@/lib/auth/actions";
import { useTranslations } from "next-intl";

const initialState: AuthFormState = { error: null };

export function SignUpForm() {
  const t = useTranslations("auth.signUpForm");
  const [state, action, pending] = useActionState(signUpAction, initialState);

  // Champs contrôlés à dessein : React 19 réinitialise un formulaire non
  // contrôlé une fois l'action terminée. Sur une erreur de validation, tout
  // ce qui venait d'être saisi disparaissait et il fallait le retaper.
  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState("");

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field
        label={t("nom_de_ton_cabinet")}
        htmlFor="organizationName"
        hint={
          <>
            {t("c_est_ce_nom_que_verront_5ed5")}
          </>
        }
      >
        <Input
          id="organizationName"
          name="organizationName"
          autoComplete="organization"
          placeholder={t("courtier_dupont")}
          required
          minLength={2}
          maxLength={120}
          value={organizationName}
          onChange={(e) => setOrganizationName(e.target.value)}
        />
      </Field>

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

      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? t("creation_en_cours") : t("creer_mon_espace")}
      </Button>

      <p className="text-xs text-muted-foreground">
        {t("tu_deviens_l_administrateur_de_cet_19d2")}
      </p>
    </form>
  );
}
