import { formatDate } from "@/lib/format";

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

export function buildBasketBrief(items: BriefSource[]): string {
  const lines: string[] = [
    "À partir des articles mis de côté ci-dessous. Cite chaque source utilisée avec son lien ; ne reprends aucune formulation d'origine — les résumés sont écrits avec nos mots.",
    "",
  ];
  items.forEach((item, i) => {
    const date = item.publishedAt ? `, ${formatDate(item.publishedAt)}` : "";
    lines.push(`${i + 1}. « ${item.title} » — ${item.publisher}${date} — ${item.url}`);
    if (item.summary) lines.push(`   ${item.summary}`);
    lines.push("");
  });
  return lines.join("\n").trim();
}
