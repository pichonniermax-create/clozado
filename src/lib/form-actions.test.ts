import { describe, expect, it, vi } from "vitest";
import { actionResult, withError } from "./form-actions";
import { AppError } from "./errors";
import { readFlash } from "./flash";

// Les phrases viennent des messages via next-intl : ici, un traducteur factice qui rend la clé reçue.
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => `phrase:${key}` }));

describe("actionResult (E3)", () => {
  it("rend la valeur quand l'action réussit", async () => {
    await expect(actionResult(async () => ({ token: "t" }))).resolves.toEqual({ ok: true, value: { token: "t" } });
  });
  it("rend la PHRASE d'une AppError, jamais sa clé brute", async () => {
    const result = await actionResult(async () => {
      throw new AppError("cette_etape_appartient_a_un_autre_pipeline_9d7d");
    });
    expect(result).toEqual({ ok: false, error: "phrase:cette_etape_appartient_a_un_autre_pipeline_9d7d" });
  });
  it("rend la phrase générique pour un accident technique", async () => {
    const result = await actionResult(async () => {
      throw new Error("connect ECONNREFUSED");
    });
    expect(result).toEqual({ ok: false, error: "phrase:common.generic" });
  });
});

describe("withError (S5)", () => {
  it("pose un jeton signé, jamais la phrase en clair, avant l'ancre", () => {
    process.env.AUTH_SECRET = "s".repeat(32);
    const url = withError("/veille?onglet=sources#sources", "Source ajoutée.", "info");
    const [path, query] = url.split("#")[0].split("?");
    expect(path).toBe("/veille");
    expect(url.endsWith("#sources")).toBe(true);
    const token = new URLSearchParams(query).get("info");
    expect(token).not.toBeNull();
    expect(token).not.toContain("Source");
    expect(readFlash(token)).toBe("Source ajoutée.");
  });
});
