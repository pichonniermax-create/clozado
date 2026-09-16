import { describe, expect, it } from "vitest";
import { findIngestToken } from "./address";

const DOMAIN = "in.clozado.fr";

describe("l'adresse d'ingestion dans les destinataires (P5)", () => {
  it("la trouve en destinataire, en copie cachée (received_for) et en copie visible", () => {
    expect(findIngestToken({ to: ["a7k2b9c4d1e6f3g8@in.clozado.fr"] }, DOMAIN)).toBe("a7k2b9c4d1e6f3g8");
    expect(findIngestToken({ to: ["client@example.org"], receivedFor: ["a7k2b9c4d1e6f3g8@in.clozado.fr"] }, DOMAIN)).toBe("a7k2b9c4d1e6f3g8");
    expect(findIngestToken({ to: ["client@example.org"], cc: ["Cabinet <A7K2B9C4D1E6F3G8@IN.CLOZADO.FR>".replace(/^.*<|>$/g, "")] }, DOMAIN)).toBe("a7k2b9c4d1e6f3g8");
    expect(findIngestToken({ bcc: ["a7k2b9c4d1e6f3g8+note@in.clozado.fr"] }, DOMAIN)).toBe("a7k2b9c4d1e6f3g8");
  });
  it("ne reconnaît rien hors du domaine d'ingestion", () => {
    expect(findIngestToken({ to: ["client@example.org"], cc: ["autre@example.org"] }, DOMAIN)).toBeNull();
    expect(findIngestToken({}, DOMAIN)).toBeNull();
    expect(findIngestToken({ to: ["@in.clozado.fr"] }, DOMAIN)).toBeNull();
  });
});
