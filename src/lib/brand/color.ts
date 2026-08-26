/**
 * La couleur, sans dépendance : sRGB ↔ OKLab ↔ OKLCH (formules de Björn
 * Ottosson), luminance relative et contraste WCAG 2.x, et le retour dans
 * le gamut sRGB par réduction de chroma. Tout ce que la dérivation des
 * jetons de marque (`derive.ts`) manipule passe par ici ; rien ici ne
 * connaît le produit.
 */
export type Rgb = { r: number; g: number; b: number };
export type Oklch = { l: number; c: number; h: number };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** « #2563eb », « 2563EB », « #fff » → sRGB 0–1 ; null si ce n'est pas une couleur hexadécimale. */
export function parseHex(input: string): Rgb | null {
  const raw = input.trim().replace(/^#/, "");
  const hex = raw.length === 3 ? raw.split("").map((ch) => ch + ch).join("") : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  const n = parseInt(hex, 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

/** La forme canonique stockée et affichée : « #2563eb ». */
export function normalizeHex(input: string): string | null {
  const rgb = parseHex(input);
  return rgb ? toHex(rgb) : null;
}

export function toHex(rgb: Rgb): string {
  const part = (v: number) =>
    Math.round(clamp01(v) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${part(rgb.r)}${part(rgb.g)}${part(rgb.b)}`;
}

function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearToSrgb(v: number): number {
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

/** La luminance relative WCAG 2.x (0 = noir, 1 = blanc). */
export function luminance(rgb: Rgb): number {
  return 0.2126 * srgbToLinear(rgb.r) + 0.7152 * srgbToLinear(rgb.g) + 0.0722 * srgbToLinear(rgb.b);
}

/** Le rapport de contraste WCAG 2.x entre deux couleurs affichées (1 à 21). */
export function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function rgbToOklch(rgb: Rgb): Oklch {
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const c = Math.sqrt(A * A + B * B);
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h: c < 1e-6 ? 0 : h };
}

/** OKLCH → sRGB, SANS bornage : sert à savoir si la couleur tient dans le gamut. */
function oklchToRgbRaw({ l, c, h }: Oklch): Rgb {
  const rad = (h * Math.PI) / 180;
  const A = c * Math.cos(rad);
  const B = c * Math.sin(rad);
  const l_ = l + 0.3963377774 * A + 0.2158037573 * B;
  const m_ = l - 0.1055613458 * A - 0.0638541728 * B;
  const s_ = l - 0.0894841775 * A - 1.291485548 * B;
  const L = l_ * l_ * l_;
  const M = m_ * m_ * m_;
  const S = s_ * s_ * s_;
  return {
    r: linearToSrgb(4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S),
    g: linearToSrgb(-1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S),
    b: linearToSrgb(-0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S),
  };
}

const EPS = 0.0005;

function inGamut(rgb: Rgb): boolean {
  return [rgb.r, rgb.g, rgb.b].every((v) => v >= -EPS && v <= 1 + EPS);
}

/**
 * Ramène une couleur OKLCH dans sRGB en RÉDUISANT LA CHROMA (jamais la
 * clarté, qui porte le contraste) : dichotomie sur C, douze itérations,
 * puis bornage des canaux. Ce qui est rendu est ce qui sera affiché — les
 * contrastes se mesurent sur cette valeur.
 */
export function oklchToRgb(color: Oklch): Rgb {
  const l = clamp01(color.l);
  let rgb = oklchToRgbRaw({ ...color, l });
  if (inGamut(rgb)) return { r: clamp01(rgb.r), g: clamp01(rgb.g), b: clamp01(rgb.b) };
  let lo = 0;
  let hi = color.c;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    rgb = oklchToRgbRaw({ l, c: mid, h: color.h });
    if (inGamut(rgb)) lo = mid;
    else hi = mid;
  }
  rgb = oklchToRgbRaw({ l, c: lo, h: color.h });
  return { r: clamp01(rgb.r), g: clamp01(rgb.g), b: clamp01(rgb.b) };
}

/** « oklch(0.52 0.168 263) » — pour lire une couleur dans un journal. */
export function formatOklch({ l, c, h }: Oklch): string {
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(0)})`;
}
