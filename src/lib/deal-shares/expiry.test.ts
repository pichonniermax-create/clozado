import { describe, expect, it } from "vitest";
import { DEFAULT_SHARE_VALIDITY_MS, endOfDayFromDateInput, isExpiryInPast, reissuedExpiry } from "./expiry";

const day = 86_400_000;
const now = new Date("2026-09-14T15:00:00Z");

describe("reissuedExpiry — un lien renvoyé naît avec une fenêtre neuve", () => {
  it("garde la durée d'origine, comptée d'aujourd'hui — même si l'ancienne date est passée", () => {
    const expired = { createdAt: new Date("2026-08-30T11:00:00Z"), expiresAt: new Date("2026-09-13T11:00:00Z") }; // 14 jours, expiré hier
    expect(reissuedExpiry(expired, now)?.getTime()).toBe(now.getTime() + 14 * day);
    const alive = { createdAt: new Date("2026-09-06T11:00:00Z"), expiresAt: new Date("2026-09-20T11:00:00Z") };
    expect(reissuedExpiry(alive, now)?.getTime()).toBe(now.getTime() + 14 * day);
  });
  it("sans expiration à l'origine : toujours sans expiration", () => {
    expect(reissuedExpiry({ createdAt: now, expiresAt: null }, now)).toBeNull();
  });
  it("une durée incohérente vaut la durée par défaut", () => {
    expect(reissuedExpiry({ createdAt: new Date("2026-09-10T00:00:00Z"), expiresAt: new Date("2026-09-09T00:00:00Z") }, now)?.getTime()).toBe(now.getTime() + DEFAULT_SHARE_VALIDITY_MS);
  });
});

describe("endOfDayFromDateInput", () => {
  it("un jour saisi vaut la fin de ce jour, heure locale", () => {
    const d = endOfDayFromDateInput("2026-09-21")!;
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 8, 21, 23, 59]);
  });
  it("refuse une saisie qui n'est pas une date", () => {
    for (const bad of ["", "21/09/2026", "2026-9-21", "demain"]) expect(endOfDayFromDateInput(bad), bad).toBeNull();
  });
});

describe("isExpiryInPast", () => {
  it("refuse une expiration passée ou immédiate, accepte l'avenir et l'absence", () => {
    expect(isExpiryInPast(new Date(now.getTime() - 1), now)).toBe(true);
    expect(isExpiryInPast(now, now)).toBe(true);
    expect(isExpiryInPast(new Date(now.getTime() + 1000), now)).toBe(false);
    expect(isExpiryInPast(null, now)).toBe(false);
  });
});
