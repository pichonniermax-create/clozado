import type { ReactNode } from "react";
import { formatRate } from "@/lib/format";
import { MIN_OBSERVATIONS, type FunnelCount, type RateStat } from "@/lib/metrics";
import { cn } from "@/lib/utils";

/**
 * LE tableau d'un funnel — la seule façon d'afficher une suite de pas dans
 * le produit : un pas par ligne, sa barre (proportionnelle au pas le plus
 * large, une seule teinte : la couleur ne porte aucune identité, elle
 * dessine l'entonnoir), son nombre, le taux de passage depuis le pas
 * précédent et la déperdition. Les chiffres sont en encre de texte, jamais
 * dans la couleur de la barre. Un pas sans objet le dit à la place de sa
 * barre ; un taux masqué dit ce qui lui manque. La règle du seuil est
 * appliquée dans la couche (`finishRate`) : ici on affiche.
 */
export type FunnelRow = {
  key: string;
  label: ReactNode;
  count: FunnelCount;
  rate: RateStat | null;
  /** Sous le libellé : ce qui manque au pas suivant, ce qui est en cours — composé par l'écran. */
  note?: ReactNode;
};

const MASKED = <span className="text-muted-foreground">—</span>;

function maskedReason(rate: RateStat): string {
  return `masqué : il manque ${rate.missing} observation${rate.missing > 1 ? "s" : ""} au pas précédent`;
}

/**
 * Un taux : le pour-cent, ou « — » avec ce qui lui manque. En forme
 * compacte (tableaux denses), l'explication passe dans le `title` natif du
 * tiret au lieu d'une ligne sous la cellule.
 */
export function rateText(rate: RateStat | null, compact = false): ReactNode {
  if (!rate) return MASKED;
  if (rate.hidden || rate.percent === null) {
    if (compact) {
      return (
        <span className="text-muted-foreground" title={maskedReason(rate)}>
          —
        </span>
      );
    }
    return (
      <span className="text-muted-foreground">
        —<span className="block text-xs text-pretty">{maskedReason(rate)}</span>
      </span>
    );
  }
  return formatRate(rate.percent);
}

export function dropText(rate: RateStat | null): ReactNode {
  if (!rate || rate.hidden || rate.percent === null) return MASKED;
  if (rate.percent > 100) {
    return (
      <span className="text-muted-foreground">
        —<span className="block text-xs text-pretty">plus que le pas précédent</span>
      </span>
    );
  }
  return formatRate(100 - rate.percent);
}

export function CountCell({ count }: { count: FunnelCount }) {
  return <>{count.unavailable ? MASKED : count.n}</>;
}

export function FunnelSteps({ rows, labelHeader = "Pas" }: { rows: FunnelRow[]; labelHeader?: string }) {
  const max = Math.max(1, ...rows.map((r) => (r.count.unavailable ? 0 : r.count.n)));
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[40rem] text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th scope="col" className="px-4 py-2.5 text-left font-medium">
              {labelHeader}
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              Nombre
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              Taux de passage
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              Déperdition
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => {
            const unavailable = Boolean(row.count.unavailable);
            const width = unavailable ? 0 : Math.round((row.count.n / max) * 1000) / 10;
            return (
              <tr key={row.key} className={cn(unavailable && "text-muted-foreground")}>
                <th scope="row" className="w-1/2 min-w-64 px-4 py-3 text-left font-normal align-top">
                  <span className={cn("block text-sm", !unavailable && "font-medium text-foreground")}>{row.label}</span>
                  {unavailable ? (
                    <span className="block text-xs text-muted-foreground text-pretty">{row.count.unavailable}</span>
                  ) : (
                    <span aria-hidden className="mt-1.5 block h-1.5 w-full max-w-sm rounded-full bg-muted">
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
                    </span>
                  )}
                  {row.note && <span className="mt-1 block text-xs text-muted-foreground text-pretty">{row.note}</span>}
                </th>
                <td className="px-4 py-3 text-right align-top tabular-nums">
                  <CountCell count={row.count} />
                </td>
                <td className="px-4 py-3 text-right align-top tabular-nums">{rateText(row.rate)}</td>
                <td className="px-4 py-3 text-right align-top tabular-nums">{dropText(row.rate)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Rappel du seuil, pour les légendes d'écran. */
export const RATE_THRESHOLD_NOTE = `Un taux calculé sur moins de ${MIN_OBSERVATIONS} observations au pas précédent est masqué ; les nombres, eux, sont toujours affichés.`;
