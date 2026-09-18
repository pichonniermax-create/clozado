import { beforeAll, describe, expect, it } from "vitest";
import { consumeState, issueState, STATE_MAX_AGE_SECONDS, stateCookieName } from "./state";

beforeAll(() => { process.env.AUTH_SECRET = "s".repeat(32); });

const NOW = 1_700_000_000_000;
const base = { uid: "utilisateur", redirectUri: "http://localhost:3000/api/google/callback", verifier: "verificateur", now: NOW };

describe("le cookie d'état", () => {
  it("s'appelle __Host- seulement en HTTPS (sinon le navigateur le refuse en silence)", () => {
    expect(stateCookieName("https://app.clozado.fr")).toBe("__Host-google-oauth");
    expect(stateCookieName("http://localhost:3000")).toBe("google-oauth");
  });

  it("ne laisse fuir ni le vérifieur ni l'état en clair", () => {
    const issued = issueState(base);
    expect(issued.value).not.toContain(issued.state);
    expect(issued.value).not.toContain("verificateur");
  });

  it("revient intact quand tout concorde", () => {
    const issued = issueState(base);
    expect(consumeState(issued.value, { state: issued.state, uid: base.uid, redirectUri: base.redirectUri, now: NOW + 1000 })).toEqual({
      ok: true,
      verifier: "verificateur",
      redirectUri: base.redirectUri,
    });
  });

  it("refuse un état absent, illisible ou altéré", () => {
    const issued = issueState(base);
    expect(consumeState(undefined, { state: issued.state, uid: base.uid, redirectUri: base.redirectUri, now: NOW })).toEqual({ ok: false, reason: "absent" });
    expect(consumeState("v1:a:b:c", { state: issued.state, uid: base.uid, redirectUri: base.redirectUri, now: NOW })).toEqual({ ok: false, reason: "illisible" });
    const altere = issued.value.slice(0, -2) + (issued.value.endsWith("A") ? "B=" : "A=");
    expect(consumeState(altere, { state: issued.state, uid: base.uid, redirectUri: base.redirectUri, now: NOW }).ok).toBe(false);
  });

  it("refuse un état expiré", () => {
    const issued = issueState(base);
    const apres = NOW + STATE_MAX_AGE_SECONDS * 1000 + 1;
    expect(consumeState(issued.value, { state: issued.state, uid: base.uid, redirectUri: base.redirectUri, now: apres })).toEqual({ ok: false, reason: "expire" });
  });

  it("refuse un autre jeton, une autre personne, une autre adresse de retour", () => {
    const issued = issueState(base);
    expect(consumeState(issued.value, { state: "autre", uid: base.uid, redirectUri: base.redirectUri, now: NOW })).toEqual({ ok: false, reason: "etat" });
    expect(consumeState(issued.value, { state: null, uid: base.uid, redirectUri: base.redirectUri, now: NOW })).toEqual({ ok: false, reason: "etat" });
    expect(consumeState(issued.value, { state: issued.state, uid: "quelqu-un-d-autre", redirectUri: base.redirectUri, now: NOW })).toEqual({ ok: false, reason: "personne" });
    expect(consumeState(issued.value, { state: issued.state, uid: base.uid, redirectUri: "https://ailleurs.example/api/google/callback", now: NOW })).toEqual({ ok: false, reason: "redirection" });
  });

  it("devient illisible si AUTH_SECRET change", () => {
    const issued = issueState(base);
    process.env.AUTH_SECRET = "z".repeat(32);
    expect(consumeState(issued.value, { state: issued.state, uid: base.uid, redirectUri: base.redirectUri, now: NOW })).toEqual({ ok: false, reason: "illisible" });
    process.env.AUTH_SECRET = "s".repeat(32);
  });
});
