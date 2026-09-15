"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { signUpAction, type AuthFormState } from "@/lib/auth/actions";
import { useTranslations } from "next-intl";

const initialState: AuthFormState = { error: null };

/** Ce qu'une invitation à créer un espace apporte au formulaire (docs/module-invitations.md §1.2) : le jeton, le nom, l'adresse réservée. */
export type SignUpInvitation = { token: string; organizationName: string; email: string | null };

export function SignUpForm({ invitation = null }: { invitation?: SignUpInvitation | null }) {
  const t = useTranslations("auth.signUpForm");
  const [state, action, pending] = useActionState(signUpAction, initialState);

  // Champs contrôlés à dessein : React 19 réinitialise un formulaire non
  // contrôlé une fois l'action terminée. Sur une erreur de validation, tout
  // ce qui venait d'être saisi disparaissait et il fallait le retaper.
  const [organizationName, setOrganizationName] = useState(invitation?.organizationName ?? "");
  const [email, setEmail] = useState(invitation?.email ?? "");
  // L'adresse réservée par l'invitation ne se change pas ici : le serveur la refuserait de toute façon.
  const emailLocked = Boolean(invitation?.email);

  return (
    <form action={action} className="flex flex-col gap-4">
      {invitation && <input type="hidden" name="invitation" value={invitation.token} />}
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
          className="pointer-coarse:h-10"
        />
      </Field>

      <Field label={t("email_professionnel")} htmlFor="email" hint={emailLocked ? t("reserve_a_cette_adresse") : undefined}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder={t("toi_cabinet_fr")}
          required
          readOnly={emailLocked}
          aria-readonly={emailLocked || undefined}
          className={emailLocked ? "bg-muted/60 text-muted-foreground pointer-coarse:h-10" : "pointer-coarse:h-10"}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "signup-error" : undefined}
        />
      </Field>

      {state.error && (
        // L'action ne renvoie qu'une erreur : elle est rattachée à l'adresse (le champ le plus souvent en cause).
        <p id="signup-error" role="alert" className="text-sm text-destructive">
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
