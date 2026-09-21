/**
 * LA FORME D'UNE VALEUR SAISIE EN PLACE (chantier « les fiches deviennent
 * modifiables ») — pur, sans base : chaque fonction rend la CLÉ de la
 * phrase à montrer, ou `null` quand la valeur passe. C'est le serveur qui
 * s'en sert (l'écran ne protège que l'écran), et c'est testé ici plutôt
 * que découvert en production par une erreur de base de données.
 *
 * Volontairement permissif là où le monde réel l'est : un numéro de
 * téléphone s'écrit de dix façons, une adresse email ne se valide
 * vraiment qu'en écrivant dessus. Ce qui est refusé, ce sont les saisies
 * qui ne peuvent PAS être ce qu'elles prétendent.
 */

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Chiffres, espaces, et les signes qu'un numéro porte vraiment : + ( ) . / - */
const PHONE_SHAPE = /^\+?[\d\s().\/-]{6,25}$/;
const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

export function checkEmail(value: string | null): string | null {
  if (!value) return null;
  if (value.length > 254 || !EMAIL_SHAPE.test(value)) return "cette_adresse_email_ne_semble_pas_valide";
  return null;
}

export function checkPhone(value: string | null): string | null {
  if (!value) return null;
  // Au moins six chiffres : « 06 » ou « -- » ne sont pas des numéros.
  const digits = value.replace(/\D/g, "").length;
  if (!PHONE_SHAPE.test(value) || digits < 6) return "ce_numero_de_telephone_ne_semble_pas_valide";
  return null;
}

/** Un montant : un nombre, positif ou nul, avec au plus deux décimales. La virgule vaut le point. */
export function checkAmount(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return "le_montant_doit_etre_un_nombre_positif";
  if (Number(normalized) > 9_999_999_999) return "le_montant_doit_etre_un_nombre_positif";
  return null;
}

/** Une probabilité : un entier de 0 à 100. */
export function checkPercent(value: string | null): string | null {
  if (!value) return null;
  const n = Number(value.replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 100) return "la_probabilite_va_de_0_a_100";
  return null;
}

/** Une date : « AAAA-MM-JJ », et un jour qui existe (le 31 février n'en est pas un). */
export function checkDate(value: string | null): string | null {
  if (!value) return null;
  if (!DATE_SHAPE.test(value)) return "la_date_est_illisible";
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  const exists = parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
  return exists ? null : "la_date_est_illisible";
}

/** Le texte d'un champ : rien de plus qu'une longueur, mais dite. */
export function checkLength(value: string | null, max: number): string | null {
  return value && value.length > max ? "la_saisie_est_trop_longue_ou_invalide" : null;
}
