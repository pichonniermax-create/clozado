"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Plus, Sparkles, Trash2, TriangleAlert, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BlockEditor, blockEditorTitle } from "./block-editor";
import { InsertionPoint } from "./insertion-point";
import { ShadowHtml } from "./shadow-html";
import { UnitFrame } from "./unit-frame";
import { SaveIndicator } from "./save-indicator";
import { useAutosave } from "./use-autosave";
import { useBlockHistory } from "./use-block-history";
import {
  defaultBlock,
  DRAFT_BLOCK_UNION,
  type AnyBlock,
  type BlockType,
} from "@/lib/newsletter/blocks";
import {
  renderBlockUnits,
  renderDocumentShell,
  type RenderBrand,
  type RenderSignatory,
} from "@/lib/newsletter/render-email";
import { PREHEADER_MAX, SUBJECT_MAX, type ReviewIssue } from "@/lib/newsletter/review";
import { saveNewsletter } from "@/lib/newsletter/actions";
import { targetSummaryAction, type TargetSummary } from "@/lib/targets/actions";
import { useFormats } from "@/components/i18n/formats-provider";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import type { TranslatorOf } from "@/i18n/translator";
import type { AppLocale } from "@/i18n/locales";

/** Une cible telle que le sélecteur la montre : son nom et le nombre RÉEL de contacts qu'elle réunit aujourd'hui. */
export type EditorTarget = { id: string; label: string; count: number };

/**
 * Les messages de la revue sont écrits pour un journal technique (« Chiffre
 * non autorisé "12" dans un bloc chiffre_cle — ni un chiffre vérifié… »).
 * Ils sont reformulés ici pour l'écran, sans toucher à `review.ts` : c'est
 * le même travail de langage que sur le reste de l'éditeur.
 */
function reviewMessage(issue: ReviewIssue, t: TranslatorOf<"newsletters.newsletterEditor">): string {
  switch (issue.code) {
    case "unauthorized_figure":
      return t("un_chiffre_n_est_ni_dans_5699");
    case "multiple_ctas":
      return t("il_y_a_plusieurs_invitations_a_a0a4");
    case "subject_too_long":
      return t("l_objet_est_un_peu_long_0f43");
    case "preheader_too_long":
      return t("l_apercu_est_un_peu_long_d84d");
  }
}

/** Un article du panier dont la newsletter part : ce qu'on en montre (jamais son texte — il n'existe pas en base). */
export type EditorSource = {
  id: string;
  title: string;
  url: string;
  publisher: string;
  /** ISO, ou null quand la source ne date pas l'article. */
  publishedAt: string | null;
  summary: string | null;
};

export type NewsletterEditorProps = {
  targets: EditorTarget[];
  brand: RenderBrand;
  signatory: RenderSignatory;
  /** La cible présélectionnée pour un nouvel email (« Écrire une newsletter pour cette cible »). */
  initialTargetId?: string;
  /** Le brief prérempli d'un nouvel email (« écrire à partir de ça » depuis le panier). */
  initialBrief?: string;
  /** La matière : les articles rattachés (nouvel email depuis le panier, ou email déjà enregistré). */
  sources?: EditorSource[];
  /** La langue des contenus GÉNÉRÉS — celle de l'organisation par défaut, pas celle de la personne qui écrit. */
  lang: AppLocale;
  initial?: {
    id: string;
    title: string;
    targetId: string;
    subject: string;
    preheader: string;
    brief: string;
    blocks: AnyBlock[];
  };
};

/**
 * L'éditeur. Le document occupe l'écran ; on clique DANS le rendu pour
 * éditer, à l'endroit même du bloc. Il n'y a plus de colonne de champs d'un
 * côté et d'aperçu de l'autre.
 *
 * Le rendu est produit ici, dans le navigateur, par le MÊME
 * `renderBlockUnits` que l'email envoyé — pas par un second moteur
 * d'affichage à tenir synchronisé, et sans aller-retour réseau : ce qu'on
 * voit se met à jour à la frappe.
 */
