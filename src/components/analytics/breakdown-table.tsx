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

export function BreakdownTable({
  rows,
  labelHeader,
  countHeader = "Affaires",
  amountHeader = "Montant",
}: {
  rows: BreakdownRow[];
  labelHeader: string;
  countHeader?: string;
  amountHeader?: string;
}) {
  const t = useTranslations("analytics.breakdownTable");
  const fmt = use(getFormats());
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[32rem] text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th scope="col" className="px-4 py-2.5 text-left font-medium">
              {labelHeader}
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              {countHeader}
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              {t("part")}
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              {amountHeader}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row" className="px-4 py-3 text-left font-medium align-top">
                {row.label}
              </th>
              <td className="px-4 py-3 text-right align-top tabular-nums">{row.n}</td>
              <td className="px-4 py-3 text-right align-top tabular-nums">{rateText(row.share, fmt, true)}</td>
              <td className="px-4 py-3 text-right align-top tabular-nums">
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
    </div>
  );
}
