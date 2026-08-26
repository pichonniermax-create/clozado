"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AnyBlock } from "@/lib/newsletter/blocks";
import { useTranslations } from "next-intl";

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
  { value: 1 as const },
  { value: 2 as const },
  { value: 3 as const },
];

export function BlockEditor({
  block,
  onChange,
}: {
  block: AnyBlock;
  onChange: (next: AnyBlock) => void;
}) {
  const t = useTranslations("newsletters.blockEditor");
  switch (block.type) {
    case "titre":
      return (
        <div className="flex flex-col gap-4">
          <Field
            label={t("surtitre")}
            hint={t("facultatif_un_ou_deux_mots_au_48c2")}
          >
            <Input
              value={block.eyebrow}
              onChange={(e) => onChange({ ...block, eyebrow: e.target.value })}
              placeholder={t("ex_marche")}
            />
          </Field>
          <Field label={t("titre")}>
            <Input
              value={block.text}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
              placeholder={t("ex_les_taux_repassent_sous_les_ed77")}
              autoFocus
            />
          </Field>
          <Field label={t("niveau")}>
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
                    {t(`levels.${lvl.value}.label`)}
                    <span className="block text-xs text-muted-foreground">{t(`levels.${lvl.value}.hint`)}</span>
                  </span>
                </label>
              ))}
            </div>
          </Field>
        </div>
      );

    case "texte":
      return (
        <Field label={t("texte")} hint={t("laisse_une_ligne_vide_pour_commencer_dc83")}>
          <Textarea
            value={block.text}
            onChange={(e) => onChange({ ...block, text: e.target.value })}
            className="min-h-32"
            placeholder={t("ecris_ici")}
            autoFocus
          />
        </Field>
      );

    case "chiffre_cle":
      return (
        <div className="flex flex-col gap-4">
          <Field label={t("le_chiffre")} hint={t("tel_qu_il_doit_s_afficher_191c")}>
            <Input
              value={block.value}
              onChange={(e) => onChange({ ...block, value: e.target.value })}
              placeholder={t("ex_3_1")}
              autoFocus
            />
          </Field>
          <Field label={t("ce_qu_il_mesure")}>
            <Input
              value={block.label}
              onChange={(e) => onChange({ ...block, label: e.target.value })}
              placeholder={t("ex_taux_moyen_sur_20_ans")}
            />
          </Field>
          <Field
            label={t("precision")}
            hint={t("facultatif_si_tu_en_mets_une_8985")}
          >
            <Input
              value={block.caption}
              onChange={(e) => onChange({ ...block, caption: e.target.value })}
              placeholder={t("ex_hors_assurance")}
            />
          </Field>
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            {t("deux_chiffres_cles_qui_se_suivent_b859")}
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
                  {t("fiche", { n: i + 1 })}
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
                    {t("retirer")}
                  </Button>
                )}
              </div>
              <Field label={t("titre")}>
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
                  placeholder={t("ex_avant_de_signer")}
                />
              </Field>
              <Field label={t("texte")}>
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
                  placeholder={t("deux_ou_trois_lignes_suffisent")}
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
              {t("ajouter_une_fiche")}
            </Button>
          )}
          <p className="text-xs text-muted-foreground">{t("entre_2_et_4_fiches")}</p>
        </div>
      );

    case "cta":
      return (
        <div className="flex flex-col gap-4">
          <Field label={t("titre_de_l_encart")}>
            <Input
              value={block.title}
              onChange={(e) => onChange({ ...block, title: e.target.value })}
              placeholder={t("ex_un_projet_en_cours")}
              autoFocus
            />
          </Field>
          <Field label={t("texte_de_l_encart")}>
            <Textarea
              value={block.text}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
              className="min-h-20"
              placeholder={t("une_phrase_qui_donne_envie_de_ae4d")}
            />
          </Field>
          <Field label={t("texte_du_bouton")}>
            <Input
              value={block.buttonLabel}
              onChange={(e) => onChange({ ...block, buttonLabel: e.target.value })}
              placeholder={t("ex_prendre_rendez_vous")}
            />
          </Field>
          <Field label={t("lien")} hint={t("l_adresse_vers_laquelle_le_bouton_360b")}>
            <Input
              value={block.url}
              onChange={(e) => onChange({ ...block, url: e.target.value })}
              placeholder={t("https")}
            />
          </Field>
        </div>
      );

    case "bouton":
      return (
        <div className="flex flex-col gap-4">
          <Field label={t("texte_du_bouton")}>
            <Input
              value={block.label}
              onChange={(e) => onChange({ ...block, label: e.target.value })}
              placeholder={t("ex_prendre_rendez_vous")}
              autoFocus
            />
          </Field>
          <Field label={t("lien")} hint={t("l_adresse_vers_laquelle_le_bouton_360b")}>
            <Input
              value={block.url}
              onChange={(e) => onChange({ ...block, url: e.target.value })}
              placeholder={t("https")}
            />
          </Field>
        </div>
      );

    case "separateur":
      return (
        <p className="text-sm text-muted-foreground">
          {t("un_trait_horizontal_qui_separe_deux_6e97")}
        </p>
      );
  }
}

/** Le titre de l'éditeur d'un bloc : le libellé de son type, dans la langue de la personne. */
export function blockEditorTitle(block: AnyBlock, t: (key: `blocks.${AnyBlock["type"]}.label`) => string): string {
  return t(`blocks.${block.type}.label`);
}
