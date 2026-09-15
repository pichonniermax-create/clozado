import { use } from "react";
import type { ReactNode } from "react";
import { rateText } from "@/components/analytics/funnel-steps";
import { getFormats } from "@/i18n/formats";
import type { RateStat } from "@/lib/metrics";
import { useTranslations } from "next-intl";

/**
 * LE tableau d'une répartition — une ligne par catégorie (motif, étape,
 * conseiller, type…), son nombre, sa part du total (masquée sous le seuil,
 * la règle vit dans la couche) et son montant, chiffres tabulaires alignés
 * à droite ; sous le montant, ce qui n'a pas pu y entrer (« 2 sans
 * montant ») — et « — » à la place du montant quand AUCUNE affaire de la
 * ligne n'en porte : jamais 0 € pour dire « inconnu ». Le libellé peut
 * être un lien vers la liste de ce que la ligne compte.
 */
export type BreakdownRow = {
  key: string;
  label: ReactNode;
  n: number;
  share: RateStat;
  amount: number;
  withoutAmount: number;
};

/**
 * Sur mobile (audit UI du 2026-09-14) : plus de largeur minimale — le
 * libellé se replie, nombre et montant restent visibles. Quand TOUTES les
 * parts sont masquées (sous le seuil), la colonne « Part » n'est pas
 * rendue : quatre tirets n'apprennent rien, et à 390 px ils prenaient la
 * place du montant perdu — la raison est dite une fois, sous le tableau.
 * `caption` nomme le tableau pour un lecteur d'écran.
 */
export function BreakdownTable({
  rows,
  labelHeader,
  countHeader,
  amountHeader,
  caption,
}: {
  rows: BreakdownRow[];
  labelHeader: string;
  countHeader?: string;
  amountHeader?: string;
  caption?: string;
}) {
  const t = useTranslations("analytics.breakdownTable");
  const tf = useTranslations("analytics.funnelSteps");
  const fmt = use(getFormats());
  const allMasked = rows.length > 0 && rows.every((r) => r.share.hidden || r.share.percent === null);
  const missing = Math.max(0, ...rows.map((r) => r.share.missing));
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th scope="col" className="px-3 py-2.5 text-left font-medium sm:px-4">
              {labelHeader}
            </th>
            <th scope="col" className="px-2 py-2.5 text-right font-medium whitespace-nowrap sm:w-24 sm:px-4">
              {countHeader ?? t("affaires")}
            </th>
            {!allMasked && (
              <th scope="col" className="px-2 py-2.5 text-right font-medium whitespace-nowrap sm:w-20 sm:px-4">
                {t("part")}
              </th>
            )}
            <th scope="col" className="px-2 py-2.5 text-right font-medium whitespace-nowrap sm:w-40 sm:px-4">
              {amountHeader ?? t("montant")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row" className="min-w-0 px-3 py-3 text-left align-top font-medium sm:px-4">
                {row.label}
              </th>
              <td className="px-2 py-3 text-right align-top whitespace-nowrap tabular-nums sm:px-4">{row.n}</td>
              {!allMasked && <td className="px-2 py-3 text-right align-top whitespace-nowrap tabular-nums sm:px-4">{rateText(row.share, fmt, tf, true)}</td>}
              <td className="px-2 py-3 text-right align-top whitespace-nowrap tabular-nums sm:px-4">
                {row.withoutAmount === row.n ? <span className="text-muted-foreground">—</span> : fmt.money(row.amount)}
                {row.withoutAmount > 0 && (
                  <span className="block text-xs text-muted-foreground">
                    {t("sans_montant", { withoutAmount: row.withoutAmount })}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {allMasked && <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground sm:px-4">{t("part_masquee", { missing })}</p>}
    </div>
  );
}
