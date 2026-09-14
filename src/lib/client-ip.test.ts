import { describe, expect, it } from "vitest";
import { clientIp } from "./client-ip";

const headersOf = (entries: Record<string, string>) => new Headers(entries);

describe("clientIp", () => {
  it("derrière Vercel, préfère x-real-ip, posé par la plateforme", () => {
    expect(clientIp(headersOf({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1, 203.0.113.7" }), true)).toBe("203.0.113.7");
    expect(clientIp(headersOf({ "x-forwarded-for": "198.51.100.1, 203.0.113.7" }), true)).toBe("203.0.113.7");
  });
  it("hors Vercel, ignore x-real-ip (le client peut l'écrire) : le dernier x-forwarded-for décide", () => {
    expect(clientIp(headersOf({ "x-real-ip": "1.2.3.4", "x-forwarded-for": "198.51.100.1, 203.0.113.7" }), false)).toBe("203.0.113.7");
    // Sans VERCEL dans l'environnement du test, c'est le comportement par défaut.
    expect(clientIp(headersOf({ "x-real-ip": "1.2.3.4" }))).toBe("unknown");
  });
  it("prend le DERNIER élément de x-forwarded-for, le seul écrit par notre mandataire", () => {
    expect(clientIp(headersOf({ "x-forwarded-for": "1.1.1.1, 198.51.100.1 , 203.0.113.7" }))).toBe("203.0.113.7");
    expect(clientIp(headersOf({ "x-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7");
  });
  it("ignore un x-forwarded-for vide et rend une valeur fixe sans en-tête", () => {
    expect(clientIp(headersOf({ "x-forwarded-for": " , " }))).toBe("unknown");
    expect(clientIp(headersOf({}))).toBe("unknown");
  });
});
