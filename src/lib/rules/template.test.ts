import { describe, expect, it } from "vitest";
import { invalidTemplateTokens, renderRuleTemplate } from "./template";

describe("le gabarit d'une règle — le contrôle qui tourne aussi dans le formulaire (D2)", () => {
  it("accepte les variables permises et refuse les autres accolades", () => {
    expect(invalidTemplateTokens("Bonjour {prenom}, {expediteur} vous écrit.")).toEqual([]);
    expect(invalidTemplateTokens("Bonjour {prenom}, votre {age} ans {")).toEqual(["{age}", "{"]);
    expect(invalidTemplateTokens("}")).toEqual(["}"]);
  });
  it("rend les variables connues et laisse visible une accolade inconnue", () => {
    const values = { prenom: "Élodie", nom: "Durand", nom_complet: "Élodie Durand", societe: "S", organisation: "O", expediteur: "E", lien_rdv: "L" };
    expect(renderRuleTemplate("Bonjour {prenom} {inconnu}", values)).toBe("Bonjour Élodie {inconnu}");
  });
});
