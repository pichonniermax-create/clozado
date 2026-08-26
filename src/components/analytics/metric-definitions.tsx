import type { MetricDefinition } from "@/lib/metrics";

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
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">Définitions</h2>
      <p className="-mt-1 text-xs text-muted-foreground">
        Chaque indicateur n&apos;a qu&apos;une définition, écrite une fois et lue partout — écrans et exports.
      </p>
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {metrics.map((m) => (
          <details key={m.id} id={definitionAnchor(m)} className="group scroll-mt-24">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium transition-colors hover:text-primary-ink">
              {m.label}
            </summary>
            <dl className="grid gap-x-4 gap-y-2 border-t border-border px-4 py-3 text-sm sm:grid-cols-[9rem_1fr]">
              <dt className="text-muted-foreground">Mesure</dt>
              <dd className="text-pretty">{m.definition}</dd>
              <dt className="text-muted-foreground">Écarte</dt>
              <dd className="text-pretty">{m.excludes}</dd>
              <dt className="text-muted-foreground">Filtres</dt>
              <dd className="text-pretty">{m.filters}</dd>
              <dt className="text-muted-foreground">Données insuffisantes</dt>
              <dd className="text-pretty">{m.whenInsufficient}</dd>
              <dt className="text-muted-foreground">Ce qui compte</dt>
              <dd className="text-pretty">{m.howToFeed}</dd>
            </dl>
          </details>
        ))}
      </div>
    </section>
  );
}
