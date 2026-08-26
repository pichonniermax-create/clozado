"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CriteriaEditor } from "@/components/targets/criteria-editor";
import type { TargetFormState } from "@/lib/targets/actions";
import { IDENTITY_FACETS, type CriteriaOptions, type IdentityFacetKey, type SegmentCriteria } from "@/lib/targets/criteria";

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
          <CardTitle>Qui reçoit</CardTitle>
          <CardDescription>
            Un segment vivant se recalcule à chaque consultation depuis tes contacts : change une étiquette sur une fiche,
            la cible bouge. Une sélection manuelle sert quand aucun critère ne dit ce que tu veux.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nom de la cible" htmlFor="target-label">
              <Input id="target-label" name="label" value={v.label} onChange={set("label")} required placeholder="Investisseurs à Lyon" />
            </Field>
            <Field label="À quoi elle sert" htmlFor="target-description" hint="Pour l'équipe — jamais transmis à l'IA.">
              <Input id="target-description" name="description" value={v.description} onChange={set("description")} placeholder="La newsletter mensuelle des clients locatifs" />
            </Field>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="kindChoice" checked={v.kind === "segment"} onChange={() => setV((p) => ({ ...p, kind: "segment" }))} />
              Segment vivant — défini par des critères
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="kindChoice" checked={v.kind === "static"} onChange={() => setV((p) => ({ ...p, kind: "static" }))} />
              Sélection manuelle — des fiches choisies une à une
            </label>
          </div>

          {v.kind === "segment" ? (
            <CriteriaEditor value={v.criteria} onChange={(criteria) => setV((p) => ({ ...p, criteria }))} options={options} />
          ) : (
            <p className="rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
              Les fiches se choisissent sur la page de la cible, {initial ? "plus bas" : "après l'enregistrement"} — par recherche, une ou plusieurs à la fois.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Identité éditoriale</CardTitle>
          <CardDescription>
            C&apos;est ce qui fait un email adressé plutôt qu&apos;un email générique : ces six réponses composent le
            prompt de rédaction. Tout est facultatif — le composer écrit avec ce qui est rempli — mais chaque facette
            vide est une facette devinée.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {IDENTITY_FACETS.map((facet) => (
            <Field key={facet.key} label={facet.label} htmlFor={`target-${facet.key}`} hint={facet.hint}>
              <Textarea id={`target-${facet.key}`} name={facet.key} value={v[facet.key]} onChange={set(facet.key)} className="min-h-14" />
            </Field>
          ))}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Étiquette d'audience" htmlFor="target-audience" hint="Un mot pour situer la cible (« B2C », « Partenaires »…), facultatif.">
              <Input id="target-audience" name="audienceLabel" value={v.audienceLabel} onChange={set("audienceLabel")} />
            </Field>
            {signatories.length > 0 && (
              <Field label="Signataire par défaut" htmlFor="target-signatory">
                <select id="target-signatory" name="defaultSignatoryId" value={v.defaultSignatoryId} onChange={set("defaultSignatoryId")} className={SELECT_CLASS}>
                  <option value="">Aucun</option>
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
        {pending ? "Enregistrement…" : submitLabel}
      </Button>
    </form>
  );
}
