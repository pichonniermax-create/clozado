/**
 * L'ANALYSEUR MARKDOWN DU BLOG — écrit ici, et STRICT.
 *
 * Pourquoi pas une librairie : le Markdown de ce blog est le nôtre, nous
 * écrivons les articles, et chaque bloc doit tomber sur une classe du
 * système (un rayon, un filet, un corps — aucune valeur nouvelle). Un
 * analyseur maison rend un ARBRE DE BLOCS TYPÉS que des composants React
 * affichent : pas une chaîne de HTML injectée, donc rien à assainir et
 * aucune balise qui échappe au système.
 *
 * STRICT VEUT DIRE : toute syntaxe qu'il ne connaît pas fait ÉCHOUER LA
 * CONSTRUCTION, en nommant le fichier et la ligne. C'est le même parti que
 * le garde-fou des libellés — un article mal formé s'arrête au build, pas
 * en ligne. Une image en Markdown est refusée pour la même raison : le site
 * n'affiche aucune image.
 *
 * La grammaire tient en huit blocs :
 *   ## / ###      un titre de niveau 2 ou 3
 *   - / 1.        une liste, à puces ou numérotée
 *   > …           une citation, close par une ligne « — source » facultative
 *   > [!note]     une note (même syntaxe, autre intention)
 *   | a | b |     un tableau, avec sa ligne de séparation
 *   ```lang       un bloc de code
 *   texte         un paragraphe
 * et quatre marques en ligne : **gras**, *italique*, `code`, [lien](url).
 */

export type Segment =
  | { readonly type: "texte"; readonly valeur: string }
  | { readonly type: "gras"; readonly valeur: string }
  | { readonly type: "italique"; readonly valeur: string }
  | { readonly type: "code"; readonly valeur: string }
  | { readonly type: "lien"; readonly valeur: string; readonly href: string };

export type Bloc =
  | { readonly type: "titre"; readonly niveau: 2 | 3; readonly texte: string; readonly id: string }
  | { readonly type: "paragraphe"; readonly segments: Segment[] }
  | { readonly type: "liste"; readonly ordonnee: boolean; readonly elements: Segment[][] }
  | { readonly type: "citation"; readonly segments: Segment[]; readonly source?: string }
  | { readonly type: "note"; readonly segments: Segment[] }
  | { readonly type: "tableau"; readonly entetes: string[]; readonly lignes: string[][] }
  | { readonly type: "code"; readonly langue: string; readonly lignes: string[] };

export type Titre = { readonly id: string; readonly texte: string; readonly niveau: 2 | 3 };

/** Une erreur d'article : elle nomme le fichier et la ligne, et arrête la construction. */
export class ErreurArticle extends Error {
  constructor(fichier: string, ligne: number, message: string) {
    super(`${fichier}:${ligne} — ${message}`);
    this.name = "ErreurArticle";
  }
}

/** L'ancre d'un titre : sans accent, sans ponctuation, en minuscules. */
export function ancre(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * LES MARQUES EN LIGNE. Quatre, pas davantage. Une marque ouverte et jamais
 * fermée reste du texte : c'est le seul endroit permissif de l'analyseur,
 * parce qu'une apostrophe ou un astérisque isolé est une écriture normale.
 */
export function segments(texte: string, fichier: string, ligne: number): Segment[] {
  if (/!\[/.test(texte)) {
    throw new ErreurArticle(fichier, ligne, "une image : le site n’en affiche aucune");
  }
  if (/<[a-zA-Z/]/.test(texte)) {
    throw new ErreurArticle(fichier, ligne, "du HTML : le corps d’article n’en accepte pas");
  }
  const sortie: Segment[] = [];
  const motif = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;
  let dernier = 0;
  let trouve: RegExpExecArray | null;
  while ((trouve = motif.exec(texte)) !== null) {
    if (trouve.index > dernier) sortie.push({ type: "texte", valeur: texte.slice(dernier, trouve.index) });
    if (trouve[1] !== undefined) sortie.push({ type: "lien", valeur: trouve[1], href: trouve[2] });
    else if (trouve[3] !== undefined) sortie.push({ type: "gras", valeur: trouve[3] });
    else if (trouve[4] !== undefined) sortie.push({ type: "italique", valeur: trouve[4] });
    else if (trouve[5] !== undefined) sortie.push({ type: "code", valeur: trouve[5] });
    dernier = motif.lastIndex;
  }
  if (dernier < texte.length) sortie.push({ type: "texte", valeur: texte.slice(dernier) });
  return sortie;
}

/** Les cellules d'une ligne de tableau : « | a | b | » sans ses barres. */
function cellules(ligne: string): string[] {
  return ligne
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cellule) => cellule.trim());
}

