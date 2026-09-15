import { describe, expect, it } from "vitest";
import { computeCommissionAmount, CREATE_SHARE_SCHEMA, type CreateShareInput } from "./input";

const DEAL = "11111111-1111-4111-8111-111111111111";
const PARTNER = "22222222-2222-4222-8222-222222222222";

/**
 * La forme EXACTE que le composeur envoie (`send()` dans
 * src/components/deal-shares/share-composer.tsx) : le schéma strict doit
 * la laisser passer, avec et sans commission — c'est le chemin nominal du
 * produit, pas seulement les refus, qui prouve le contrat.
 */
function composerPayload(commission: CreateShareInput["commission"]): CreateShareInput {
  return {
    dealId: DEAL,
    partnerId: PARTNER,
    proposedTerms: null,
    message: "Bonjour",
    expiresAt: new Date("2026-12-31T00:00:00Z"),
    commission,
  };
}

describe("CREATE_SHARE_SCHEMA", () => {
  it("laisse passer le partage du composeur AVEC commission (pourcentage et forfait) et SANS", () => {
    expect(
      CREATE_SHARE_SCHEMA.safeParse(composerPayload({ basis: "percentage", rate: "10", fixedAmount: null, baseAmount: "1000" })).success
    ).toBe(true);
    expect(CREATE_SHARE_SCHEMA.safeParse(composerPayload({ basis: "fixed", rate: null, fixedAmount: "500", baseAmount: null })).success).toBe(true);
    expect(CREATE_SHARE_SCHEMA.safeParse(composerPayload(null)).success).toBe(true);
    expect(CREATE_SHARE_SCHEMA.safeParse({ dealId: DEAL, partnerId: PARTNER }).success).toBe(true);
  });
  it("refuse une clé que seul le serveur décide : organizationId sur le partage, state dans la commission", () => {
    expect(CREATE_SHARE_SCHEMA.safeParse({ ...composerPayload(null), organizationId: DEAL }).success).toBe(false);
    expect(
      CREATE_SHARE_SCHEMA.safeParse(
        composerPayload({ basis: "percentage", rate: "10", fixedAmount: null, baseAmount: "1000", state: "prevue" } as never)
      ).success
    ).toBe(false);
  });
  it("attend un Date pour l'échéance (ce que le client envoie), pas une chaîne ISO", () => {
    expect(CREATE_SHARE_SCHEMA.safeParse({ ...composerPayload(null), expiresAt: "2026-12-31T00:00:00Z" }).success).toBe(false);
  });
});

describe("les montants d'une commission (chasse aux failles du 2026-09-14)", () => {
  it("refuse un taux hors (0, 100], un montant non numérique et un montant calculé venu du client", () => {
    for (const bad of [{ rate: "150" }, { rate: "-10" }, { rate: "NaN" }, { rate: "0" }, { rate: "10.555" }, { baseAmount: "1e9" }, { baseAmount: "abc" }, { computedAmount: "1" }]) {
      const commission = { basis: "percentage" as const, rate: "10", fixedAmount: null, baseAmount: "1000", ...bad };
      expect(CREATE_SHARE_SCHEMA.safeParse(composerPayload(commission as never)).success, JSON.stringify(bad)).toBe(false);
    }
    expect(CREATE_SHARE_SCHEMA.safeParse(composerPayload({ basis: "percentage", rate: "10", fixedAmount: null, baseAmount: "100000" })).success).toBe(true);
    expect(CREATE_SHARE_SCHEMA.safeParse(composerPayload({ basis: "percentage", rate: "2.5", fixedAmount: null, baseAmount: "1000.50" })).success).toBe(true);
  });
  it("calcule le montant côté serveur, arrondi au centime", () => {
    expect(computeCommissionAmount({ basis: "percentage", rate: "10", baseAmount: "100000" })).toBe("10000.00");
    expect(computeCommissionAmount({ basis: "percentage", rate: "2.5", baseAmount: "1000.50" })).toBe("25.01");
    expect(computeCommissionAmount({ basis: "percentage", rate: "10", baseAmount: null })).toBeNull();
    expect(computeCommissionAmount({ basis: "fixed", fixedAmount: "500" })).toBe("500");
  });
});

