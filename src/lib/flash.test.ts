import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFlash, signFlash } from "./flash";

const SECRET = "s".repeat(32);

describe("les messages éphémères signés (S5)", () => {
  const before = process.env.AUTH_SECRET;
  beforeEach(() => {
    process.env.AUTH_SECRET = SECRET;
  });
  afterEach(() => {
    process.env.AUTH_SECRET = before;
  });

  it("relit la phrase que le serveur a signée, accents et apostrophes compris", () => {
    const message = "L’étape « Signée » n’existe plus — réessaie.";
    expect(readFlash(signFlash(message))).toBe(message);
  });
  it("ignore une phrase posée telle quelle dans l'adresse (le cas de l'hameçonnage)", () => {
    expect(readFlash("Ton compte est suspendu, appelle le 01 23 45 67 89")).toBeUndefined();
    expect(readFlash(Buffer.from("Ton compte est suspendu", "utf8").toString("base64url"))).toBeUndefined();
  });
  it("ignore un jeton altéré ou signé avec un autre secret", () => {
    const token = signFlash("Fiche enregistrée.");
    const [payload, signature] = token.split(".");
    expect(readFlash(`${Buffer.from("Fiche supprimée.", "utf8").toString("base64url")}.${signature}`)).toBeUndefined();
    expect(readFlash(`${payload}.${signature.slice(0, -1)}x`)).toBeUndefined();
    process.env.AUTH_SECRET = "t".repeat(32);
    expect(readFlash(token)).toBeUndefined();
  });
  it("ignore ce qui n'est pas un jeton : vide, tableau, trop long, absent", () => {
    expect(readFlash(undefined)).toBeUndefined();
    expect(readFlash(null)).toBeUndefined();
    expect(readFlash("")).toBeUndefined();
    expect(readFlash(["a.b", "c.d"])).toBeUndefined();
    expect(readFlash(`${"a".repeat(5000)}.${"b".repeat(22)}`)).toBeUndefined();
  });
  it("sans secret, rien ne s'affiche jamais", () => {
    const token = signFlash("Enregistré.");
    delete process.env.AUTH_SECRET;
    expect(readFlash(token)).toBeUndefined();
    expect(readFlash(signFlash("Enregistré."))).toBeUndefined();
  });
});
