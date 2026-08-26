import { contrast, luminance, normalizeHex, oklchToRgb, parseHex, rgbToOklch, toHex, type Oklch, type Rgb } from "./color";

/**
 * LA DÉRIVATION DES JETONS DE MARQUE (docs/module-marque-blanche-i18n.md
 * §1, validée le 2026-08-26). Une couleur choisie → tous les jetons dont
 * l'interface a besoin, et CHAQUE paire texte/fond émise est vérifiée au
 * moment de la dériver : texte ≥ 4,5:1 (AA), composants ≥ 3:1. Une
 * couleur trop claire est assombrie pour les boutons et les liens, jamais
 * refusée ; le texte posé sur la couleur est blanc, encre ou noir selon le
 * contraste (le meilleur des deux vaut toujours au moins √21 ≈ 4,58). Les
 * couleurs sémantiques, polices, rayons, espacements ne sont pas ici : ils
 * ne bougent jamais.
 *
 * Fonction PURE, déterministe, sans dépendance, exécutable côté serveur
 * (la coquille) comme dans le navigateur (l'aperçu du sélecteur) — le même
 * code produit les deux, il ne peut pas y avoir d'écart entre l'aperçu et
 * l'application. Rien de dérivé n'est stocké : seule la couleur choisie.
 */
export type BrandTheme = "light" | "dark";

export const BRAND_TOKEN_NAMES = [
  "--primary",
  "--primary-foreground",
  "--primary-hover",
  "--primary-active",
  "--primary-ink",
  "--primary-soft",
  "--ring",
  "--chart-1",
  "--accent",
  "--accent-foreground",
  "--muted",
  "--secondary",
  "--secondary-foreground",
  "--border",
  "--input",
  "--sidebar",
  "--sidebar-border",
  "--sidebar-primary",
  "--sidebar-primary-foreground",
  "--sidebar-accent",
  "--sidebar-accent-foreground",
  "--sidebar-ring",
] as const;

export type BrandTokenName = (typeof BRAND_TOKEN_NAMES)[number];
export type BrandTokens = Record<BrandTokenName, string>;

/** Les paires vérifiées, identifiées par un code : leur libellé est `brand.pairs.<id>` dans les messages. */
export type ContrastPairId =
  | "button_text"
  | "button_hover_text"
  | "button_active_text"
  | "button_on_background"
  | "link_on_background"
  | "link_on_card"
  | "active_row_label"
  | "hovered_row_text"
  | "secondary_text";

export type ContrastPair = {
  id: ContrastPairId;
  foreground: string;
  background: string;
  ratio: number;
  required: number;
  ok: boolean;
};

/** Les diagnostics, par code : leur phrase est `brand.diagnostics.<code>` dans les messages — le sélecteur les affiche dans la langue de la personne. */
export type BrandDiagnosticCode =
  | "too_light"
  | "too_dark_for_theme"
  | "dark_text"
  | "light_text"
  | "too_dark_flipped"
  | "too_light_flipped"
  | "gray"
  | "vivid"
  | "links_darkened";

export type BrandDiagnostic = { code: BrandDiagnosticCode };

export type DerivedBrand = {
  input: string;
  theme: BrandTheme;
  tokens: BrandTokens;
  pairs: ContrastPair[];
  diagnostics: BrandDiagnostic[];
};

/** Les neutres du système (globals.css) : ce sur quoi les contrastes se mesurent. Tenus alignés avec la feuille de style. */
const SYSTEM = {
  light: {
    background: { l: 0.988, c: 0.002, h: 264 },
    card: { l: 1, c: 0, h: 0 },
    foreground: { l: 0.21, c: 0.018, h: 264 },
    /** Les clartés/chromas des neutres teintés ; seule la teinte suit la marque. */
    muted: { l: 0.968, c: 0.004 },
    secondary: { l: 0.965, c: 0.005 },
    secondaryForeground: { l: 0.3, c: 0.02 },
    border: { l: 0.918, c: 0.006 },
    sidebar: { l: 0.975, c: 0.004 },
    accent: { l: 0.955, c: 0.012 },
    /** Le texte d'une ligne survolée : une teinte sombre de la marque (comme aujourd'hui), pas l'encre de marque. */
    accentForeground: { l: 0.34, cMax: 0.06 },
    soft: { l: 0.955, cMax: 0.04 },
  },
  dark: {
    background: { l: 0.175, c: 0.014, h: 264 },
    card: { l: 0.216, c: 0.016, h: 264 },
    foreground: { l: 0.96, c: 0.004, h: 264 },
    muted: { l: 0.27, c: 0.018 },
    secondary: { l: 0.27, c: 0.018 },
    secondaryForeground: { l: 0.94, c: 0.006 },
    border: { l: 0.29, c: 0.01 },
    sidebar: { l: 0.196, c: 0.015 },
    accent: { l: 0.31, c: 0.03 },
    accentForeground: { l: 0.94, cMax: 0.006 },
    soft: { l: 0.31, cMax: 0.05 },
  },
} as const;

