import { describe, expect, it } from "vitest";
import {
  arityOf,
  escapeValue,
  filterFields,
  operatorsFor,
  parseFilters,
  serializeFilters,
  unescapeValue,
  type FilterCondition,
} from "./filters";

/**
 * LA SYNTAXE DES FILTRES est une surface publique : elle voyage dans les
 * adresses que les gens copient et dans les vues qu'ils enregistrent. Ces
 * contrôles la tiennent — ce qui est écarté, ce qui est gardé, et le fait
 * qu'écrire puis relire rende exactement la même chose.
 */
describe("la syntaxe des filtres", () => {
  it("lit l'exemple du brief", () => {
    const conditions = parseFilters("affaires", "montant:gt:200000,etape:eq:11111111-1111-1111-1111-111111111111,conseiller:eq:moi");
    expect(conditions).toEqual([
      { field: "montant", type: "nombre", operator: "gt", values: ["200000"] },
      { field: "etape", type: "liste", operator: "eq", values: ["11111111-1111-1111-1111-111111111111"] },
      { field: "conseiller", type: "liste", operator: "eq", values: ["moi"] },
    ]);
  });

  it("écrit ce qu'elle a lu, à l'identique", () => {
    const raw = "montant:bt:100000|200000,titre:ct:maison,creation:last:30";
    expect(serializeFilters(parseFilters("affaires", raw))).toBe(raw);
  });

  it("écarte ce qui ne tient pas debout, et garde le reste", () => {
    // Champ inconnu de l'écran, opérateur impossible pour le type, valeur mal formée, arité fausse.
    const conditions = parseFilters(
      "affaires",
      "inventé:ct:x,montant:ct:x,montant:gt:beaucoup,montant:bt:100,titre:ct:maison"
    );
    expect(conditions.map((c) => c.field)).toEqual(["titre"]);
  });

  it("accepte « moi » là où une personne est attendue, nulle part ailleurs", () => {
    expect(parseFilters("affaires", "conseiller:eq:moi")).toHaveLength(1);
    // `etape` n'est pas un champ de personne : « moi » n'y est qu'une chaîne, acceptée comme identifiant libre.
    expect(parseFilters("affaires", "etape:eq:moi")).toHaveLength(1);
    expect(parseFilters("affaires", "montant:gt:moi")).toHaveLength(0);
  });

  it("borne les dates relatives", () => {
    expect(parseFilters("contacts", "activite:last:30")).toHaveLength(1);
    expect(parseFilters("contacts", "activite:last:0")).toHaveLength(0);
    expect(parseFilters("contacts", "activite:last:99999")).toHaveLength(0);
    expect(parseFilters("contacts", "activite:before:2026-09-01")).toHaveLength(1);
    expect(parseFilters("contacts", "activite:before:hier")).toHaveLength(0);
  });

  it("garde une condition dont l'identifiant n'existe peut-être plus", () => {
    // Ce module ne connaît pas la base : un identifiant bien formé passe, et c'est l'écran qui dira
    // « élément supprimé ». Retirer la condition élargirait la liste sans le dire.
    const conditions = parseFilters("affaires", "etape:eq:99999999-9999-9999-9999-999999999999");
    expect(conditions).toHaveLength(1);
  });

  it("rend les séparateurs écrits dans une valeur", () => {
    const written: FilterCondition[] = [{ field: "titre", type: "texte", operator: "ct", values: ["a,b:c|d~e"] }];
    const raw = serializeFilters(written);
    expect(raw).toBe("titre:ct:a~vb~dc~bd~~e");
    expect(parseFilters("affaires", raw)).toEqual(written);
  });

  it("l'échappement fait l'aller-retour sur n'importe quelle chaîne", () => {
    for (const value of ["simple", "a,b", "a:b", "a|b", "~", "~v", "a~~b", ",,,", ""]) {
      expect(unescapeValue(escapeValue(value))).toBe(value);
    }
  });

  it("ne connaît que les opérateurs du type", () => {
    expect(operatorsFor("texte")).toEqual(["ct", "sw", "eq", "empty"]);
    expect(operatorsFor("date")).toEqual(["before", "after", "bt", "last"]);
    expect(arityOf("empty")).toBe("none");
    expect(arityOf("bt")).toBe("two");
    expect(arityOf("in")).toBe("many");
  });

  it("« est vide » ne porte aucune valeur", () => {
    expect(parseFilters("contacts", "email:empty")).toEqual([{ field: "email", type: "texte", operator: "empty", values: [] }]);
    expect(parseFilters("contacts", "email:empty:x")).toHaveLength(0);
  });

  it("« fait partie de » porte plusieurs identifiants, et pas zéro", () => {
    expect(parseFilters("affaires", "etape:in:a|b|c")[0].values).toEqual(["a", "b", "c"]);
    expect(parseFilters("affaires", "etape:in:")).toHaveLength(0);
  });

  it("déclare des champs pour les écrans qui en ont, et rien pour les autres", () => {
    expect(filterFields("contacts").length).toBeGreaterThan(5);
    expect(filterFields("affaires").some((f) => f.key === "montant" && f.type === "nombre")).toBe(true);
    expect(filterFields("taches")).toEqual([]);
  });

  it("ne se laisse pas remplir sans fin", () => {
    const many = Array.from({ length: 40 }, () => "titre:ct:x").join(",");
    expect(parseFilters("affaires", many)).toHaveLength(20);
  });
});