/** Le corps d'un article, en blocs. */
export function analyse(source: string, fichier: string, decalage = 0): Bloc[] {
  const lignes = source.split("\n");
  const blocs: Bloc[] = [];
  let i = 0;

  /*
   * LES ANCRES SONT UNIQUES. Deux sections peuvent porter le même nom — « Un
   * exemple » deux fois dans un même article est une écriture normale. Leurs
   * ancres, elles, ne peuvent pas : deux `id` identiques feraient pointer la
   * seconde entrée du sommaire sur la première section. La deuxième reçoit
   * donc un rang, et l'écriture de l'article n'a rien à savoir de tout ça.
   */
  const ancresPosees = new Map<string, number>();
  const ancreUnique = (texte: string, ligne: number) => {
    const base = ancre(texte);
    if (base === "") {
      throw new ErreurArticle(fichier, ligne, "un titre sans lettre ni chiffre : il ne peut pas porter d’ancre");
    }
    const rang = (ancresPosees.get(base) ?? 0) + 1;
    ancresPosees.set(base, rang);
    return rang === 1 ? base : `${base}-${rang}`;
  };

  const numero = () => decalage + i + 1;

  while (i < lignes.length) {
    const ligne = lignes[i];

    if (ligne.trim() === "") {
      i += 1;
      continue;
    }

    // --- Un bloc de code, jusqu'à sa clôture ---
    if (ligne.startsWith("```")) {
      const langue = ligne.slice(3).trim();
      const contenu: string[] = [];
      i += 1;
      while (i < lignes.length && !lignes[i].startsWith("```")) {
        contenu.push(lignes[i]);
        i += 1;
      }
      if (i >= lignes.length) throw new ErreurArticle(fichier, numero(), "bloc de code jamais refermé");
      i += 1;
      blocs.push({ type: "code", langue, lignes: contenu });
      continue;
    }

    // --- Un titre ---
    if (ligne.startsWith("#")) {
      const trouve = ligne.match(/^(#{2,3})\s+(.+)$/);
      if (!trouve) {
        throw new ErreurArticle(fichier, numero(), "seuls ## et ### sont admis (le titre de l’article vient de l’en-tête)");
      }
      const texte = trouve[2].trim();
      blocs.push({ type: "titre", niveau: trouve[1].length as 2 | 3, texte, id: ancreUnique(texte, numero()) });
      i += 1;
      continue;
    }

    // --- Une citation, ou une note ---
    if (ligne.startsWith(">")) {
      const contenu: string[] = [];
      while (i < lignes.length && lignes[i].startsWith(">")) {
        contenu.push(lignes[i].replace(/^>\s?/, ""));
        i += 1;
      }
      const note = contenu[0]?.trim() === "[!note]";
      if (note) contenu.shift();
      const derniere = contenu[contenu.length - 1] ?? "";
      const source = derniere.startsWith("— ") ? contenu.pop()!.slice(2).trim() : undefined;
      const texte = contenu.join(" ").trim();
      if (!texte) throw new ErreurArticle(fichier, numero(), "citation vide");
      blocs.push(
        note
          ? { type: "note", segments: segments(texte, fichier, numero()) }
          : { type: "citation", segments: segments(texte, fichier, numero()), source }
      );
      continue;
    }

    // --- Un tableau : sa ligne d'en-tête, sa ligne de séparation, ses lignes ---
    if (ligne.trim().startsWith("|")) {
      const entetes = cellules(ligne);
      const separation = lignes[i + 1] ?? "";
      if (!/^\s*\|[\s:|-]+\|\s*$/.test(separation)) {
        throw new ErreurArticle(fichier, numero() + 1, "tableau sans ligne de séparation « |---|---| »");
      }
      i += 2;
      const corps: string[][] = [];
      while (i < lignes.length && lignes[i].trim().startsWith("|")) {
        const rangee = cellules(lignes[i]);
        if (rangee.length !== entetes.length) {
          throw new ErreurArticle(fichier, numero(), `${rangee.length} cellules pour ${entetes.length} colonnes`);
        }
        corps.push(rangee);
        i += 1;
      }
      blocs.push({ type: "tableau", entetes, lignes: corps });
      continue;
    }

    // --- Une liste, à puces ou numérotée ---
    const puce = /^[-*]\s+(.+)$/.exec(ligne);
    const numerote = /^\d+\.\s+(.+)$/.exec(ligne);
    if (puce || numerote) {
      const ordonnee = Boolean(numerote);
      const elements: Segment[][] = [];
      while (i < lignes.length) {
        const courante = lignes[i];
        const suivantePuce = /^[-*]\s+(.+)$/.exec(courante);
        const suivanteNumerotee = /^\d+\.\s+(.+)$/.exec(courante);
        if (!suivantePuce && !suivanteNumerotee) break;
        if (Boolean(suivanteNumerotee) !== ordonnee) {
          throw new ErreurArticle(fichier, numero(), "une liste ne change pas de type en cours de route");
        }
        elements.push(segments((suivantePuce ?? suivanteNumerotee)![1].trim(), fichier, numero()));
        i += 1;
      }
      blocs.push({ type: "liste", ordonnee, elements });
      continue;
    }

    // --- Ce qui reste est un paragraphe, lignes contiguës jointes ---
    if (/^\s/.test(ligne)) {
      throw new ErreurArticle(fichier, numero(), "une ligne indentée : ni liste, ni code reconnu");
    }
    const paragraphe: string[] = [];
    while (i < lignes.length && lignes[i].trim() !== "" && !/^(#|>|\||```|[-*]\s|\d+\.\s)/.test(lignes[i])) {
      paragraphe.push(lignes[i].trim());
      i += 1;
    }
    blocs.push({ type: "paragraphe", segments: segments(paragraphe.join(" "), fichier, numero()) });
  }

  return blocs;
}

/** Les titres d'un corps, pour la table des matières. */
export function titresDe(blocs: readonly Bloc[]): Titre[] {
  return blocs.filter((bloc) => bloc.type === "titre").map(({ id, texte, niveau }) => ({ id, texte, niveau }));
}

/** Le nombre de mots d'un corps — pour le temps de lecture. */
export function motsDe(blocs: readonly Bloc[]): number {
  const compte = (texte: string) => texte.trim().split(/\s+/).filter(Boolean).length;
  const dansSegments = (liste: readonly Segment[]) => liste.reduce((total, s) => total + compte(s.valeur), 0);
  return blocs.reduce((total, bloc) => {
    switch (bloc.type) {
      case "titre":
        return total + compte(bloc.texte);
      case "paragraphe":
      case "note":
        return total + dansSegments(bloc.segments);
      case "citation":
        return total + dansSegments(bloc.segments) + compte(bloc.source ?? "");
      case "liste":
        return total + bloc.elements.reduce((s, e) => s + dansSegments(e), 0);
      case "tableau":
        return total + bloc.entetes.reduce((s, e) => s + compte(e), 0) + bloc.lignes.flat().reduce((s, c) => s + compte(c), 0);
      case "code":
        return total + bloc.lignes.reduce((s, l) => s + compte(l), 0);
    }
  }, 0);
}
