/**
 * LA SAISIE D'UN MONTANT (chantier « champs de saisie » du 2026-09-17) —
 * la logique PURE du champ montant partagé (`components/ui/amount-input.tsx`),
 * testée seule :
 *
 * - à l'écran : séparateur de milliers par espace fine insécable
 *   (« 300 000 », jamais « 300000 » ni « 300,000 »), virgule décimale, deux
 *   décimales au plus ; le point du pavé numérique vaut une virgule ;
 * - vers le serveur : un nombre BRUT (« 300000.5 »), sans espace ni
 *   symbole — jamais une chaîne formatée ;
 * - le curseur reste où la personne travaille quand un séparateur s'insère
 *   ou disparaît (ajouter un chiffre au milieu du nombre ne renvoie pas le
 *   curseur à la fin) ;
 * - le collage est nettoyé : « 300 000,00 € », « 300000.00 » et « 300,000 »
 *   donnent tous 300 000 ;
 * - un champ vide reste vide, jamais 0.
 *
 * Le symbole monétaire n'entre jamais dans le champ : il vit dans le libellé.
 */

/** Espace fine insécable — le séparateur de milliers du produit (le même que `src/lib/format.ts`). */
export const THIN_SPACE = " ";
/** La virgule : le séparateur décimal à l'écran. */
export const DECIMAL_SEPARATOR = ",";
const MAX_FRACTION_DIGITS = 2;

const isDigit = (ch: string) => ch >= "0" && ch <= "9";
const isSeparator = (ch: string) => ch === "," || ch === ".";

/** Un nombre en deux parties : chiffres de la partie entière, et fraction (null sans séparateur, "" pour une virgule seule). */
type Parts = { integer: string; fraction: string | null };

function groupThousands(digits: string): string {
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    const fromEnd = digits.length - i;
    if (i > 0 && fromEnd % 3 === 0) out += THIN_SPACE;
    out += digits[i];
  }
  return out;
}

/** Sans zéros de tête (« 007 » → « 7 »), mais jamais vide devant une fraction (« 0,5 »). */
function trimLeadingZeros(integer: string, fraction: string | null): string {
  const trimmed = integer.replace(/^0+(?=\d)/, "");
  return trimmed === "" && fraction !== null ? "0" : trimmed;
}

function render(parts: Parts): string {
  const integer = trimLeadingZeros(parts.integer, parts.fraction);
  const fraction = parts.fraction === null ? null : parts.fraction.slice(0, MAX_FRACTION_DIGITS);
  if (integer === "" && fraction === null) return "";
  return groupThousands(integer) + (fraction === null ? "" : DECIMAL_SEPARATOR + fraction);
}

/** Ce que le champ montre pour une valeur brute du serveur : « 300000.50 » → « 300 000,50 », « 100000.00 » → « 100 000 », vide pour vide. */
export function formatAmount(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return "";
  const text = String(raw).trim();
  if (text === "") return "";
  const match = /^-?(\d*)(?:[.,](\d*))?$/.exec(text);
  if (!match) return "";
  const fraction = match[2] ?? null;
  // Des décimales toutes à zéro ne disent rien : « 100000.00 » s'affiche « 100 000 ».
  const useful = fraction !== null && /[1-9]/.test(fraction.slice(0, MAX_FRACTION_DIGITS)) ? fraction : null;
  return render({ integer: match[1], fraction: useful });
}

/** La valeur brute pour le serveur : « 300 000,50 » → « 300000.50 », « 300 000 » → « 300000 », vide → vide. */
export function rawAmount(display: string): string {
  const parts = partsOf(display);
  // Une virgule sans chiffre derrière n'est pas encore une décimale (« 1 234, » vaut 1234 ; « , » ne vaut rien).
  const fraction = parts.fraction ? parts.fraction.slice(0, MAX_FRACTION_DIGITS) : "";
  const integer = trimLeadingZeros(parts.integer, fraction === "" ? null : fraction);
  if (integer === "" && fraction === "") return "";
  return (integer === "" ? "0" : integer) + (fraction === "" ? "" : "." + fraction);
}

/** Les parties d'un texte affiché (une virgule ou un point au plus comptent ; le premier gagne). */
function partsOf(text: string): Parts {
  let integer = "";
  let fraction: string | null = null;
  for (const ch of text) {
    if (isDigit(ch)) {
      if (fraction === null) integer += ch;
      else fraction += ch;
    } else if (isSeparator(ch) && fraction === null) {
      fraction = "";
    }
  }
  return { integer, fraction };
}