export function NewsletterEditor({ targets, brand, signatory, initialTargetId, initialBrief, sources = [], initial, lang }: NewsletterEditorProps) {
  const tr = useTranslations("newsletters.newsletterEditor");
  const tb = useTranslations("newsletters");
  const fmt = useFormats();
  const [newsletterId, setNewsletterId] = useState(initial?.id);
  const [targetId, setTargetId] = useState(initial?.targetId ?? initialTargetId ?? targets[0]?.id ?? "");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [preheader, setPreheader] = useState(initial?.preheader ?? "");
  const [blocks, setBlocks] = useState<AnyBlock[]>(initial?.blocks ?? []);
  const [brief, setBrief] = useState(initial?.brief ?? initialBrief ?? "");

  /**
   * La sélection est ancrée sur un BLOC, pas sur une unité : les index
   * d'unités bougent dès qu'on insère ou déplace quelque chose, et un bloc
   * qu'on vient d'ajouter doit s'ouvrir de lui-même — sinon on insère un
   * bloc vide et il ne se passe rien de visible à l'écran.
   */
  const [selectedBlock, setSelectedBlock] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Résultat de la revue déterministe, porté jusqu'à l'écran. */
  const [reviewIssues, setReviewIssues] = useState<ReviewIssue[]>([]);

  const [dragUnit, setDragUnit] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    unit: number;
    position: "before" | "after";
  } | null>(null);

  const { commit, undo, canUndo } = useBlockHistory(blocks, setBlocks);

  const shell = useMemo(() => renderDocumentShell(brand, signatory), [brand, signatory]);
  // `editable` pose les ancres `data-block` que le clic utilise pour savoir
  // quel bloc ouvrir. Elles n'existent que dans ce rendu-ci.
  const units = useMemo(() => renderBlockUnits(blocks, brand, true), [blocks, brand]);
  const selectedUnit =
    selectedBlock === null ? -1 : units.findIndex((u) => u.indices.includes(selectedBlock));

  /**
   * La frappe dans un champ ne passe PAS par l'historique : elle garde
   * l'annulation native du navigateur, à l'intérieur du champ.
   */
  function replaceBlock(index: number, next: AnyBlock) {
    setBlocks((prev) => prev.map((b, i) => (i === index ? next : b)));
  }

  function insertBlock(at: number, type: BlockType) {
    commit(blocks);
    const next = [...blocks];
    next.splice(at, 0, defaultBlock(type));
    setBlocks(next);
    setSelectedBlock(at);
  }

  function removeUnit(indices: number[]) {
    commit(blocks);
    setBlocks(blocks.filter((_, i) => !indices.includes(i)));
    setSelectedBlock(null);
  }

  function duplicateUnit(indices: number[]) {
    commit(blocks);
    const copies = indices.map((i) => structuredClone(blocks[i]));
    const next = [...blocks];
    next.splice(indices[indices.length - 1] + 1, 0, ...copies);
    setBlocks(next);
    setSelectedBlock(null);
  }

  /**
   * Déplace le bloc — ou le groupe de chiffres clés — d'un seul tenant.
   * Les index sont recalculés APRÈS extraction : insérer à la position
   * d'origine d'une cible située plus bas décalerait le résultat d'autant de
   * blocs qu'on vient de retirer au-dessus.
   */
  function moveUnit(fromIndices: number[], toBlockIndex: number) {
    commit(blocks);
    const moved = fromIndices.map((i) => blocks[i]);
    const rest = blocks.filter((_, i) => !fromIndices.includes(i));
    const removedBefore = fromIndices.filter((i) => i < toBlockIndex).length;
    const at = Math.max(0, Math.min(rest.length, toBlockIndex - removedBefore));
    rest.splice(at, 0, ...moved);
    setBlocks(rest);
    setSelectedBlock(null);
  }

  function handleDocumentClick(unit: { indices: number[] }) {
    setSelectedBlock((prev) => (unit.indices.includes(prev ?? -1) ? null : unit.indices[0]));
  }

  function handleDrop() {
    if (dragUnit === null || dropTarget === null) return;
    const from = units[dragUnit];
    const target = units[dropTarget.unit];
    const toBlockIndex =
      dropTarget.position === "before"
        ? target.indices[0]
        : target.indices[target.indices.length - 1] + 1;
    if (dragUnit !== dropTarget.unit) moveUnit(from.indices, toBlockIndex);
    setDragUnit(null);
    setDropTarget(null);
  }

  /**
   * Génération en flux : les blocs se posent dans le document à mesure
   * qu'ils sont rédigés, plutôt qu'un écran figé puis tout d'un coup.
   *
   * Ce qui arrive en cours de route est PROVISOIRE : chaque bloc est validé
   * contre le schéma brouillon avant d'être affiché (jamais une forme non
   * vérifiée poussée dans l'état), et l'événement final remplace l'ensemble
   * par la sortie complète, elle seule passée par la revue déterministe.
   */
  async function generate() {
    if (!brief.trim() || !targetId) return;
    // La génération REMPLACE le document. Sur un email déjà écrit, c'est la
    // plus destructrice des actions : elle entre dans l'historique pour
    // qu'un ⌘Z ramène ce qu'il y avait avant.
    commit(blocks);
    setGenerating(true);
    setError(null);
    setReviewIssues([]);
    try {
      const res = await fetch("/api/newsletters/ai/design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId, brief, lang }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? tr("la_redaction_a_echoue"));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // Une ligne = un objet JSON. La dernière ligne d'un morceau peut être
      // coupée en plein milieu : elle reste dans le tampon jusqu'au suivant.
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          let event;
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }

          if (event.type === "error") {
            setError(event.error);
            return;
          }

          if (event.type === "progress") {
            if (event.newsletter.subject !== null) setSubject(event.newsletter.subject);
            if (event.newsletter.preheader !== null) setPreheader(event.newsletter.preheader);
            const valides = (event.newsletter.blocks as unknown[])
              .map((b) => DRAFT_BLOCK_UNION.safeParse(b))
              .filter((r) => r.success)
              .map((r) => r.data);
            setBlocks(valides);
          }

          if (event.type === "done") {
            setSubject(event.newsletter.subject);
            setPreheader(event.newsletter.preheader);
            setBlocks(event.newsletter.blocks);
            setReviewIssues(event.review?.issues ?? []);
          }
        }
      }
    } catch {
      setError(tr("connexion_impossible_reessaie"));
    } finally {
      setGenerating(false);
    }
  }

  /**
   * `useCallback` sur les valeurs courantes : le crochet d'enregistrement
   * garde la dernière version dans une ref, donc ce qui part est toujours
   * l'état au moment de l'écriture, jamais celui figé au montage.
   */
  const save = useCallback(async () => {
    if (!targetId) return;
    const id = await saveNewsletter({
      id: newsletterId,
      targetId,
      // Défaut intelligent : le nom du brouillon suit l'objet tant qu'on ne
      // l'a pas nommé à la main. Jamais « Sans titre » quand un objet existe.
      title: subject.trim() || initial?.title || tr("brouillon_sans_titre"),
      subject,
      preheader,
      brief: brief.trim() || undefined,
      blocks,
      // La matière est rattachée à la première écriture (idempotent ensuite).
      sourceItemIds: sources.length ? sources.map((s) => s.id) : undefined,
    });
    if (!newsletterId) {
      setNewsletterId(id);
      // L'URL suit le brouillon créé, sans recharger la page : recharger
      // ferait perdre ce qui n'est pas encore parti.
      window.history.replaceState(null, "", `/newsletters/${id}`);
    }
  }, [newsletterId, targetId, subject, preheader, brief, blocks, initial?.title, sources, tr]);

  // Rien n'est écrit tant que le document est vide : ouvrir puis quitter
  // l'écran ne doit pas semer un brouillon fantôme dans la liste.
  const hasContent =
    blocks.length > 0 || subject.trim().length > 0 || preheader.trim().length > 0;

  const saveState = useAutosave({
    data: JSON.stringify({ targetId, subject, preheader, brief, blocks }),
    hasContent: hasContent && Boolean(targetId),
    save,
  });

  const empty = blocks.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Barre de l'éditeur : à qui — avec le nombre réel de personnes — et l'action d'enregistrement. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{tr("pour")}</span>
          <Select
            value={targetId}
            onValueChange={(v) => setTargetId(String(v))}
            items={targets.map((t) => ({ label: targetLabel(t), value: t.id }))}
          >
            <SelectTrigger className="h-8 w-72">
              <SelectValue placeholder={tr("choisir_la_cible")} />
            </SelectTrigger>
            <SelectContent>
              {targets.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {targetLabel(t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          {/* Le raccourci existe, mais il ne se devine pas : le bouton le
              rend visible et donne son équivalent clavier. */}
          <Button
            variant="ghost"
            size="sm"
            onClick={undo}
            disabled={!canUndo}
            title={tr("annuler_la_derniere_action_z")}
          >
            <Undo2 />
            {tr("annuler")}
          </Button>
          <SaveIndicator state={saveState} />
        </div>
      </div>

      {/* À combien de personnes réelles on s'adresse, et ce qu'elles ont déjà reçu — l'anti-répétition. */}
      <TargetInsight targetId={targetId} />

      {/* La matière : les articles du panier dont l'email part — titres,
          éditeurs, dates, liens et NOS résumés. Jamais le texte des
          articles : il n'existe pas en base. */}
      {sources.length > 0 && (
        <details className="group rounded-xl border border-border bg-card" open>
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium">
            <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
            {tr("matiere_article_articles_mis_de_cote_0c6a", { count: sources.length })}
          </summary>
          <ul className="flex flex-col gap-3 border-t border-border p-4">
            {sources.map((s) => (
              <li key={s.id} className="flex flex-col gap-0.5 text-sm">
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
                  {s.title}
                </a>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {s.publisher}
                  {s.publishedAt ? ` · ${fmt.date(s.publishedAt)}` : ""}
                </span>
                {s.summary && <p className="text-xs text-muted-foreground text-pretty">{s.summary}</p>}
              </li>
            ))}
          </ul>
        </details>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {/* La revue déterministe qui suit chaque génération : elle ne sert à
          rien si son résultat n'arrive pas jusqu'à l'écran. Un chiffre non
          autorisé pointe le bloc concerné, pour aller le corriger. */}
      {reviewIssues.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <TriangleAlert className="size-4 shrink-0 text-warning" />
            {tr("a_verifier_avant_d_envoyer")}
          </p>
          <ul className="flex flex-col gap-1">
            {reviewIssues.map((issue, i) => (
              <li key={i} className="text-xs">
                {issue.blockIndex !== undefined ? (
                  <button
                    type="button"
                    className="text-left underline underline-offset-2 hover:text-foreground"
                    onClick={() => setSelectedBlock(issue.blockIndex!)}
                  >
                    {reviewMessage(issue, tr)}
                  </button>
                ) : (
                  reviewMessage(issue, tr)
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Le document. Fond de page et feuille repris du gabarit email lui-même. */}
      <div
        className="flex justify-center rounded-xl border border-border py-8"
        style={{ background: shell.pageBackground }}
      >
        <div className="w-full" style={{ maxWidth: shell.width }}>
          {/* Objet et aperçu : au-dessus de la feuille, à sa largeur, comme
              dans une messagerie — pas dans un panneau à part. */}
          <div className="mb-4 flex flex-col gap-2 rounded-lg bg-white/70 p-3 shadow-xs backdrop-blur-sm">
            <LineField
              label={tr("objet")}
              value={subject}
              onChange={setSubject}
              max={SUBJECT_MAX}
              placeholder={tr("ce_que_le_lecteur_voit_en_2bcb")}
            />
            <LineField
              label={tr("apercu")}
              value={preheader}
              onChange={setPreheader}
              max={PREHEADER_MAX}
              placeholder={tr("la_ligne_grise_sous_l_objet_ec2d")}
            />
          </div>

          <div
            className="overflow-hidden"
            style={{ background: shell.sheetBackground }}
          >
            <ShadowHtml html={shell.headerHtml} />

            {empty ? (
              <EmptyState
                brief={brief}
                onBrief={setBrief}
                onGenerate={generate}
                generating={generating}
                onAdd={(type) => insertBlock(0, type)}
              />
            ) : (
              <>
                <InsertionPoint onInsert={(type) => insertBlock(0, type)} />
                {units.map((unit, i) => (
                  <div key={unit.indices.join("-")}>
                    <UnitFrame
                      onDuplicate={() => duplicateUnit(unit.indices)}
                      onDelete={() => removeUnit(unit.indices)}
                      onDragStart={() => setDragUnit(i)}
                      onDragOver={(position) => setDropTarget({ unit: i, position })}
                      onDrop={handleDrop}
                      onDragEnd={() => {
                        setDragUnit(null);
                        setDropTarget(null);
                      }}
                      dragging={dragUnit === i}
                      dropBefore={
                        dragUnit !== null &&
                        dragUnit !== i &&
                        dropTarget?.unit === i &&
                        dropTarget.position === "before"
                      }
                      dropAfter={
                        dragUnit !== null &&
                        dragUnit !== i &&
                        dropTarget?.unit === i &&
                        dropTarget.position === "after"
                      }
                      editing={selectedUnit === i}
                    >
                      {selectedUnit === i ? (
                      <div className="border-y-2 border-primary bg-accent/30 p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {blockEditorTitle(blocks[unit.indices[0]], tb)}
                          </span>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={tr("supprimer_ce_bloc")}
                              onClick={() => removeUnit(unit.indices)}
                            >
                              <Trash2 />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedBlock(null)}
                            >
                              {tr("termine")}
                            </Button>
                          </div>
                        </div>
                        <div className="flex flex-col gap-5">
                          {unit.indices.map((bi, n) => (
                            <div key={bi} className="flex flex-col gap-3">
                              {unit.indices.length > 1 && (
                                <span className="text-xs font-medium text-muted-foreground">
                                  {tr("chiffre", { n: n + 1 })}
                                </span>
                              )}
                              <BlockEditor
                                block={blocks[bi]}
                                onChange={(next) => replaceBlock(bi, next)}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleDocumentClick(unit)}
                          className={cn(
                            "block w-full cursor-text text-left transition-shadow",
                            "hover:shadow-[inset_0_0_0_2px_var(--color-primary)]"
                          )}
                          aria-label={tr("modifier", { blockEditorTitle: blockEditorTitle(blocks[unit.indices[0]], tb) })}
                        >
                          <ShadowHtml html={unit.html} />
                        </button>
                      )}
                    </UnitFrame>
                    <InsertionPoint
                      onInsert={(type) => insertBlock(unit.indices[unit.indices.length - 1] + 1, type)}
                    />
                  </div>
                ))}
              </>
            )}

            {/* Pendant la rédaction, le document ne doit pas avoir l'air
                terminé : ce curseur dit qu'il en reste à venir. */}
            {generating && !empty && (
              <div className="flex items-center gap-2 px-6 py-3 text-xs text-muted-foreground">
                <span className="inline-block h-4 w-0.5 animate-pulse bg-primary" />
                {tr("redaction_en_cours")}
              </div>
            )}

            <ShadowHtml html={shell.signatureHtml} />
          </div>
        </div>
      </div>
    </div>
  );
}

function targetLabel(t: EditorTarget): string {
  return `${t.label} · ${t.count} contact${t.count > 1 ? "s" : ""}`;
}

/**
 * Au choix d'une cible : le nombre réel de contacts qu'elle réunit
 * aujourd'hui, et ce qui leur a déjà été envoyé récemment (lu dans la
 * photographie des envois marqués « envoyée », avec les sujets traités) —
 * rien n'est plus dommageable que de renvoyer le même sujet deux fois de
 * suite. Chargé à part pour ne pas retarder l'ouverture de l'éditeur.
 */
function TargetInsight({ targetId }: { targetId: string }) {
  const t = useTranslations("newsletters.newsletterEditor");
  const fmt = useFormats();
  // Le résumé porte l'id de la cible qui l'a produit : tant qu'il diffère de
  // la cible choisie, on est en chargement — rien n'est posé dans l'effet
  // lui-même, seulement à la réponse.
  const [loaded, setLoaded] = useState<{ targetId: string; summary: TargetSummary | null } | null>(null);

  useEffect(() => {
    if (!targetId) return;
    let cancelled = false;
    targetSummaryAction(targetId)
      .then((summary) => {
        if (!cancelled) setLoaded({ targetId, summary });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ targetId, summary: null });
      });
    return () => {
      cancelled = true;
    };
  }, [targetId]);

  if (!targetId) return null;
  if (loaded?.targetId !== targetId) {
    return <p className="text-xs text-muted-foreground">{t("calcul_des_destinataires")}</p>;
  }
  const summary = loaded.summary;
  if (summary === null) return null;

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
      <p>
        {t.rich("contact_contacts_reel_reels_aujourd_hui", { count: summary.count, span: (chunks) => <span className="font-semibold tabular-nums">{chunks}</span> })}
        {summary.count === 0 && (
          <span className="text-muted-foreground"> {t("cette_cible_est_vide_personne_ne_5121")}</span>
        )}
      </p>
      {summary.recentSends.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium">{t("deja_recu_par_ces_contacts_a_fe0a")}</p>
          <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
            {summary.recentSends.map((s) => (
              <li key={s.id}>
                {t.rich("le_de_la_cible", { n: s.subject || s.title, formatDate: fmt.date(s.sentAt), n2: s.overlapPercent ?? 0, n3: (s.topics.length > 0 && t("sujets", { join: s.topics.join(", ") })) || "", link: (chunks) => <Link href={`/newsletters/${s.id}`} className="underline underline-offset-2 hover:text-foreground">{chunks}</Link>, span: (chunks) => <span className="tabular-nums">{chunks}</span> })}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t("rien_d_envoye_a_ces_contacts_95af")}</p>
      )}
    </div>
  );
}

/** Objet / aperçu : une ligne, avec un compteur qui prévient sans bloquer. */
function LineField({
  label,
  value,
  onChange,
  max,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  placeholder: string;
}) {
  const t = useTranslations("newsletters.newsletterEditor");
  const over = value.length > max;
  return (
    <div className="flex items-center gap-3">
      <span className="w-14 shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
      />
      {/* Jamais tronqué, jamais interdit : seulement signalé. */}
      <span
        className={cn(
          "shrink-0 text-xs tabular-nums",
          over ? "font-medium text-warning" : "text-muted-foreground"
        )}
        title={over ? t("un_peu_long_risque_d_etre_49a6") : undefined}
      >
        {value.length}/{max}
      </span>
    </div>
  );
}

/**
 * Écran vierge : le chemin principal est l'IA, posée à l'endroit exact
 * qu'occupera le contenu. L'écriture manuelle reste possible, en retrait.
 */
function EmptyState({
  brief,
  onBrief,
  onGenerate,
  generating,
  onAdd,
}: {
  brief: string;
  onBrief: (v: string) => void;
  onGenerate: () => void;
  generating: boolean;
  onAdd: (type: BlockType) => void;
}) {
  const t = useTranslations("newsletters.newsletterEditor");
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-10">
      <div className="w-full rounded-xl border border-border bg-card p-4 shadow-xs">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <span className="text-sm font-semibold">{t("que_doit_dire_cet_email")}</span>
        </div>
        <Textarea
          value={brief}
          onChange={(e) => onBrief(e.target.value)}
          className="min-h-24"
          placeholder={t("ex_la_baisse_des_taux_et_6b32")}
        />
        <Button
          className="mt-3 w-full"
          onClick={onGenerate}
          disabled={generating || !brief.trim()}
        >
          {generating ? t("redaction_en_cours") : t("rediger_l_email")}
        </Button>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{t("ou")}</span>
        <InsertionPoint
          onInsert={onAdd}
          trigger={
            <span className="inline-flex items-center gap-1 underline underline-offset-2">
              <Plus className="size-3" />
              {t("ecrire_moi_meme")}
            </span>
          }
        />
      </div>
    </div>
  );
}
