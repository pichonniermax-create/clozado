import { describe, expect, it } from "vitest";
import { isStale, versionOf } from "./inline";

/**
 * La version d'une fiche est la seule protection contre l'écrasement
 * silencieux : elle se teste comme telle — à la milliseconde, et sans
 * jamais « deviner » quand elle est illisible.
 */
describe("la version d'une fiche", () => {
  const row = { updatedAt: new Date("2026-09-21T10:30:00.123Z") };

  it("est l'horodatage de sa dernière écriture, en ISO", () => {
    expect(versionOf(row)).toBe("2026-09-21T10:30:00.123Z");
  });

  it("reconnaît la version qu'elle a elle-même produite", () => {
    expect(isStale(row, versionOf(row))).toBe(false);
  });

  it("refuse une version antérieure : quelqu'un d'autre a écrit entre-temps", () => {
    expect(isStale(row, "2026-09-21T10:29:59.000Z")).toBe(true);
  });

  it("voit une différence d'une seule milliseconde", () => {
    expect(isStale(row, "2026-09-21T10:30:00.122Z")).toBe(true);
  });

  it("traite une version absente ou illisible comme périmée — on ne devine pas", () => {
    expect(isStale(row, "")).toBe(true);
    expect(isStale(row, "hier")).toBe(true);
    expect(isStale(row, "undefined")).toBe(true);
  });

  it("accepte la même instant écrit autrement (un fuseau, pas une autre version)", () => {
    expect(isStale(row, "2026-09-21T12:30:00.123+02:00")).toBe(false);
  });
});
