"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BLOCK_LABELS, type AnyBlock } from "@/lib/newsletter/blocks";

/**
 * Les formulaires d'édition, affichés À LA PLACE du bloc dans le document.
 *
 * Règle de rédaction tenue partout ici : aucun mot de développeur ni de
 * graphiste. « eyebrow » devient « surtitre », un niveau de titre se choisit
 * par ce qu'il fait (« Titre principal ») et non par son numéro, « CTA »
 * devient « encart », « URL » devient « lien ». Chaque champ dont l'effet
 * n'est pas évident porte une phrase d'aide sous lui — pas d'infobulle à
 * aller chercher.
 */

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Niveaux de titre nommés par leur rôle — jamais « 1 / 2 / 3 ». */
const TITLE_LEVELS = [
  { value: 1 as const, label: "Titre principal", hint: "En haut de l'email, une seule fois" },
  { value: 2 as const, label: "Sous-titre", hint: "Ouvre une section" },
  { value: 3 as const, label: "Petit titre", hint: "À l'intérieur d'une section" },
];

export function BlockEditor({
  block,
  onChange,
}: {
  block: AnyBlock;
  onChange: (next: AnyBlock) => void;
}) {
  switch (block.type) {
    case "titre":
      return (
        <div className="flex flex-col gap-4">
          <Field
            label="Surtitre"
            hint="Facultatif — un ou deux mots au-dessus du titre, en petites capitales."
          >
            <Input
              value={block.eyebrow}
              onChange={(e) => onChange({ ...block, eyebrow: e.target.value })}
              placeholder="Ex : Marché"
            />
          </Field>
          <Field label="Titre">
            <Input
              value={block.text}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
              placeholder="Ex : Les taux repassent sous les 3 %"
              autoFocus
            />
          </Field>
          <Field label="Niveau">
            <div className="flex flex-col gap-1.5">
              {TITLE_LEVELS.map((lvl) => (
                <label
                  key={lvl.value}
                  className="flex cursor-pointer items-start gap-2 text-sm"
                >
                  <input
                    type="radio"
                    name={`niveau-titre`}
                    className="mt-0.5"
                    checked={block.level === lvl.value}
                    onChange={() => onChange({ ...block, level: lvl.value })}
                  />
                  <span>
                    {lvl.label}
                    <span className="block text-xs text-muted-foreground">{lvl.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </Field>
        </div>
      );

    case "texte":
      return (
        <Field label="Texte" hint="Laisse une ligne vide pour commencer un nouveau paragraphe.">
          <Textarea
            value={block.text}
            onChange={(e) => onChange({ ...block, text: e.target.value })}
            className="min-h-32"
            placeholder="Écris ici…"
            autoFocus
          />
        </Field>
      );

    case "chiffre_cle":
      return (
        <div className="flex flex-col gap-4">
          <Field label="Le chiffre" hint="Tel qu'il doit s'afficher, unité comprise.">
            <Input
              value={block.value}
              onChange={(e) => onChange({ ...block, value: e.target.value })}
              placeholder="Ex : 3,1 %"
              autoFocus
            />
          </Field>
          <Field label="Ce qu'il mesure">
            <Input
              value={block.label}
              onChange={(e) => onChange({ ...block, label: e.target.value })}
              placeholder="Ex : Taux moyen sur 20 ans"
            />
          </Field>
          <Field
            label="Précision"
            hint="Facultatif. Si tu en mets une, mets-en une sur tous les chiffres de la rangée — sinon elle est ignorée."
          >
            <Input
              value={block.caption}
              onChange={(e) => onChange({ ...block, caption: e.target.value })}
              placeholder="Ex : hors assurance"
            />
          </Field>
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            Deux chiffres clés qui se suivent s&apos;affichent côte à côte dans l&apos;email.
          </p>
        </div>
      );

    case "fiches":
      return (
        <div className="flex flex-col gap-4">
          {block.cards.map((card, i) => (
            <div key={i} className="flex flex-col gap-3 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">
                  Fiche {i + 1}
                </span>
                {block.cards.length > 2 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() =>
                      onChange({ ...block, cards: block.cards.filter((_, n) => n !== i) })
                    }
                  >
                    Retirer
                  </Button>
                )}
              </div>
              <Field label="Titre">
                <Input
                  value={card.title}
                  onChange={(e) =>
                    onChange({
                      ...block,
                      cards: block.cards.map((c, n) =>
                        n === i ? { ...c, title: e.target.value } : c
                      ),
                    })
                  }
                  placeholder="Ex : Avant de signer"
                />
              </Field>
              <Field label="Texte">
                <Textarea
                  value={card.text}
                  onChange={(e) =>
                    onChange({
                      ...block,
                      cards: block.cards.map((c, n) =>
                        n === i ? { ...c, text: e.target.value } : c
                      ),
                    })
                  }
                  className="min-h-20"
                  placeholder="Deux ou trois lignes suffisent."
                />
              </Field>
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
          <p className="text-xs text-muted-foreground">Entre 2 et 4 fiches.</p>
        </div>
      );

    case "cta":
      return (
        <div className="flex flex-col gap-4">
          <Field label="Titre de l'encart">
            <Input
              value={block.title}
              onChange={(e) => onChange({ ...block, title: e.target.value })}
              placeholder="Ex : Un projet en cours ?"
              autoFocus
            />
          </Field>
          <Field label="Texte de l'encart">
            <Textarea
              value={block.text}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
              className="min-h-20"
              placeholder="Une phrase qui donne envie de cliquer."
            />
          </Field>
          <Field label="Texte du bouton">
            <Input
              value={block.buttonLabel}
              onChange={(e) => onChange({ ...block, buttonLabel: e.target.value })}
              placeholder="Ex : Prendre rendez-vous"
            />
          </Field>
          <Field label="Lien" hint="L'adresse vers laquelle le bouton envoie.">
            <Input
              value={block.url}
              onChange={(e) => onChange({ ...block, url: e.target.value })}
              placeholder="https://…"
            />
          </Field>
        </div>
      );

    case "bouton":
      return (
        <div className="flex flex-col gap-4">
          <Field label="Texte du bouton">
            <Input
              value={block.label}
              onChange={(e) => onChange({ ...block, label: e.target.value })}
              placeholder="Ex : Prendre rendez-vous"
              autoFocus
            />
          </Field>
          <Field label="Lien" hint="L'adresse vers laquelle le bouton envoie.">
            <Input
              value={block.url}
              onChange={(e) => onChange({ ...block, url: e.target.value })}
              placeholder="https://…"
            />
          </Field>
        </div>
      );

    case "separateur":
      return (
        <p className="text-sm text-muted-foreground">
          Un trait horizontal qui sépare deux parties de l&apos;email. Rien à régler.
        </p>
      );
  }
}

export function blockEditorTitle(block: AnyBlock): string {
  return BLOCK_LABELS[block.type];
}
