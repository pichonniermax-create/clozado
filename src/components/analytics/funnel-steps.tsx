import { use } from "react";
import type { ReactNode } from "react";
import { getFormats } from "@/i18n/formats";
import { type FunnelCount, type RateStat } from "@/lib/metrics";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import type { TranslatorOf } from "@/i18n/translator";
import type { Formats } from "@/lib/format";

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

/** Ce qui manque à un taux masqué — une phrase du traducteur, jamais composée à la main (elle s'affichait en français en locale anglaise). */
function maskedReason(rate: RateStat, t: TranslatorOf<"analytics.funnelSteps">): string {
  return t("masked_missing", { missing: rate.missing });
}

/**
 * Un taux : le pour-cent, ou « — » avec ce qui lui manque. En forme
 * compacte (tableaux denses), l'explication passe dans le `title` natif du
 * tiret au lieu d'une ligne sous la cellule.
 */
export function rateText(rate: RateStat | null, fmt: Formats, t: TranslatorOf<"analytics.funnelSteps">, compact = false): ReactNode {
  if (!rate) return MASKED;
  if (rate.hidden || rate.percent === null) {
    if (compact) {
      return (
        <span className="text-muted-foreground" title={maskedReason(rate, t)}>
          —
        </span>
      );
    }
    return (
      <span className="text-muted-foreground">
        —<span className="block text-xs text-pretty">{maskedReason(rate, t)}</span>
      </span>
    );
  }
  return fmt.rate(rate.percent);
}

export function dropText(rate: RateStat | null, t: TranslatorOf<"analytics.funnelSteps">, fmt: Formats): ReactNode {
  if (!rate || rate.hidden || rate.percent === null) return MASKED;
  if (rate.percent > 100) {
    return (
      <span className="text-muted-foreground">
        {t.rich("plus_que_le_pas_precedent", { span: (chunks) => <span className="block text-xs text-pretty">{chunks}</span> })}
      </span>
    );
  }
  return fmt.rate(100 - rate.percent);
}

export function CountCell({ count }: { count: FunnelCount }) {
  return <>{count.unavailable ? MASKED : count.n}</>;
}

/**
 * Sur mobile (audit UI du 2026-09-14) : plus de largeur minimale — le
 * libellé se replie, les trois chiffres restent visibles, la déperdition
 * (100 − taux) passe sous `sm:`. Le corps de page ne défile jamais
 * horizontalement. `caption` nomme le tableau pour un lecteur d'écran.
 */
export function FunnelSteps({ rows, labelHeader, caption }: { rows: FunnelRow[]; labelHeader?: string; caption?: string }) {
  const t = useTranslations("analytics.funnelSteps");
  const fmt = use(getFormats());
  const max = Math.max(1, ...rows.map((r) => (r.count.unavailable ? 0 : r.count.n)));
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th scope="col" className="px-3 py-2.5 text-left font-medium sm:px-4">
              {labelHeader ?? t("etape")}
            </th>
            <th scope="col" className="px-2 py-2.5 text-right font-medium whitespace-nowrap sm:w-24 sm:px-4">
              {t("nombre")}
            </th>
            <th scope="col" className="px-2 py-2.5 text-right font-medium whitespace-nowrap sm:w-28 sm:px-4">
              {t("taux_de_passage")}
            </th>
            <th scope="col" className="hidden px-2 py-2.5 text-right font-medium whitespace-nowrap sm:table-cell sm:w-28 sm:px-4">
              {t("deperdition")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => {
            const unavailable = Boolean(row.count.unavailable);
            const width = unavailable ? 0 : Math.round((row.count.n / max) * 1000) / 10;
            return (
              <tr key={row.key} className={cn(unavailable && "text-muted-foreground")}>
                <th scope="row" className="min-w-0 px-3 py-3 text-left align-top font-normal sm:w-1/2 sm:min-w-64 sm:px-4">
                  <span className={cn("block text-sm", !unavailable && "font-medium text-foreground")}>{row.label}</span>
                  {unavailable ? (
                    <span className="block text-xs text-muted-foreground text-pretty">{row.count.unavailable}</span>
                  ) : (
                    <span aria-hidden className="mt-1.5 block h-1.5 w-full max-w-md rounded-full bg-muted">
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
                    </span>
                  )}
                  {row.note && <span className="mt-1 block text-xs text-muted-foreground text-pretty">{row.note}</span>}
                </th>
                <td className="px-2 py-3 text-right align-top whitespace-nowrap tabular-nums sm:px-4">
                  <CountCell count={row.count} />
                </td>
                <td className="px-2 py-3 text-right align-top tabular-nums sm:px-4">{rateText(row.rate, fmt, t)}</td>
                <td className="hidden px-2 py-3 text-right align-top tabular-nums sm:table-cell sm:px-4">{dropText(row.rate, t, fmt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

