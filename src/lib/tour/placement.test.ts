import { describe, expect, it } from "vitest";
import { canAnchor, CARD_WIDTH, GAP, MARGIN, placeCard } from "./placement";

const VUE = { width: 1440, height: 900 };
const CARTE = 232;

describe("le halo", () => {
  it("déborde de l'élément de la même marge des quatre côtés", () => {
    const { halo } = placeCard({ top: 200, left: 300, width: 400, height: 120 }, VUE, CARTE);
    expect(halo).toEqual({ top: 200 - MARGIN, left: 300 - MARGIN, width: 400 + MARGIN * 2, height: 120 + MARGIN * 2 });
  });
});

describe("la place de la carte", () => {
  it("se pose dessous quand le bas de la fenêtre le permet", () => {
    const { card, side } = placeCard({ top: 100, left: 300, width: 400, height: 120 }, VUE, CARTE);
    expect(side).toBe("dessous");
    expect(card).toEqual({ top: 220 + GAP, left: 300 });
  });

  it("passe dessus quand le bas manque", () => {
    const { card, side } = placeCard({ top: 600, left: 300, width: 400, height: 120 }, VUE, CARTE);
    expect(side).toBe("dessus");
    expect(card).toEqual({ top: 600 - GAP - CARTE, left: 300 });
  });

  it("passe à côté quand l'élément occupe toute la hauteur", () => {
    const { card, side } = placeCard({ top: 20, left: 40, width: 300, height: 860 }, VUE, CARTE);
    expect(side).toBe("droite");
    expect(card).toEqual({ top: 20, left: 40 + 300 + GAP });
  });

  it("passe à gauche quand la droite est prise", () => {
    const { card, side } = placeCard({ top: 20, left: 700, width: 700, height: 860 }, VUE, CARTE);
    expect(side).toBe("gauche");
    expect(card).toEqual({ top: 20, left: 700 - GAP - CARD_WIDTH });
  });

  it("ne sort jamais par la droite : la carte se recale sur le bord", () => {
    const { card } = placeCard({ top: 100, left: 1300, width: 100, height: 40 }, VUE, CARTE);
    expect(card.left).toBe(VUE.width - CARD_WIDTH - MARGIN);
  });

  it("ne sort jamais par la gauche", () => {
    const { card } = placeCard({ top: 100, left: -60, width: 200, height: 40 }, VUE, CARTE);
    expect(card.left).toBe(MARGIN);
  });

  it("tient compte de la hauteur RÉELLE de la carte : un texte plus long la fait passer dessus", () => {
    const rect = { top: 420, left: 300, width: 400, height: 120 };
    expect(placeCard(rect, VUE, 300).side).toBe("dessous");
    expect(placeCard(rect, VUE, 360).side).toBe("dessus");
  });

  it("reste dans la fenêtre même quand plus rien ne tient", () => {
    const { card } = placeCard({ top: 0, left: 0, width: 1440, height: 900 }, VUE, 880);
    expect(card.top).toBe(MARGIN);
    expect(card.left).toBe(MARGIN);
  });
});

describe("l'ancrage", () => {
  it("n'existe pas sous 768 px de large", () => {
    expect(canAnchor({ width: 767, height: 900 })).toBe(false);
    expect(canAnchor({ width: 768, height: 900 })).toBe(true);
  });
});