/** La teinte du système quand la couleur n'en a pas (un gris) : celle du bleu Clozado — les neutres restent ceux d'aujourd'hui. */
const SYSTEM_HUE = 264;
const TEXT_MIN = 4.5;
const COMPONENT_MIN = 3;

const WHITE: Rgb = { r: 1, g: 1, b: 1 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };

const hex = (c: Oklch) => toHex(oklchToRgb(c));
const rgb = (c: Oklch) => oklchToRgb(c);

/**
 * Déplace la clarté par pas de 0,02 dans la direction demandée jusqu'à ce
 * que `ok` soit vrai — bornée pour ne jamais boucler : au pire, on rend le
 * dernier essai (le noir ou le blanc satisfont tout contraste ≥ 4,5
 * contre leur opposé, donc la boucle s'arrête toujours avant).
 */
function adjustLightness(start: Oklch, direction: -1 | 1, ok: (c: Oklch) => boolean): Oklch {
  let current = { ...start };
  for (let i = 0; i < 60 && !ok(current); i++) {
    current = { ...current, l: Math.min(1, Math.max(0, current.l + direction * 0.02)) };
    if (current.l === 0 || current.l === 1) break;
  }
  return current;
}

export function deriveBrandTokens(input: string, theme: BrandTheme = "light"): DerivedBrand {
  const normalized = normalizeHex(input);
  const chosenRgb = normalized ? parseHex(normalized)! : parseHex("#2563eb")!;
  const chosen = rgbToOklch(chosenRgb);
  const sys = SYSTEM[theme];
  const isLight = theme === "light";
  const background = rgb(sys.background);
  const card = rgb(sys.card);
  const ink = rgb(sys.foreground);
  const diagnostics: BrandDiagnostic[] = [];
  const pairs: ContrastPair[] = [];

  // Un gris vrai (chroma nulle) reste gris ; un blanc cassé ou un beige
  // garde sa teinte discrète — c'est elle qui fera la marque une fois assombrie.
  const isGray = chosen.c < 0.005;
  const hue = isGray ? SYSTEM_HUE : chosen.h;
  const brandChroma = isGray ? 0 : chosen.c;

  // 1. La surface principale : la couleur telle quelle, sauf si un bouton
  //    ne se distinguerait pas du fond (< 3:1) — on l'assombrit (clair) ou
  //    l'éclaircit (sombre), teinte et chroma conservées.
  const towardsInk: -1 | 1 = isLight ? -1 : 1;
  const primary = adjustLightness({ l: chosen.l, c: brandChroma, h: hue }, towardsInk, (c) => contrast(rgb(c), background) >= COMPONENT_MIN);
  const primaryDarkened = Math.abs(primary.l - chosen.l) > 0.001;

  // 2. Le texte posé sur la surface : blanc, sinon l'encre, sinon le noir.
  const candidates: { name: string; value: Rgb }[] = isLight
    ? [
        { name: "white", value: WHITE },
        { name: "ink", value: ink },
        { name: "black", value: BLACK },
      ]
    : [
        { name: "ink", value: ink },
        { name: "white", value: WHITE },
        { name: "black", value: BLACK },
      ];
  const primaryRgb = rgb(primary);
  const foreground = candidates.find((c) => contrast(c.value, primaryRgb) >= TEXT_MIN) ?? candidates[candidates.length - 1];

  // 3. Survol et actif : un cran, puis deux, en S'ÉLOIGNANT du texte du
  //    bouton — plus sombre sous un texte blanc, plus clair sous un texte
  //    foncé : le contraste ne peut que monter. Quand la couleur est au
  //    bout de l'échelle (presque noire sous du blanc), on va dans l'autre
  //    sens, avec un pas revérifié pour que le texte reste lisible.
  const foregroundIsLight = luminance(foreground.value) > 0.5;
  let stepDirection: -1 | 1 = foregroundIsLight ? -1 : 1;
  const flipped = (stepDirection === -1 && primary.l < 0.14) || (stepDirection === 1 && primary.l > 0.9);
  if (flipped) stepDirection = stepDirection === -1 ? 1 : -1;
  const variant = (step: number): Oklch => {
    let c: Oklch = { ...primary, l: Math.min(1, Math.max(0, primary.l + stepDirection * step)) };
    for (let i = 0; i < 8 && contrast(foreground.value, rgb(c)) < TEXT_MIN; i++) {
      c = { ...c, l: c.l - stepDirection * 0.01 };
    }
    return c;
  };
  const hover = variant(0.05);
  const active = variant(0.09);

  // 4. Les neutres : les mêmes clartés et chromas qu'aujourd'hui, sur la teinte de la marque.
  const tint = (spec: { l: number; c: number }): Oklch => ({ l: spec.l, c: spec.c, h: hue });
  const accent = tint(sys.accent);
  const accentForeground: Oklch = { l: sys.accentForeground.l, c: Math.min(brandChroma, sys.accentForeground.cMax), h: hue };
  const muted = tint(sys.muted);
  const secondary = tint(sys.secondary);
  const secondaryForeground = tint(sys.secondaryForeground);
  const border = tint(sys.border);
  const sidebar = tint(sys.sidebar);

  // 5. L'encre de marque : un texte à la couleur de la marque, lisible sur
  //    le fond de page, sur une carte ET sur la surface teintée la plus
  //    sombre (une ligne survolée) — le gamut réduit la chroma au besoin.
  const surfaces = [background, card, rgb(accent)];
  const inkColor = adjustLightness({ ...primary, l: chosen.l }, towardsInk, (c) => surfaces.every((s) => contrast(rgb(c), s) >= TEXT_MIN));
  const inkDarkened = Math.abs(inkColor.l - chosen.l) > 0.05;

  // 6. Le fond léger : la teinte, très claire (ou très sombre), chroma bornée ; l'encre doit y rester lisible.
  let soft: Oklch = { l: sys.soft.l, c: Math.min(brandChroma, sys.soft.cMax), h: hue };
  soft = adjustLightness(soft, isLight ? 1 : -1, (c) => contrast(rgb(inkColor), rgb(c)) >= TEXT_MIN);

  const tokens: BrandTokens = {
    "--primary": hex(primary),
    "--primary-foreground": toHex(foreground.value),
    "--primary-hover": hex(hover),
    "--primary-active": hex(active),
    "--primary-ink": hex(inkColor),
    "--primary-soft": hex(soft),
    "--ring": hex(primary),
    "--chart-1": hex(primary),
    "--accent": hex(accent),
    "--accent-foreground": hex(accentForeground),
    "--muted": hex(muted),
    "--secondary": hex(secondary),
    "--secondary-foreground": hex(secondaryForeground),
    "--border": hex(border),
    "--input": hex(border),
    "--sidebar": hex(sidebar),
    "--sidebar-border": hex(border),
    "--sidebar-primary": hex(primary),
    "--sidebar-primary-foreground": toHex(foreground.value),
    "--sidebar-accent": hex(soft),
    "--sidebar-accent-foreground": hex(inkColor),
    "--sidebar-ring": hex(primary),
  };

  const pair = (id: ContrastPairId, fg: string, bg: string, required: number) => {
    const ratio = contrast(parseHex(fg)!, parseHex(bg)!);
    pairs.push({ id, foreground: fg, background: bg, ratio: Math.round(ratio * 100) / 100, required, ok: ratio >= required });
  };
  const bgHex = toHex(background);
  const cardHex = toHex(card);
  pair("button_text", tokens["--primary-foreground"], tokens["--primary"], TEXT_MIN);
  pair("button_hover_text", tokens["--primary-foreground"], tokens["--primary-hover"], TEXT_MIN);
  pair("button_active_text", tokens["--primary-foreground"], tokens["--primary-active"], TEXT_MIN);
  pair("button_on_background", tokens["--primary"], bgHex, COMPONENT_MIN);
  pair("link_on_background", tokens["--primary-ink"], bgHex, TEXT_MIN);
  pair("link_on_card", tokens["--primary-ink"], cardHex, TEXT_MIN);
  pair("active_row_label", tokens["--sidebar-accent-foreground"], tokens["--sidebar-accent"], TEXT_MIN);
  pair("hovered_row_text", tokens["--accent-foreground"], tokens["--accent"], TEXT_MIN);
  pair("secondary_text", tokens["--secondary-foreground"], tokens["--secondary"], TEXT_MIN);

  if (primaryDarkened) diagnostics.push({ code: isLight ? "too_light" : "too_dark_for_theme" });
  if (foreground.name !== (isLight ? "white" : "ink")) diagnostics.push({ code: isLight ? "dark_text" : "light_text" });
  if (flipped) diagnostics.push({ code: foregroundIsLight ? "too_dark_flipped" : "too_light_flipped" });
  if (isGray) diagnostics.push({ code: "gray" });
  if (chosen.c > 0.25) diagnostics.push({ code: "vivid" });
  if (inkDarkened && !primaryDarkened) diagnostics.push({ code: "links_darkened" });

  return { input: normalized ?? "#2563eb", theme, tokens, pairs, diagnostics };
}

/** Les jetons en propriétés CSS inline (`style={brandStyle(tokens)}`) — sur la coquille, ou sur l'aperçu du sélecteur. */
export function brandStyle(tokens: BrandTokens): Record<string, string> {
  return { ...tokens };
}

/** Huit couleurs sobres pour les métiers de la finance et du patrimoine — un point de départ, jamais une contrainte. Leurs noms sont `brand.palettes.<key>`. */
export const BRAND_PALETTES = [
  { key: "midnight", hex: "#1e3a5f" },
  { key: "blue", hex: "#2563eb" },
  { key: "forest", hex: "#1f5f45" },
  { key: "burgundy", hex: "#7a1f2e" },
  { key: "slate", hex: "#3f4f6b" },
  { key: "ochre", hex: "#8a6a1f" },
  { key: "plum", hex: "#4b2e5e" },
  { key: "charcoal", hex: "#2f3136" },
] as const;
