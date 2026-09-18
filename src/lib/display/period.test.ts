import { describe, expect, it, vi } from "vitest";

// La période est lue par des modules qui côtoient la couche base (les préréglages, les clés de préférences) : celle-ci
// refuse de se charger sans adresse. Le test la pose lui-même, comme le veut `vitest.config.ts` — aucune connexion
// n'est ouverte, seul l'import est satisfait.
vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});
import { DEFAULT_PERIOD, parseMetricFilters } from "@/lib/metrics/search-params";
import { PREF } from "@/db/queries/preferences";
import { parsePeriodChoice, periodFromPreferences, withRememberedPeriod } from "./period";

/**
 * LA PÉRIODE PARTAGÉE — le tableau de bord disait 90 jours, l'analytique
 * « depuis le début » : deux écrans côte à côte ne parlaient pas du même
 * temps. Ces contrôles tiennent l'ordre de priorité (adresse, mémoire,
 * défaut) et la borne du mois calendaire.
 */
const TZ = "Europe/Paris";
const prefs = (value: unknown) => new Map<string, unknown>(value === undefined ? [] : [[PREF.period, value]]);

describe("la période partagée", () => {
  it("a un seul défaut pour tout le produit", () => {
    expect(DEFAULT_PERIOD).toBe("90j");
    expect(parseMetricFilters({}, TZ).period).toBe("90j");
  });

  it("préfère l'adresse à la mémoire", () => {
    expect(periodFromPreferences({ periode: "30j" }, prefs({ periode: "tout" }))).toEqual({ periode: "30j", du: undefined, au: undefined });
  });

  it("applique la mémoire quand l'adresse se tait", () => {
    expect(periodFromPreferences({}, prefs({ periode: "tout" }))).toEqual({ periode: "tout" });
    expect(parseMetricFilters(withRememberedPeriod({}, prefs({ periode: "tout" })), TZ).period).toBe("tout");
  });

  it("n'accepte en mémoire qu'un préréglage connu ou des dates bien formées", () => {
    expect(parsePeriodChoice({ periode: "n-importe-quoi" })).toBeUndefined();
    expect(parsePeriodChoice({ periode: "12m" })).toEqual({ periode: "12m" });
    expect(parsePeriodChoice({ du: "2026-01-01", au: "2026-01-31" })).toEqual({ du: "2026-01-01", au: "2026-01-31" });
    expect(parsePeriodChoice({ du: "hier" })).toBeUndefined();
    expect(parsePeriodChoice("30j")).toBeUndefined();
  });

  it("des bornes dans l'adresse l'emportent sur une période mémorisée", () => {
    const parsed = parseMetricFilters(withRememberedPeriod({ du: "2026-03-01", au: "2026-03-31" }, prefs({ periode: "30j" })), TZ);
    expect(parsed.period).toBe("perso");
  });

  it("« ce mois-ci » part du premier jour du mois, dans le fuseau de l'organisation", () => {
    const now = new Date("2026-09-18T09:00:00Z");
    const parsed = parseMetricFilters({ periode: "mois" }, TZ, now);
    expect(parsed.period).toBe("mois");
    // Le 1er septembre à 00:00 à Paris (UTC+2 en septembre) = 31 août 22:00 UTC.
    expect(parsed.filters.from?.toISOString()).toBe("2026-08-31T22:00:00.000Z");
  });

  it("garde la période dans les liens dès qu'elle n'est pas le défaut", () => {
    expect(parseMetricFilters({ periode: "tout" }, TZ).params.periode).toBe("tout");
    expect(parseMetricFilters({ periode: "90j" }, TZ).params.periode).toBeUndefined();
  });
});
