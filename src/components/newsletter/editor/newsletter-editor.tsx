"use client";

import { useMemo, useState } from "react";
import { Plus, Sparkles, Trash2 } from "lucide-react";
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
import {
  defaultBlock,
  type AnyBlock,
  type BlockType,
} from "@/lib/newsletter/blocks";
import {
  renderBlockUnits,
  renderDocumentShell,
  type RenderBrand,
  type RenderSignatory,
} from "@/lib/newsletter/render-email";
import { PREHEADER_MAX, SUBJECT_MAX } from "@/lib/newsletter/review";
import { saveNewsletter } from "@/lib/newsletter/actions";
import { cn } from "@/lib/utils";

export type EditorTarget = { id: string; label: string };

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

  const [selectedUnit, setSelectedUnit] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shell = useMemo(() => renderDocumentShell(brand, signatory), [brand, signatory]);
  // `editable` pose les ancres `data-block` que le clic utilise pour savoir
  // quel bloc ouvrir. Elles n'existent que dans ce rendu-ci.
  const units = useMemo(() => renderBlockUnits(blocks, brand, true), [blocks, brand]);

  function replaceBlock(index: number, next: AnyBlock) {
    setBlocks((prev) => prev.map((b, i) => (i === index ? next : b)));
  }

  function insertBlock(at: number, type: BlockType) {
    setBlocks((prev) => {
      const next = [...prev];
      next.splice(at, 0, defaultBlock(type));
      return next;
    });
    setSelectedUnit(null);
  }

  function removeUnit(indices: number[]) {
    setBlocks((prev) => prev.filter((_, i) => !indices.includes(i)));
    setSelectedUnit(null);
  }

  /** Retrouve l'unité cliquée à partir de l'ancre `data-block` la plus proche. */
  function handleDocumentClick(unitIndex: number) {
    setSelectedUnit((prev) => (prev === unitIndex ? null : unitIndex));
  }

  async function generate() {
    if (!brief.trim() || !targetId) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/newsletters/ai/design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId, brief, lang: "fr" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "La rédaction a échoué.");
        return;
      }
      setSubject(data.newsletter.subject);
      setPreheader(data.newsletter.preheader);
      setBlocks(data.newsletter.blocks);
    } catch {
      setError("Connexion impossible. Réessaie.");
    } finally {
      setGenerating(false);
    }
  }

  async function save() {
    if (!targetId) return;
    setSaving(true);
    setError(null);
    try {
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
      setNewsletterId(id);
      // L'URL suit le brouillon créé, sans recharger la page.
      window.history.replaceState(null, "", `/newsletters/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "L'enregistrement a échoué.");
    } finally {
      setSaving(false);
    }
  }

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
        <Button onClick={save} disabled={saving || !targetId} size="sm">
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
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
                              onClick={() => setSelectedUnit(null)}
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
                        onClick={() => handleDocumentClick(i)}
                        className={cn(
                          "block w-full cursor-text text-left transition-shadow",
                          "hover:shadow-[inset_0_0_0_2px_var(--color-primary)]"
                        )}
                        aria-label={`Modifier : ${blockEditorTitle(blocks[unit.indices[0]])}`}
                      >
                        <ShadowHtml html={unit.html} />
                      </button>
                    )}
                    <InsertionPoint
                      onInsert={(type) => insertBlock(unit.indices[unit.indices.length - 1] + 1, type)}
                    />
                  </div>
                ))}
              </>
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
