import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { metricQueryString, PERIOD_CHOICES, type MetricSearchParams, type ParsedMetricFilters, type PeriodPresetKey } from "@/lib/metrics";
import { cn } from "@/lib/utils";
import { getTranslations } from "next-intl/server";

/**
 * LE SÉLECTEUR DE PÉRIODE, UN SEUL POUR TOUT LE PRODUIT (lot 1, étape 2).
 * Le tableau de bord avait son contrôle segmenté, l'analytique le sien
 * dans sa barre de filtres, et les partenaires aucun : trois écrans, trois
 * fenêtres de temps, sans que rien ne le dise. Ici, un seul composant,
 * affiché EN PERMANENCE sur les écrans qui ont une période — le choix part
 * dans l'adresse (il se copie et se partage) et se mémorise pour la
 * personne (il la suit d'un écran et d'un navigateur à l'autre).
 *
 * Les liens portent TOUJOURS `periode`, même pour le défaut : une adresse
 * copiée montre alors la même chose à tout le monde, quelle que soit la
 * période dont le destinataire se souvient.
 */
export async function PeriodPicker({
  basePath,
  parsed,
  /** Les autres paramètres de l'écran à conserver dans les liens (filtres, tri, page). */
  keep = {},
  className,
  showCustom = true,
}: {
  basePath: string;
  parsed: ParsedMetricFilters;
  keep?: Record<string, string | undefined>;
  className?: string;
  /** Les bornes libres « du / au » — masquées là où elles n'ont pas de sens. */
  showCustom?: boolean;
}) {
  const t = await getTranslations("metrics");
  const tp = await getTranslations("ui.display");
  const params = { ...keep, ...parsed.params } as MetricSearchParams & Record<string, string | undefined>;
  const href = (key: PeriodPresetKey) => `${basePath}${metricQueryString(params, { periode: key, du: undefined, au: undefined })}`;

  return (
    <section aria-label={tp("periode")} className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="grid w-full grid-cols-2 gap-0.5 rounded-lg border border-border p-0.5 sm:flex sm:w-auto">
        {PERIOD_CHOICES.map((key) => (
          <Link
            key={key}
            href={href(key)}
            aria-current={parsed.period === key ? "true" : undefined}
            className={cn(
              "rounded-md px-2.5 py-2 text-center text-sm transition-colors sm:py-1",
              parsed.period === key ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t(`periods.${key}`)}
          </Link>
        ))}
      </div>
      {showCustom && (
        <form method="get" action={basePath} className="flex flex-wrap items-end gap-2">
          {Object.entries(params).map(([name, value]) =>
            value && name !== "du" && name !== "au" && name !== "periode" ? <input key={name} type="hidden" name={name} value={value} /> : null
          )}
          <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
            {tp("du")}
            <Input type="date" name="du" defaultValue={parsed.params.du ?? ""} className="pointer-coarse:min-h-10" aria-label={tp("debut_de_periode")} />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
            {tp("au_inclus")}
            <Input type="date" name="au" defaultValue={parsed.params.au ?? ""} className="pointer-coarse:min-h-10" aria-label={tp("fin_de_periode")} />
          </label>
          <Button type="submit" variant="outline" size="sm">
            {tp("appliquer")}
          </Button>
          {parsed.period === "perso" && (
            <Link href={href("90j")} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              {tp("retirer_les_bornes")}
            </Link>
          )}
        </form>
      )}
    </section>
  );
}
