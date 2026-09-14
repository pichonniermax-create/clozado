import { describe, expect, it } from "vitest";
import { InvalidCriteriaError, isEmptyCriteria, normalizeCriteria, parseCriteria, readCriteriaStrict } from "./criteria";

/** Les deux lecteurs des critères d'une cible (audit, constat Q6) : tolérant pour l'écran, strict pour tout ce qui décide d'un envoi. */
const valid = { kind: "person", tagsAny: ["11111111-1111-4111-8111-111111111111"], inactiveForDays: 90 } as const;

describe("parseCriteria (tolérant, affichage)", () => {
  it("normalise une valeur valide et retire les listes vides", () => {
    expect(parseCriteria({ ...valid, cities: [] })).toEqual(valid);
  });
  it("rend {} pour tout ce qui est illisible : un écran ne casse pas", () => {
    expect(parseCriteria("pas du json")).toEqual({});
    expect(parseCriteria(["tableau"])).toEqual({});
    expect(parseCriteria({ ageMin: "douze" })).toEqual({});
    expect(parseCriteria(null)).toEqual({});
    expect(parseCriteria(undefined)).toEqual({});
  });
});

describe("readCriteriaStrict (strict, évaluation)", () => {
  it("rend la même forme normalisée qu'une valeur valide, {} compris (le choix explicite « tous les contacts »)", () => {
    expect(readCriteriaStrict({ ...valid, cities: [] })).toEqual(valid);
    expect(readCriteriaStrict({})).toEqual({});
    expect(readCriteriaStrict(JSON.stringify(valid))).toEqual(valid);
  });
  it("LÈVE au lieu d'élargir à tous les contacts : JSON invalide, chaîne, tableau, null, clé inconnue, valeur hors forme", () => {
    for (const value of ["{pas du json", "tous", ["tableau"], null, undefined, 42, { kind: "person", extra: true }, { ageMin: "douze" }, { tagsAny: ["pas-un-uuid"] }, { inactiveForDays: 0 }]) {
      expect(() => readCriteriaStrict(value), JSON.stringify(value)).toThrow(InvalidCriteriaError);
    }
  });
  it("l'erreur est une AppError traduisible (clé du namespace errors, statut 400)", () => {
    try {
      readCriteriaStrict("x");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidCriteriaError);
      expect((error as InvalidCriteriaError).key).toBe("les_criteres_de_cette_cible_sont_illisibles");
      expect((error as InvalidCriteriaError).status).toBe(400);
    }
  });
});

describe("normalizeCriteria / isEmptyCriteria", () => {
  it("deux cibles « tous les contacts » se ressemblent", () => {
    expect(normalizeCriteria({ tagsAny: [], cities: undefined })).toEqual({});
    expect(isEmptyCriteria({ tagsAny: [] })).toBe(true);
    expect(isEmptyCriteria({ hasEmail: true })).toBe(false);
  });
});
