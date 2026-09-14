import { describe, expect, it } from "vitest";
import { assertPublicTarget, WatchFetchError } from "./http";

/** La garde contre le SSRF avant chaque requête de la veille (audit, constat S6), avec une résolution DNS simulée. */
const resolving = (addresses: string[]) => (async () => addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }))) as never;

async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error instanceof WatchFetchError ? error.code : "autre";
  }
}

describe("assertPublicTarget", () => {
  it("laisse passer un site public en http(s) sur un port standard", async () => {
    expect(await codeOf(assertPublicTarget("https://www.lesechos.fr/feed", resolving(["91.198.174.192", "2a02:26f0::1"])))).toBeNull();
    expect(await codeOf(assertPublicTarget("http://exemple.fr:80/", resolving(["93.184.216.34"])))).toBeNull();
  });
  it("refuse une adresse résolue vers le réseau interne, la boucle locale ou les métadonnées d'instance", async () => {
    expect(await codeOf(assertPublicTarget("https://interne.example/", resolving(["10.0.0.5"])))).toBe("forbidden_address");
    expect(await codeOf(assertPublicTarget("http://localhost/", resolving(["127.0.0.1"])))).toBe("forbidden_address");
    expect(await codeOf(assertPublicTarget("http://169.254.169.254/latest/meta-data/", resolving(["169.254.169.254"])))).toBe("forbidden_address");
    expect(await codeOf(assertPublicTarget("http://[::1]/", resolving(["::1"])))).toBe("forbidden_address");
    expect(await codeOf(assertPublicTarget("http://mapped.example/", resolving(["::ffff:10.0.0.1"])))).toBe("forbidden_address");
  });
  it("refuse dès qu'UNE des adresses est privée (on ne sait pas laquelle fetch choisira)", async () => {
    expect(await codeOf(assertPublicTarget("https://mixte.example/", resolving(["93.184.216.34", "192.168.1.1"])))).toBe("forbidden_address");
  });
  it("refuse un port non standard et un schéma autre que http(s), sans même résoudre", async () => {
    const never = (async () => {
      throw new Error("ne doit pas résoudre");
    }) as never;
    expect(await codeOf(assertPublicTarget("http://10.0.0.5:8080/", never))).toBe("forbidden_address");
    expect(await codeOf(assertPublicTarget("https://exemple.fr:8443/", never))).toBe("forbidden_address");
    expect(await codeOf(assertPublicTarget("file:///etc/passwd", never))).toBe("forbidden_address");
    expect(await codeOf(assertPublicTarget("ftp://exemple.fr/", never))).toBe("forbidden_address");
    expect(await codeOf(assertPublicTarget("pas une adresse", never))).toBe("forbidden_address");
  });
  it("un hôte qui ne se résout pas est « injoignable »", async () => {
    const failing = (async () => {
      throw new Error("ENOTFOUND");
    }) as never;
    expect(await codeOf(assertPublicTarget("https://nexiste-pas.invalid/", failing))).toBe("unreachable");
    expect(await codeOf(assertPublicTarget("https://vide.example/", resolving([])))).toBe("unreachable");
  });
});
