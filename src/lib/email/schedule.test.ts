import { describe, expect, it } from "vitest";
import { departureAt, departuresByTimeZone, localDateIn, localDeparture, resolveContactTimeZone, toScheduleMode, zonedTimeToUtc } from "./schedule";

/**
 * L'horaire selon le destinataire (chantier envoi, partie 4). Ce qui est
 * éprouvé ici décide d'une heure de départ réelle : l'échelle du fuseau et
 * sa provenance, le changement d'heure, et la règle « c'est déjà passé chez
 * lui, donc demain ».
 */

const PARIS = "Europe/Paris";

/** Une heure lue dans un fuseau — pour dire ce qu'un instant vaut là-bas. */
function readIn(timeZone: string, at: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hourCycle: "h23", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(at);
}

describe("le fuseau d'un contact", () => {
  it("descend l'échelle du plus précis au plus général, et dit d'où vient sa réponse", () => {
    const facts = { contactTimeZone: "America/New_York", cityTimeZone: "America/Chicago", countryTimeZone: "America/Denver", organizationTimeZone: PARIS };
    expect(resolveContactTimeZone(facts)).toEqual({ timeZone: "America/New_York", source: "contact" });
    expect(resolveContactTimeZone({ ...facts, contactTimeZone: null })).toEqual({ timeZone: "America/Chicago", source: "ville" });
    expect(resolveContactTimeZone({ ...facts, contactTimeZone: null, cityTimeZone: null })).toEqual({ timeZone: "America/Denver", source: "pays" });
    expect(resolveContactTimeZone({ contactTimeZone: null, cityTimeZone: null, countryTimeZone: null, organizationTimeZone: PARIS })).toEqual({ timeZone: PARIS, source: "organisation" });
  });

  it("ignore un barreau dont la valeur n'est pas un fuseau connu, au lieu de le croire", () => {
    expect(resolveContactTimeZone({ contactTimeZone: "Paris", cityTimeZone: null, countryTimeZone: "Europe/Brussels", organizationTimeZone: PARIS })).toEqual({
      timeZone: "Europe/Brussels",
      source: "pays",
    });
    expect(resolveContactTimeZone({ contactTimeZone: "", cityTimeZone: "  ", countryTimeZone: "n'importe quoi", organizationTimeZone: PARIS })).toEqual({ timeZone: PARIS, source: "organisation" });
  });

  it("retombe sur le fuseau du produit si même l'organisation en a un illisible", () => {
    expect(resolveContactTimeZone({ contactTimeZone: null, cityTimeZone: null, countryTimeZone: null, organizationTimeZone: "UTC+1" })).toEqual({ timeZone: PARIS, source: "organisation" });
  });
});

describe("une heure locale → un instant", () => {
  it("rend l'instant qui se lit à cette heure-là dans ce fuseau", () => {
    const at = zonedTimeToUtc({ year: 2026, month: 1, day: 15, hour: 9, minute: 0 }, PARIS);
    expect(at.toISOString()).toBe("2026-01-15T08:00:00.000Z");
    expect(readIn(PARIS, at)).toBe("15/01, 09:00");
  });

  it("donne des instants différents selon le fuseau, pour la même heure locale", () => {
    const tokyo = zonedTimeToUtc({ year: 2026, month: 1, day: 15, hour: 9, minute: 0 }, "Asia/Tokyo");
    const losAngeles = zonedTimeToUtc({ year: 2026, month: 1, day: 15, hour: 9, minute: 0 }, "America/Los_Angeles");
    expect(tokyo.toISOString()).toBe("2026-01-15T00:00:00.000Z");
    expect(losAngeles.toISOString()).toBe("2026-01-15T17:00:00.000Z");
  });

  it("traverse le passage à l'heure d'été sans se décaler d'une heure", () => {
    // Le 29 mars 2026 à Paris, 2 h devient 3 h : 2 h 30 n'existe pas, et tombe juste après le saut.
    const inexistante = zonedTimeToUtc({ year: 2026, month: 3, day: 29, hour: 2, minute: 30 }, PARIS);
    expect(inexistante.toISOString()).toBe("2026-03-29T01:30:00.000Z");
    expect(readIn(PARIS, inexistante)).toBe("29/03, 03:30");
    // Et une heure ordinaire du même jour, après le saut, se lit bien telle quelle.
    const apres = zonedTimeToUtc({ year: 2026, month: 3, day: 29, hour: 9, minute: 0 }, PARIS);
    expect(readIn(PARIS, apres)).toBe("29/03, 09:00");
  });

  it("et le passage à l'heure d'hiver rend un instant qui se lit bien à l'heure demandée", () => {
    const at = zonedTimeToUtc({ year: 2026, month: 10, day: 25, hour: 9, minute: 0 }, PARIS);
    expect(readIn(PARIS, at)).toBe("25/10, 09:00");
  });

  it("lit la date du jour dans le fuseau, pas celui du serveur", () => {
    // 23 h 30 UTC : on est déjà demain à Tokyo, encore hier soir à Los Angeles.
    const at = new Date("2026-01-15T23:30:00Z");
    expect(localDateIn("Asia/Tokyo", at)).toEqual({ year: 2026, month: 1, day: 16 });
    expect(localDateIn("America/Los_Angeles", at)).toEqual({ year: 2026, month: 1, day: 15 });
  });
});

