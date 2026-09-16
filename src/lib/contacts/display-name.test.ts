import { describe, expect, it } from "vitest";
import { displayNameAfterUpdate } from "./display-name";

describe("displayNameAfterUpdate (D3)", () => {
  const imported = { name: "Jean Dupont", kind: "person" as const };

  it("ne réduit pas « Jean Dupont » à « Jean » quand seul le prénom est saisi", () => {
    expect(displayNameAfterUpdate(imported, { name: "Jean", firstName: "Jean", lastName: "" })).toBe("Jean Dupont");
    expect(displayNameAfterUpdate(imported, { name: "Dupont", firstName: null, lastName: "Dupont" })).toBe("Jean Dupont");
  });
  it("recompose le nom quand prénom et nom sont tous deux saisis", () => {
    expect(displayNameAfterUpdate(imported, { name: "Jean Dupont", firstName: " Jean ", lastName: "Durand" })).toBe("Jean Durand");
  });
  it("garde le nom actuel quand rien n'est saisi", () => {
    expect(displayNameAfterUpdate(imported, { name: "", firstName: "", lastName: "" })).toBe("Jean Dupont");
  });
  it("complète une fiche sans nom avec ce qu'on a", () => {
    expect(displayNameAfterUpdate({ name: "", kind: "person" }, { name: "Jean", firstName: "Jean", lastName: "" })).toBe("Jean");
  });
  it("pour une société, suit le champ nom et garde l'actuel s'il est vide", () => {
    expect(displayNameAfterUpdate({ name: "Cap Test", kind: "company" }, { name: " Cap Test SAS " })).toBe("Cap Test SAS");
    expect(displayNameAfterUpdate({ name: "Cap Test", kind: "company" }, { name: "" })).toBe("Cap Test");
  });
});
