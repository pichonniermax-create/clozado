import { describe, expect, it } from "vitest";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { serializeError } from "./log";

describe("serializeError", () => {
  it("ne recopie jamais les paramètres d'une requête (données personnelles) dans le journal", () => {
    const error = new DrizzleQueryError("insert into contacts (name, email) values ($1, $2)", ["Jean Dupont", "jean@example.test"], new Error("boom"));
    const line = JSON.stringify(serializeError(error));
    expect(line).not.toContain("jean@example.test");
    expect(line).not.toContain("Jean Dupont");
    expect(line).toContain("drizzle_query_failed");
    expect(line).toContain("insert into contacts");
    expect(line).toContain("boom");
  });
  it("garde nom, message, code et cause d'une erreur ordinaire", () => {
    const cause = Object.assign(new Error("racine"), { code: "23503" });
    const out = serializeError(new Error("surface", { cause }));
    expect(out.message).toBe("surface");
    expect(out.cause?.code).toBe("23503");
  });
});
