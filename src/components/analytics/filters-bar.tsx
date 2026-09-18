import Link from "next/link";
import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  metricQueryString,
  ORIGIN_UNKNOWN,
  ORIGIN_UNMATCHED,
  type ExportView,
  type MetricSearchParams,
  type ParsedMetricFilters,
} from "@/lib/metrics";
import { PeriodPicker } from "@/components/display/period-picker";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

/**
 * La barre de filtres commune aux vues analytiques : période (préréglages
 * en liens, bornes libres), conseiller, type d'affaire, pipeline, origine.
 * Un formulaire GET, sans état client : l'URL EST le filtre — un lien copié
 * garde sa sélection, et le lien « Exporter en CSV » porte exactement les
 * mêmes paramètres : le fichier contient ce que l'écran montre.
 * Un sélecteur n'apparaît que s'il a de quoi choisir (un seul conseiller,
 * un seul pipeline : rien à filtrer).
 */
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
  const { params, active } = parsed;

  return (
    <section aria-label={tr("filtres")} className="flex flex-col gap-3">
      {/* LE sélecteur de période du produit (lot 1, étape 2) — le même composant sur le tableau de bord et ici. */}
      <div className="flex flex-wrap items-center gap-2">
        <PeriodPicker basePath={basePath} parsed={parsed} showCustom={false} />
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

      {/* Une grille à deux colonnes sous sm (dates côte à côte, sélecteurs pleine largeur, « Filtrer » sur toute la ligne) ; dès sm, une rangée qui se replie. */}
      <form method="get" action={basePath} className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
        {params.periode && <input type="hidden" name="periode" value={params.periode} />}
        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground sm:w-auto">
          {tr("du")}
          {/* Le champ du socle (40 px au doigt) : un clic dans le champ ouvre le sélecteur. */}
          <Input type="date" name="du" defaultValue={params.du ?? ""} className="pointer-coarse:min-h-10" aria-label={tr("debut_de_periode")} />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground sm:w-auto">
          {tr("au_inclus")}
          <Input type="date" name="au" defaultValue={params.au ?? ""} className="pointer-coarse:min-h-10" aria-label={tr("fin_de_periode")} />
        </label>
        {users.length > 1 && (
          <NativeSelect name="conseiller" defaultValue={params.conseiller ?? ""} className="col-span-2 sm:w-auto sm:max-w-56" aria-label={tr("filtrer_par_conseiller")}>
            <option value="">{tr("tous_les_conseillers")}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name || u.email}
              </option>
            ))}
          </NativeSelect>
        )}
        {types.length > 0 && (
          <NativeSelect name="type" defaultValue={params.type ?? ""} className="col-span-2 sm:w-auto sm:max-w-56" aria-label={tr("filtrer_par_type_d_affaire")}>
            <option value="">{tr("tous_les_types")}</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </NativeSelect>
        )}
        {pipelines.length > 1 && (
          <NativeSelect name="pipeline" defaultValue={params.pipeline ?? ""} className="col-span-2 sm:w-auto sm:max-w-56" aria-label={tr("filtrer_par_pipeline")}>
            <option value="">{tr("tous_les_pipelines")}</option>
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </NativeSelect>
        )}
        {origins.length > 0 && (
          <NativeSelect name="origine" defaultValue={params.origine ?? ""} className="col-span-2 sm:w-auto sm:max-w-56" aria-label={tr("filtrer_par_origine")}>
            <option value="">{tr("toutes_les_origines")}</option>
            {origins.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
            <option value={ORIGIN_UNMATCHED}>{tr("origine_a_rapprocher")}</option>
            <option value={ORIGIN_UNKNOWN}>{tr("sans_origine_aucun_lead")}</option>
          </NativeSelect>
        )}
        <button type="submit" className={cn(buttonVariants({ variant: "outline" }), "col-span-2 sm:col-span-1")}>
          {tr("filtrer")}
        </button>
      </form>
    </section>
  );
}
