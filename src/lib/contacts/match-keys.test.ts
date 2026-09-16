import { describe, expect, it } from "vitest";
import { nameCityKey, normalizeText, phoneKey } from "./match-keys";

describe("les clés d'appariement d'un import (D7)", () => {
  it("rejoint les écritures d'un même téléphone sans supposer de pays", () => {
    expect(phoneKey("+33 6 12 34 56 78")).toBe("612345678");
    expect(phoneKey("06 12 34 56 78")).toBe("612345678");
    expect(phoneKey("0033612345678")).toBe("612345678");
    expect(phoneKey("06.12.34.56.78")).toBe("612345678");
    expect(phoneKey("+41 79 123 45 67")).toBe("791234567");
    expect(phoneKey("079 123 45 67")).toBe("791234567");
  });
  it("distingue deux numéros différents et refuse ce qui n'est pas un numéro", () => {
    expect(phoneKey("06 12 34 56 78")).not.toBe(phoneKey("06 12 34 56 79"));
    expect(phoneKey("12345")).toBeNull();
    expect(phoneKey("")).toBeNull();
    expect(phoneKey(null)).toBeNull();
    expect(phoneKey("à rappeler")).toBeNull();
  });
  it("compare un nom et une ville à la frappe près, jamais l'un sans l'autre", () => {
    expect(normalizeText("  Élodie   DURAND ")).toBe("elodie durand");
    expect(nameCityKey("Élodie Durand", "Saint-Étienne")).toBe(nameCityKey("elodie durand", "saint-etienne"));
    expect(nameCityKey("Élodie Durand", "Lyon")).not.toBe(nameCityKey("Élodie Durand", "Saint-Étienne"));
    expect(nameCityKey("Élodie Durand", "")).toBeNull();
    expect(nameCityKey("", "Lyon")).toBeNull();
  });
});
