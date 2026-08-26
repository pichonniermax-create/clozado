"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CriteriaEditor } from "@/components/targets/criteria-editor";
import type { TargetFormState } from "@/lib/targets/actions";
import { IDENTITY_FACET_KEYS, type CriteriaOptions, type IdentityFacetKey, type SegmentCriteria } from "@/lib/targets/criteria";
import { useTranslations } from "next-intl";

export type TargetFormInitial = {
  label: string;
  description: string;
  kind: "segment" | "static";
  criteria: SegmentCriteria;
  audienceLabel: string;
  defaultSignatoryId: string;
} & Record<IdentityFacetKey, string>;

const EMPTY: TargetFormInitial = {
  label: "",
  description: "",
  kind: "segment",
  criteria: {},
  audienceLabel: "",
  defaultSignatoryId: "",
  persona: "",
  concerns: "",
  knowledgeLevel: "",
  editorialVoice: "",
  interests: "",
  avoid: "",
};

const SELECT_CLASS = "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm";

/**
 * Le formulaire d'une cible — création et édition, le même. Champs
 * contrôlés à dessein : quand l'action revient avec une erreur, ce qui
 * venait d'être saisi doit rester à l'écran (React 19 vide un formulaire
 * non contrôlé après l'action). Les critères vivent dans l'état et partent
 * en JSON dans un champ caché ; l'action les revalide.
 */
export function TargetForm({
  action,
  options,
  signatories,
  initial,
  submitLabel,
}: {
  action: (prev: TargetFormState, formData: FormData) => Promise<TargetFormState>;
  options: CriteriaOptions;
  signatories: { id: string; name: string; jobTitle: string | null }[];
  initial?: TargetFormInitial;
  submitLabel: string;
}) {
  const t = useTranslations("targets.targetForm");
  const tt = useTranslations("targets");
  const [state, formAction, pending] = useActionState(action, { error: null });
  const [v, setV] = useState<TargetFormInitial>(initial ?? EMPTY);
  const set = (key: keyof TargetFormInitial) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setV((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="kind" value={v.kind} />
      <input type="hidden" name="criteria" value={JSON.stringify(v.criteria)} />

      <Card>
        <CardHeader>
          <CardTitle>{t("qui_recoit")}</CardTitle>
          <CardDescription>
            {t("un_segment_vivant_se_recalcule_a_6474")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("nom_de_la_cible")} htmlFor="target-label">
              <Input id="target-label" name="label" value={v.label} onChange={set("label")} required placeholder={t("investisseurs_a_lyon")} />
            </Field>
            <Field label={t("a_quoi_elle_sert")} htmlFor="target-description" hint={t("pour_l_equipe_jamais_transmis_a_d044")}>
              <Input id="target-description" name="description" value={v.description} onChange={set("description")} placeholder={t("la_newsletter_mensuelle_des_clients_locatifs")} />
            </Field>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="kindChoice" checked={v.kind === "segment"} onChange={() => setV((p) => ({ ...p, kind: "segment" }))} />
              {t("segment_vivant_defini_par_des_criteres")}
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="kindChoice" checked={v.kind === "static"} onChange={() => setV((p) => ({ ...p, kind: "static" }))} />
              {t("selection_manuelle_des_fiches_choisies_une_fb4d")}
            </label>
          </div>

          {v.kind === "segment" ? (
            <CriteriaEditor value={v.criteria} onChange={(criteria) => setV((p) => ({ ...p, criteria }))} options={options} />
          ) : (
            <p className="rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
              {t("les_fiches_se_choisissent_sur_la_f8d6", { value: initial ? t("plus_bas") : t("apres_l_enregistrement") })}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("identite_editoriale")}</CardTitle>
          <CardDescription>
            {t("c_est_ce_qui_fait_un_53e0")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {IDENTITY_FACET_KEYS.map((key) => (
            <Field key={key} label={tt(`facets.${key}.label`)} htmlFor={`target-${key}`} hint={tt(`facets.${key}.hint`)}>
              <Textarea id={`target-${key}`} name={key} value={v[key]} onChange={set(key)} className="min-h-14" />
            </Field>
          ))}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("etiquette_d_audience")} htmlFor="target-audience" hint={t("un_mot_pour_situer_la_cible_bd83")}>
              <Input id="target-audience" name="audienceLabel" value={v.audienceLabel} onChange={set("audienceLabel")} />
            </Field>
            {signatories.length > 0 && (
              <Field label={t("signataire_par_defaut")} htmlFor="target-signatory">
                <select id="target-signatory" name="defaultSignatoryId" value={v.defaultSignatoryId} onChange={set("defaultSignatoryId")} className={SELECT_CLASS}>
                  <option value="">{t("aucun")}</option>
                  {signatories.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.jobTitle ? ` — ${s.jobTitle}` : ""}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
        </CardContent>
      </Card>

      {state.error && (
        <p role="alert" className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">
          {state.error}
        </p>
      )}

      <Button type="submit" className="w-fit" disabled={pending}>
        {pending ? t("enregistrement") : submitLabel}
      </Button>
    </form>
  );
}
