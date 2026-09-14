import { describe, expect, it } from "vitest";
import { csvCell, csvDocument, csvLine, parseCsvDocument } from "./csv";

describe("csvCell", () => {
  it("garde le dialecte : point-virgule, virgule décimale, oui/non, vide pour l'absence", () => {
    expect(csvCell(1234.5)).toBe("1234,5");
    expect(csvCell(true)).toBe("oui");
    expect(csvCell(null)).toBe("");
    expect(csvLine(["a", 1, false])).toBe("a;1;non");
  });
  it("met entre guillemets ce qui porte un séparateur, un guillemet ou un retour à la ligne", () => {
    expect(csvCell('Dupont; "Marie"')).toBe('"Dupont; ""Marie"""');
  });
  it("neutralise une injection de formule : =, +, -, @, tabulation, retour chariot en tête", () => {
    expect(csvCell("=HYPERLINK(\"http://evil.example\";\"clic\")")).toBe("\"'=HYPERLINK(\"\"http://evil.example\"\";\"\"clic\"\")\"");
    expect(csvCell("+1+1")).toBe("'+1+1");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\tcmd")).toBe("'\tcmd");
    expect(csvCell("\rcmd")).toBe("\"'\rcmd\"");
  });
  it("ne touche pas aux nombres négatifs (des nombres, pas du texte) ni au texte ordinaire", () => {
    expect(csvCell(-12.5)).toBe("-12,5");
    expect(csvCell("Crédit immobilier")).toBe("Crédit immobilier");
    expect(csvCell("a=b")).toBe("a=b");
  });
});

describe("csvDocument / parseCsvDocument", () => {
  it("écrit puis relit un document, la marque d'ordre d'octets comprise", () => {
    const text = csvDocument([{ title: "Volumes", columns: ["Libellé", "Nombre"], rows: [["=danger", 3], ["Normal", 4]] }]);
    expect(text.startsWith("﻿")).toBe(true);
    const [table] = parseCsvDocument(text);
    expect(table.title).toBe("Volumes");
    expect(table.rows).toEqual([["'=danger", "3"], ["Normal", "4"]]);
  });
});
