import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  callbackUrl,
  confirmationUrl,
  formatLoginCode,
  hashLoginCode,
  hashVerificationToken,
  isTokenShape,
  newLoginCode,
  newVerificationToken,
  normalizeLoginCode,
  parseCallbackUrl,
  safeCallbackPath,
  validityLabel,
} from "./magic-link";

const LINK = "https://clozado.vercel.app/api/auth/callback/resend?callbackUrl=%2Fdashboard&token=abc123&email=max%40cabinet.fr";

describe("le lien de connexion — la page de confirmation à la place du callback", () => {
  it("relit les trois paramètres du lien d'Auth.js", () => {
    expect(parseCallbackUrl(LINK)).toEqual({ origin: "https://clozado.vercel.app", token: "abc123", email: "max@cabinet.fr", callbackUrl: "/dashboard" });
  });
  it("refuse tout ce qui n'est pas le callback du fournisseur", () => {
    expect(parseCallbackUrl("https://clozado.vercel.app/login?token=x&email=y")).toBeNull();
    expect(parseCallbackUrl("https://clozado.vercel.app/api/auth/callback/resend?email=y")).toBeNull();
    expect(parseCallbackUrl("pas une adresse")).toBeNull();
  });
  it("l'email reçoit notre page de confirmation, et le geste explicite reconstruit le callback à l'identique", () => {
    const parts = parseCallbackUrl(LINK)!;
    expect(confirmationUrl(parts)).toBe("https://clozado.vercel.app/login/confirmer?token=abc123&email=max%40cabinet.fr&callbackUrl=%2Fdashboard");
    expect(callbackUrl(parts)).toBe(LINK);
  });
  it("le chemin de retour reste interne", () => {
    expect(safeCallbackPath("/contacts")).toBe("/contacts");
    expect(safeCallbackPath("https://evil.example/")).toBe("/dashboard");
    expect(safeCallbackPath("//evil.example")).toBe("/dashboard");
    expect(safeCallbackPath(null)).toBe("/dashboard");
  });
  it("hache le jeton exactement comme Auth.js (SHA-256 de jeton + secret, en hexadécimal)", () => {
    expect(hashVerificationToken("abc", "s3cret")).toBe(createHash("sha256").update("abcs3cret").digest("hex"));
  });
  it("un jeton neuf a la forme d'un jeton d'Auth.js", () => {
    const token = newVerificationToken();
    expect(isTokenShape(token)).toBe(true);
    expect(isTokenShape("../etc")).toBe(false);
    expect(isTokenShape("")).toBe(false);
  });
});

describe("le lien de connexion — le code à six chiffres", () => {
  it("tire six chiffres, zéros de tête compris", () => {
    for (let i = 0; i < 50; i++) expect(newLoginCode()).toMatch(/^\d{6}$/);
  });
  it("accepte ce qu'une personne tape (espaces, tirets), refuse le reste", () => {
    expect(normalizeLoginCode("123 456")).toBe("123456");
    expect(normalizeLoginCode("123-456")).toBe("123456");
    expect(normalizeLoginCode(" 000123 ")).toBe("000123");
    expect(normalizeLoginCode("12345")).toBeNull();
    expect(normalizeLoginCode("1234567")).toBeNull();
    expect(normalizeLoginCode("abcdef")).toBeNull();
    expect(normalizeLoginCode(null)).toBeNull();
  });
  it("s'affiche par groupes de trois, et se hache avec l'adresse", () => {
    expect(formatLoginCode("123456")).toBe("123 456");
    expect(hashLoginCode("Max@cabinet.fr", "123456", "s")).toBe(hashLoginCode("max@cabinet.fr", "123456", "s"));
    expect(hashLoginCode("a@x.fr", "123456", "s")).not.toBe(hashLoginCode("b@x.fr", "123456", "s"));
  });
  it("dit la durée du lien en clair", () => {
    expect(validityLabel(60, "fr")).toBe("1 heure");
    expect(validityLabel(120, "en")).toBe("2 hours");
    expect(validityLabel(15, "fr")).toBe("15 minutes");
    expect(validityLabel(90, "fr")).toBe("1 h 30");
  });
});
