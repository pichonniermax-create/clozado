/**
 * OÙ SE POSE LA BULLE DE LA VISITE GUIDÉE.
 *
 * La géométrie est ici, pure et testable, parce qu'elle décide de ce que
 * l'œil voit : la carte doit être POSÉE avant d'être visible. Le composant
 * mesure (l'élément à éclairer, la fenêtre, la hauteur réelle de la carte),
 * cette fonction place, et rien ne bouge ensuite sous le regard du lecteur.
 *
 * L'ordre des places est celui de la lecture : dessous d'abord (on lit ce
 * qui est montré, puis ce qui l'explique), dessus si le bas manque, à côté
 * si ni l'un ni l'autre ne tient — un élément haut comme l'écran ne laisse
 * que ça.
 */

/** La largeur de la carte ancrée (`w-96` de Tailwind), en pixels. */
export const CARD_WIDTH = 384;
/** L'air entre l'élément éclairé et la carte. */
export const GAP = 14;
/** Le halo déborde de l'élément, et rien ne colle au bord de la fenêtre. */
export const MARGIN = 8;
/** En dessous de `md`, pas d'éclairage : la carte reste en bas de l'écran. */
export const ANCHOR_MIN_WIDTH = 768;

export type Box = { top: number; left: number; width: number; height: number };
export type Viewport = { width: number; height: number };
export type Side = "dessous" | "dessus" | "droite" | "gauche";
export type Placement = { halo: Box; card: { top: number; left: number }; side: Side };

/** Un téléphone n'éclaire rien : la carte y vit en bas, pleine largeur. */
export function canAnchor(viewport: Viewport): boolean {
  return viewport.width >= ANCHOR_MIN_WIDTH;
}

function clamp(value: number, max: number): number {
  return Math.max(MARGIN, Math.min(value, max));
}

/**
 * La place du halo et celle de la carte, pour un élément donné, dans une
 * fenêtre donnée, avec la hauteur RÉELLE de la carte — une hauteur devinée
 * (c'était 232 px en dur) sort la carte de l'écran dès qu'un texte passe à
 * la ligne.
 */
export function placeCard(rect: Box, viewport: Viewport, cardHeight: number): Placement {
  const halo = { top: rect.top - MARGIN, left: rect.left - MARGIN, width: rect.width + MARGIN * 2, height: rect.height + MARGIN * 2 };
  const bottom = rect.top + rect.height;
  const alignedLeft = clamp(rect.left, viewport.width - CARD_WIDTH - MARGIN);

  if (bottom + GAP + cardHeight <= viewport.height - MARGIN) {
    return { halo, card: { top: bottom + GAP, left: alignedLeft }, side: "dessous" };
  }
  if (rect.top - GAP - cardHeight >= MARGIN) {
    return { halo, card: { top: rect.top - GAP - cardHeight, left: alignedLeft }, side: "dessus" };
  }

  // Ni dessus ni dessous : à côté, à la hauteur du haut de l'élément.
  const top = clamp(rect.top, viewport.height - cardHeight - MARGIN);
  if (rect.left + rect.width + GAP + CARD_WIDTH <= viewport.width - MARGIN) {
    return { halo, card: { top, left: rect.left + rect.width + GAP }, side: "droite" };
  }
  if (rect.left - GAP - CARD_WIDTH >= MARGIN) {
    return { halo, card: { top, left: rect.left - GAP - CARD_WIDTH }, side: "gauche" };
  }
  // Rien ne tient : la carte se pose dans la fenêtre, quitte à couvrir un bord de l'élément.
  return { halo, card: { top, left: alignedLeft }, side: "dessous" };
}
