"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { previewSegmentAction } from "@/lib/targets/actions";
import {
  CONTACT_SOURCE_LABELS,
  DEAL_PRESENCE_LABELS,
  normalizeCriteria,
  type ContactSource,
  type CriteriaOptions,
  type DealPresence,
  type SegmentCriteria,
} from "@/lib/targets/criteria";
import type { SegmentPreview } from "@/db/queries/mail-targets";
import { cn } from "@/lib/utils";

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
      <Group title="Qui">
        <Row label="Type de fiche">
          <select
            className={SELECT_CLASS}
            value={c.kind ?? ""}
            onChange={(e) => set("kind", (e.target.value || undefined) as SegmentCriteria["kind"])}
            aria-label="Type de fiche"
          >
            <option value="">Personnes et sociétés</option>
            <option value="person">Personnes seulement</option>
            <option value="company">Sociétés seulement</option>
          </select>
        </Row>
        <Row label="Porte au moins une de ces étiquettes" hint={options.tags.length === 0 ? "Aucune étiquette dans ton organisation pour l'instant — elles se créent depuis une fiche contact." : undefined}>
          <CheckList items={options.tags.map((t) => ({ id: t.id, label: t.label }))} selected={c.tagsAny ?? []} onToggle={(id) => toggle("tagsAny", id)} />
        </Row>
        {options.tags.length > 0 && (
          <Row label="N'en porte aucune de celles-ci">
            <CheckList items={options.tags.map((t) => ({ id: t.id, label: t.label }))} selected={c.tagsNone ?? []} onToggle={(id) => toggle("tagsNone", id)} />
          </Row>
        )}
        <Row label="Âge" hint="Personnes physiques dont la date de naissance est renseignée.">
          <div className="flex items-center gap-2 text-sm">
            <span>de</span>
            <Input type="number" min={0} max={120} className="w-20 text-right tabular-nums" value={c.ageMin ?? ""} onChange={(e) => set("ageMin", e.target.value === "" ? undefined : Number(e.target.value))} aria-label="Âge minimum" />
            <span>à</span>
            <Input type="number" min={0} max={120} className="w-20 text-right tabular-nums" value={c.ageMax ?? ""} onChange={(e) => set("ageMax", e.target.value === "" ? undefined : Number(e.target.value))} aria-label="Âge maximum" />
            <span>ans</span>
          </div>
        </Row>
        <Row label="Adresse email">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={c.hasEmail === true} onChange={(e) => set("hasEmail", e.target.checked ? true : undefined)} />
            Seulement les fiches qui ont une adresse email
          </label>
        </Row>
      </Group>

      <Group title="Où">
        <Row label="Ville" hint="Plusieurs villes : sépare-les par des virgules.">
          <ListInput value={c.cities ?? []} onChange={(v) => set("cities", v)} suggestions={options.cities} placeholder="Lyon, Villeurbanne" listId="cities" />
        </Row>
        <Row label="Pays" hint="Tel qu'il est écrit sur les fiches.">
          <ListInput value={c.countries ?? []} onChange={(v) => set("countries", v)} suggestions={options.countries} placeholder="France" listId="countries" />
        </Row>
      </Group>

      <Group title="Suivi">
        {options.users.length > 0 && (
          <Row label="Conseiller attribué">
            <CheckList items={options.users.map((u) => ({ id: u.id, label: u.name || u.email || "—" }))} selected={c.ownerIds ?? []} onToggle={(id) => toggle("ownerIds", id)} />
          </Row>
        )}
        <Row label="Ancienneté de la fiche">
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
              aria-label="Ancienneté de la fiche"
            >
              <option value="">Peu importe</option>
              <option value="more">Créée il y a plus de</option>
              <option value="less">Créée il y a moins de</option>
            </select>
            {seniority && (
              <>
                <Input type="number" min={1} max={3650} className="w-24 text-right tabular-nums" value={seniorityDays} onChange={(e) => set(seniority === "more" ? "createdMoreThanDays" : "createdLessThanDays", Math.max(1, Number(e.target.value) || 1))} aria-label="Nombre de jours" />
                <span>jours</span>
              </>
            )}
          </div>
        </Row>
        <Row label="Sans interaction depuis" hint="Aucun appel, email, rendez-vous ni note consigné pendant cette durée.">
          <div className="flex items-center gap-2 text-sm">
            <span>plus de</span>
            <Input type="number" min={1} max={3650} className="w-24 text-right tabular-nums" value={c.inactiveForDays ?? ""} onChange={(e) => set("inactiveForDays", e.target.value === "" ? undefined : Math.max(1, Number(e.target.value) || 1))} aria-label="Jours sans interaction" placeholder="—" />
            <span>jours</span>
          </div>
        </Row>
      </Group>

      <Group title="Affaires">
        <Row label="Présence d'affaires">
          <select className={SELECT_CLASS} value={c.deals ?? ""} onChange={(e) => set("deals", (e.target.value || undefined) as DealPresence | undefined)} aria-label="Présence d'affaires">
            <option value="">Peu importe</option>
            {(Object.keys(DEAL_PRESENCE_LABELS) as DealPresence[]).map((k) => (
              <option key={k} value={k}>
                {DEAL_PRESENCE_LABELS[k]}
              </option>
            ))}
          </select>
        </Row>
        {stages.length > 0 && (
          <Row label="Au moins une affaire dans l'étape">
            <CheckList
              items={stages.map((s) => ({ id: s.id, label: options.pipelines.length > 1 ? `${s.label} (${s.pipelineLabel})` : s.label }))}
              selected={c.dealStageIds ?? []}
              onToggle={(id) => toggle("dealStageIds", id)}
            />
          </Row>
        )}
        {options.pipelines.length > 1 && (
          <Row label="Au moins une affaire dans le pipeline">
            <CheckList items={options.pipelines.map((p) => ({ id: p.id, label: p.label }))} selected={c.dealPipelineIds ?? []} onToggle={(id) => toggle("dealPipelineIds", id)} />
          </Row>
        )}
      </Group>

      <Group title="Origine">
        <Row label="Comment la fiche est entrée">
          <CheckList
            items={(Object.keys(CONTACT_SOURCE_LABELS) as ContactSource[]).map((s) => ({ id: s, label: CONTACT_SOURCE_LABELS[s] }))}
            selected={c.sources ?? []}
            onToggle={(id) => toggleSource(id as ContactSource)}
          />
        </Row>
        {options.origins.length > 0 && (
          <Row label="Origine d'acquisition" hint="Un lead reçu depuis l'une de ces origines.">
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
            <span className="font-semibold tabular-nums">{p.count}</span> contact{p.count > 1 ? "s" : ""} aujourd&apos;hui
            {p.withoutEmail > 0 && (
              <span className="text-muted-foreground">
                {" "}
                · dont <span className="tabular-nums">{p.withoutEmail}</span> sans adresse email
              </span>
            )}
            {loading && <span className="text-muted-foreground"> · calcul…</span>}
          </span>
          {p.sample.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {p.sample.join(", ")}
              {p.count > p.sample.length ? "…" : ""}
            </span>
          )}
        </>
      ) : (
        <span className="text-muted-foreground">Calcul du nombre de contacts…</span>
      )}
    </div>
  );
}