/**
 * LA FRAPPE : le contenu du champ après une modification (chiffres, espaces
 * et séparateurs mêlés) et la position du curseur → l'affichage formaté et
 * le curseur qui lui correspond. Un séparateur tapé alors qu'il en existe
 * déjà un est ignoré (le nombre ne change pas de sens sous les doigts) ; le
 * point vaut une virgule ; au plus deux décimales ; tout autre caractère
 * est ignoré.
 */
export function reformatTyped(text: string, caret: number): { display: string; caret: number } {
  const chars = Array.from(text);
  // Le séparateur retenu : s'il y en a plusieurs, celui qui vient d'être tapé (juste avant le curseur) est écarté.
  const separators = chars.map((ch, i) => (isSeparator(ch) ? i : -1)).filter((i) => i >= 0);
  let kept = separators[0] ?? -1;
  if (separators.length > 1 && separators.includes(caret - 1)) kept = separators.find((i) => i !== caret - 1) ?? -1;
  // La séquence significative (chiffres et le séparateur retenu), en notant ce qui précède le curseur.
  const significant: { ch: string; before: boolean; fraction: boolean }[] = [];
  let afterSeparator = false;
  chars.forEach((ch, i) => {
    if (i === kept) {
      significant.push({ ch: DECIMAL_SEPARATOR, before: i < caret, fraction: false });
      afterSeparator = true;
    } else if (isDigit(ch)) {
      significant.push({ ch, before: i < caret, fraction: afterSeparator });
    }
  });
  // Les zéros de tête disparaissent de la séquence (et du compte avant le curseur) ; la fraction est bornée.
  while (significant.length > 1 && significant[0].ch === "0" && significant[1].ch !== DECIMAL_SEPARATOR && !significant[1].fraction) significant.shift();
  let fractionDigits = 0;
  const bounded = significant.filter((s) => {
    if (!s.fraction) return true;
    fractionDigits += 1;
    return fractionDigits <= MAX_FRACTION_DIGITS;
  });
  const integer = bounded.filter((s) => !s.fraction && s.ch !== DECIMAL_SEPARATOR).map((s) => s.ch).join("");
  const hasSeparator = bounded.some((s) => s.ch === DECIMAL_SEPARATOR);
  const fraction = hasSeparator ? bounded.filter((s) => s.fraction).map((s) => s.ch).join("") : null;
  const display = render({ integer, fraction });
  // Le curseur : après autant de caractères significatifs dans l'affichage qu'il y en avait avant lui dans la frappe —
  // le zéro que l'affichage ajoute devant une fraction seule (« ,5 » → « 0,5 ») compte comme franchi.
  let target = bounded.filter((s) => s.before).length;
  if (integer === "" && fraction !== null && target > 0) target += 1;
  let seen = 0;
  let position = 0;
  for (const ch of display) {
    if (seen === target) break;
    position += 1;
    if (isDigit(ch) || ch === DECIMAL_SEPARATOR) seen += 1;
  }
  return { display, caret: position };
}

/**
 * LE COLLAGE : ce qu'un presse-papiers apporte (« 300 000,00 € »,
 * « 300000.00 », « 300,000 », « 1.234,56 », « 1,234.56 ») → l'affichage
 * formaté. Avec les deux séparateurs, le dernier est la décimale ; avec un
 * seul, il est décimal s'il est unique et suivi d'un ou deux chiffres,
 * sinon c'est un séparateur de milliers.
 */
export function cleanPasted(text: string): string {
  const kept = Array.from(text).filter((ch) => isDigit(ch) || isSeparator(ch)).join("");
  if (kept === "") return "";
  const commas = [...kept].filter((ch) => ch === ",").length;
  const dots = [...kept].filter((ch) => ch === ".").length;
  let decimalAt = -1;
  if (commas > 0 && dots > 0) {
    decimalAt = Math.max(kept.lastIndexOf(","), kept.lastIndexOf("."));
  } else if (commas + dots === 1) {
    const at = kept.search(/[.,]/);
    const after = kept.length - at - 1;
    if (after >= 1 && after <= MAX_FRACTION_DIGITS) decimalAt = at;
  }
  const integer = [...kept.slice(0, decimalAt === -1 ? kept.length : decimalAt)].filter(isDigit).join("");
  const fractionRaw = decimalAt === -1 ? null : [...kept.slice(decimalAt + 1)].filter(isDigit).join("").slice(0, MAX_FRACTION_DIGITS);
  const fraction = fractionRaw !== null && /[1-9]/.test(fractionRaw) ? fractionRaw : null;
  return render({ integer, fraction });
}
