import { describe, expect, it } from "vitest";
import { cleanPasted, formatAmount, rawAmount, reformatTyped, THIN_SPACE } from "./amount-input";

const S = THIN_SPACE;

describe("le champ montant — affichage d'une valeur du serveur", () => {
  it("groupe les milliers par espace fine insécable et enlève des décimales toutes à zéro", () => {
    expect(formatAmount("100000.00")).toBe(`100${S}000`);
    expect(formatAmount("300000")).toBe(`300${S}000`);
    expect(formatAmount(1234567)).toBe(`1${S}234${S}567`);
    expect(formatAmount("999")).toBe("999");
  });
  it("garde les décimales qui disent quelque chose, deux au plus, avec la virgule", () => {
    expect(formatAmount("1234.50")).toBe(`1${S}234,50`);
    expect(formatAmount("0.5")).toBe("0,5");
    expect(formatAmount("12.345")).toBe("12,34");
  });
  it("laisse vide ce qui est vide ou illisible — jamais 0", () => {
    expect(formatAmount("")).toBe("");
    expect(formatAmount(null)).toBe("");
    expect(formatAmount(undefined)).toBe("");
    expect(formatAmount("abc")).toBe("");
  });
});

describe("le champ montant — la valeur brute envoyée au serveur", () => {
  it("retire les espaces et rend le point décimal", () => {
    expect(rawAmount(`300${S}000`)).toBe("300000");
    expect(rawAmount(`1${S}234,50`)).toBe("1234.50");
    expect(rawAmount("0,5")).toBe("0.5");
    expect(rawAmount(",5")).toBe("0.5");
  });
  it("un champ vide envoie une chaîne vide, pas 0", () => {
    expect(rawAmount("")).toBe("");
    expect(rawAmount(",")).toBe("");
  });
});

describe("le champ montant — la frappe et le curseur", () => {
  it("formate au fil de la frappe : 300000 → 300 000", () => {
    expect(reformatTyped("300000", 6)).toEqual({ display: `300${S}000`, caret: 7 });
    expect(reformatTyped("3000", 4)).toEqual({ display: `3${S}000`, caret: 5 });
    expect(reformatTyped("300", 3)).toEqual({ display: "300", caret: 3 });
  });
  it("garde le curseur où l'on travaille quand un chiffre s'ajoute au milieu", () => {
    // « 300|000 » : on tape 1 → « 3001000 », curseur après le 1 (index 4) → « 3 001 000 », curseur après « 3 001 » (index 5).
    expect(reformatTyped("3001000", 4)).toEqual({ display: `3${S}001${S}000`, caret: 5 });
    // « 3 0|01 000 » : on tape 5 → curseur après le 5.
    const r = reformatTyped(`3${S}05` + `01${S}000`, 4);
    expect(r.display).toBe(`30${S}501${S}000`);
    expect(r.display.slice(0, r.caret)).toBe(`30${S}5`);
  });
  it("le point du pavé numérique vaut une virgule, deux décimales au plus", () => {
    expect(reformatTyped("1234.5", 6)).toEqual({ display: `1${S}234,5`, caret: 7 });
    expect(reformatTyped(`1${S}234,567`, 9).display).toBe(`1${S}234,56`);
  });
  it("un second séparateur tapé est ignoré, le nombre ne change pas de sens", () => {
    // « 300 000,5 » puis « , » en fin : la nouvelle virgule est écartée.
    expect(reformatTyped(`300${S}000,5,`, 10)).toEqual({ display: `300${S}000,5`, caret: 9 });
    // « 1 234,5 » puis « . » après le 1 : le point tapé est écarté, le curseur reste après le 1.
    expect(reformatTyped(`1.${S}234,5`, 2)).toEqual({ display: `1${S}234,5`, caret: 1 });
  });
  it("effacer la virgule recolle les chiffres et regroupe", () => {
    expect(reformatTyped(`300${S}0005`, 8).display).toBe(`3${S}000${S}005`);
  });
  it("les zéros de tête disparaissent, un zéro précède une fraction seule", () => {
    expect(reformatTyped("007", 3)).toEqual({ display: "7", caret: 1 });
    expect(reformatTyped(",5", 2)).toEqual({ display: "0,5", caret: 3 });
  });
  it("ignore ce qui n'est ni chiffre ni séparateur", () => {
    expect(reformatTyped("12a3", 4)).toEqual({ display: "123", caret: 3 });
    expect(reformatTyped("", 0)).toEqual({ display: "", caret: 0 });
  });
});

describe("le champ montant — le collage", () => {
  it("« 300 000,00 € », « 300000.00 » et « 300,000 » donnent tous 300 000", () => {
    expect(cleanPasted("300 000,00 €")).toBe(`300${S}000`);
    expect(cleanPasted("300000.00")).toBe(`300${S}000`);
    expect(cleanPasted("300,000")).toBe(`300${S}000`);
    expect(cleanPasted(`300${S}000`)).toBe(`300${S}000`);
  });
  it("reconnaît la décimale quand elle est là", () => {
    expect(cleanPasted("1.234,56")).toBe(`1${S}234,56`);
    expect(cleanPasted("1,234.56")).toBe(`1${S}234,56`);
    expect(cleanPasted("1,5")).toBe("1,5");
    expect(cleanPasted("1.5")).toBe("1,5");
    expect(cleanPasted("300,50")).toBe("300,50");
    expect(cleanPasted("1.000.000")).toBe(`1${S}000${S}000`);
  });
  it("vide reste vide", () => {
    expect(cleanPasted("")).toBe("");
    expect(cleanPasted("€")).toBe("");
  });
});
