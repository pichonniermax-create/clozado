import type { ReactNode } from "react";
import { formatDuration } from "@/lib/format";
import type { DurationStat } from "@/lib/metrics";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import type { TranslatorOf } from "@/i18n/translator";

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
  const t = useTranslations("analytics.durationTable");
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[32rem] text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th scope="col" className="px-4 py-2.5 text-left font-medium">
              {labelHeader}
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              {t("mediane")}
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              {t("moyenne")}
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              {t("observations")}
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


/**
 * Les mentions sous un indicateur, dans un ordre fixe : pourquoi il est
 * masqué, ce qui est en cours, ce qui a été écarté. Les mots dépendent de
 * la métrique (un « passage en cours » n'est pas un « lead sans premier
 * contact ») : l'écran les fournit, la règle reste ici.
 */
/** Les mentions propres à un indicateur (« 3 passages en cours ») : des phrases déjà accordées, produites par l'écran avec SON traducteur. */
export type StatNoteWords = {
  pending?: (n: number) => string;
  reconstructed?: (n: number) => string;
  unknown?: (n: number) => string;
};

export function statNotes(stat: DurationStat, t: TranslatorOf<"analytics.durationTable">, words: StatNoteWords = {}): string | undefined {
  const parts: string[] = [];
  if (stat.unavailable) parts.push(stat.unavailable);
  else if (stat.hidden) parts.push(stat.n === 0 ? t("no_observation", { missing: stat.missing }) : t("masked_missing", { missing: stat.missing }));
  if (stat.pending > 0 && words.pending) parts.push(words.pending(stat.pending));
  if (stat.excludedReconstructed > 0 && words.reconstructed) parts.push(words.reconstructed(stat.excludedReconstructed));
  if (stat.excludedUnknown > 0 && words.unknown) parts.push(words.unknown(stat.excludedUnknown));
  return parts.length ? parts.join(" · ") : undefined;
}
