import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { analyse, type Bloc, ErreurArticle, motsDe, type Titre, titresDe } from "./markdown";

/**
 * LES ARTICLES DU BLOG — des fichiers Markdown du dépôt, lus AU BUILD.
 *
 * Aucune base, aucune requête, aucun rendu à la demande : les pages du blog
 * sont rendues une fois et servies par le CDN, avec une revalidation
 * quotidienne posée sur chaque route. Un article se publie en déposant un
 * fichier dans `content/articles/` et en poussant.
 *
 * L'EN-TÊTE EST STRICTE : six clés, pas une de plus, et chacune obligatoire
 * sauf deux. Une clé inconnue, une date mal formée ou un résumé manquant
 * arrêtent la construction en nommant le fichier — comme le garde-fou des
 * libellés. Un blog se casse silencieusement, sinon.
 */

const DOSSIER = join(process.cwd(), "content", "articles");
const CLES = ["titre", "resume", "categorie", "publie", "misAJour", "demonstration"] as const;
const OBLIGATOIRES = ["titre", "resume", "categorie", "publie"] as const;
/** Deux cent vingt mots à la minute : la vitesse de lecture d'un texte technique en français. */
const MOTS_PAR_MINUTE = 220;

export type Article = {
  readonly slug: string;
  readonly titre: string;
  readonly resume: string;
  readonly categorie: string;
  readonly publie: string;
  readonly misAJour?: string;
  readonly demonstration: boolean;
  readonly minutes: number;
  readonly mots: number;
  readonly titres: readonly Titre[];
  readonly blocs: readonly Bloc[];
};

function enTete(brut: string, fichier: string): Record<string, string> {
  const lignes = brut.split("\n");
  if (lignes[0].trim() !== "---") throw new ErreurArticle(fichier, 1, "en-tête manquante (« --- » en première ligne)");
  const valeurs: Record<string, string> = {};
  let i = 1;
  for (; i < lignes.length && lignes[i].trim() !== "---"; i += 1) {
    const trouve = lignes[i].match(/^([a-zA-Zé]+):\s*(.+)$/);
    if (!trouve) throw new ErreurArticle(fichier, i + 1, "ligne d’en-tête illisible (attendu « clé: valeur »)");
    const [, cle, valeur] = trouve;
    if (!(CLES as readonly string[]).includes(cle)) {
      throw new ErreurArticle(fichier, i + 1, `clé inconnue « ${cle} » (admises : ${CLES.join(", ")})`);
    }
    valeurs[cle] = valeur.trim();
  }
  if (i >= lignes.length) throw new ErreurArticle(fichier, 1, "en-tête jamais refermée");
  for (const cle of OBLIGATOIRES) {
    if (!valeurs[cle]) throw new ErreurArticle(fichier, 1, `clé obligatoire manquante : « ${cle} »`);
  }
  for (const cle of ["publie", "misAJour"]) {
    if (valeurs[cle] && !/^\d{4}-\d{2}-\d{2}$/.test(valeurs[cle])) {
      throw new ErreurArticle(fichier, 1, `date « ${cle} » attendue au format AAAA-MM-JJ`);
    }
  }
  valeurs.corpsDebut = String(i + 1);
  return valeurs;
}

function lis(fichier: string): Article {
  const brut = readFileSync(join(DOSSIER, fichier), "utf8");
  const tete = enTete(brut, fichier);
  const debut = Number(tete.corpsDebut);
  const corps = brut.split("\n").slice(debut).join("\n");
  const blocs = analyse(corps, fichier, debut);
  const mots = motsDe(blocs);
  return {
    slug: fichier.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}-/, ""),
    titre: tete.titre,
    resume: tete.resume,
    categorie: tete.categorie,
    publie: tete.publie,
    misAJour: tete.misAJour,
    demonstration: tete.demonstration === "oui",
    minutes: Math.max(1, Math.round(mots / MOTS_PAR_MINUTE)),
    mots,
    titres: titresDe(blocs),
    blocs,
  };
}

/** Tous les articles, du plus récent au plus ancien. */
export function articles(): Article[] {
  let fichiers: string[];
  try {
    fichiers = readdirSync(DOSSIER).filter((nom) => nom.endsWith(".md"));
  } catch {
    return [];
  }
  return fichiers
    .map(lis)
    .sort((a, b) => (a.publie === b.publie ? a.slug.localeCompare(b.slug) : b.publie.localeCompare(a.publie)));
}

export function articleParSlug(slug: string): Article | undefined {
  return articles().find((article) => article.slug === slug);
}

/** Les catégories, avec leur compte, par ordre alphabétique. */
export function categories(): { nom: string; slug: string; compte: number }[] {
  const comptes = new Map<string, number>();
  for (const article of articles()) comptes.set(article.categorie, (comptes.get(article.categorie) ?? 0) + 1);
  return [...comptes.entries()]
    .map(([nom, compte]) => ({ nom, slug: slugCategorie(nom), compte }))
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}

export function slugCategorie(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function articlesDeCategorie(slug: string): Article[] {
  return articles().filter((article) => slugCategorie(article.categorie) === slug);
}

/** L'article précédent et le suivant, dans l'ordre de publication. */
export function voisins(slug: string): { precedent?: Article; suivant?: Article } {
  const liste = articles();
  const rang = liste.findIndex((article) => article.slug === slug);
  if (rang < 0) return {};
  // La liste va du plus récent au plus ancien : le « suivant » est plus récent.
  return { suivant: liste[rang - 1], precedent: liste[rang + 1] };
}

/** Le nombre d'articles par page d'index. */
export const PAR_PAGE = 6;

export function nombreDePages(total = articles().length): number {
  return Math.max(1, Math.ceil(total / PAR_PAGE));
}

export function pageDArticles(numero: number, liste = articles()): Article[] {
  return liste.slice((numero - 1) * PAR_PAGE, numero * PAR_PAGE);
}

/** Une date écrite en français — « 18 septembre 2026 ». */
export function dateLongue(iso: string): string {
  const [annee, mois, jour] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(Date.UTC(annee, mois - 1, jour))
  );
}
