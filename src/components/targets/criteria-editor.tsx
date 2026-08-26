"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { previewSegmentAction } from "@/lib/targets/actions";
import {
  CONTACT_SOURCES,
  DEAL_PRESENCES,
  normalizeCriteria,
  type ContactSource,
  type CriteriaOptions,
  type DealPresence,
  type SegmentCriteria,
} from "@/lib/targets/criteria";
import type { SegmentPreview } from "@/db/queries/mail-targets";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

/**
 * L'ÉDITEUR DE CRITÈRES — lisible par un non-technicien : une ligne par
 * critère, une phrase par ligne, des cases et des listes, jamais un
 * opérateur ni une syntaxe. Tout ce qui n'est pas renseigné vaut « peu
 * importe ». En bas, l'aperçu permanent : combien de contacts répondent
 * aux critères à cet instant, combien n'ont pas d'adresse email, et
 * quelques noms — recalculé à chaque changement (délai de 300 ms), par la
 * même fonction SQL que la liste et le compte de la cible.
 */
const SELECT_CLASS = "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm";

export function CriteriaEditor({
  value,
  onChange,
  options,
}: {
  value: SegmentCriteria;
  onChange: (next: SegmentCriteria) => void;
  options: CriteriaOptions;
}) {
  const tr = useTranslations("targets.criteriaEditor");
  const tt = useTranslations("targets");
  const c = value;
  const set = <K extends keyof SegmentCriteria>(key: K, v: SegmentCriteria[K] | undefined) => {
    const next = { ...c, [key]: v } as SegmentCriteria;
    if (v === undefined || (Array.isArray(v) && v.length === 0)) delete next[key];
    onChange(normalizeCriteria(next));
  };
  const toggle = (key: "tagsAny" | "tagsNone" | "ownerIds" | "dealStageIds" | "dealPipelineIds" | "originIds", id: string) => {
    const list = c[key] ?? [];
    set(key, list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };
  const toggleSource = (s: ContactSource) => {
    const list = c.sources ?? [];
    set("sources", list.includes(s) ? list.filter((x) => x !== s) : [...list, s]);
  };
  const stages = options.pipelines.flatMap((p) => p.stages.map((s) => ({ ...s, pipelineLabel: p.label })));
  const seniority = c.createdMoreThanDays !== undefined ? "more" : c.createdLessThanDays !== undefined ? "less" : "";
  const seniorityDays = c.createdMoreThanDays ?? c.createdLessThanDays ?? 30;

  return (
    <div className="flex flex-col gap-5">
      <Group title={tr("qui")}>
        <Row label={tr("type_de_fiche")}>
          <select
            className={SELECT_CLASS}
            value={c.kind ?? ""}
            onChange={(e) => set("kind", (e.target.value || undefined) as SegmentCriteria["kind"])}
            aria-label={tr("type_de_fiche")}
          >
            <option value="">{tr("personnes_et_societes")}</option>
            <option value="person">{tr("personnes_seulement")}</option>
            <option value="company">{tr("societes_seulement")}</option>
          </select>
        </Row>
        <Row label={tr("porte_au_moins_une_de_ces_b799")} hint={options.tags.length === 0 ? tr("aucune_etiquette_dans_ton_organisation_pour_3f45") : undefined}>
          <CheckList items={options.tags.map((t) => ({ id: t.id, label: t.label }))} selected={c.tagsAny ?? []} onToggle={(id) => toggle("tagsAny", id)} />
        </Row>
        {options.tags.length > 0 && (
          <Row label={tr("n_en_porte_aucune_de_celles_4f95")}>
            <CheckList items={options.tags.map((t) => ({ id: t.id, label: t.label }))} selected={c.tagsNone ?? []} onToggle={(id) => toggle("tagsNone", id)} />
          </Row>
        )}
        <Row label={tr("age")} hint={tr("personnes_physiques_dont_la_date_de_bcf7")}>
          <div className="flex items-center gap-2 text-sm">
            <span>{tr("de")}</span>
            <Input type="number" min={0} max={120} className="w-20 text-right tabular-nums" value={c.ageMin ?? ""} onChange={(e) => set("ageMin", e.target.value === "" ? undefined : Number(e.target.value))} aria-label={tr("age_minimum")} />
            <span>{tr("a")}</span>
            <Input type="number" min={0} max={120} className="w-20 text-right tabular-nums" value={c.ageMax ?? ""} onChange={(e) => set("ageMax", e.target.value === "" ? undefined : Number(e.target.value))} aria-label={tr("age_maximum")} />
            <span>{tr("ans")}</span>
          </div>
        </Row>
        <Row label={tr("adresse_email")}>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={c.hasEmail === true} onChange={(e) => set("hasEmail", e.target.checked ? true : undefined)} />
            {tr("seulement_les_fiches_qui_ont_une_0ea2")}
          </label>
        </Row>
      </Group>

      <Group title={tr("ou")}>
        <Row label={tr("ville")} hint={tr("plusieurs_villes_separe_les_par_des_9a68")}>
          <ListInput value={c.cities ?? []} onChange={(v) => set("cities", v)} suggestions={options.cities} placeholder={tr("lyon_villeurbanne")} listId="cities" />
        </Row>
        <Row label={tr("pays")} hint={tr("tel_qu_il_est_ecrit_sur_75be")}>
          <ListInput value={c.countries ?? []} onChange={(v) => set("countries", v)} suggestions={options.countries} placeholder={tr("france")} listId="countries" />
        </Row>
      </Group>

      <Group title={tr("suivi")}>
        {options.users.length > 0 && (
          <Row label={tr("conseiller_attribue")}>
            <CheckList items={options.users.map((u) => ({ id: u.id, label: u.name || u.email || "—" }))} selected={c.ownerIds ?? []} onToggle={(id) => toggle("ownerIds", id)} />
          </Row>
        )}
        <Row label={tr("anciennete_de_la_fiche")}>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <select
              className={SELECT_CLASS}
              value={seniority}
              onChange={(e) => {
                const v = e.target.value;
                const next = { ...c } as SegmentCriteria;
                delete next.createdMoreThanDays;
                delete next.createdLessThanDays;
                if (v === "more") next.createdMoreThanDays = seniorityDays;
                if (v === "less") next.createdLessThanDays = seniorityDays;
                onChange(normalizeCriteria(next));
              }}
              aria-label={tr("anciennete_de_la_fiche")}
            >
              <option value="">{tr("peu_importe")}</option>
              <option value="more">{tr("creee_il_y_a_plus_de")}</option>
              <option value="less">{tr("creee_il_y_a_moins_de")}</option>
            </select>
            {seniority && (
              <>
                <Input type="number" min={1} max={3650} className="w-24 text-right tabular-nums" value={seniorityDays} onChange={(e) => set(seniority === "more" ? "createdMoreThanDays" : "createdLessThanDays", Math.max(1, Number(e.target.value) || 1))} aria-label={tr("nombre_de_jours")} />
                <span>{tr("jours")}</span>
              </>
            )}
          </div>
        </Row>
        <Row label={tr("sans_interaction_depuis")} hint={tr("aucun_appel_email_rendez_vous_ni_f65e")}>
          <div className="flex items-center gap-2 text-sm">
            <span>{tr("plus_de")}</span>
            <Input type="number" min={1} max={3650} className="w-24 text-right tabular-nums" value={c.inactiveForDays ?? ""} onChange={(e) => set("inactiveForDays", e.target.value === "" ? undefined : Math.max(1, Number(e.target.value) || 1))} aria-label={tr("jours_sans_interaction")} placeholder="—" />
            <span>{tr("jours")}</span>
          </div>
        </Row>
      </Group>

      <Group title={tr("affaires")}>
        <Row label={tr("presence_d_affaires")}>
          <select className={SELECT_CLASS} value={c.deals ?? ""} onChange={(e) => set("deals", (e.target.value || undefined) as DealPresence | undefined)} aria-label={tr("presence_d_affaires")}>
            <option value="">{tr("peu_importe")}</option>
            {DEAL_PRESENCES.map((k) => (
              <option key={k} value={k}>
                {tt(`dealPresence.${k}`)}
              </option>
            ))}
          </select>
        </Row>
        {stages.length > 0 && (
          <Row label={tr("au_moins_une_affaire_dans_l_9e54")}>
            <CheckList
              items={stages.map((s) => ({ id: s.id, label: options.pipelines.length > 1 ? `${s.label} (${s.pipelineLabel})` : s.label }))}
              selected={c.dealStageIds ?? []}
              onToggle={(id) => toggle("dealStageIds", id)}
            />
          </Row>
        )}
        {options.pipelines.length > 1 && (
          <Row label={tr("au_moins_une_affaire_dans_le_2e40")}>
            <CheckList items={options.pipelines.map((p) => ({ id: p.id, label: p.label }))} selected={c.dealPipelineIds ?? []} onToggle={(id) => toggle("dealPipelineIds", id)} />
          </Row>
        )}
      </Group>

      <Group title={tr("origine")}>
        <Row label={tr("comment_la_fiche_est_entree")}>
          <CheckList
            items={CONTACT_SOURCES.map((s) => ({ id: s, label: tt(`sources.${s}`) }))}
            selected={c.sources ?? []}
            onToggle={(id) => toggleSource(id as ContactSource)}
          />
        </Row>
        {options.origins.length > 0 && (
          <Row label={tr("origine_d_acquisition")} hint={tr("un_lead_recu_depuis_l_une_8e69")}>
            <CheckList items={options.origins} selected={c.originIds ?? []} onToggle={(id) => toggle("originIds", id)} />
          </Row>
        )}
      </Group>

      <SegmentPreviewLine criteria={c} />
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{title}</legend>
      {children}
    </fieldset>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[14rem_1fr] sm:gap-4">
      <span className="pt-1.5 text-sm font-medium">{label}</span>
      <div className="flex flex-col gap-1">
        {children}
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

function CheckList({
  items,
  selected,
  onToggle,
}: {
  items: { id: string; label: string }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (items.length === 0) return <span className="pt-1.5 text-sm text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1.5">
      {items.map((item) => (
        <label key={item.id} className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={selected.includes(item.id)} onChange={() => onToggle(item.id)} />
          {item.label}
        </label>
      ))}
    </div>
  );
}

/** « Lyon, Villeurbanne » → ["Lyon", "Villeurbanne"], avec les valeurs déjà présentes dans les fiches en suggestion. */
function ListInput({
  value,
  onChange,
  suggestions,
  placeholder,
  listId,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  suggestions: string[];
  placeholder: string;
  listId: string;
}) {
  const id = useId();
  const [text, setText] = useState(value.join(", "));
  // Si les critères changent de l'extérieur (réinitialisation), le champ suit.
  const joined = value.join(", ");
  const lastJoined = useRef(joined);
  useEffect(() => {
    if (joined !== lastJoined.current) {
      lastJoined.current = joined;
      setText(joined);
    }
  }, [joined]);
  return (
    <>
      <Input
        list={`${id}-${listId}`}
        value={text}
        placeholder={placeholder}
        className="max-w-md"
        onChange={(e) => {
          setText(e.target.value);
          const parts = [...new Set(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 20);
          lastJoined.current = parts.join(", ");
          onChange(parts);
        }}
      />
      <datalist id={`${id}-${listId}`}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  );
}

/** L'aperçu permanent : le nombre réel, recalculé à chaque changement. */
function SegmentPreviewLine({ criteria }: { criteria: SegmentCriteria }) {
  const t = useTranslations("targets.criteriaEditor");
  const key = JSON.stringify(criteria);
  // Le résultat porte la clé des critères qui l'ont produit : tant qu'elle
  // diffère de la clé courante, l'écran est « en calcul » — aucun état
  // posé dans l'effet lui-même, seulement dans la réponse.
  const [result, setResult] = useState<{ key: string; preview?: SegmentPreview; error?: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const r = await previewSegmentAction(JSON.parse(key));
      if (cancelled) return;
      setResult(r.ok ? { key, preview: r.preview } : { key, error: r.error });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key]);

  const loading = result?.key !== key;
  const p = result?.preview;
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm",
        loading && "opacity-70"
      )}
      aria-live="polite"
    >
      {result?.error && !loading ? (
        <span className="text-destructive">{result.error}</span>
      ) : p ? (
        <>
          <span>
            {t.rich("contact_contacts_aujourd_hui", { count: p.count, span: (chunks) => <span className="font-semibold tabular-nums">{chunks}</span> })}
            {p.withoutEmail > 0 && (
              <span className="text-muted-foreground">
                {t.rich("dont_sans_adresse_email", { withoutEmail: p.withoutEmail, span: (chunks) => <span className="tabular-nums">{chunks}</span> })}
              </span>
            )}
            {loading && <span className="text-muted-foreground"> {t("calcul")}</span>}
          </span>
          {p.sample.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {p.sample.join(", ")}
              {p.count > p.sample.length ? "…" : ""}
            </span>
          )}
        </>
      ) : (
        <span className="text-muted-foreground">{t("calcul_du_nombre_de_contacts")}</span>
      )}
    </div>
  );
}
