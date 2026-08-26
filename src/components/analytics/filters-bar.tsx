import Link from "next/link";
import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  metricQueryString,
  ORIGIN_UNKNOWN,
  ORIGIN_UNMATCHED,
  PERIOD_PRESETS,
  type ExportView,
  type MetricSearchParams,
  type ParsedMetricFilters,
} from "@/lib/metrics";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

/**
 * La barre de filtres commune aux vues analytiques : période (préréglages
 * en liens, bornes libres), conseiller, type d'affaire, pipeline, origine.
 * Un formulaire GET, sans état client : l'URL EST le filtre — un lien copié
 * garde sa sélection, et le lien « Exporter en CSV » porte exactement les
 * mêmes paramètres : le fichier contient ce que l'écran montre.
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
  exportView,
}: {
  basePath: string;
  parsed: ParsedMetricFilters;
  /** La vue à exporter en CSV (`/api/analytique/export`), avec les filtres courants. */
  exportView?: ExportView;
  users: { id: string; name: string | null; email: string }[];
  types: { id: string; label: string }[];
  pipelines: { id: string; label: string }[];
  origins: { id: string; label: string }[];
}) {
  const tr = useTranslations("analytics.filtersBar");
  const tm = useTranslations("metrics");
  const { params, period, active } = parsed;
  const presetHref = (key: string) =>
    `${basePath}${metricQueryString(params, { periode: key === "tout" ? undefined : key, du: undefined, au: undefined })}`;

  return (
    <section aria-label={tr("filtres")} className="flex flex-col gap-3">
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
              {tm(`periods.${p.key}`)}
            </Link>
          ))}
        </div>
        <span className="ml-auto flex items-center gap-1">
          {active && (
            <Link href={basePath} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              {tr("retirer_les_filtres")}
            </Link>
          )}
          {exportView && (
            <a
              href={`/api/analytique/export${metricQueryString<MetricSearchParams & { vue?: string }>(params, { vue: exportView })}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
              title={tr("telecharger_cette_vue_avec_ses_filtres_a2e3")}
            >
              <Download />
              {tr("exporter_en_csv")}
            </a>
          )}
        </span>
      </div>

      <form method="get" action={basePath} className="flex flex-wrap items-end gap-2">
        {params.periode && <input type="hidden" name="periode" value={params.periode} />}
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {tr("du")}
          <input type="date" name="du" defaultValue={params.du ?? ""} className={DATE_CLASS} aria-label={tr("debut_de_periode")} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {tr("au_inclus")}
          <input type="date" name="au" defaultValue={params.au ?? ""} className={DATE_CLASS} aria-label={tr("fin_de_periode")} />
        </label>
        {users.length > 1 && (
          <select name="conseiller" defaultValue={params.conseiller ?? ""} className={SELECT_CLASS} aria-label={tr("filtrer_par_conseiller")}>
            <option value="">{tr("tous_les_conseillers")}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name || u.email}
              </option>
            ))}
          </select>
        )}
        {types.length > 0 && (
          <select name="type" defaultValue={params.type ?? ""} className={SELECT_CLASS} aria-label={tr("filtrer_par_type_d_affaire")}>
            <option value="">{tr("tous_les_types")}</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        )}
        {pipelines.length > 1 && (
          <select name="pipeline" defaultValue={params.pipeline ?? ""} className={SELECT_CLASS} aria-label={tr("filtrer_par_pipeline")}>
            <option value="">{tr("tous_les_pipelines")}</option>
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        )}
        {origins.length > 0 && (
          <select name="origine" defaultValue={params.origine ?? ""} className={SELECT_CLASS} aria-label={tr("filtrer_par_origine")}>
            <option value="">{tr("toutes_les_origines")}</option>
            {origins.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
            <option value={ORIGIN_UNMATCHED}>{tr("origine_a_rapprocher")}</option>
            <option value={ORIGIN_UNKNOWN}>{tr("sans_origine_aucun_lead")}</option>
          </select>
        )}
        <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
          {tr("filtrer")}
        </button>
      </form>
    </section>
  );
}
