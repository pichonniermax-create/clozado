import type { MetricDefinition } from "@/lib/metrics";
import { useTranslations } from "next-intl";

/** L'ancre d'une définition dans la page — les libellés d'indicateurs y renvoient. */
export function definitionAnchor(metric: MetricDefinition): string {
  return `definition-${metric.id}`;
}

/**
 * Les définitions, telles qu'elles sont dans le registre — le même texte
 * que celui qui gouverne le calcul, jamais une paraphrase. Repliées dans
 * des `<details>` natifs : présentes pour être vérifiées, hors du champ de
 * vision le reste du temps.
 */
export function MetricDefinitions({ metrics }: { metrics: MetricDefinition[] }) {
  const tm = useTranslations("metrics");
  const t = useTranslations("analytics.metricDefinitions");
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">{t("definitions")}</h2>
      <p className="-mt-1 text-xs text-muted-foreground">
        {t("chaque_indicateur_n_a_qu_une_2e7b")}
      </p>
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {metrics.map((m) => (
          <details key={m.id} id={definitionAnchor(m)} className="group scroll-mt-24">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium transition-colors hover:text-primary-ink">
              {tm(`definitions.${m.id}.label`)}
            </summary>
            <dl className="grid gap-x-4 gap-y-2 border-t border-border px-4 py-3 text-sm sm:grid-cols-[9rem_1fr]">
              <dt className="text-muted-foreground">{t("mesure")}</dt>
              <dd className="text-pretty">{tm(`definitions.${m.id}.definition`)}</dd>
              <dt className="text-muted-foreground">{t("ecarte")}</dt>
              <dd className="text-pretty">{tm(`definitions.${m.id}.excludes`)}</dd>
              <dt className="text-muted-foreground">{t("filtres")}</dt>
              <dd className="text-pretty">{tm(`definitions.${m.id}.filters`)}</dd>
              <dt className="text-muted-foreground">{t("donnees_insuffisantes")}</dt>
              <dd className="text-pretty">{tm(`definitions.${m.id}.whenInsufficient`)}</dd>
              <dt className="text-muted-foreground">{t("ce_qui_compte")}</dt>
              <dd className="text-pretty">{tm(`definitions.${m.id}.howToFeed`)}</dd>
            </dl>
          </details>
        ))}
      </div>
    </section>
  );
}
