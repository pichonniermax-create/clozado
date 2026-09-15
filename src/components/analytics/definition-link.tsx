import { CircleHelp } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { definitionAnchor } from "@/components/analytics/metric-definitions";
import { METRICS } from "@/lib/metrics";

/**
 * Le lien vers la définition d'un indicateur (la section « Définitions »
 * en bas de page), reconnaissable à son « ? » — avant, quatre copies
 * locales sans icône se confondaient avec le lien qui ouvre une liste
 * d'affaires (audit UI du 2026-09-14 : rien ne disait, avant le clic,
 * si un libellé expliquait ou naviguait).
 */
export function DefinitionLink({ id, children }: { id: keyof typeof METRICS; children: ReactNode }) {
  const t = useTranslations("analytics.metricDefinitions");
  return (
    <a href={`#${definitionAnchor(METRICS[id])}`} className="inline-flex items-center gap-1 underline-offset-2 hover:underline" title={t("voir_la_definition")}>
      {children}
      <CircleHelp aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
    </a>
  );
}

/** La classe d'un lien qui ouvre une LISTE (affaires filtrées) : souligné au repos, en gris — visible sans survol, donc sur mobile aussi. */
export const DATA_LINK_CLASS = "underline decoration-border underline-offset-4 hover:decoration-foreground";
