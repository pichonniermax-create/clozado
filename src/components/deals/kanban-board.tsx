"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { moveDealStageAction, updateDealDetailsAction } from "@/lib/deals/actions";
import { useFormats } from "@/components/i18n/formats-provider";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

export type KanbanStage = {
  id: string;
  label: string;
  color: string | null;
  probability: number | null;
  outcome: "won" | "lost" | null;
};

export type KanbanCard = {
  id: string;
  title: string;
  clientName: string;
  statusId: string;
  estimatedAmount: string | null;
  expectedCloseDate: string | null;
  lossReasonId: string | null;
  ownerName: string | null;
};

type LossReason = { id: string; label: string };

/**
 * Le kanban : une colonne par étape, glisser-déposer natif (HTML5, pas de
 * dépendance). Le déplacement est optimiste — la carte change de colonne
 * immédiatement, le serveur écrit affaire + historique + journal, et le
 * rafraîchissement réaligne. Déposer sur une étape « perdu » ouvre le
 * choix du motif SUR la carte, sans bloquer le geste.
 */
export function KanbanBoard({
  stages,
  cards,
  lossReasons,
}: {
  stages: KanbanStage[];
  cards: KanbanCard[];
  lossReasons: LossReason[];
}) {
  const tr = useTranslations("deals.kanbanBoard");
  const fmt = useFormats();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [optimisticCards, applyMove] = useOptimistic(
    cards,
    (state, move: { dealId: string; statusId: string }) =>
      state.map((c) => (c.id === move.dealId ? { ...c, statusId: move.statusId } : c))
  );
  const [dragged, setDragged] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const byStage = useMemo(() => {
    const map = new Map<string, KanbanCard[]>();
    for (const s of stages) map.set(s.id, []);
    for (const c of optimisticCards) map.get(c.statusId)?.push(c);
    return map;
  }, [stages, optimisticCards]);

  function drop(stageId: string) {
    setDropTarget(null);
    const dealId = dragged;
    setDragged(null);
    if (!dealId) return;
    const card = optimisticCards.find((c) => c.id === dealId);
    if (!card || card.statusId === stageId) return;
    setError(null);
    startTransition(async () => {
      applyMove({ dealId, statusId: stageId });
      try {
        await moveDealStageAction(dealId, stageId);
      } catch (e) {
        setError(e instanceof Error ? e.message : tr("le_deplacement_a_echoue_de_notre_9277"));
      }
      router.refresh();
    });
  }

  function setReason(dealId: string, lossReasonId: string) {
    if (!lossReasonId) return;
    startTransition(async () => {
      try {
        await updateDealDetailsAction(dealId, { lossReasonId });
      } catch (e) {
        setError(e instanceof Error ? e.message : tr("l_enregistrement_du_motif_a_echoue_a3c4"));
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max gap-3">
          {stages.map((stage) => {
            const columnCards = byStage.get(stage.id) ?? [];
            const total = columnCards.reduce((sum, c) => sum + (Number(c.estimatedAmount) || 0), 0);
            return (
              <section
                key={stage.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropTarget(stage.id);
                }}
                onDragLeave={() => setDropTarget((t) => (t === stage.id ? null : t))}
                onDrop={() => drop(stage.id)}
                className={cn(
                  "flex w-64 shrink-0 flex-col gap-2 rounded-xl border border-border bg-muted/40 p-2 transition-colors",
                  dropTarget === stage.id && "border-primary bg-accent/60"
                )}
              >
                <header className="flex items-baseline justify-between gap-2 px-1 pt-1">
                  <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: stage.color ?? "var(--muted-foreground)" }}
                    />
                    <span className="truncate">{stage.label}</span>
                    {stage.outcome && (
                      <span className="text-xs font-normal text-muted-foreground">
                        {stage.outcome === "won" ? tr("gagne") : tr("perdu")}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {columnCards.length}
                    {total > 0 && ` · ${fmt.money(total)}`}
                  </span>
                </header>

                {columnCards.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-2 py-6 text-center text-xs text-muted-foreground">
                    {tr("depose_une_affaire_ici")}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {columnCards.map((card) => (
                      <li
                        key={card.id}
                        draggable
                        onDragStart={() => setDragged(card.id)}
                        onDragEnd={() => setDragged(null)}
                        className={cn(
                          "cursor-grab rounded-lg border border-border bg-card p-3 shadow-xs active:cursor-grabbing",
                          dragged === card.id && "opacity-50"
                        )}
                      >
                        <Link href={`/affaires/${card.id}`} className="block" draggable={false}>
                          <p className="truncate text-sm font-medium">{card.title}</p>
                          <p className="truncate text-xs text-muted-foreground">{card.clientName}</p>
                          <p className="mt-1 flex items-center justify-between gap-2 text-xs">
                            <span className="font-medium tabular-nums">
                              {card.estimatedAmount ? fmt.money(card.estimatedAmount) : "—"}
                            </span>
                            <span className="tabular-nums text-muted-foreground">
                              {card.expectedCloseDate
                                ? fmt.shortDate(card.expectedCloseDate)
                                : ""}
                            </span>
                          </p>
                          {card.ownerName && (
                            <p className="mt-1 truncate text-xs text-muted-foreground">{card.ownerName}</p>
                          )}
                        </Link>
                        {stage.outcome === "lost" && !card.lossReasonId && lossReasons.length > 0 && (
                          <select
                            defaultValue=""
                            onChange={(e) => setReason(card.id, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-2 w-full rounded-md border border-warning/50 bg-background px-1.5 py-1 text-xs"
                            aria-label={tr("motif_de_perte")}
                          >
                            <option value="" disabled>
                              {tr("motif_de_perte_c1b7")}
                            </option>
                            {lossReasons.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
