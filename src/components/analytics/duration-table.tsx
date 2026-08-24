import type { ReactNode } from "react";
import { formatDuration } from "@/lib/format";
import type { DurationStat } from "@/lib/metrics";
import { cn } from "@/lib/utils";

/**
 * LE tableau des durées — la seule façon d'afficher une `DurationStat` dans
 * le produit : médiane ET moyenne côte à côte (sur de petits volumes, la
 * moyenne ment), le nombre d'observations toujours visible, et un
 * indicateur masqué qui dit ce qui lui manque au lieu d'un chiffre
 * trompeur. Chiffres tabulaires, alignés à droite. La règle du seuil est
 * déjà appliquée dans la couche de métriques (`hidden`) : ce composant ne
 * décide rien, il affiche.
 */
export type DurationRow = {
  key: string;
  label: ReactNode;
  /** Sous le libellé : ce qui est écarté, ce qui est en cours — composé par l'écran avec `statNotes`. */
  note?: ReactNode;
  stat: DurationStat;
};

const MASKED = <span className="text-muted-foreground">—</span>;

function Cell({ stat, value }: { stat: DurationStat; value: number | null }) {
  return (
    <td className="px-4 py-3 text-right tabular-nums">
      {stat.hidden || value === null ? MASKED : formatDuration(value)}
    </td>
  );
}

export function DurationTable({ rows, labelHeader = "Indicateur" }: { rows: DurationRow[]; labelHeader?: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[32rem] text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th scope="col" className="px-4 py-2.5 text-left font-medium">
              {labelHeader}
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              Médiane
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              Moyenne
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              Observations
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.key} className={cn(row.stat.hidden && "text-muted-foreground")}>
              <th scope="row" className="px-4 py-3 text-left font-normal">
                <span className={cn("block text-sm", !row.stat.hidden && "font-medium text-foreground")}>{row.label}</span>
                {row.note && <span className="block text-xs text-muted-foreground text-pretty">{row.note}</span>}
              </th>
              <Cell stat={row.stat} value={row.stat.medianDays} />
              <Cell stat={row.stat} value={row.stat.meanDays} />
              <td className="px-4 py-3 text-right tabular-nums">
                {row.stat.unavailable ? MASKED : row.stat.n}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n > 1 ? pluralForm : singular}`;
}

/**
 * Les mentions sous un indicateur, dans un ordre fixe : pourquoi il est
 * masqué, ce qui est en cours, ce qui a été écarté. Les mots dépendent de
 * la métrique (un « passage en cours » n'est pas un « lead sans premier
 * contact ») : l'écran les fournit, la règle reste ici.
 */
export function statNotes(
  stat: DurationStat,
  words: {
    /** Ex. ["passage en cours", "passages en cours"]. */
    pending?: readonly [string, string];
    /** Ex. ["passage reconstitué écarté", "passages reconstitués écartés"]. */
    reconstructed?: readonly [string, string];
    /** Ex. ["date de confirmation inconnue, écartée", "dates de confirmation inconnues, écartées"]. */
    unknown?: readonly [string, string];
  } = {}
): string | undefined {
  const parts: string[] = [];
  if (stat.unavailable) parts.push(stat.unavailable);
  else if (stat.hidden) {
    parts.push(
      stat.n === 0
        ? `aucune observation — il en faut ${stat.missing} pour afficher un chiffre`
        : `masqué : il manque ${plural(stat.missing, "observation", "observations")} pour afficher un chiffre`
    );
  }
  if (stat.pending > 0 && words.pending) parts.push(plural(stat.pending, words.pending[0], words.pending[1]));
  if (stat.excludedReconstructed > 0 && words.reconstructed)
    parts.push(plural(stat.excludedReconstructed, words.reconstructed[0], words.reconstructed[1]));
  if (stat.excludedUnknown > 0 && words.unknown) parts.push(plural(stat.excludedUnknown, words.unknown[0], words.unknown[1]));
  return parts.length ? parts.join(" · ") : undefined;
}
