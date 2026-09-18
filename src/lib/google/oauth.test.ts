import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTH_URL, consentUrl, exchangeCode, googleCredentials, googleRedirectUri, pkce, SCOPES, scopesCover } from "./oauth";

const credentials = { clientId: "client", clientSecret: "secret" };

describe("l'URL de consentement", () => {
  const url = new URL(consentUrl({ credentials, redirectUri: "http://localhost:3000/api/google/callback", state: "etat", challenge: "defi" }));

  it("part chez Google", () => {
    expect(url.origin + url.pathname).toBe(AUTH_URL);
  });
  it("demande un accès HORS LIGNE et un consentement FORCÉ — sans eux, aucun jeton de rafraîchissement", () => {
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
  });
  it("ne demande que les deux portées du chantier", () => {
    expect(url.searchParams.get("scope")).toBe(SCOPES.join(" "));
  });
  it("porte l'état et l'empreinte PKCE, jamais le vérifieur", () => {
    expect(url.searchParams.get("state")).toBe("etat");
    expect(url.searchParams.get("code_challenge")).toBe("defi");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.toString()).not.toContain("code_verifier");
  });
});

describe("PKCE", () => {
  it("tire un couple différent à chaque fois", () => {
    const a = pkce();
    const b = pkce();
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.challenge).not.toBe(b.challenge);
  });
});

describe("les identifiants", () => {
  it("sont nuls tant que les deux ne sont pas là", () => {
    expect(googleCredentials({ GOOGLE_CLIENT_ID: "x" } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(googleCredentials({ GOOGLE_CLIENT_ID: "x", GOOGLE_CLIENT_SECRET: " " } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(googleCredentials({ GOOGLE_CLIENT_ID: "x", GOOGLE_CLIENT_SECRET: "y" } as unknown as NodeJS.ProcessEnv)).toEqual({ clientId: "x", clientSecret: "y" });
  });
});

describe("l'adresse de retour", () => {
  it("se déduit de l'origine, sans slash en double", () => {
    expect(googleRedirectUri("https://app.clozado.fr/")).toBe("https://app.clozado.fr/api/google/callback");
    expect(googleRedirectUri("http://localhost:3000")).toBe("http://localhost:3000/api/google/callback");
  });
});

describe("l'échange du code", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rend le jeton de rafraîchissement et les portées accordées", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      expect(String(init.body)).toContain("grant_type=authorization_code");
      expect(String(init.body)).toContain("code_verifier=verif");
      return { ok: true, status: 200, json: async () => ({ refresh_token: "1//JETON", scope: SCOPES.join(" ") }) };
    }));
    const result = await exchangeCode({ code: "c", verifier: "verif", redirectUri: "http://x/api/google/callback", credentials });
    expect(result).toEqual({ ok: true, refreshToken: "1//JETON", scope: SCOPES.join(" ") });
  });

  it("ne laisse RIEN sortir du corps d'erreur de Google — seulement le statut", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: "invalid_client", error_description: "Unauthorized", access_token: "ya29.SECRET" }),
    })));
    const result = await exchangeCode({ code: "c", verifier: "v", redirectUri: "http://x/api/google/callback", credentials });
    expect(result).toEqual({ ok: false, status: 401 });
    expect(JSON.stringify(result)).not.toContain("SECRET");
    expect(JSON.stringify(result)).not.toContain("invalid_client");
  });
});

describe("les portées accordées", () => {
  it("doivent couvrir les deux demandées", () => {
    expect(scopesCover(SCOPES.join(" "))).toBe(true);
    expect(scopesCover(`${SCOPES[0]} https://www.googleapis.com/auth/userinfo.email`)).toBe(false);
    expect(scopesCover("")).toBe(false);
  });
});
