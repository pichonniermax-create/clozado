import Link from "next/link";
import { Funnel } from "lucide-react";
import { periodPhrase } from "@/lib/metrics/period-phrase";
import { buttonVariants } from "@/components/ui/button";
import { LOSS_NO_REASON, LOST_FROM_CREATION, ORIGIN_UNKNOWN, ORIGIN_UNMATCHED, type ParsedDealSelection } from "@/lib/metrics";
import { useTranslations } from "next-intl";
import type { TranslatorOf } from "@/i18n/translator";

/**
 * Le bandeau qui dit ce que la liste montre quand elle vient d'un clic sur
 * un pas du funnel : la phrase complète de la sélection (« affaires créées
 * sur les 90 derniers jours, de type Crédit, ayant atteint « Devis »,
 * perdues »), le nombre, et les deux gestes — retirer la sélection, revenir
 * au funnel avec les mêmes filtres. Sans lui, une liste filtrée par l'URL
 * serait une liste qui ment.
 */
export function describeDealSelection(
  sel: ParsedDealSelection,
  lookups: {
    stages: { id: string; label: string }[];
    types: { id: string; label: string }[];
    origins: { id: string; label: string }[];
    users: { id: string; name: string | null; email: string }[];
    reasons?: { id: string; label: string }[];
  },
  t: TranslatorOf<"deals.selectionBanner">,
  tm: TranslatorOf<"metrics">
): string {
  const { selection, parsed } = sel;
  const { filters } = selection;
  const parts: string[] = [];

  const outcome =
    selection.cohort === "perte"
      ? "perdues"
      : selection.outcome === "gagnee"
        ? t("gagnees")
        : selection.outcome === "perdue"
          ? "perdues"
          : selection.outcome === "en-cours"
            ? t("en_cours")
            : null;

  const period = periodPhrase(parsed, tm);
  if (selection.cohort === "perte") {
    parts.push(t("a_la_date_de_la_perte", { period }));
    if (selection.lossReasonId === LOSS_NO_REASON) parts.push(t("sans_motif"));
    else if (selection.lossReasonId) parts.push(`motif « ${lookups.reasons?.find((r) => r.id === selection.lossReasonId)?.label ?? "?"} »`);
    if (selection.lostFromStageId === LOST_FROM_CREATION) parts.push(t("nees_perdues"));
    else if (selection.lostFromStageId) parts.push(t("perdues_depuis", { n: lookups.stages.find((s) => s.id === selection.lostFromStageId)?.label ?? "?" }));
  } else {
    parts.push(selection.cohort === "lead" ? t("issues_d_un_lead_recu", { period }) : t("creees", { period }));
  }

  if (filters.typeId) parts.push(t("de_type", { n: lookups.types.find((t) => t.id === filters.typeId)?.label ?? "?" }));
  if (filters.originId === ORIGIN_UNKNOWN) parts.push(t("sans_origine_aucun_lead"));
  else if (filters.originId === ORIGIN_UNMATCHED) parts.push(t("d_origine_a_rapprocher"));
  else if (filters.originId) parts.push(t("d_origine", { n: lookups.origins.find((o) => o.id === filters.originId)?.label ?? "?" }));
  if (filters.ownerId) {
    const u = lookups.users.find((u) => u.id === filters.ownerId);
    if (u) parts.push(t("suivies_par", { n: u.name || u.email }));
  }
  if (selection.reachedStageId) {
    parts.push(t("ayant_atteint", { n: lookups.stages.find((s) => s.id === selection.reachedStageId)?.label ?? "?" }));
  }
  if (selection.furthestStageId) {
    parts.push(t("au_plus_loin_dans", { n: lookups.stages.find((s) => s.id === selection.furthestStageId)?.label ?? "?" }));
  }
  return `Affaires ${outcome ? `${outcome} ` : ""}${parts.join(", ")}`;
}

export function DealSelectionBanner({
  description,
  total,
  clearHref,
  backHref,
  backLabel,
}: {
  description: string;
  total: number;
  clearHref: string;
  /** L'écran analytique d'où vient la sélection, avec ses filtres. */
  backHref: string;
  backLabel: string;
}) {
  const t = useTranslations("deals.selectionBanner");
  return (
    <section
      aria-label={t("selection_venue_de_l_analytique")}
      className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-accent/40 px-4 py-3 text-sm"
    >
      <Funnel className="size-4 shrink-0 text-primary-ink" aria-hidden />
      <p className="min-w-0 flex-1 text-pretty">
        {t.rich("affaire_affaires_exactement_ce_que_l_c114", { description, total, span: (chunks) => <span className="font-medium">{chunks}</span>, span2: (chunks) => <span className="text-muted-foreground tabular-nums">{chunks}</span> })}
      </p>
      <span className="flex shrink-0 items-center gap-1">
        {t.rich("retirer_la_selection", { backLabel, link: (chunks) => <Link href={backHref} className={buttonVariants({ variant: "ghost", size: "sm" })}>{chunks}</Link>, link2: (chunks) => <Link href={clearHref} className={buttonVariants({ variant: "outline", size: "sm" })}>{chunks}</Link> })}
      </span>
    </section>
  );
}

/** Les paramètres de la sélection, pour les liens de la liste qui doivent la garder (tri, pagination, filtres natifs). */
export function selectionQuery(sel: ParsedDealSelection): Record<string, string | undefined> {
  return { ...sel.params, pipeline: undefined, conseiller: undefined };
}
