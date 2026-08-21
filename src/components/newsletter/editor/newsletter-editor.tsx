"use client";

import { useCallback, useMemo, useState } from "react";
import { Plus, Sparkles, Trash2, TriangleAlert, Undo2 } from "lucide-react";
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
import { cn } from "@/lib/utils";

export type EditorTarget = { id: string; label: string };

/**
 * Les messages de la revue sont écrits pour un journal technique (« Chiffre
 * non autorisé "12" dans un bloc chiffre_cle — ni un chiffre vérifié… »).
 * Ils sont reformulés ici pour l'écran, sans toucher à `review.ts` : c'est
 * le même travail de langage que sur le reste de l'éditeur.
 */
function reviewMessage(issue: ReviewIssue): string {
  switch (issue.code) {
    case "unauthorized_figure":
      return "Un chiffre n'est ni dans tes chiffres vérifiés, ni entre crochets — vérifie-le ou mets-le entre crochets.";
    case "multiple_ctas":
      return "Il y a plusieurs invitations à cliquer. Un seul bouton ou encart par email.";
    case "subject_too_long":
      return "L'objet est un peu long : il risque d'être coupé dans certaines boîtes mail.";
    case "preheader_too_long":
      return "L'aperçu est un peu long : il risque d'être coupé.";
  }
}

export type NewsletterEditorProps = {
  targets: EditorTarget[];
  brand: RenderBrand;
  signatory: RenderSignatory;
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
export function NewsletterEditor({ targets, brand, signatory, initial }: NewsletterEditorProps) {
  const [newsletterId, setNewsletterId] = useState(initial?.id);
  const [targetId, setTargetId] = useState(initial?.targetId ?? targets[0]?.id ?? "");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [preheader, setPreheader] = useState(initial?.preheader ?? "");
  const [blocks, setBlocks] = useState<AnyBlock[]>(initial?.blocks ?? []);
  const [brief, setBrief] = useState(initial?.brief ?? "");

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
        body: JSON.stringify({ targetId, brief, lang: "fr" }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "La rédaction a échoué.");
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
      setError("Connexion impossible. Réessaie.");
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
      title: subject.trim() || initial?.title || "Brouillon sans titre",
      subject,
      preheader,
      brief: brief.trim() || undefined,
      blocks,
    });
    if (!newsletterId) {
      setNewsletterId(id);
      // L'URL suit le brouillon créé, sans recharger la page : recharger
      // ferait perdre ce qui n'est pas encore parti.
      window.history.replaceState(null, "", `/newsletters/${id}`);
    }
  }, [newsletterId, targetId, subject, preheader, brief, blocks, initial?.title]);

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
      {/* Barre de l'éditeur : à qui, et l'action d'enregistrement. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Pour</span>
          <Select
            value={targetId}
            onValueChange={(v) => setTargetId(String(v))}
            items={targets.map((t) => ({ label: t.label, value: t.id }))}
          >
            <SelectTrigger className="h-8 w-56">
              <SelectValue placeholder="Choisir les destinataires" />
            </SelectTrigger>
            <SelectContent>
              {targets.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label}
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
            title="Annuler la dernière action (⌘Z)"
          >
            <Undo2 />
            Annuler
          </Button>
          <SaveIndicator state={saveState} />
        </div>
      </div>

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
            À vérifier avant d&apos;envoyer
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
                    {reviewMessage(issue)}
                  </button>
                ) : (
                  reviewMessage(issue)
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
              label="Objet"
              value={subject}
              onChange={setSubject}
              max={SUBJECT_MAX}
              placeholder="Ce que le lecteur voit en premier"
            />
            <LineField
              label="Aperçu"
              value={preheader}
              onChange={setPreheader}
              max={PREHEADER_MAX}
              placeholder="La ligne grise sous l'objet, dans la boîte de réception"
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
                            {blockEditorTitle(blocks[unit.indices[0]])}
                          </span>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Supprimer ce bloc"
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
                              Terminé
                            </Button>
                          </div>
                        </div>
                        <div className="flex flex-col gap-5">
                          {unit.indices.map((bi, n) => (
                            <div key={bi} className="flex flex-col gap-3">
                              {unit.indices.length > 1 && (
                                <span className="text-xs font-medium text-muted-foreground">
                                  Chiffre {n + 1}
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
                          aria-label={`Modifier : ${blockEditorTitle(blocks[unit.indices[0]])}`}
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
                Rédaction en cours…
              </div>
            )}

            <ShadowHtml html={shell.signatureHtml} />
          </div>
        </div>
      </div>
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
        title={over ? "Un peu long : risque d'être coupé dans certaines boîtes mail." : undefined}
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
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-10">
      <div className="w-full rounded-xl border border-border bg-card p-4 shadow-xs">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <span className="text-sm font-semibold">Que doit dire cet email ?</span>
        </div>
        <Textarea
          value={brief}
          onChange={(e) => onBrief(e.target.value)}
          className="min-h-24"
          placeholder="Ex : la baisse des taux et ce qu'elle change pour un projet d'achat cet été."
        />
        <Button
          className="mt-3 w-full"
          onClick={onGenerate}
          disabled={generating || !brief.trim()}
        >
          {generating ? "Rédaction en cours…" : "Rédiger l'email"}
        </Button>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>ou</span>
        <InsertionPoint
          onInsert={onAdd}
          trigger={
            <span className="inline-flex items-center gap-1 underline underline-offset-2">
              <Plus className="size-3" />
              écrire moi-même
            </span>
          }
        />
      </div>
    </div>
  );
}
