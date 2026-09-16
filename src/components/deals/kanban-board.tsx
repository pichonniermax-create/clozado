"use client";

import { safeColor } from "@/lib/brand/color";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, GripVertical } from "lucide-react";
import { moveDealStageAction, updateDealDetailsAction } from "@/lib/deals/actions";
import { useFormats } from "@/components/i18n/formats-provider";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { NativeSelect } from "@/components/ui/native-select";

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
 *
 * Le glisser HTML5 n'existe ni au doigt (iOS, Android) ni au clavier
 * (audit UI du 2026-09-14) : chaque carte porte aussi un choix explicite
 * « Déplacer vers » — un sélecteur sous md, un menu derrière un bouton
 * icône dès md — qui passe par la même transition optimiste.
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

  /** Le déplacement lui-même — commun au dépôt, au sélecteur tactile et au menu clavier. */
  function moveTo(dealId: string, stageId: string) {
    const card = optimisticCards.find((c) => c.id === dealId);
    if (!card || card.statusId === stageId) return;
    setError(null);
    startTransition(async () => {
      applyMove({ dealId, statusId: stageId });
      // L'action rend son échec traduit ; une coupure réseau, elle, se lit comme un échec « de notre côté ».
      const result = await moveDealStageAction(dealId, stageId).catch(() => null);
      if (!result) setError(tr("le_deplacement_a_echoue_de_notre_9277"));
      else if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  function drop(stageId: string) {
    setDropTarget(null);
    const dealId = dragged;
    setDragged(null);
    if (!dealId) return;
    moveTo(dealId, stageId);
  }

  // La date du jour (UTC, la même au serveur et au client — pas de désaccord d'hydratation) : une clôture prévue
  // dépassée sur une affaire encore ouverte se voit au premier regard, comme sur tout pilote de pipeline.
  const todayIso = new Date().toISOString().slice(0, 10);

  function setReason(dealId: string, lossReasonId: string) {
    if (!lossReasonId) return;
    startTransition(async () => {
      const result = await updateDealDetailsAction(dealId, { lossReasonId }).catch(() => null);
      if (!result) setError(tr("l_enregistrement_du_motif_a_echoue_a3c4"));
      else if (!result.ok) setError(result.error);
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
      {/* Les gouttières de la page servent au défilement (le bord coupé devient le bord de l'écran) et chaque
          colonne s'accroche au défilement : on ne s'arrête plus entre deux colonnes sur un téléphone. */}
      <div className="-mx-4 snap-x snap-proximity overflow-x-auto px-4 pb-2 md:-mx-8 md:px-8">
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
                  "flex w-[calc(100vw-3rem)] shrink-0 snap-start flex-col gap-2 rounded-xl border border-border bg-muted/40 p-2 transition-colors sm:w-64",
                  dropTarget === stage.id && "border-primary bg-accent/60"
                )}
              >
                <header className="flex items-baseline justify-between gap-2 px-1 pt-1">
                  <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: safeColor(stage.color, "var(--muted-foreground)") }}
                    />
                    <span className="break-words">{stage.label}</span>
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
                    {columnCards.map((card) => {
                      const overdue = !stage.outcome && Boolean(card.expectedCloseDate) && card.expectedCloseDate! < todayIso;
                      return (
                      <li
                        key={card.id}
                        draggable
                        onDragStart={() => setDragged(card.id)}
                        onDragEnd={() => setDragged(null)}
                        className={cn(
                          "rounded-lg border border-border bg-card p-3 shadow-xs",
                          dragged === card.id && "opacity-50"
                        )}
                      >
                        {/* La poignée nommée à gauche, le menu « Déplacer vers » à droite (dès md) : la carte n'est
                            plus à la fois lien et poignée sans le dire. */}
                        <div className="flex items-start gap-1.5">
                          <span aria-hidden className="hidden cursor-grab pt-0.5 text-muted-foreground active:cursor-grabbing md:inline-flex">
                            <GripVertical className="size-3.5" />
                          </span>
                          <Link href={`/affaires/${card.id}`} className="block min-w-0 flex-1" draggable={false}>
                            <p className="text-sm leading-snug font-medium break-words">{card.title}</p>
                            <p className="text-xs text-muted-foreground break-words">{card.clientName}</p>
                            <p className="mt-1 flex items-center justify-between gap-2 text-xs">
                              <span className="font-medium tabular-nums">
                                {card.estimatedAmount ? fmt.money(card.estimatedAmount) : "—"}
                              </span>
                              <span
                                className={cn("tabular-nums", overdue ? "font-medium text-destructive" : "text-muted-foreground")}
                                title={overdue ? tr("cloture_depassee") : undefined}
                              >
                                {card.expectedCloseDate
                                  ? fmt.shortDate(card.expectedCloseDate)
                                  : ""}
                              </span>
                            </p>
                            {card.ownerName && (
                              <p className="mt-1 text-xs text-muted-foreground break-words">{card.ownerName}</p>
                            )}
                          </Link>
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={<Button variant="ghost" size="icon-xs" aria-label={tr("deplacer_vers")} className="hidden shrink-0 md:inline-flex" />}
                            >
                              <ArrowRightLeft />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              {stages
                                .filter((s) => s.id !== stage.id)
                                .map((s) => (
                                  <DropdownMenuItem key={s.id} onClick={() => moveTo(card.id, s.id)}>
                                    <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: safeColor(s.color, "var(--muted-foreground)") }} />
                                    {s.label}
                                  </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        {/* Au doigt : le choix d'étape sur la carte — le glisser HTML5 n'existe pas sur mobile. */}
                        <NativeSelect
                          value={card.statusId}
                          onChange={(e) => moveTo(card.id, e.target.value)}
                          aria-label={tr("deplacer_vers")}
                          className="mt-2 w-full md:hidden"
                        >
                          {stages.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.label}
                            </option>
                          ))}
                        </NativeSelect>
                        {stage.outcome === "lost" && !card.lossReasonId && lossReasons.length > 0 && (
                          <NativeSelect
                            defaultValue=""
                            onChange={(e) => setReason(card.id, e.target.value)}
                            onClick={(e) => e.stopPropagation()} className="mt-2 w-full"
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
                          </NativeSelect>
                        )}
                      </li>
                      );
                    })}
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