describe("le départ d'un message", () => {
  const now = new Date("2026-01-15T08:00:00Z"); // 9 h à Paris, 17 h à Tokyo, minuit à Los Angeles

  it("part tout de suite en mode immédiat", () => {
    expect(departureAt({ mode: "immediat", now, timeZone: "Asia/Tokyo" }).at).toEqual(now);
  });

  it("part à l'instant choisi en mode date fixe — le même pour tout le monde", () => {
    const fixedAt = new Date("2026-01-16T08:00:00Z");
    expect(departureAt({ mode: "date_fixe", now, fixedAt, timeZone: "Asia/Tokyo" }).at).toEqual(fixedAt);
    expect(departureAt({ mode: "date_fixe", now, fixedAt, timeZone: "America/Los_Angeles" }).at).toEqual(fixedAt);
  });

  it("attend l'heure locale quand elle est encore à venir chez le destinataire", () => {
    // Minuit à Los Angeles : 9 h y arrivent dans neuf heures.
    const depart = localDeparture(now, 9 * 60, "America/Los_Angeles");
    expect(depart.nextDay).toBe(false);
    expect(depart.at.toISOString()).toBe("2026-01-15T17:00:00.000Z");
    expect(readIn("America/Los_Angeles", depart.at)).toBe("15/01, 09:00");
  });

  it("passe au lendemain quand l'heure est déjà passée chez lui — et le dit", () => {
    // 17 h à Tokyo : 9 h sont passées depuis longtemps.
    const depart = localDeparture(now, 9 * 60, "Asia/Tokyo");
    expect(depart.nextDay).toBe(true);
    expect(readIn("Asia/Tokyo", depart.at)).toBe("16/01, 09:00");
  });

  it("traite l'heure pile comme passée : on n'envoie pas « maintenant » en croyant programmer", () => {
    const aNeufHeuresPile = new Date("2026-01-15T08:00:00Z"); // exactement 9 h à Paris
    expect(localDeparture(aNeufHeuresPile, 9 * 60, PARIS).nextDay).toBe(true);
  });

  it("borne l'heure demandée dans la journée", () => {
    expect(readIn(PARIS, localDeparture(now, -30, PARIS).at)).toBe("16/01, 00:00");
    expect(readIn(PARIS, localDeparture(now, 5000, PARIS).at)).toBe("15/01, 23:59");
  });

  it("part tout de suite plutôt que jamais si la programmation est incomplète", () => {
    expect(departureAt({ mode: "date_fixe", now, fixedAt: null, timeZone: PARIS }).at).toEqual(now);
    expect(departureAt({ mode: "heure_locale", now, localMinutes: null, timeZone: PARIS }).at).toEqual(now);
  });

  it("ne retient que les trois modes connus", () => {
    expect(toScheduleMode("heure_locale")).toBe("heure_locale");
    expect(toScheduleMode("n'importe quoi")).toBe("immediat");
    expect(toScheduleMode(undefined)).toBe("immediat");
  });
});

describe("le tableau des départs par fuseau", () => {
  const now = new Date("2026-01-15T08:00:00Z");

  it("compte les destinataires par fuseau et range les départs dans l'ordre", () => {
    const recipients = [
      { timeZone: "Asia/Tokyo" },
      { timeZone: PARIS },
      { timeZone: "America/Los_Angeles" },
      { timeZone: PARIS },
      { timeZone: PARIS },
    ];
    const departs = departuresByTimeZone(recipients, { mode: "heure_locale", now, localMinutes: 9 * 60 });
    // Los Angeles part aujourd'hui ; Tokyo, demain matin là-bas, part AVANT Paris — c'est tout l'intérêt du tableau.
    expect(departs.map((d) => [d.timeZone, d.count, d.nextDay])).toEqual([
      ["America/Los_Angeles", 1, false],
      ["Asia/Tokyo", 1, true],
      ["Europe/Paris", 3, true],
    ]);
    expect(departs.map((d) => d.at.getTime())).toEqual([...departs.map((d) => d.at.getTime())].sort((a, b) => a - b));
  });

  it("en mode immédiat, tout le monde part au même instant", () => {
    const departs = departuresByTimeZone([{ timeZone: "Asia/Tokyo" }, { timeZone: PARIS }], { mode: "immediat", now });
    expect(new Set(departs.map((d) => d.at.getTime())).size).toBe(1);
  });
});
