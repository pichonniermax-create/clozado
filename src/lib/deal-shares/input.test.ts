import { describe, expect, it } from "vitest";
import { CREATE_SHARE_SCHEMA, type CreateShareInput } from "./input";

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
      CREATE_SHARE_SCHEMA.safeParse(composerPayload({ basis: "percentage", rate: "10", fixedAmount: null, baseAmount: "1000", computedAmount: "100" })).success
    ).toBe(true);
    expect(CREATE_SHARE_SCHEMA.safeParse(composerPayload({ basis: "fixed", rate: null, fixedAmount: "500", baseAmount: null, computedAmount: "500" })).success).toBe(true);
    expect(CREATE_SHARE_SCHEMA.safeParse(composerPayload(null)).success).toBe(true);
    expect(CREATE_SHARE_SCHEMA.safeParse({ dealId: DEAL, partnerId: PARTNER }).success).toBe(true);
  });
  it("refuse une clé que seul le serveur décide : organizationId sur le partage, state dans la commission", () => {
    expect(CREATE_SHARE_SCHEMA.safeParse({ ...composerPayload(null), organizationId: DEAL }).success).toBe(false);
    expect(
      CREATE_SHARE_SCHEMA.safeParse(
        composerPayload({ basis: "percentage", rate: "10", fixedAmount: null, baseAmount: "1000", computedAmount: "100", state: "prevue" } as never)
      ).success
    ).toBe(false);
  });
  it("attend un Date pour l'échéance (ce que le client envoie), pas une chaîne ISO", () => {
    expect(CREATE_SHARE_SCHEMA.safeParse({ ...composerPayload(null), expiresAt: "2026-12-31T00:00:00Z" }).success).toBe(false);
  });
});
