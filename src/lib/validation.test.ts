import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError } from "./errors";
import { isHttpUrl, isSafeHttpUrl, readInput, safeHttpUrl, safeHttpUrlOrEmpty } from "./validation";

describe("isSafeHttpUrl", () => {
  it("accepte http, https et mailto", () => {
    expect(isSafeHttpUrl("https://www.cabinet-dupont.fr/simulateur?x=1#haut")).toBe(true);
    expect(isSafeHttpUrl("http://localhost:3000/")).toBe(true);
    expect(isSafeHttpUrl("mailto:contact@cabinet-dupont.fr")).toBe(true);
  });
  it("refuse javascript:, data:, file:, une adresse relative ou vide, quelle que soit la casse", () => {
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("JavaScript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl(" javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeHttpUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeHttpUrl("vbscript:msgbox")).toBe(false);
    expect(isSafeHttpUrl("/simulateur")).toBe(false);
    expect(isSafeHttpUrl("//evil.example/x")).toBe(false);
    expect(isSafeHttpUrl("")).toBe(false);
    expect(isSafeHttpUrl("pas une adresse")).toBe(false);
  });
});

describe("isHttpUrl", () => {
  it("n'accepte que http et https — pas mailto, ni les schémas dangereux", () => {
    expect(isHttpUrl("https://www.insee.fr/fr/statistiques/1234")).toBe(true);
    expect(isHttpUrl("HTTP://exemple.fr")).toBe(true);
    expect(isHttpUrl("mailto:contact@cabinet-dupont.fr")).toBe(false);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("insee.fr")).toBe(false);
  });
});

describe("safeHttpUrl (zod)", () => {
  it("laisse passer un lien sûr et refuse un lien javascript:", () => {
    expect(safeHttpUrl.safeParse("https://exemple.fr").success).toBe(true);
    expect(safeHttpUrl.safeParse("javascript:alert(1)").success).toBe(false);
    expect(safeHttpUrl.safeParse("").success).toBe(false);
  });
  it("tolère la chaîne vide dans sa variante brouillon, sans rien relâcher d'autre", () => {
    expect(safeHttpUrlOrEmpty.safeParse("").success).toBe(true);
    expect(safeHttpUrlOrEmpty.safeParse("javascript:alert(1)").success).toBe(false);
  });
});

describe("readInput", () => {
  const schema = z.strictObject({ name: z.string().min(1), email: z.string().nullable().optional() });
  it("rend l'objet validé", () => {
    expect(readInput(schema, { name: "Marie", email: null })).toEqual({ name: "Marie", email: null });
  });
  it("refuse une clé inconnue (affectation de masse) par une AppError 400, pas une exception zod", () => {
    let caught: unknown;
    try {
      readInput(schema, { name: "Marie", organizationId: "11111111-1111-4111-8111-111111111111" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).status).toBe(400);
    expect((caught as AppError).key).toBe("les_donnees_envoyees_ne_sont_pas_valides");
  });
});
