import type { BrandTokens } from "@/lib/brand/derive";

/**
 * Les jetons de marque posés sur TOUT le document — pas sur une `div` de
 * la coquille : les menus, le panneau de navigation mobile et les listes
 * déroulantes se rendent en portail à la racine du corps, hors de la
 * coquille ; des variables posées sur un élément ne les atteindraient pas,
 * et le menu de compte garderait le bleu Clozado sous une marque bordeaux.
 * Une feuille de style rendue dans le flux (montée et démontée avec la
 * coquille — un super admin qui change d'organisation change de marque au
 * même instant), sélecteur `html:root`, plus précis que le `:root` de
 * globals.css : il gagne quel que soit l'ordre des feuilles.
 *
 * Rien n'y entre autrement que par `deriveBrandTokens` — des hexadécimaux
 * à six chiffres, et un garde-fou qui refuse toute autre valeur.
 */
const HEX = /^#[0-9a-f]{6}$/i;

function declarations(tokens: BrandTokens): string {
  return Object.entries(tokens)
    .filter(([name, value]) => /^--[a-z-]+$/.test(name) && HEX.test(value))
    .map(([name, value]) => `${name}:${value}`)
    .join(";");
}

export function brandCss(light: BrandTokens, dark: BrandTokens): string {
  return `html:root{${declarations(light)}}html:root.dark,html:root .dark{${declarations(dark)}}`;
}

export function BrandStyle({ light, dark }: { light: BrandTokens; dark: BrandTokens }) {
  return <style data-brand="" dangerouslySetInnerHTML={{ __html: brandCss(light, dark) }} />;
}
