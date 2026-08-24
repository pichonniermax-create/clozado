import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import {
  metricQueryString,
  ORIGIN_UNKNOWN,
  ORIGIN_UNMATCHED,
  PERIOD_PRESETS,
  type ParsedMetricFilters,
} from "@/lib/metrics";
import { cn } from "@/lib/utils";

/**
 * La barre de filtres commune aux vues analytiques : période (préréglages
 * en liens, bornes libres), conseiller, type d'affaire, pipeline, origine.
 * Un formulaire GET, sans état client : l'URL EST le filtre — un lien copié
 * garde sa sélection, et l'export (étape 6) lira les mêmes paramètres.
 * Un sélecteur n'apparaît que s'il a de quoi choisir (un seul conseiller,
 * un seul pipeline : rien à filtrer).
 */
const SELECT_CLASS = "h-8 max-w-56 rounded-lg border border-input bg-transparent px-2.5 text-sm";
const DATE_CLASS = "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm";

export function AnalyticsFiltersBar({
  basePath,
  parsed,
  users,
  types,
  pipelines,
  origins,
}: {
  basePath: string;
  parsed: ParsedMetricFilters;
  users: { id: string; name: string | null; email: string }[];
  types: { id: string; label: string }[];
  pipelines: { id: string; label: string }[];
  origins: { id: string; label: string }[];
}) {
  const { params, period, active } = parsed;
  const presetHref = (key: string) =>
    `${basePath}${metricQueryString(params, { periode: key === "tout" ? undefined : key, du: undefined, au: undefined })}`;

  return (
    <section aria-label="Filtres" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap rounded-lg border border-border p-0.5">
          {PERIOD_PRESETS.map((p) => (
            <Link
              key={p.key}
              href={presetHref(p.key)}
              aria-current={period === p.key ? "true" : undefined}
              className={cn(
                "rounded-md px-2.5 py-1 text-sm transition-colors",
                period === p.key ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {p.label}
            </Link>
          ))}
        </div>
        {active && (
          <Link href={basePath} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "ml-auto")}>
            Retirer les filtres
          </Link>
        )}
      </div>

      <form method="get" action={basePath} className="flex flex-wrap items-end gap-2">
        {params.periode && <input type="hidden" name="periode" value={params.periode} />}
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Du
          <input type="date" name="du" defaultValue={params.du ?? ""} className={DATE_CLASS} aria-label="Début de période" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Au (inclus)
          <input type="date" name="au" defaultValue={params.au ?? ""} className={DATE_CLASS} aria-label="Fin de période" />
        </label>
        {users.length > 1 && (
          <select name="conseiller" defaultValue={params.conseiller ?? ""} className={SELECT_CLASS} aria-label="Filtrer par conseiller">
            <option value="">Tous les conseillers</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name || u.email}
              </option>
            ))}
          </select>
        )}
        {types.length > 0 && (
          <select name="type" defaultValue={params.type ?? ""} className={SELECT_CLASS} aria-label="Filtrer par type d'affaire">
            <option value="">Tous les types</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        )}
        {pipelines.length > 1 && (
          <select name="pipeline" defaultValue={params.pipeline ?? ""} className={SELECT_CLASS} aria-label="Filtrer par pipeline">
            <option value="">Tous les pipelines</option>
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        )}
        {origins.length > 0 && (
          <select name="origine" defaultValue={params.origine ?? ""} className={SELECT_CLASS} aria-label="Filtrer par origine">
            <option value="">Toutes les origines</option>
            {origins.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
            <option value={ORIGIN_UNMATCHED}>Origine à rapprocher</option>
            <option value={ORIGIN_UNKNOWN}>Sans origine (aucun lead)</option>
          </select>
        )}
        <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Filtrer
        </button>
      </form>
    </section>
  );
}
