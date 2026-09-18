import { and, eq, gte, ilike, inArray, isNull, lt, ne, notInArray, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { parseLocalDateTime } from "@/lib/timezone";
import { arityOf, type FilterCondition, type FilterType } from "@/lib/display/filters";

/**
 * LES CONDITIONS DU CONSTRUCTEUR DE FILTRES, TRADUITES EN SQL (lot 3).
 *
 * Un principe tenu partout ici : une condition ne référence QUE la table
 * de base, jamais une jointure. Les listes du produit comptent leurs
 * lignes par une seconde requête SANS jointures (`select count(*) from
 * deals where …`) : une condition qui parlerait d'une table jointe
 * ferait diverger le compte et la page. Tout ce qui vit ailleurs passe
 * donc par une sous-requête.
 *
 * Deuxième principe : une condition qu'on ne sait pas traduire rend
 * `undefined` et n'est PAS appliquée — mais l'écran, lui, la garde
 * affichée. C'est la règle du plan : retirer une condition en silence
 * élargirait la liste sans le dire.
 */
export type FilterTarget =
  | { kind: "column"; type: FilterType; column: AnyPgColumn }
  /** Un champ qui ne vit pas dans une colonne : une étiquette, une dernière activité, une issue d'étape. */
  | { kind: "custom"; type: FilterType; build: (condition: FilterCondition, ctx: FilterContext) => SQL | undefined };

export type FilterContext = { timeZone: string; now: Date };

/** Le jour calendaire suivant — la borne haute d'un « entre » est INCLUSE, comme partout dans le produit. */
function nextDay(day: string): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
}

/** « 2026-09-01 » → l'instant où ce jour commence dans le fuseau de l'organisation. */
function dayStart(day: string, ctx: FilterContext): Date | undefined {
  return parseLocalDateTime(`${day}T00:00`, ctx.timeZone) ?? undefined;
}

/** Les bornes d'une condition de date, en instants. `from` inclus, `to` exclu. */
export function dateBounds(condition: FilterCondition, ctx: FilterContext): { from?: Date; to?: Date } | undefined {
  const [a, b] = condition.values;
  switch (condition.operator) {
    case "before":
      return { to: dayStart(a, ctx) };
    case "after":
      // « après le 1er » veut dire à partir du 2 : le jour nommé n'en fait pas partie.
      return { from: dayStart(nextDay(a), ctx) };
    case "bt":
      return { from: dayStart(a, ctx), to: dayStart(nextDay(b), ctx) };
    case "last":
      return { from: new Date(ctx.now.getTime() - Number(a) * 86_400_000) };
    default:
      return undefined;
  }
}

function textCondition(column: AnyPgColumn, condition: FilterCondition): SQL | undefined {
  const [value] = condition.values;
  switch (condition.operator) {
    case "ct":
      return ilike(column, `%${escapeLike(value)}%`);
    case "sw":
      return ilike(column, `${escapeLike(value)}%`);
    case "eq":
      // « est » compare sans la casse : personne ne cherche « DUPONT » en pensant à autre chose que « Dupont ».
      return sql`lower(${column}) = ${value.toLowerCase()}`;
    case "empty":
      // Vide = NULL ou chaîne vide : les deux existent en base et veulent dire la même chose à l'écran.
      return or(isNull(column), eq(sql`btrim(${column})`, ""));
    default:
      return undefined;
  }
}

/** `%` et `_` sont les jokers de LIKE : tapés dans une recherche, ils doivent rester des caractères. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function numberCondition(column: AnyPgColumn, condition: FilterCondition): SQL | undefined {
  const [a, b] = condition.values;
  switch (condition.operator) {
    case "gt":
      return sql`${column} > ${a}`;
    case "lt":
      return sql`${column} < ${a}`;
    case "bt":
      return sql`${column} >= ${a} and ${column} <= ${b}`;
    default:
      return undefined;
  }
}

function dateCondition(column: AnyPgColumn, condition: FilterCondition, ctx: FilterContext): SQL | undefined {
  const bounds = dateBounds(condition, ctx);
  if (!bounds) return undefined;
  const parts = [bounds.from ? gte(column, bounds.from) : undefined, bounds.to ? lt(column, bounds.to) : undefined].filter(
    (p): p is SQL => Boolean(p)
  );
  return parts.length === 0 ? undefined : and(...parts);
}

function listCondition(column: AnyPgColumn, condition: FilterCondition): SQL | undefined {
  const values = condition.values;
  switch (condition.operator) {
    case "eq":
      return eq(column, values[0]);
    case "ne":
      // « n'est pas » inclut les lignes SANS valeur : une affaire sans conseiller n'est pas « le conseiller X ».
      return or(ne(column, values[0]), isNull(column));
    case "in":
      return inArray(column, values);
    default:
      return undefined;
  }
}

function booleanCondition(column: AnyPgColumn, condition: FilterCondition): SQL | undefined {
  if (condition.operator !== "is") return undefined;
  return eq(column, condition.values[0] === "vrai");
}

/** UNE condition → du SQL, ou `undefined` quand elle ne se traduit pas. */
export function conditionToSql(condition: FilterCondition, target: FilterTarget, ctx: FilterContext): SQL | undefined {
  if (arityOf(condition.operator) !== "none" && condition.values.length === 0) return undefined;
  if (target.kind === "custom") return target.build(condition, ctx);
  switch (target.type) {
    case "texte":
      return textCondition(target.column, condition);
    case "nombre":
      return numberCondition(target.column, condition);
    case "date":
      return dateCondition(target.column, condition, ctx);
    case "liste":
      return listCondition(target.column, condition);
    case "booleen":
      return booleanCondition(target.column, condition);
  }
}

/**
 * Le jeu complet, combiné en **ET** (le OU n'existe qu'À L'INTÉRIEUR d'un
 * champ, par « fait partie de » — décision du plan, §3.0.1).
 */
export function filtersToSql(
  conditions: FilterCondition[],
  targets: Record<string, FilterTarget>,
  ctx: FilterContext
): SQL | undefined {
  const parts = conditions
    .map((condition) => {
      const target = targets[condition.field];
      return target ? conditionToSql(condition, target, ctx) : undefined;
    })
    .filter((p): p is SQL => Boolean(p));
  return parts.length === 0 ? undefined : and(...parts);
}

/** Une condition de liste jouée sur un ENSEMBLE d'identifiants (étiquettes, sous-requêtes). */
export function listOverSet(column: AnyPgColumn, condition: FilterCondition, idsFor: (values: string[]) => SQL): SQL | undefined {
  switch (condition.operator) {
    case "eq":
    case "in":
      return sql`${column} in ${idsFor(condition.values)}`;
    case "ne":
      return sql`${column} not in ${idsFor(condition.values)}`;
    default:
      return undefined;
  }
}

export { notInArray };
