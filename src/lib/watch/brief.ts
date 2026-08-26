import type { TranslatorOf } from "@/i18n/translator";
import type { Formats } from "@/lib/format";

/**
 * Le brief prérempli quand une newsletter part du panier (« écrire à
 * partir de ça ») : les titres, éditeurs, dates, liens et NOS résumés —
 * c'est ce que le composer reçoit aujourd'hui comme matière. À l'étape 6,
 * le prompt lira les articles rattachés directement ; ce texte restera un
 * point de départ que l'utilisateur peut remanier.
 */
export type BriefSource = {
  title: string;
  url: string;
  publisher: string;
  publishedAt: Date | string | null;
  summary: string | null;
};

export function buildBasketBrief(items: BriefSource[], fmt: Formats): string {
  const lines: string[] = [
    // eslint-disable-next-line local/no-visible-text -- une consigne au modèle (le brief), pas un texte d'interface : sa langue est celle des contenus générés
    "À partir des articles mis de côté ci-dessous. Cite chaque source utilisée avec son lien ; ne reprends aucune formulation d'origine — les résumés sont écrits avec nos mots.",
    "",
  ];
  items.forEach((item, i) => {
    const date = item.publishedAt ? `, ${fmt.date(item.publishedAt)}` : "";
    lines.push(`${i + 1}. « ${item.title} » — ${item.publisher}${date} — ${item.url}`);
    if (item.summary) lines.push(`   ${item.summary}`);
    lines.push("");
  });
  return lines.join("\n").trim();
}

/**
 * Le brief prérempli quand une newsletter part de l'ÉCART DE CONTENU
 * (« écrire sur ce sujet ») : le sujet, combien de concurrents l'ont
 * traité et sous quels angles — et c'est tout ce qui vient d'eux. La
 * matière, elle, est la nôtre : nos articles sur ce sujet quand il y en a.
 * Les phrases viennent des messages, dans la langue des contenus de
 * l'organisation (c'est une consigne au modèle, que la personne remanie).
 */
export type GapBriefContext = {
  subject: string;
  competitors: string[];
  articles: number;
  /** Les angles pris par les concurrents, déjà traduits. */
  angles: string[];
  ownItems: BriefSource[];
};

export function buildGapBrief(ctx: GapBriefContext, t: TranslatorOf<"watch">, fmt: Formats): string {
  const lines: string[] = [t("brief.sujet_a_traiter", { subject: ctx.subject })];
  if (ctx.competitors.length > 0) {
    lines.push(t("brief.concurrent_concurrents_l_ont_traite_ce_c5d1", { count: ctx.competitors.length, names: fmt.list(ctx.competitors), articles: ctx.articles }));
  }
  if (ctx.angles.length > 0) lines.push(t("brief.angles_qu_ils_ont_pris_prends_9b7c", { angles: fmt.list(ctx.angles) }));
  lines.push(t("brief.ne_reprends_rien_de_ce_qu_2f6e"));
  lines.push("");
  if (ctx.ownItems.length === 0) {
    lines.push(t("brief.aucun_article_de_nos_sources_sur_3a41"));
  } else {
    lines.push(t("brief.notre_matiere_sur_ce_sujet"));
    ctx.ownItems.forEach((item, i) => {
      const date = item.publishedAt ? `, ${fmt.date(item.publishedAt)}` : "";
      lines.push(`${i + 1}. « ${item.title} » — ${item.publisher}${date} — ${item.url}`);
      if (item.summary) lines.push(`   ${item.summary}`);
    });
  }
  return lines.join("\n").trim();
}
