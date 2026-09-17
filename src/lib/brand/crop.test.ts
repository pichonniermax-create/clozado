import { describe, expect, it } from "vitest";
import { clampRect, containRect, drawPlacement, opaqueBounds, outputSize, pan, parseCropRect, squareInside, withZoom, zoomOf } from "./crop";

describe("le cadrage du logo — le cadre « tout contenu »", () => {
  it("un logo très large dans un cadre 3:1 : le cadre prend la largeur, des marges en haut et en bas", () => {
    expect(containRect({ width: 2400, height: 300 }, 3)).toEqual({ x: 0, y: -250, w: 2400, h: 800 });
  });
  it("un logo carré dans un cadre 3:1 : le cadre prend la hauteur, des marges à gauche et à droite", () => {
    expect(containRect({ width: 600, height: 600 }, 3)).toEqual({ x: -600, y: 0, w: 1800, h: 600 });
  });
  it("un logo carré dans le cadre carré de l'icône : exactement l'image", () => {
    expect(containRect({ width: 600, height: 600 }, 1)).toEqual({ x: 0, y: 0, w: 600, h: 600 });
  });
});

describe("le cadrage du logo — zoom et déplacement", () => {
  const source = { width: 2400, height: 300 };
  it("le zoom 1 est le cadre « tout contenu », le zoom 2 un cadre deux fois plus petit autour du même centre", () => {
    const base = containRect(source, 3);
    expect(zoomOf(base, source, 3)).toBe(1);
    const z2 = withZoom(base, 2, source, 3);
    expect(z2.w).toBe(1200);
    expect(z2.h).toBe(400);
    expect(z2.x + z2.w / 2).toBe(1200);
    expect(zoomOf(z2, source, 3)).toBe(2);
  });
  it("le zoom est borné : jamais sous 1, jamais au-delà de 6", () => {
    const base = containRect(source, 3);
    expect(withZoom(base, 0.2, source, 3)).toEqual(base);
    expect(withZoom(base, 40, source, 3).w).toBe(400);
  });
  it("un déplacement ne sort jamais de l'image : le cadre s'arrête au bord", () => {
    const z2 = withZoom(containRect(source, 3), 2, source, 3); // 1200 × 400, centré
    expect(pan(z2, 5000, 0, source).x).toBe(1200); // 2400 − 1200
    expect(pan(z2, -5000, 0, source).x).toBe(0);
    // Sur la hauteur, le cadre (400) dépasse l'image (300) : il reste centré quoi qu'on fasse.
    expect(pan(z2, 0, 999, source).y).toBe(-50);
  });
  it("un cadre plus grand que l'image sur un axe la contient, centré", () => {
    expect(clampRect({ x: 40, y: 40, w: 1800, h: 600 }, { width: 600, height: 600 })).toEqual({ x: -600, y: 0, w: 1800, h: 600 });
  });
});

describe("le cadrage du logo — le rendu", () => {
  it("la taille du rendu est bornée, proportion gardée, jamais agrandie", () => {
    expect(outputSize({ x: 0, y: 0, w: 2400, h: 800 }, { width: 1200, height: 400 })).toEqual({ width: 1200, height: 400 });
    expect(outputSize({ x: 0, y: 0, w: 600, h: 200 }, { width: 1200, height: 400 })).toEqual({ width: 600, height: 200 });
    expect(outputSize({ x: 0, y: 0, w: 600, h: 600 }, { width: 128, height: 128 })).toEqual({ width: 128, height: 128 });
  });
  it("la source se dessine décalée du cadre, à l'échelle du rendu", () => {
    // Cadre 1800 × 600 posé à x = −600 sur une source 600 × 600, rendu en 1200 × 400 (échelle 2/3).
    expect(drawPlacement({ x: -600, y: 0, w: 1800, h: 600 }, { width: 600, height: 600 }, { width: 1200, height: 400 })).toEqual({ dx: 400, dy: 0, dw: 400, dh: 400 });
  });
  it("les marges transparentes se mesurent sur l'alpha", () => {
    // 4 × 3 pixels, un carré opaque de 2 × 1 en (1, 1).
    const data = new Uint8ClampedArray(4 * 3 * 4);
    for (const [x, y] of [[1, 1], [2, 1]]) data[(y * 4 + x) * 4 + 3] = 255;
    expect(opaqueBounds(data, 4, 3)).toEqual({ x: 1, y: 1, w: 2, h: 1 });
    expect(opaqueBounds(new Uint8ClampedArray(16), 2, 2)).toBeNull();
  });
  it("le carré de l'icône par défaut contient tout le cadre du logo, centré", () => {
    expect(squareInside({ x: 0, y: -250, w: 2400, h: 800 })).toEqual({ x: 0, y: -1050, w: 2400, h: 2400 });
  });
});

describe("le cadrage du logo — relecture d'un cadre", () => {
  it("accepte des nombres finis et une taille positive, refuse le reste", () => {
    expect(parseCropRect({ x: 1, y: -2, w: 3, h: 1 })).toEqual({ x: 1, y: -2, w: 3, h: 1 });
    expect(parseCropRect({ x: 1, y: 2, w: 0, h: 1 })).toBeNull();
    expect(parseCropRect({ x: "1", y: 2, w: 3, h: 1 })).toBeNull();
    expect(parseCropRect(null)).toBeNull();
    expect(parseCropRect("{}")).toBeNull();
  });
});
