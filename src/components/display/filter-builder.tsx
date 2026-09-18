"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { describeCondition } from "@/lib/display/filter-labels";
import {
  arityOf,
  FILTER_PARAM,
  ME_TOKEN,
  operatorsFor,
  serializeFilters,
  type FilterCondition,
  type FilterOperator,
  type FilterType,
} from "@/lib/display/filters";

/**
 * LE CONSTRUCTEUR DE FILTRES (lot 3) — « montant supérieur à 200 000 ET
 * étape égale à Négociation ET conseiller égal à moi », composé à la
 * souris. Trois contrôles : le champ, l'opérateur (ceux de son TYPE, pas
 * d'autres), la valeur (dans la forme du type : un nombre, une date, une
 * liste de choix).
 *
 * Le résultat part dans l'ADRESSE, jamais dans un état caché : un lien se
 * copie, une vue l'enregistre, la mémoire d'affichage le retient. Les
 * conditions posées s'affichent en pastilles retirables, rendues par
 * l'écran serveur — ce composant ne sert qu'à en AJOUTER une.
 */
export type BuilderField = {
  key: string;
  type: FilterType;
  /** Les choix d'un champ de type liste, déjà résolus par l'écran. */
  options?: { value: string; label: string }[];
  /** Le champ accepte « moi ». */
  me?: boolean;
};

export function FilterBuilder({
  fields,
  conditions,
  basePath,
  keep,
}: {
  fields: BuilderField[];
  conditions: FilterCondition[];
  basePath: string;
  /** Les autres paramètres de l'écran à garder dans le lien (vue, tri, densité…). */
  keep: Record<string, string>;
}) {
  const t = useTranslations("ui.filters");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fieldKey, setFieldKey] = useState(fields[0]?.key ?? "");
  const field = fields.find((f) => f.key === fieldKey) ?? fields[0];
  const operators = field ? operatorsFor(field.type) : [];
  const [operator, setOperator] = useState<FilterOperator>(operators[0]);
  const [a, setA] = useState("");
  const [b, setB] = useState("");

  // Changer de champ change les opérateurs possibles : on repart du premier, jamais sur un couple impossible.
  const chooseField = (key: string) => {
    const next = fields.find((f) => f.key === key);
    setFieldKey(key);
    setOperator(next ? operatorsFor(next.type)[0] : operators[0]);
    setA("");
    setB("");
  };

  const arity = arityOf(operator);
  const ready = arity === "none" || (a.trim() !== "" && (arity !== "two" || b.trim() !== ""));

  const add = () => {
    if (!field || !ready) return;
    const values = arity === "none" ? [] : arity === "two" ? [a.trim(), b.trim()] : [a.trim()];
    const next = [...conditions, { field: field.key, type: field.type, operator, values }];
    const params = new URLSearchParams(keep);
    params.set(FILTER_PARAM, serializeFilters(next));
    // La page repart à 1 : filtrer change le nombre de résultats, rester en page 4 montrerait du vide.
    params.delete("page");
    setOpen(false);
    setA("");
    setB("");
    router.push(`${basePath}?${params.toString()}`);
  };

  const preview = useMemo(() => {
    if (!field || !ready) return null;
    const values = arity === "none" ? [] : arity === "two" ? [a.trim(), b.trim()] : [a.trim()];
    return describeCondition(
      { field: field.key, type: field.type, operator, values },
      (key, vals) => t(key as never, vals as never),
      (_f, value) => field.options?.find((o) => o.value === value)?.label ?? null
    );
  }, [field, ready, arity, a, b, operator, t]);

  if (fields.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button type="button" variant="outline" size="sm" />}>
        <SlidersHorizontal />
        {/* « Ajouter un filtre », pas « Filtrer » : la liste des affaires a déjà un bouton « Filtrer » qui
            applique ses deux sélecteurs — deux boutons du même nom sur un écran ne disent plus rien. */}
        {t("ajouter_un_filtre")}
        {conditions.length > 0 && <span className="tabular-nums text-muted-foreground">{conditions.length}</span>}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">{t("aucun_filtre")}</p>

          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t("champ")}
            <NativeSelect aria-label={t("champ")} value={fieldKey} onChange={(e) => chooseField(e.target.value)}>
              {fields.map((f) => (
                <option key={f.key} value={f.key}>
                  {t(`fields.${f.key}` as never)}
                </option>
              ))}
            </NativeSelect>
          </label>

          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t("operateur")}
            <NativeSelect aria-label={t("operateur")} value={operator} onChange={(e) => setOperator(e.target.value as FilterOperator)}>
              {operators.map((op) => (
                <option key={op} value={op}>
                  {t(`operators.${op}` as never)}
                </option>
              ))}
            </NativeSelect>
          </label>

          {arity !== "none" && (
            <div className="flex flex-col gap-2">
              <ValueInput field={field} operator={operator} value={a} onChange={setA} label={arity === "two" ? t("valeur_min") : t("valeur")} />
              {arity === "two" && <ValueInput field={field} operator={operator} value={b} onChange={setB} label={t("valeur_max")} />}
            </div>
          )}

          {preview && <p className="rounded-md bg-muted px-2 py-1.5 text-xs text-foreground">{preview}</p>}

          <Button type="button" size="sm" className="w-fit" disabled={!ready} onClick={add}>
            <Plus />
            {t("ajouter")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Le contrôle de saisie DANS LA FORME DU TYPE : un nombre, une date, un choix — jamais un champ libre pour tout. */
function ValueInput({
  field,
  operator,
  value,
  onChange,
  label,
}: {
  field: BuilderField | undefined;
  operator: FilterOperator;
  value: string;
  onChange: (next: string) => void;
  label: string;
}) {
  const t = useTranslations("ui.filters");
  if (!field) return null;
  if (field.type === "liste") {
    return (
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {label}
        <NativeSelect aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{t("choisir")}</option>
          {field.me && <option value={ME_TOKEN}>{t("moi")}</option>}
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      </label>
    );
  }
  if (field.type === "booleen") {
    return (
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {label}
        <NativeSelect aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{t("choisir")}</option>
          <option value="vrai">{t("vrai")}</option>
          <option value="faux">{t("faux")}</option>
        </NativeSelect>
      </label>
    );
  }
  // Une date relative se saisit en JOURS, pas en date : « dans les 30 derniers jours ».
  const type = field.type === "nombre" || (field.type === "date" && operator === "last") ? "number" : field.type === "date" ? "date" : "text";
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {field.type === "date" && operator === "last" ? t("jours") : label}
      <Input
        aria-label={field.type === "date" && operator === "last" ? t("jours") : label}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pointer-coarse:min-h-10"
      />
    </label>
  );
}
