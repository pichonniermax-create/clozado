import { describe, expect, it } from "vitest";
import { validateContactInput } from "./input";

const base = { kind: "person" as const, name: "Jean Dupont" };

describe("validateContactInput (E5)", () => {
  it("accepte une fiche minimale, et une fiche complète", () => {
    expect(validateContactInput(base)).toEqual({ ok: true });
    expect(validateContactInput({ ...base, email: "jean@exemple.fr", phone: "06 12 34 56 78", birthDate: "1980-05-17", ownerId: "11111111-1111-4111-8111-111111111111", notes: "ok" })).toEqual({ ok: true });
  });
  it("refuse une adresse email malformée avec sa phrase", () => {
    expect(validateContactInput({ ...base, email: "jean@" })).toEqual({ ok: false, key: "cette_adresse_email_ne_semble_pas_valide" });
  });
  it("refuse une date de naissance illisible avec sa phrase", () => {
    expect(validateContactInput({ ...base, birthDate: "17/05/1980" })).toEqual({ ok: false, key: "la_date_de_naissance_est_illisible" });
    expect(validateContactInput({ ...base, birthDate: "1980-13-45" })).toEqual({ ok: false, key: "la_date_de_naissance_est_illisible" });
  });
  it("refuse une saisie trop longue ou un responsable qui n'est pas un identifiant", () => {
    expect(validateContactInput({ ...base, name: "x".repeat(201) })).toEqual({ ok: false, key: "la_saisie_est_trop_longue_ou_invalide" });
    expect(validateContactInput({ ...base, ownerId: "moi" })).toEqual({ ok: false, key: "la_saisie_est_trop_longue_ou_invalide" });
  });
});
