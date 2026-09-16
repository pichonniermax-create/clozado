import { describe, expect, it, vi } from "vitest";
import { magicLinkMayBeSentTo } from "./magic-link-guard";

// Le module importe la connexion (qui exige DATABASE_URL) ; ici seule la garde PURE est exercée.
vi.mock("@/db", () => ({ db: {} }));

describe("magicLinkMayBeSentTo", () => {
  it("refuse toute adresse réservée aux exemples — dont celles des personas de la démo", () => {
    for (const address of ["claire@vasseur-courtage.example", "thomas@vasseur-courtage.example", "x@example.com", "y@sub.example.org", "admin@_iso-a.invalid", "z@app.test", "w@app.localhost"]) {
      expect(magicLinkMayBeSentTo(address), address).toBe(false);
    }
  });
  it("laisse passer une adresse réelle", () => {
    expect(magicLinkMayBeSentTo("prenom+thomas@gmail.com")).toBe(true);
    expect(magicLinkMayBeSentTo("contact@cabinet-dupont.fr")).toBe(true);
  });
});
