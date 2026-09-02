"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { RuleFormOptions } from "@/db/queries/rules";
import {
  RULE_ACTIONS,
  RULE_TRIGGERS,
  needsTemplate,
  type RuleConditions,
} from "@/lib/rules/criteria";
import { RULE_TEMPLATE_VARIABLES, renderRuleTemplate } from "@/lib/rules/template";
import { useTranslations } from "next-intl";

/**
 * LE FORMULAIRE D'UNE RÈGLE (§5.4) — une phrase à remplir : déclencheur,
 * seuil, conditions (cases à cocher, comme l'éditeur de critères des
 * cibles), UNE action. Le gabarit n'apparaît que pour les actions qui
 * écrivent un email, avec l'aperçu rendu en direct (valeurs d'exemple) ;
 * la case d'opt-in de l'envoi automatique est SOUS le gabarit affiché en
 * entier — la base la re-vérifie de toute façon (CHECK).
 */

const SELECT_CLASS = "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm";

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
  /** La server action du formulaire (créer ou enregistrer), déjà liée. */
  action: (formData: FormData) => void | Promise<void>;
  initial: RuleFormValue;
  template: { subject: string; body: string } | null;
  options: RuleFormOptions;
  submitLabel: string;
}) {
  const t = useTranslations("rules.editor");
  const [ruleAction, setRuleAction] = useState(initial.action);
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const withTemplate = needsTemplate(ruleAction);

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
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {items.map((item) => (
            <label key={item.id} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name={name} value={item.id} defaultChecked={initial.conditions[name]?.includes(item.id)} />
              {item.label}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );

  return (
    <form action={action} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("la_regle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field label={t("nom_de_la_regle")} htmlFor="rule-name" hint={t("il_devient_le_titre_des_taches")}>
            <Input id="rule-name" name="name" required defaultValue={initial.name} className="max-w-xl" />
          </Field>
          <div className="flex flex-wrap items-end gap-3">
            <Field label={t("declencheur")} htmlFor="rule-trigger">
              <select id="rule-trigger" name="trigger" defaultValue={initial.trigger} className={SELECT_CLASS}>
                {RULE_TRIGGERS.map((trigger) => (
                  <option key={trigger} value={trigger}>
                    {t(`triggers.${trigger}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("depuis_au_moins_jours")} htmlFor="rule-threshold">
              <Input
                id="rule-threshold"
                name="thresholdDays"
                type="number"
                min={1}
                max={365}
                required
                defaultValue={initial.thresholdDays}
                className="w-24"
              />
            </Field>
            <Field label={t("action")} htmlFor="rule-action">
              <select
                id="rule-action"
                name="action"
                value={ruleAction}
                onChange={(event) => setRuleAction(event.target.value)}
                className={SELECT_CLASS}
              >
                {RULE_ACTIONS.map((value) => (
                  <option key={value} value={value}>
                    {t(`actions.${value}`)}
                  </option>
                ))}
              </select>
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
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {options.professions.map((profession) => (
                  <label key={profession} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      name="partnerProfessions"
                      value={profession}
                      defaultChecked={initial.conditions.partnerProfessions?.includes(profession)}
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
            {(subject || body) && (
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("apercu_rendu_valeurs_d_exemple")}</p>
                <p className="font-medium">{renderRuleTemplate(subject, exampleValues)}</p>
                <p className="whitespace-pre-wrap text-muted-foreground">{renderRuleTemplate(body, exampleValues)}</p>
              </div>
            )}
            {ruleAction === "send_email" && (
              <label className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">
                <input type="checkbox" name="confirmAutoSend" defaultChecked={initial.autoSendConfirmed} className="mt-0.5" />
                <span>{t("opt_in_j_ai_relu_ce_gabarit")}</span>
              </label>
            )}
          </CardContent>
        </Card>
      )}

      {ruleAction === "send_email" && (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">{t("rappel_vague_rien_ne_part_sans_clic")}</p>
      )}

      <Button type="submit" className="w-fit">
        {submitLabel}
      </Button>
    </form>
  );
}
