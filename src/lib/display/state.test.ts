import { describe, expect, it } from "vitest";
import { displayScreen, screenForPath } from "./screens";
import {
  ME,
  parseScreenState,
  queryString,
  resolveOwnerFilter,
  sameScreenState,
  sanitizeScreenState,
  VIEW_PARAM,
  withParams,
} from "./state";

/**
 * L'ÉTAT D'AFFICHAGE est la porte d'entrée de tout ce que le lot 1 écrit
 * en base : ce qui passe ici finit dans `user_preferences` et dans les
 * définitions de vues. Ces contrôles tiennent la liste blanche — c'est la
 * garantie qu'une adresse forgée ne fait pas d'une préférence d'affichage
 * un entrepôt de texte libre.
 */
describe("l'état d'affichage d'un écran", () => {
  const contacts = displayScreen("contacts")!;

  it("ne garde que les paramètres déclarés par l'écran", () => {
    const state = sanitizeScreenState(contacts, { q: "dupont", page: "2", erreur: "coucou", nouveau: "1", inconnu: "x" });
    expect(state).toEqual({ q: "dupont", page: "2" });
  });

  it("laisse tomber une valeur vide, et une valeur démesurée", () => {
    const state = sanitizeScreenState(contacts, { q: "   ", conseiller: "x".repeat(300), tri: "creation" });
    expect(state).toEqual({ tri: "creation" });
  });

  it("produit toujours le même ordre, quel que soit l'ordre de l'adresse", () => {
    const a = sanitizeScreenState(contacts, { page: "3", q: "a" });
    const b = sanitizeScreenState(contacts, { q: "a", page: "3" });
    expect(queryString(a)).toBe(queryString(b));
    expect(queryString(a)).toBe("?q=a&page=3");
  });

  it("relit ce qui a été écrit en base, et ignore ce qui n'est pas une chaîne", () => {
    expect(parseScreenState(contacts, { q: "dupont", page: 2, autre: "x" })).toEqual({ q: "dupont" });
    expect(parseScreenState(contacts, null)).toEqual({});
    expect(parseScreenState(contacts, ["q"])).toEqual({});
  });

  it("n'attribue un écran qu'à une liste, jamais à une fiche", () => {
    expect(screenForPath("/contacts")?.key).toBe("contacts");
    expect(screenForPath("/contacts/9f1")).toBeUndefined();
    expect(screenForPath("/analytique/funnel")?.key).toBe("analytique-funnel");
  });

  it("change un paramètre sans toucher aux autres, et le retire sur une valeur vide", () => {
    const state = { q: "a", page: "2", tri: "creation" };
    expect(withParams(state, { page: undefined })).toEqual({ q: "a", tri: "creation" });
    expect(withParams(state, { tri: "" })).toEqual({ q: "a", page: "2" });
    expect(withParams(state, { q: "b" })).toEqual({ q: "b", page: "2", tri: "creation" });
  });

  it("reconnaît deux affichages identiques (on ne réécrit pas la mémoire pour rien)", () => {
    expect(sameScreenState({ q: "a" }, { q: "a" })).toBe(true);
    expect(sameScreenState({ q: "a" }, { q: "a", page: "2" })).toBe(false);
    expect(sameScreenState({ q: "a" }, { q: "b" })).toBe(false);
  });

  it("résout « moi » pour la personne qui regarde, et laisse passer un identifiant", () => {
    expect(resolveOwnerFilter(ME, "u-1")).toBe("u-1");
    expect(resolveOwnerFilter("u-2", "u-1")).toBe("u-2");
    expect(resolveOwnerFilter(undefined, "u-1")).toBeUndefined();
  });

  it("accepte le paramètre de vue sur les écrans qui en ont, jamais ailleurs", () => {
    expect(sanitizeScreenState(contacts, { [VIEW_PARAM]: "abc" })).toEqual({ [VIEW_PARAM]: "abc" });
    expect(sanitizeScreenState(displayScreen("emails-recus"), { [VIEW_PARAM]: "abc" })).toEqual({});
  });
});
