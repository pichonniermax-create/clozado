import type { TranslatorOf } from "@/i18n/translator";
import type { Formats } from "@/lib/format";

/**
 * Les BRIEFS préremplis quand une newsletter part de la veille — une
 * consigne au modèle, que la personne remanie, dans la langue des contenus
 * de l'organisation (`watch.brief.*`). Depuis l'étape 6, la matière
 * (titres, liens, dates, nos résumés) est transmise au composer telle
 * quelle et affichée dans le panneau « Matière » de l'éditeur : le brief
 * ne la recopie plus, il dit quoi en faire.
 */

/** « Écrire une newsletter à partir de ça » (le panier). */
export function buildBasketBrief(count: number, t: TranslatorOf<"watch">): string {
  return t("brief.a_partir_des_articles_mis_de_cote", { count });
}

/**
 * « Écrire sur ce sujet » (l'écart de contenu) : le sujet, combien de
 * concurrents l'ont traité et sous quels angles — et c'est tout ce qui
 * vient d'eux. La matière, elle, est la nôtre : nos articles sur ce sujet
 * quand il y en a (joints au composer), sinon la consigne d'écrire depuis
 * notre expertise.
 */
export type GapBriefContext = {
  subject: string;
  competitors: string[];
  articles: number;
  /** Les angles pris par les concurrents, déjà traduits. */
  angles: string[];
  /** Le nombre de nos articles sur ce sujet, joints comme matière. */
  ownItemsCount: number;
};

export function buildGapBrief(ctx: GapBriefContext, t: TranslatorOf<"watch">, fmt: Formats): string {
  const lines: string[] = [t("brief.sujet_a_traiter", { subject: ctx.subject })];
  if (ctx.competitors.length > 0) {
    lines.push(t("brief.concurrent_concurrents_l_ont_traite_ce_c5d1", { count: ctx.competitors.length, names: fmt.list(ctx.competitors), articles: ctx.articles }));
  }
  if (ctx.angles.length > 0) lines.push(t("brief.angles_qu_ils_ont_pris_prends_9b7c", { angles: fmt.list(ctx.angles) }));
  lines.push(t("brief.ne_reprends_rien_de_ce_qu_2f6e"));
  lines.push(ctx.ownItemsCount === 0 ? t("brief.aucun_article_de_nos_sources_sur_3a41") : t("brief.notre_matiere_articles_joints", { count: ctx.ownItemsCount }));
  return lines.join("\n").trim();
}
