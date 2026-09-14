import { describe, expect, it } from "vitest";
import { InvalidRuleConditionsError, normalizeRuleConditions, parseRuleConditions, readRuleConditionsStrict } from "./criteria";

/** Les deux lecteurs des conditions d'une règle (audit, constat Q6) : {} = « tous les contacts vivants », donc l'évaluation ne tolère rien. */
const valid = { tagsAny: ["11111111-1111-4111-8111-111111111111"], partnerProfessions: ["notaire"] };

describe("parseRuleConditions (tolérant, affichage)", () => {
  it("normalise une valeur valide", () => {
    expect(parseRuleConditions({ ...valid, ownerIds: [] })).toEqual(valid);
  });
  it("rend {} pour l'illisible : le formulaire s'affiche", () => {
    expect(parseRuleConditions("cassé")).toEqual({});
    expect(parseRuleConditions({ tagsAny: "pas-une-liste" })).toEqual({});
    expect(parseRuleConditions({ inconnue: true })).toEqual({});
    expect(parseRuleConditions(null)).toEqual({});
  });
});

describe("readRuleConditionsStrict (strict, évaluation)", () => {
  it("accepte une valeur valide, {} et la même chose en JSON texte", () => {
    expect(readRuleConditionsStrict({ ...valid, ownerIds: [] })).toEqual(valid);
    expect(readRuleConditionsStrict({})).toEqual({});
    expect(readRuleConditionsStrict(JSON.stringify(valid))).toEqual(valid);
  });
  it("LÈVE au lieu de valoir « tous les contacts » : JSON invalide, chaîne, tableau, null, clé inconnue, valeur hors forme", () => {
    for (const value of ["{", "tous", [], null, undefined, { inconnue: true }, { tagsAny: "x" }, { targetIds: ["pas-un-uuid"] }, { partnerProfessions: [""] }]) {
      expect(() => readRuleConditionsStrict(value), JSON.stringify(value)).toThrow(InvalidRuleConditionsError);
    }
  });
});

describe("normalizeRuleConditions", () => {
  it("retire les listes vides", () => {
    expect(normalizeRuleConditions({ tagsAny: [], targetIds: undefined })).toEqual({});
  });
});
