"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { MailTarget } from "@/db/schema";
import { saveNewsletter } from "@/lib/newsletter/actions";
import {
  BLOCK_LABELS,
  BLOCK_TYPES,
  defaultBlock,
  type AnyBlock,
  type BlockType,
} from "@/lib/newsletter/blocks";
import type { ReviewIssue } from "@/lib/newsletter/review";

export type ComposerInitial = {
  id: string;
  targetId: string;
  title: string;
  subject: string;
  preheader: string;
  brief: string | null;
  blocks: AnyBlock[];
};

type Props = {
  targets: MailTarget[];
  initial?: ComposerInitial;
};

/**
 * Composer V1 — pas de glisser-déposer (pas de dépendance @dnd-kit) : le
 * réordonnancement passe par deux boutons haut/bas, volontairement plus
 * simple que la version de référence (dossier de reconstruction §3). Pas
 * non plus de passe de resserrement/traduction/sourcing automatique : la
 * génération produit un jet, revu par `reviewNewsletter`, modifiable à la
 * main avant enregistrement.
 */
export function Composer({ targets, initial }: Props) {
  const router = useRouter();

  const [targetId, setTargetId] = useState(initial?.targetId ?? targets[0]?.id ?? "");
  const [lang, setLang] = useState<"fr" | "en">("fr");
  const [brief, setBrief] = useState(initial?.brief ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [preheader, setPreheader] = useState(initial?.preheader ?? "");
  const [blocks, setBlocks] = useState<AnyBlock[]>(initial?.blocks ?? []);
  const [review, setReview] = useState<ReviewIssue[]>([]);

  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Aperçu live débouncé — silencieux tant que le draft n'est pas valide
  // (champs vides en cours de saisie) : on garde le dernier aperçu affiché
  // plutôt que de spammer une erreur à chaque frappe.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!targetId || !subject || !preheader || blocks.length === 0) return;

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/newsletters/render", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetId, subject, preheader, blocks }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { html: string };
        setPreviewHtml(data.html);
      } catch {
        // Aperçu best-effort : une erreur réseau ne doit pas casser l'éditeur.
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [targetId, subject, preheader, blocks]);

  async function handleGenerate() {
    setError(null);
    if (!targetId) {
      setError("Choisis une cible avant de générer.");
      return;
    }
    if (!brief.trim()) {
      setError("Le brief est requis pour générer une newsletter.");
      return;
    }

    setGenerating(true);
    try {
      const res = await fetch("/api/newsletters/ai/design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId, brief, lang }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "La génération a échoué.");
      }
      setSubject(data.newsletter.subject);
      setPreheader(data.newsletter.preheader);
      setBlocks(data.newsletter.blocks);
      setReview(data.review.issues ?? []);
      if (!title.trim()) {
        setTitle(data.newsletter.subject);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "La génération a échoué.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    setError(null);
    if (!targetId) {
      setError("Choisis une cible avant d'enregistrer.");
      return;
    }
    if (!title.trim() || !subject.trim() || !preheader.trim() || blocks.length === 0) {
      setError(
        "Titre, objet, préheader et au moins un bloc sont requis avant d'enregistrer."
      );
      return;
    }

    setSaving(true);
    try {
      const id = await saveNewsletter({
        id: initial?.id,
        targetId,
        title,
        subject,
        preheader,
        brief: brief || undefined,
        blocks,
      });
      router.replace(`/newsletters/${id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "L'enregistrement a échoué.");
    } finally {
      setSaving(false);
    }
  }

  function updateBlock(index: number, next: AnyBlock) {
    setBlocks((prev) => prev.map((b, i) => (i === index ? next : b)));
  }

  function removeBlock(index: number) {
    setBlocks((prev) => prev.filter((_, i) => i !== index));
  }

  function moveBlock(index: number, direction: -1 | 1) {
    setBlocks((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function addBlock(type: BlockType) {
    setBlocks((prev) => [...prev, defaultBlock(type)]);
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Concevoir avec l&apos;IA</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="target">Cible</Label>
              <Select value={targetId} onValueChange={(v) => setTargetId(String(v))}>
                <SelectTrigger id="target" className="w-full">
                  <SelectValue placeholder="Choisir une cible" />
                </SelectTrigger>
                <SelectContent>
                  {targets.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {targets.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Aucune cible configurée pour cette organisation.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="lang">Langue</Label>
              <Select value={lang} onValueChange={(v) => setLang(v as "fr" | "en")}>
                <SelectTrigger id="lang" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fr">Français</SelectItem>
                  <SelectItem value="en">Anglais</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="brief">Brief</Label>
              <Textarea
                id="brief"
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="Ce que cette newsletter doit couvrir..."
                className="min-h-24"
              />
            </div>

            <Button onClick={handleGenerate} disabled={generating} className="w-fit">
              {generating ? "Génération..." : "Générer"}
            </Button>

            {error && <p className="text-sm text-destructive">{error}</p>}

            {review.length > 0 && (
              <div className="flex flex-col gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-sm font-medium text-destructive">
                  Revue automatique — {review.length} point(s) à vérifier
                </p>
                <ul className="flex flex-col gap-1">
                  {review.map((issue, i) => (
                    <li key={i} className="text-xs text-muted-foreground">
                      {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Objet & préheader</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="title">Titre interne</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Pour retrouver ce brouillon dans la liste"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="subject">Objet</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={42}
              />
              <p className="text-xs text-muted-foreground">{subject.length}/42</p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="preheader">Préheader</Label>
              <Input
                id="preheader"
                value={preheader}
                onChange={(e) => setPreheader(e.target.value)}
                maxLength={85}
              />
              <p className="text-xs text-muted-foreground">{preheader.length}/85</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Blocs</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {blocks.map((block, index) => (
              <BlockEditor
                key={index}
                block={block}
                onChange={(next) => updateBlock(index, next)}
                onRemove={() => removeBlock(index)}
                onMoveUp={index > 0 ? () => moveBlock(index, -1) : undefined}
                onMoveDown={index < blocks.length - 1 ? () => moveBlock(index, 1) : undefined}
              />
            ))}

            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              <span className="text-sm text-muted-foreground">Ajouter :</span>
              {BLOCK_TYPES.map((type) => (
                <Button
                  key={type}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addBlock(type)}
                >
                  {BLOCK_LABELS[type]}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Button onClick={handleSave} disabled={saving} className="w-fit">
          {saving ? "Enregistrement..." : "Enregistrer"}
        </Button>
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle>Aperçu</CardTitle>
          </CardHeader>
          <CardContent>
            {previewHtml ? (
              <iframe
                title="Aperçu de la newsletter"
                srcDoc={previewHtml}
                className="h-[720px] w-full rounded-md border"
                sandbox=""
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                L&apos;aperçu apparaît une fois l&apos;objet, le préheader et au moins un
                bloc renseignés.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function BlockEditor({
  block,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  block: AnyBlock;
  onChange: (next: AnyBlock) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <Badge variant="secondary">{BLOCK_LABELS[block.type]}</Badge>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onMoveUp}
            disabled={!onMoveUp}
            aria-label="Monter"
          >
            ↑
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onMoveDown}
            disabled={!onMoveDown}
            aria-label="Descendre"
          >
            ↓
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onRemove}
            aria-label="Supprimer"
          >
            ×
          </Button>
        </div>
      </div>

      <BlockFields block={block} onChange={onChange} />
    </div>
  );
}

function BlockFields({
  block,
  onChange,
}: {
  block: AnyBlock;
  onChange: (next: AnyBlock) => void;
}) {
  switch (block.type) {
    case "titre":
      return (
        <div className="flex flex-col gap-2">
          <Input
            value={block.eyebrow}
            onChange={(e) => onChange({ ...block, eyebrow: e.target.value })}
            placeholder="Eyebrow (h1 uniquement)"
          />
          <Input
            value={block.text}
            onChange={(e) => onChange({ ...block, text: e.target.value })}
            placeholder="Titre"
          />
          <Select
            value={String(block.level)}
            onValueChange={(v) =>
              onChange({ ...block, level: Number(v) as 1 | 2 | 3 })
            }
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Niveau 1</SelectItem>
              <SelectItem value="2">Niveau 2</SelectItem>
              <SelectItem value="3">Niveau 3</SelectItem>
            </SelectContent>
          </Select>
        </div>
      );

    case "texte":
      return (
        <Textarea
          value={block.text}
          onChange={(e) => onChange({ ...block, text: e.target.value })}
          placeholder="Texte (paragraphes séparés par une ligne vide)"
          className="min-h-24"
        />
      );

    case "chiffre_cle":
      return (
        <div className="grid grid-cols-3 gap-2">
          <Input
            value={block.value}
            onChange={(e) => onChange({ ...block, value: e.target.value })}
            placeholder="Valeur"
          />
          <Input
            value={block.label}
            onChange={(e) => onChange({ ...block, label: e.target.value })}
            placeholder="Libellé"
          />
          <Input
            value={block.caption}
            onChange={(e) => onChange({ ...block, caption: e.target.value })}
            placeholder="Légende (optionnelle)"
          />
        </div>
      );

    case "fiches":
      return (
        <div className="flex flex-col gap-2">
          {block.cards.map((card, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={card.title}
                onChange={(e) => {
                  const cards = block.cards.map((c, j) =>
                    j === i ? { ...c, title: e.target.value } : c
                  );
                  onChange({ ...block, cards });
                }}
                placeholder="Titre de la fiche"
              />
              <Input
                value={card.text}
                onChange={(e) => {
                  const cards = block.cards.map((c, j) =>
                    j === i ? { ...c, text: e.target.value } : c
                  );
                  onChange({ ...block, cards });
                }}
                placeholder="Texte de la fiche"
              />
              {block.cards.length > 2 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Retirer la fiche"
                  onClick={() =>
                    onChange({ ...block, cards: block.cards.filter((_, j) => j !== i) })
                  }
                >
                  ×
                </Button>
              )}
            </div>
          ))}
          {block.cards.length < 4 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() =>
                onChange({ ...block, cards: [...block.cards, { title: "", text: "" }] })
              }
            >
              Ajouter une fiche
            </Button>
          )}
        </div>
      );

    case "cta":
      return (
        <div className="flex flex-col gap-2">
          <Input
            value={block.title}
            onChange={(e) => onChange({ ...block, title: e.target.value })}
            placeholder="Titre du CTA"
          />
          <Textarea
            value={block.text}
            onChange={(e) => onChange({ ...block, text: e.target.value })}
            placeholder="Texte du CTA"
          />
          <Input
            value={block.buttonLabel}
            onChange={(e) => onChange({ ...block, buttonLabel: e.target.value })}
            placeholder="Libellé du bouton"
          />
          <Input
            value={block.url}
            onChange={(e) => onChange({ ...block, url: e.target.value })}
            placeholder="URL"
          />
        </div>
      );

    case "bouton":
      return (
        <div className="flex flex-col gap-2">
          <Input
            value={block.label}
            onChange={(e) => onChange({ ...block, label: e.target.value })}
            placeholder="Libellé du bouton"
          />
          <Input
            value={block.url}
            onChange={(e) => onChange({ ...block, url: e.target.value })}
            placeholder="URL"
          />
        </div>
      );

    case "separateur":
      return <p className="text-sm text-muted-foreground">Séparateur visuel — aucun champ.</p>;
  }
}
