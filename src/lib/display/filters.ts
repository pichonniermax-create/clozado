import type { SavedViewScreen } from "@/db/schema/user-preferences";

/**
 * LE CONSTRUCTEUR DE FILTRES (lot 3, étape 0) — « montant supérieur à
 * 200 000 ET étape égale à Négociation ET conseiller égal à moi », écrit
 * sans l'écrire. Ce module est PUR : il lit et écrit la syntaxe, il ne
 * touche à aucune base. La traduction en SQL vit dans la couche base
 * (`src/db/queries/filter-sql.ts`), l'affichage dans les écrans.
 *
 * LA SYNTAXE, dans l'adresse, sous un seul paramètre `f` :
 *
 *     f=champ:operateur:valeur,champ:operateur:valeur
 *
 * Les conditions se séparent par une VIRGULE, les trois parties d'une
 * condition par un DEUX-POINTS, les valeurs multiples par une BARRE
 * VERTICALE. Ces trois caractères restent littéraux : l'adresse se lit et
 * se corrige à la main.
 *
 * L'ÉCHAPPEMENT (correction du 2026-09-18 sur la syntaxe annoncée) : le
 * plan disait « pourcent-encodés » pour les séparateurs à l'intérieur
 * d'une valeur. Impossible — le cadre décode l'adresse AVANT que ce module
 * la voie, donc un `%2C` redevient une virgule et coupe la condition en
 * deux. L'échappement se fait donc avec un TILDE, caractère non réservé
 * (RFC 3986) que l'encodage d'URL laisse intact :
 *
 *     ~~ = ~     ~v = ,  (virgule)     ~d = :  (deux-points)     ~b = |  (barre)
 *
 * Personne ne l'écrit à la main : le constructeur le pose, la lecture le
 * retire. Une valeur ordinaire n'en contient jamais.
 */

export const FILTER_PARAM = "f";

export type FilterType = "texte" | "nombre" | "date" | "liste" | "booleen";

/** Les opérateurs, par type de champ — la table du plan, en code. */
export const OPERATORS_BY_TYPE = {
  texte: ["ct", "sw", "eq", "empty"],
  nombre: ["gt", "lt", "bt"],
  date: ["before", "after", "bt", "last"],
  liste: ["eq", "ne", "in"],
  booleen: ["is"],
} as const satisfies Record<FilterType, readonly string[]>;

export type FilterOperator = (typeof OPERATORS_BY_TYPE)[FilterType][number];

/** Combien de valeurs chaque opérateur attend : zéro, une, deux, ou une liste. */
const ARITY: Record<FilterOperator, "none" | "one" | "two" | "many"> = {
  ct: "one",
  sw: "one",
  eq: "one",
  empty: "none",
  gt: "one",
  lt: "one",
  bt: "two",
  before: "one",
  after: "one",
  last: "one",
  ne: "one",
  in: "many",
  is: "one",
};

export type FilterField = {
  /** La clé dans l'adresse : minuscules sans accent, stable dans le temps. */
  key: string;
  type: FilterType;
  /**
   * Pour un champ de type liste : le jeu d'options que l'écran doit
   * fournir. C'est l'écran qui les charge — ce module ne connaît aucune
   * donnée.
   */
  options?: "conseillers" | "etapes" | "types" | "pipelines" | "origines" | "partenaires" | "etiquettes" | "natures" | "issues" | "statuts";
  /** Le champ accepte le jeton `moi`, résolu pour la personne qui regarde. */
  me?: boolean;
};

/** LES CHAMPS FILTRABLES, par écran — la liste blanche, comme partout depuis le lot 1. */
export const FILTER_FIELDS: Partial<Record<SavedViewScreen, readonly FilterField[]>> = {
  contacts: [
    { key: "nom", type: "texte" },
    { key: "email", type: "texte" },
    { key: "telephone", type: "texte" },
    { key: "societe", type: "texte" },
    { key: "ville", type: "texte" },
    { key: "codepostal", type: "texte" },
    { key: "nature", type: "liste", options: "natures" },
    { key: "conseiller", type: "liste", options: "conseillers", me: true },
    { key: "apporteur", type: "liste", options: "partenaires" },
    { key: "origine", type: "liste", options: "origines" },
    { key: "etiquette", type: "liste", options: "etiquettes" },
    { key: "creation", type: "date" },
    { key: "activite", type: "date" },
  ],
  affaires: [
    { key: "titre", type: "texte" },
    { key: "client", type: "texte" },
    { key: "montant", type: "nombre" },
    { key: "etape", type: "liste", options: "etapes" },
    { key: "type", type: "liste", options: "types" },
    { key: "pipeline", type: "liste", options: "pipelines" },
    { key: "conseiller", type: "liste", options: "conseillers", me: true },
    { key: "issue", type: "liste", options: "issues" },
    { key: "creation", type: "date" },
    { key: "cloture", type: "date" },
  ],
} as const;

export function filterFields(screen: SavedViewScreen): readonly FilterField[] {
  return FILTER_FIELDS[screen] ?? [];
}

