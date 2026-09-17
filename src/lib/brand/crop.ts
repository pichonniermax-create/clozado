/**
 * LE CADRAGE DU LOGO (correctif du chantier C partie 1, 2026-09-17) — la
 * géométrie PURE du cadre, testée seule : le composant ne fait que la
 * dessiner. Un cadre est un rectangle en PIXELS DE LA SOURCE, de proportion
 * fixe (3:1 pour le logo, 1:1 pour l'icône) ; il peut déborder de l'image
 * (marges transparentes) : zoomer, c'est rétrécir le cadre autour de son
 * centre ; repositionner, c'est le déplacer. Le résultat est ce que le cadre
 * contient, rendu dans une taille bornée, puis — pour le logo — débarrassé
 * de ses marges entièrement transparentes.
 */

export type Size = { width: number; height: number };
/** Un cadre en pixels de la source ; `w / h` vaut toujours la proportion du cadre. */
export type CropRect = { x: number; y: number; w: number; h: number };

/** Le zoom le plus fort : le cadre ne descend pas sous un sixième de sa taille « tout contenu ». */
export const MAX_ZOOM = 6;

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Le cadre « tout contenu » : la source entière dans le cadre, centrée — le point de départ, et le zoom 1. */
export function containRect(source: Size, ratio: number): CropRect {
  const w = Math.max(source.width, source.height * ratio);
  const h = w / ratio;
  return { x: round((source.width - w) / 2), y: round((source.height - h) / 2), w: round(w), h: round(h) };
}

/** Le zoom d'un cadre, relatif au cadre « tout contenu » (1 = tout contenu, 2 = deux fois plus près). */
export function zoomOf(rect: CropRect, source: Size, ratio: number): number {
  return containRect(source, ratio).w / rect.w;
}

/** Le cadre au zoom demandé (borné entre 1 et MAX_ZOOM), autour du même centre, puis ramené sur l'image. */
export function withZoom(rect: CropRect, zoom: number, source: Size, ratio: number): CropRect {
  const base = containRect(source, ratio);
  const z = Math.min(MAX_ZOOM, Math.max(1, zoom));
  const w = base.w / z;
  const h = w / ratio;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  return clampRect({ x: cx - w / 2, y: cy - h / 2, w, h }, source);
}

/** Le cadre déplacé de (dx, dy) pixels de la source, puis ramené sur l'image. */
export function pan(rect: CropRect, dx: number, dy: number, source: Size): CropRect {
  return clampRect({ ...rect, x: rect.x + dx, y: rect.y + dy }, source);
}

/**
 * Le cadre ne quitte jamais l'image : sur chaque axe, s'il est plus grand
 * que l'image il la contient (centré), sinon il reste dedans. Ainsi le
 * résultat montre toujours de l'image, jamais un cadre vide.
 */
export function clampRect(rect: CropRect, source: Size): CropRect {
  const x = rect.w >= source.width ? (source.width - rect.w) / 2 : Math.min(Math.max(rect.x, 0), source.width - rect.w);
  const y = rect.h >= source.height ? (source.height - rect.h) / 2 : Math.min(Math.max(rect.y, 0), source.height - rect.h);
  return { x: round(x), y: round(y), w: round(rect.w), h: round(rect.h) };
}

/** Un cadre relu (base, formulaire) : des nombres finis, une taille positive, sinon null. */
export function parseCropRect(value: unknown): CropRect | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  const nums = [r.x, r.y, r.w, r.h].map((n) => (typeof n === "number" && Number.isFinite(n) ? n : NaN));
  if (nums.some((n) => Number.isNaN(n)) || nums[2] <= 0 || nums[3] <= 0) return null;
  return { x: nums[0], y: nums[1], w: nums[2], h: nums[3] };
}

/** La taille du rendu d'un cadre : ses pixels de source, bornés au maximum, proportion gardée, jamais agrandis au-delà de 1:1. */
export function outputSize(rect: CropRect, max: Size): Size {
  const scale = Math.min(1, max.width / rect.w, max.height / rect.h);
  return { width: Math.max(1, Math.round(rect.w * scale)), height: Math.max(1, Math.round(rect.h * scale)) };
}

/** Où dessiner la source entière sur un rendu du cadre (`drawImage(img, dx, dy, dw, dh)`) — les débords sont transparents. */
export function drawPlacement(rect: CropRect, source: Size, output: Size): { dx: number; dy: number; dw: number; dh: number } {
  const scale = output.width / rect.w;
  const nz = (n: number) => (n === 0 ? 0 : n); // jamais « −0 »
  return { dx: nz(-rect.x * scale), dy: nz(-rect.y * scale), dw: source.width * scale, dh: source.height * scale };
}

/** Les bornes du contenu visible (alpha > 0) d'un rendu RGBA, ou null si tout est transparent. */
export function opaqueBounds(data: Uint8ClampedArray, width: number, height: number): { x: number; y: number; w: number; h: number } | null {
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 0) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) return null;
  return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

/** Le cadre de l'icône par défaut : le carré centré qui contient tout le logo cadré — l'emblème se choisit ensuite au zoom. */
export function squareInside(rect: CropRect): CropRect {
  const side = Math.max(rect.w, rect.h);
  return { x: round(rect.x + (rect.w - side) / 2), y: round(rect.y + (rect.h - side) / 2), w: round(side), h: round(side) };
}
