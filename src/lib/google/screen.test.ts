import { describe, expect, it } from "vitest";
import { escapeHtml, failureScreen, SCREEN_HEADERS, tokenScreen } from "./screen";

const ecran = tokenScreen({
  title: "Titre",
  warning: "Une seule fois",
  variableIntro: "À coller dans",
  variableName: "GOOGLE_REFRESH_TOKEN",
  scopesLabel: "Autorisations :",
  scopes: "portee.a portee.b",
  refreshToken: "1//JETON-SECRET",
});

describe("l'écran qui porte le jeton", () => {
  it("l'affiche une seule fois, dans un champ en lecture seule", () => {
    expect(ecran.split("1//JETON-SECRET").length - 1).toBe(1);
    expect(ecran).toContain('<textarea readonly');
  });
  it("ne met le jeton dans aucun formulaire — rien ne peut le soumettre ailleurs", () => {
    expect(ecran).not.toContain("<form");
  });
  it("n'embarque ni script ni ressource externe", () => {
    expect(ecran).not.toContain("<script");
    expect(ecran).not.toContain("http://");
    expect(ecran).not.toContain("https://");
  });
  it("nomme la variable à créer", () => {
    expect(ecran).toContain("GOOGLE_REFRESH_TOKEN");
  });
  it("échappe ce qui viendrait du dehors", () => {
    expect(escapeHtml(`<img src=x onerror="alert('x')">`)).toBe("&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;");
  });
});

describe("l'écran de refus", () => {
  it("ne porte jamais de valeur secrète", () => {
    const refus = failureScreen({ title: "Refus", message: "Recommencez", detail: "401" });
    expect(refus).not.toContain("1//");
    expect(refus).toContain("401");
  });
});

describe("les en-têtes", () => {
  it("interdisent le cache, l'indexation, le référent, l'encadrement et tout script", () => {
    expect(SCREEN_HEADERS["cache-control"]).toContain("no-store");
    expect(SCREEN_HEADERS["x-robots-tag"]).toContain("noindex");
    expect(SCREEN_HEADERS["referrer-policy"]).toBe("no-referrer");
    expect(SCREEN_HEADERS["x-frame-options"]).toBe("DENY");
    expect(SCREEN_HEADERS["content-security-policy"]).toContain("default-src 'none'");
  });
});