export type FilterCondition = {
  field: string;
  type: FilterType;
  operator: FilterOperator;
  /** Déjà déséchappées ; jamais vides sauf pour `empty`. */
  values: string[];
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const NUMBER = /^-?\d+(\.\d+)?$/;
/** Dix ans de jours : au-delà, « les N derniers jours » n'est plus une fenêtre, c'est tout l'historique. */
const MAX_LAST_DAYS = 3650;
/** Assez pour un jeu de filtres travaillé, pas assez pour faire de l'adresse un entrepôt. */
const MAX_CONDITIONS = 20;
const MAX_VALUE = 200;
const MAX_IN_VALUES = 30;

function unescapeValue(raw: string): string {
  return raw.replace(/~([~vdb])/g, (_, c: string) => (c === "~" ? "~" : c === "v" ? "," : c === "d" ? ":" : "|"));
}

function escapeValue(value: string): string {
  return value.replace(/~/g, "~~").replace(/,/g, "~v").replace(/:/g, "~d").replace(/\|/g, "~b");
}

/** Une valeur est-elle acceptable pour ce type ? Une valeur refusée écarte la condition. */
function valueFits(type: FilterType, operator: FilterOperator, value: string): boolean {
  if (value.length === 0 || value.length > MAX_VALUE) return false;
  if (type === "nombre") return NUMBER.test(value);
  if (type === "date") return operator === "last" ? /^\d{1,4}$/.test(value) && Number(value) >= 1 && Number(value) <= MAX_LAST_DAYS : DAY.test(value);
  if (type === "booleen") return value === "vrai" || value === "faux";
  return true;
}

/**
 * L'ADRESSE → des conditions. Ce qui ne tient pas debout est ÉCARTÉ en
 * silence : champ inconnu de l'écran, opérateur impossible pour le type,
 * mauvais nombre de valeurs, valeur mal formée. Ce sont des adresses
 * malformées, pas des données — les garder n'aiderait personne.
 *
 * Un IDENTIFIANT qui n'existe plus, lui, n'est PAS écarté : ce module ne
 * connaît pas la base, il rend la condition telle quelle, et l'écran la
 * montre comme « élément supprimé ». Retirer une condition élargirait la
 * liste sans le dire.
 */
export function parseFilters(screen: SavedViewScreen, raw: string | undefined): FilterCondition[] {
  if (!raw) return [];
  const fields = new Map(filterFields(screen).map((f) => [f.key, f]));
  const out: FilterCondition[] = [];
  for (const clause of raw.split(",")) {
    if (out.length >= MAX_CONDITIONS) break;
    const first = clause.indexOf(":");
    if (first < 0) continue;
    const second = clause.indexOf(":", first + 1);
    const key = clause.slice(0, first);
    const operator = (second < 0 ? clause.slice(first + 1) : clause.slice(first + 1, second)) as FilterOperator;
    const rest = second < 0 ? "" : clause.slice(second + 1);

    const field = fields.get(key);
    if (!field) continue;
    if (!(OPERATORS_BY_TYPE[field.type] as readonly string[]).includes(operator)) continue;

    const values = rest === "" ? [] : rest.split("|").map(unescapeValue);
    const arity = ARITY[operator];
    if (arity === "none" && values.length !== 0) continue;
    if (arity === "one" && values.length !== 1) continue;
    if (arity === "two" && values.length !== 2) continue;
    if (arity === "many" && (values.length === 0 || values.length > MAX_IN_VALUES)) continue;
    // Le jeton `moi` échappe au contrôle de forme : il n'est pas un identifiant, il en devient un à la lecture.
    const meToken = field.me && values.length === 1 && values[0] === "moi";
    if (!meToken && !values.every((v) => valueFits(field.type, operator, v))) continue;

    out.push({ field: key, type: field.type, operator, values });
  }
  return out;
}

/** Des conditions → l'adresse. Vide quand il n'y en a aucune (le paramètre disparaît). */
export function serializeFilters(conditions: FilterCondition[]): string {
  return conditions
    .slice(0, MAX_CONDITIONS)
    .map((c) => `${c.field}:${c.operator}${c.values.length > 0 ? `:${c.values.map(escapeValue).join("|")}` : ""}`)
    .join(",");
}

/** La même condition, retirée d'un jeu — l'index est celui de la liste affichée. */
export function withoutCondition(conditions: FilterCondition[], index: number): FilterCondition[] {
  return conditions.filter((_, i) => i !== index);
}

/** Les opérateurs proposés pour un champ, dans l'ordre d'affichage. */
export function operatorsFor(type: FilterType): readonly FilterOperator[] {
  return OPERATORS_BY_TYPE[type];
}

export function arityOf(operator: FilterOperator): "none" | "one" | "two" | "many" {
  return ARITY[operator];
}

/**
 * `moi` → l'identifiant de la personne qui REGARDE, juste avant que les
 * conditions descendent vers la base. Jamais figé dans l'adresse ni dans
 * une vue : c'est ce qui rend « mes affaires » juste pour chacun et
 * n'expose l'identifiant de personne (même règle que le lot 1).
 */
export function resolveMe(conditions: FilterCondition[], viewerId: string): FilterCondition[] {
  return conditions.map((c) =>
    c.values.includes(ME_TOKEN) ? { ...c, values: c.values.map((v) => (v === ME_TOKEN ? viewerId : v)) } : c
  );
}

export const ME_TOKEN = "moi";

export { escapeValue, unescapeValue };
