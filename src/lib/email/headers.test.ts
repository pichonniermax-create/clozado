import { describe, expect, it } from "vitest";
import { feedbackId, unsubscribeUrls } from "./headers";

const message = { kind: "newsletter", organizationId: "3f1c2b6e-1d5a-4f2b-9c8d-77e3a1b2c4d5", sendId: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d" };

describe("l'en-tête Feedback-ID", () => {
  it("porte la nature, l'organisation, la vague, puis nous — quatre champs, dans cet ordre", () => {
    expect(feedbackId(message)).toBe("newsletter:3f1c2b6e-1d5a-4f2b-9c8d-77e3a1b2c4d5:9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d:clozado");
  });

  it("dit « seul » plutôt que rien quand le message ne fait pas partie d'une vague", () => {
    expect(feedbackId({ ...message, sendId: null })).toBe("newsletter:3f1c2b6e-1d5a-4f2b-9c8d-77e3a1b2c4d5:seul:clozado");
  });

  it("respecte la forme imposée par Google : quatre champs, 127 caractères au plus", () => {
    const value = feedbackId(message);
    expect(value.split(":")).toHaveLength(4);
    expect(value.length).toBeLessThanOrEqual(127);
    expect(value.split(":").at(-1)).toBe("clozado");
  });
});

describe("les adresses de désinscription", () => {
  it("séparent la page (dans le pied de page) de la route en un clic (dans l'en-tête)", () => {
    expect(unsubscribeUrls("https://app.clozado.fr", "abc")).toEqual({
      page: "https://app.clozado.fr/desinscription/abc",
      oneClick: "https://app.clozado.fr/api/unsubscribe/abc",
    });
  });
});
