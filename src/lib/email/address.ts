/**
 * Les adresses email, côté produit : la validation de forme et l'écriture
 * d'une boîte aux lettres avec son nom d'affichage (RFC 5322). Partagé par
 * la connexion, l'inscription et l'expéditeur des organisations — une
 * seule définition de « ça ressemble à une adresse ».
 */

/** Volontairement permissif : la validation qui fait foi est l'email qui arrive — ou pas. */
export function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

/**
 * « Cabinet Dupont <contact@cabinet-dupont.fr> ». Le nom vient d'une
 * saisie : les retours à la ligne sont retirés (une injection d'en-tête
 * passe par là) et le nom est mis entre guillemets dès qu'il porte un
 * caractère que la grammaire des en-têtes ne tolère pas nu (virgule,
 * point, chevrons, deux-points, guillemets…).
 */
export function formatMailbox(displayName: string, address: string): string {
  const name = displayName.replace(/[\r\n\t]+/g, " ").trim();
  if (!name) return address;
  const bare = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~ -]+$/.test(name);
  const quoted = bare ? name : `"${name.replace(/(["\\])/g, "\\$1")}"`;
  return `${quoted} <${address}>`;
}

/** « Clozado <no-reply@clozado.app> » → « no-reply@clozado.app » ; une adresse nue reste telle quelle. */
export function bareAddress(mailbox: string): string {
  const match = /<([^>]+)>\s*$/.exec(mailbox);
  return (match ? match[1] : mailbox).trim();
}
