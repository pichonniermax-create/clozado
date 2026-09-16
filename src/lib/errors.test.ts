import { describe, expect, it } from "vitest";
import { AppError, nullIfNotFound } from "./errors";

describe("nullIfNotFound (E2)", () => {
  it("rend null pour une fiche introuvable ou d'un autre espace (404, 403)", async () => {
    await expect(nullIfNotFound(Promise.reject(new AppError("contact_introuvable", undefined, 404)))).resolves.toBeNull();
    await expect(nullIfNotFound(Promise.reject(new AppError("acces_refuse_cette_donnee_n_appartient_pas_044a", undefined, 403)))).resolves.toBeNull();
  });
  it("laisse remonter toute autre erreur — une base indisponible n'est pas « n'existe pas »", async () => {
    await expect(nullIfNotFound(Promise.reject(new Error("connect ECONNREFUSED")))).rejects.toThrow("ECONNREFUSED");
    await expect(nullIfNotFound(Promise.reject(new AppError("le_titre_est_obligatoire")))).rejects.toBeInstanceOf(AppError);
  });
  it("rend la valeur quand tout va bien", async () => {
    await expect(nullIfNotFound(Promise.resolve({ id: "x" }))).resolves.toEqual({ id: "x" });
  });
});
