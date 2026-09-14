import { describe, expect, it } from "vitest";
import { invitationStatus } from "./status";
import { generateInvitationToken, hashInvitationToken, invitationUrl, isInvitationTokenShape } from "./token";

describe("le jeton d'invitation", () => {
  it("a 256 bits d'aléa en base64url, une empreinte SHA-256 hexadécimale, et deux jetons ne se ressemblent pas", () => {
    const a = generateInvitationToken();
    const b = generateInvitationToken();
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.tokenHash).toBe(hashInvitationToken(a.token));
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).not.toBe(b.tokenHash);
  });

  it("refuse toute forme qui n'est pas un jeton avant la moindre requête", () => {
    expect(isInvitationTokenShape(generateInvitationToken().token)).toBe(true);
    for (const bad of ["", "abc", "x".repeat(42), "x".repeat(44), "a".repeat(42) + "=", "a".repeat(42) + "/", 42, null, undefined, {}]) {
      expect(isInvitationTokenShape(bad), String(bad)).toBe(false);
    }
  });

  it("compose l'adresse d'inscription sur l'origine donnée", () => {
    expect(invitationUrl("https://app.clozado.fr", "abc")).toBe("https://app.clozado.fr/inscription?invitation=abc");
  });
});

describe("l'état d'une invitation", () => {
  const now = new Date("2026-09-14T12:00:00Z");
  const future = new Date("2026-09-28T12:00:00Z");
  const past = new Date("2026-09-01T12:00:00Z");

  it("est « en attente » tant qu'elle n'a ni servi, ni été révoquée, ni expiré", () => {
    expect(invitationStatus({ usedAt: null, revokedAt: null, expiresAt: future }, now)).toBe("en_attente");
  });
  it("devient « expirée » à l'instant exact de l'expiration", () => {
    expect(invitationStatus({ usedAt: null, revokedAt: null, expiresAt: now }, now)).toBe("expiree");
    expect(invitationStatus({ usedAt: null, revokedAt: null, expiresAt: past }, now)).toBe("expiree");
  });
  it("« utilisée » l'emporte sur tout, puis « révoquée » sur « expirée »", () => {
    expect(invitationStatus({ usedAt: past, revokedAt: past, expiresAt: past }, now)).toBe("utilisee");
    expect(invitationStatus({ usedAt: null, revokedAt: past, expiresAt: past }, now)).toBe("revoquee");
    expect(invitationStatus({ usedAt: null, revokedAt: past, expiresAt: future }, now)).toBe("revoquee");
  });
});
