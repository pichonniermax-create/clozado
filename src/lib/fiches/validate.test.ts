import { describe, expect, it } from "vitest";
import { checkAmount, checkDate, checkEmail, checkLength, checkPercent, checkPhone } from "./validate";

/**
 * Ce que le serveur accepte d'une saisie en place. Chaque refus porte la
 * clé de sa phrase ; une valeur vide passe partout (c'est l'obligatoire,
 * décidé ailleurs, qui refuse le vide).
 */
describe("la forme d'une valeur saisie", () => {
  it("laisse passer le vide : c'est l'obligatoire qui refuse, pas la forme", () => {
    for (const check of [checkEmail, checkPhone, checkAmount, checkPercent, checkDate]) expect(check(null)).toBeNull();
    for (const check of [checkEmail, checkPhone, checkAmount, checkPercent, checkDate]) expect(check("")).toBeNull();
  });

  it("accepte une adresse plausible et refuse ce qui n'en est pas une", () => {
    expect(checkEmail("elodie.durand@cabinet-vasseur.fr")).toBeNull();
    expect(checkEmail("pas-une-adresse")).toBe("cette_adresse_email_ne_semble_pas_valide");
    expect(checkEmail("deux@arobases@example.fr")).toBe("cette_adresse_email_ne_semble_pas_valide");
    expect(checkEmail("sans@point")).toBe("cette_adresse_email_ne_semble_pas_valide");
  });

  it("accepte un numéro écrit comme les gens l'écrivent", () => {
    for (const phone of ["06 12 34 56 78", "+33 6 12 34 56 78", "02.40.12.34.56", "(01) 23-45-67-89"]) {
      expect(checkPhone(phone)).toBeNull();
    }
    expect(checkPhone("06")).toBe("ce_numero_de_telephone_ne_semble_pas_valide");
    expect(checkPhone("appelez-moi")).toBe("ce_numero_de_telephone_ne_semble_pas_valide");
  });

  it("n'accepte qu'un montant positif, virgule comprise", () => {
    expect(checkAmount("300000")).toBeNull();
    expect(checkAmount("1 234,50")).toBeNull();
    expect(checkAmount("1234.5")).toBeNull();
    expect(checkAmount("-100")).toBe("le_montant_doit_etre_un_nombre_positif");
    expect(checkAmount("beaucoup")).toBe("le_montant_doit_etre_un_nombre_positif");
    expect(checkAmount("10,005")).toBe("le_montant_doit_etre_un_nombre_positif");
  });

  it("borne une probabilité entre 0 et 100", () => {
    expect(checkPercent("0")).toBeNull();
    expect(checkPercent("100")).toBeNull();
    expect(checkPercent("101")).toBe("la_probabilite_va_de_0_a_100");
    expect(checkPercent("-1")).toBe("la_probabilite_va_de_0_a_100");
  });

  it("n'accepte qu'une date qui existe", () => {
    expect(checkDate("2026-02-28")).toBeNull();
    expect(checkDate("2024-02-29")).toBeNull();
    expect(checkDate("2026-02-31")).toBe("la_date_est_illisible");
    expect(checkDate("2026-13-01")).toBe("la_date_est_illisible");
    expect(checkDate("28/02/2026")).toBe("la_date_est_illisible");
  });

  it("dit une longueur dépassée", () => {
    expect(checkLength("x".repeat(200), 200)).toBeNull();
    expect(checkLength("x".repeat(201), 200)).toBe("la_saisie_est_trop_longue_ou_invalide");
  });
});
