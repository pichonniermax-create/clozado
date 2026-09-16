/**
 * LES CLÉS D'APPARIEMENT D'UNE FICHE (stabilisation, D7) — ce qui permet
 * de reconnaître une personne déjà connue quand une ligne d'import n'a pas
 * d'email : d'abord l'email, sinon le téléphone normalisé, sinon le nom
 * exact et la ville. Déterministe, sans valeur client en dur : pas
 * d'indicatif par défaut, pas de pays supposé.
 */

/** Minuscules, sans accents, espaces repliés — pour comparer un nom ou une ville « exacts » à la frappe près. */
export function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * La clé d'un téléphone : les chiffres seuls, le préfixe international
 * « 00 » retiré, puis les NEUF derniers chiffres — « +33 6 12 34 56 78 »,
 * « 06 12 34 56 78 » et « 0033612345678 » se rejoignent sans qu'on ait à
 * connaître le pays. Moins de six chiffres : pas un numéro, pas de clé.
 */
export function phoneKey(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  const national = digits.startsWith("00") ? digits.slice(2) : digits;
  if (national.length < 6) return null;
  return national.slice(-9);
}

/** Nom ET ville, normalisés — l'un sans l'autre ne reconnaît personne (« Jean Martin » seul serait trop court). */
export function nameCityKey(name: string | null | undefined, city: string | null | undefined): string | null {
  const n = normalizeText(name);
  const c = normalizeText(city);
  if (!n || !c) return null;
  return `${n}|${c}`;
}
