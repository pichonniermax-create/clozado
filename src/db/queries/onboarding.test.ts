import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { QueryBuilder } from "drizzle-orm/pg-core";
import { organizations } from "@/db/schema";
import { onboardingFactsFields } from "./onboarding";

// Le module importe la connexion (qui exige DATABASE_URL) ; ici on ne teste que le SQL généré, sans base.
vi.mock("@/db", () => ({ db: {} }));

const ORG = "11111111-1111-4111-8111-111111111111";

describe("onboardingFactsFields", () => {
  it("compare chaque sous-requête au paramètre lié, jamais à la colonne nue « id » (la carte disait 1 sur 8 à un cabinet de 44 contacts)", () => {
    const { sql, params } = new QueryBuilder().select(onboardingFactsFields(ORG)).from(organizations).where(eq(organizations.id, ORG)).toSQL();
    expect(sql).not.toMatch(/organization_id = "id"/);
    // Sept sous-requêtes (la marque, puis six existences) + le WHERE : huit occurrences du même paramètre.
    expect(params.filter((p) => p === ORG)).toHaveLength(8);
    expect(sql).toMatch(/c\.organization_id = \$\d+/);
    expect(sql).toMatch(/a\.organization_id = \$\d+/);
    expect(sql).toMatch(/r\.organization_id = \$\d+/);
  });
});
