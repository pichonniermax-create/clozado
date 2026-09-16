import { describe, expect, it, vi } from "vitest";
import { isAppError } from "@/lib/errors";
import { assertTargetForNewsletter, resolveSendToResume } from "./guards";

// `@/db/scope` importe la connexion (qui exige DATABASE_URL) ; ces gardes n'en ont pas besoin.
vi.mock("@/db", () => ({ db: {} }));

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const adminA = { role: "admin" as const, organizationId: ORG_A };
const superAdmin = { role: "super_admin" as const, organizationId: null };

function keyOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (isAppError(error)) return error.key;
    throw error;
  }
  return "(aucune erreur)";
}

async function keyOfAsync(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (error) {
    if (isAppError(error)) return error.key;
    throw error;
  }
  return "(aucune erreur)";
}

describe("assertTargetForNewsletter (S4)", () => {
  it("refuse une newsletter d'une autre organisation", () => {
    expect(keyOf(() => assertTargetForNewsletter(adminA, { organizationId: ORG_A }, { organizationId: ORG_B }))).toBe("acces_refuse_cette_donnee_n_appartient_pas_044a");
  });
  it("refuse une cible d'une autre organisation", () => {
    expect(keyOf(() => assertTargetForNewsletter(adminA, { organizationId: ORG_B }, { organizationId: ORG_A }))).toBe("acces_refuse_cette_donnee_n_appartient_pas_044a");
    expect(keyOf(() => assertTargetForNewsletter(adminA, { organizationId: ORG_B }, null))).toBe("acces_refuse_cette_donnee_n_appartient_pas_044a");
  });
  it("refuse, même à un super admin en vue globale, une cible qui n'est pas de l'organisation de la newsletter", () => {
    expect(keyOf(() => assertTargetForNewsletter(superAdmin, { organizationId: ORG_B }, { organizationId: ORG_A }))).toBe("la_cible_et_la_newsletter_n_appartiennent_3901");
  });
  it("accepte une newsletter et une cible de la même organisation, et une création avec sa seule cible", () => {
    expect(() => assertTargetForNewsletter(adminA, { organizationId: ORG_A }, { organizationId: ORG_A })).not.toThrow();
    expect(() => assertTargetForNewsletter(adminA, { organizationId: ORG_A }, null)).not.toThrow();
    expect(() => assertTargetForNewsletter(superAdmin, { organizationId: ORG_B }, { organizationId: ORG_B })).not.toThrow();
  });
});

describe("resolveSendToResume (S2)", () => {
  const openSend = { id: "send-1", finishedAt: null };
  const finishedSend = { id: "send-2", finishedAt: new Date("2026-09-01T10:00:00Z") };

  it("refuse une newsletter d'une autre organisation SANS jamais lire son envoi (pas d'oracle)", async () => {
    const findLatestSend = vi.fn(async () => openSend);
    const key = await keyOfAsync(() => resolveSendToResume(adminA, "n-b", { findNewsletter: async () => ({ organizationId: ORG_B }), findLatestSend }));
    expect(key).toBe("acces_refuse_cette_donnee_n_appartient_pas_044a");
    expect(findLatestSend).not.toHaveBeenCalled();
  });
  it("répond « introuvable » à un identifiant inconnu, sans lire d'envoi", async () => {
    const findLatestSend = vi.fn(async () => openSend);
    expect(await keyOfAsync(() => resolveSendToResume(adminA, "n-x", { findNewsletter: async () => null, findLatestSend }))).toBe("newsletter_introuvable");
    expect(findLatestSend).not.toHaveBeenCalled();
  });
  it("dit « terminé » quand l'envoi de SA newsletter est fini ou absent", async () => {
    expect(await keyOfAsync(() => resolveSendToResume(adminA, "n-a", { findNewsletter: async () => ({ organizationId: ORG_A }), findLatestSend: async () => finishedSend }))).toBe("cet_envoi_est_termine");
    expect(await keyOfAsync(() => resolveSendToResume(adminA, "n-a", { findNewsletter: async () => ({ organizationId: ORG_A }), findLatestSend: async () => null }))).toBe("cet_envoi_est_termine");
  });
  it("rend l'envoi ouvert de sa propre newsletter", async () => {
    const findLatestSend = vi.fn(async () => openSend);
    await expect(resolveSendToResume(adminA, "n-a", { findNewsletter: async () => ({ organizationId: ORG_A }), findLatestSend })).resolves.toBe(openSend);
    expect(findLatestSend).toHaveBeenCalledWith("n-a");
  });
});
