"use client";

import { Fragment, useActionState, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { RuleFormOptions } from "@/db/queries/rules";
import type { RuleFormState } from "@/lib/rules/actions";
import {
  RULE_ACTIONS,
  RULE_TRIGGERS,
  needsTemplate,
  type RuleConditions,
} from "@/lib/rules/criteria";
import { RULE_TEMPLATE_VARIABLES, invalidTemplateTokens, renderRuleTemplate } from "@/lib/rules/template";
import { useTranslations } from "next-intl";
import { NativeSelect } from "@/components/ui/native-select";

/**
 * LE FORMULAIRE D'UNE RÈGLE (§5.4) — une phrase à remplir : déclencheur,
 * seuil, conditions (cases à cocher, comme l'éditeur de critères des
 * cibles), UNE action. Le gabarit n'apparaît que pour les actions qui
 * écrivent un email, avec l'aperçu rendu en direct (valeurs d'exemple) ;
 * la case d'opt-in de l'envoi automatique est SOUS le gabarit affiché en
 * entier — la base la re-vérifie de toute façon (CHECK).
 *
 * Champs CONTRÔLÉS à dessein (stabilisation, D2) : quand l'action revient
 * avec une erreur, ce qui venait d'être saisi reste à l'écran (React 19
 * vide un formulaire non contrôlé après l'action) ; l'erreur se lit à côté
 * du bouton. Les accolades interdites du gabarit sont signalées AVANT
 * l'envoi : le contrôle est pur, il tourne ici, et la base le refait.
 *
 * Vu au navigateur : React 19 remet le formulaire à zéro quand l'action
 * rend, même en échec, et un `<select>` contrôlé perd alors sa valeur dans
 * le DOM sans que l'état change (les champs texte gardent la leur : React
 * synchronise leur attribut `value`, pas l'option `selected`) — l'action
 * repartait « Créer une tâche » alors que l'écran montrait le gabarit. Les
 * champs sont donc REMONTÉS après chaque retour d'action (`generation`),
 * ce qui réapplique l'état à tout le DOM.
 */

type ConditionKey = "tagsAny" | "targetIds" | "ownerIds" | "partnerProfessions";

type RuleFormValue = {
  name: string;
  trigger: string;
  thresholdDays: number;
  action: string;
  conditions: RuleConditions;
  autoSendConfirmed: boolean;
};

export function RuleForm({
  action,
  initial,
  template,
  options,
  submitLabel,
}: {
  /** La server action du formulaire (créer ou enregistrer), déjà liée — elle rend son échec en état. */
  action: (prev: RuleFormState, formData: FormData) => Promise<RuleFormState>;
  initial: RuleFormValue;
  template: { subject: string; body: string } | null;
  options: RuleFormOptions;
  submitLabel: string;
}) {
  const t = useTranslations("rules.editor");
  const [state, formAction, pending] = useActionState(action, { error: null });
  const [v, setV] = useState<RuleFormValue>(initial);
  const [generation, setGeneration] = useState(0);
  const firstState = useRef(true);
  useEffect(() => {
    // Le premier passage est le montage (l'état initial) : rien à remonter. Ensuite, chaque retour d'action est un nouvel objet.
    if (firstState.current) {
      firstState.current = false;
      return;
    }
    setGeneration((value) => value + 1);
  }, [state]);
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const withTemplate = needsTemplate(v.action);
  const invalidTokens = withTemplate ? [...new Set([...invalidTemplateTokens(subject), ...invalidTemplateTokens(body)])] : [];

  const toggle = (key: ConditionKey, value: string, checked: boolean) =>
    setV((prev) => {
      const current = prev.conditions[key] ?? [];
      const next = checked ? [...new Set([...current, value])] : current.filter((item) => item !== value);
      return { ...prev, conditions: { ...prev.conditions, [key]: next } };
    });

  const exampleValues = useMemo(
    () => ({
      prenom: t("exemple.prenom"),
      nom: t("exemple.nom"),
      nom_complet: t("exemple.nom_complet"),
      societe: t("exemple.societe"),
      organisation: t("exemple.organisation"),
      expediteur: t("exemple.organisation"),
      lien_rdv: "https://calendly.com/exemple",
    }),
    [t]
  );

  const checkboxGroup = (
    name: "tagsAny" | "targetIds" | "ownerIds",
    label: string,
    items: { id: string; label: string }[],
    empty: string
  ) => (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-sm font-medium">{label}</legend>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        // 36 px de haut au doigt (une case native fait 13 px) ; rien ne change à la souris.
        <div className="flex flex-wrap gap-x-4 gap-y-1 sm:gap-y-1.5">
          {items.map((item) => (
            <label key={item.id} className="flex min-h-9 items-center gap-2 text-sm sm:min-h-0">
              <input
                type="checkbox"
                name={name}
                value={item.id}
                checked={v.conditions[name]?.includes(item.id) ?? false}
                onChange={(event) => toggle(name, item.id, event.target.checked)}
              />
              {item.label}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Fragment key={generation}>
      <Card>
        <CardHeader>
          <CardTitle>{t("la_regle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field label={t("nom_de_la_regle")} htmlFor="rule-name" hint={t("il_devient_le_titre_des_taches")}>
            <Input
              id="rule-name"
              name="name"
              required
              value={v.name}
              onChange={(event) => setV((prev) => ({ ...prev, name: event.target.value }))}
              className="max-w-xl"
            />
          </Field>
          {/* `items-start` : les libellés s'alignent en haut quels que soient les contrôles (un select et un champ n'ont pas la même hauteur). */}
          <div className="flex flex-wrap items-start gap-3">
            <Field label={t("declencheur")} htmlFor="rule-trigger">
              <NativeSelect
                id="rule-trigger"
                name="trigger"
                value={v.trigger}
                onChange={(event) => setV((prev) => ({ ...prev, trigger: event.target.value }))}
                className="w-auto max-w-full"
              >
                {RULE_TRIGGERS.map((trigger) => (
                  <option key={trigger} value={trigger}>
                    {t(`triggers.${trigger}`)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {/* « Seuil » + l'unité en suffixe, plutôt que « Depuis au moins (jours) » entre parenthèses. */}
            <Field label={t("seuil")} htmlFor="rule-threshold">
              <div className="flex items-center gap-2">
                <Input
                  id="rule-threshold"
                  name="thresholdDays"
                  type="number"
                  min={1}
                  max={365}
                  required
                  value={v.thresholdDays}
                  onChange={(event) => setV((prev) => ({ ...prev, thresholdDays: Number(event.target.value) }))}
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">{t("jours")}</span>
              </div>
            </Field>
            <Field label={t("action")} htmlFor="rule-action">
              <NativeSelect
                id="rule-action"
                name="action"
                value={v.action}
                onChange={(event) => setV((prev) => ({ ...prev, action: event.target.value }))}
                className="w-auto max-w-full"
              >
                {RULE_ACTIONS.map((value) => (
                  <option key={value} value={value}>
                    {t(`actions.${value}`)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("conditions")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">{t("tout_ce_qui_n_est_pas_coche_vaut_peu_importe")}</p>
          {checkboxGroup("tagsAny", t("porte_au_moins_une_de_ces_etiquettes"), options.tags, t("aucune_etiquette"))}
          {checkboxGroup("targetIds", t("fait_partie_d_au_moins_une_de_ces_cibles"), options.targets, t("aucune_cible"))}
          {checkboxGroup("ownerIds", t("suivi_par_l_un_de_ces_conseillers"), options.owners, t("aucun_conseiller"))}
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-sm font-medium">{t("est_un_partenaire_de_l_une_de_ces_professions")}</legend>
            {options.professions.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("aucune_profession_de_partenaire")}</p>
            ) : (
              <div className="flex flex-wrap gap-x-4 gap-y-1 sm:gap-y-1.5">
                {options.professions.map((profession) => (
                  <label key={profession} className="flex min-h-9 items-center gap-2 text-sm sm:min-h-0">
                    <input
                      type="checkbox"
                      name="partnerProfessions"
                      value={profession}
                      checked={v.conditions.partnerProfessions?.includes(profession) ?? false}
                      onChange={(event) => toggle("partnerProfessions", profession, event.target.checked)}
                    />
                    {profession}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        </CardContent>
      </Card>

      {withTemplate && (
        <Card>
          <CardHeader>
            <CardTitle>{t("le_gabarit")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field label={t("objet")} htmlFor="rule-template-subject">
              <Input
                id="rule-template-subject"
                name="templateSubject"
                required={withTemplate}
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                className="max-w-xl"
              />
            </Field>
            <Field label={t("corps")} htmlFor="rule-template-body" hint={t("variables_permises")}>
              <Textarea
                id="rule-template-body"
                name="templateBody"
                required={withTemplate}
                rows={8}
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              {RULE_TEMPLATE_VARIABLES.map((variable) => `{${variable}}`).join(" · ")}
            </p>
            {invalidTokens.length > 0 && (
              <p role="alert" className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">
                {t("accolades_interdites", { tokens: invalidTokens.join(" ") })}
              </p>
            )}
            {(subject || body) && (
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("apercu_rendu_valeurs_d_exemple")}</p>
                <p className="font-medium">{renderRuleTemplate(subject, exampleValues)}</p>
                <p className="whitespace-pre-wrap text-muted-foreground">{renderRuleTemplate(body, exampleValues)}</p>
              </div>
            )}
            {v.action === "send_email" && (
              <label className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  name="confirmAutoSend"
                  checked={v.autoSendConfirmed}
                  onChange={(event) => setV((prev) => ({ ...prev, autoSendConfirmed: event.target.checked }))}
                  className="mt-0.5"
                />
                <span>{t("opt_in_j_ai_relu_ce_gabarit")}</span>
              </label>
            )}
          </CardContent>
        </Card>
      )}

      {v.action === "send_email" && (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">{t("rappel_vague_rien_ne_part_sans_clic")}</p>
      )}
      </Fragment>

      {/* Une échappatoire explicite à côté du bouton d'envoi : avant, le retour se faisait par le fil, tout en haut.
          L'erreur de l'action vit ici aussi : elle se lit au clic, la saisie reste. */}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || invalidTokens.length > 0}>
          {pending ? t("enregistrement") : submitLabel}
        </Button>
        <Link href="/regles" className={buttonVariants({ variant: "ghost" })}>
          {t("annuler")}
        </Link>
        {state.error && (
          <p role="alert" className="min-w-0 flex-1 text-sm text-destructive text-pretty">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
