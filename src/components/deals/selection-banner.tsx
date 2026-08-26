import Link from "next/link";
import { Funnel } from "lucide-react";
import { periodPhrase } from "@/lib/metrics/period-phrase";
import { buttonVariants } from "@/components/ui/button";
import { LOSS_NO_REASON, LOST_FROM_CREATION, ORIGIN_UNKNOWN, ORIGIN_UNMATCHED, type ParsedDealSelection } from "@/lib/metrics";

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
  }
): string {
  const { selection, parsed } = sel;
  const { filters } = selection;
  const parts: string[] = [];

  const outcome =
    selection.cohort === "perte"
      ? "perdues"
      : selection.outcome === "gagnee"
        ? "gagnées"
        : selection.outcome === "perdue"
          ? "perdues"
          : selection.outcome === "en-cours"
            ? "en cours"
            : null;

  const period = periodPhrase(parsed);
  if (selection.cohort === "perte") {
    parts.push(`${period} (à la date de la perte)`);
    if (selection.lossReasonId === LOSS_NO_REASON) parts.push("sans motif");
    else if (selection.lossReasonId) parts.push(`motif « ${lookups.reasons?.find((r) => r.id === selection.lossReasonId)?.label ?? "?"} »`);
    if (selection.lostFromStageId === LOST_FROM_CREATION) parts.push("nées perdues");
    else if (selection.lostFromStageId) parts.push(`perdues depuis « ${lookups.stages.find((s) => s.id === selection.lostFromStageId)?.label ?? "?"} »`);
  } else {
    parts.push(selection.cohort === "lead" ? `issues d'un lead reçu ${period}` : `créées ${period}`);
  }

  if (filters.typeId) parts.push(`de type « ${lookups.types.find((t) => t.id === filters.typeId)?.label ?? "?"} »`);
  if (filters.originId === ORIGIN_UNKNOWN) parts.push("sans origine (aucun lead)");
  else if (filters.originId === ORIGIN_UNMATCHED) parts.push("d'origine à rapprocher");
  else if (filters.originId) parts.push(`d'origine « ${lookups.origins.find((o) => o.id === filters.originId)?.label ?? "?"} »`);
  if (filters.ownerId) {
    const u = lookups.users.find((u) => u.id === filters.ownerId);
    if (u) parts.push(`suivies par ${u.name || u.email}`);
  }
  if (selection.reachedStageId) {
    parts.push(`ayant atteint « ${lookups.stages.find((s) => s.id === selection.reachedStageId)?.label ?? "?"} »`);
  }
  if (selection.furthestStageId) {
    parts.push(`au plus loin dans « ${lookups.stages.find((s) => s.id === selection.furthestStageId)?.label ?? "?"} »`);
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
  return (
    <section
      aria-label="Sélection venue de l'analytique"
      className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-accent/40 px-4 py-3 text-sm"
    >
      <Funnel className="size-4 shrink-0 text-primary-ink" aria-hidden />
      <p className="min-w-0 flex-1 text-pretty">
        <span className="font-medium">{description}</span>
        <span className="text-muted-foreground tabular-nums"> — {total} affaire{total > 1 ? "s" : ""}, exactement ce que l&apos;analyse a compté.</span>
      </p>
      <span className="flex shrink-0 items-center gap-1">
        <Link href={backHref} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          {backLabel}
        </Link>
        <Link href={clearHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Retirer la sélection
        </Link>
      </span>
    </section>
  );
}

/** Les paramètres de la sélection, pour les liens de la liste qui doivent la garder (tri, pagination, filtres natifs). */
export function selectionQuery(sel: ParsedDealSelection): Record<string, string | undefined> {
  return { ...sel.params, pipeline: undefined, conseiller: undefined };
}
