import { describe, expect, it } from "vitest";
import { bareAddress, formatMailbox, isPlausibleEmail, isSameMailbox, mailboxKey } from "./address";

/**
 * Le premier test unitaire du dépôt (chantier audit et production-ready,
 * étape 3) : les adresses email, une logique pure partagée par la
 * connexion, l'inscription et l'expéditeur des organisations.
 */
describe("isPlausibleEmail", () => {
  it("accepte une adresse ordinaire", () => {
    expect(isPlausibleEmail("marie.dupont@cabinet-dupont.fr")).toBe(true);
  });
  it("refuse une adresse sans domaine, avec espace, ou trop longue", () => {
    expect(isPlausibleEmail("marie@")).toBe(false);
    expect(isPlausibleEmail("marie dupont@cabinet.fr")).toBe(false);
    expect(isPlausibleEmail(`${"a".repeat(250)}@x.fr`)).toBe(false);
  });
});

describe("formatMailbox", () => {
  it("écrit un nom simple sans guillemets", () => {
    expect(formatMailbox("Cabinet Dupont", "contact@cabinet-dupont.fr")).toBe("Cabinet Dupont <contact@cabinet-dupont.fr>");
  });
  it("met entre guillemets un nom qui porte une virgule ou un point, et échappe les guillemets", () => {
    expect(formatMailbox("Dupont, Marie", "m@d.fr")).toBe('"Dupont, Marie" <m@d.fr>');
    expect(formatMailbox('Le "vrai" cabinet', "m@d.fr")).toBe('"Le \\"vrai\\" cabinet" <m@d.fr>');
  });
  it("neutralise une injection d'en-tête par retour à la ligne", () => {
    expect(formatMailbox("Dupont\r\nBcc: pirate@evil.example", "m@d.fr")).toBe('"Dupont Bcc: pirate@evil.example" <m@d.fr>');
  });
  it("rend l'adresse nue quand le nom est vide", () => {
    expect(formatMailbox("  ", "m@d.fr")).toBe("m@d.fr");
  });
});

describe("bareAddress", () => {
  it("extrait l'adresse d'une boîte nommée et laisse une adresse nue telle quelle", () => {
    expect(bareAddress("Clozado <connexion@mail.clozado.fr>")).toBe("connexion@mail.clozado.fr");
    expect(bareAddress(" connexion@mail.clozado.fr ")).toBe("connexion@mail.clozado.fr");
  });
});

describe("mailboxKey et isSameMailbox", () => {
  it("retire le sous-adressage et la casse", () => {
    expect(mailboxKey("Claire <Claire+Test@Cabinet.FR>")).toBe("claire@cabinet.fr");
    expect(mailboxKey("claire@cabinet.fr")).toBe("claire@cabinet.fr");
  });
  it("ne rend rien d'une chaîne qui n'est pas une adresse", () => {
    expect(mailboxKey("pas une adresse")).toBe("");
    expect(mailboxKey("+tag@cabinet.fr")).toBe("");
  });
  it("reconnaît un alias d'une adresse autorisée, et refuse une autre boîte", () => {
    const allowed = ["claire@cabinet.fr", "Thomas <thomas@cabinet.fr>"];
    expect(isSameMailbox("claire+demo@cabinet.fr", allowed)).toBe(true);
    expect(isSameMailbox("THOMAS@cabinet.fr", allowed)).toBe(true);
    expect(isSameMailbox("client@ailleurs.fr", allowed)).toBe(false);
    expect(isSameMailbox("", allowed)).toBe(false);
  });
  it("ne prend pas un domaine voisin pour le bon", () => {
    expect(isSameMailbox("claire@cabinet.fr.evil.example", ["claire@cabinet.fr"])).toBe(false);
  });
});
