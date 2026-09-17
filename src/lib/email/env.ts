/**
 * La lecture des variables d'environnement de l'email — sans aucune
 * dépendance à Next (pas de `next/headers`), pour que les règles de flux
 * (`flows.ts`) se testent seules. Une variable exigée absente est une
 * erreur dite en clair, jamais un repli silencieux.
 */
export class EmailConfigError extends Error {
  readonly variable: string;
  constructor(variable: string) {
    // eslint-disable-next-line local/no-visible-text -- message technique de configuration, jamais affiché à une personne
    super(`email: la variable d'environnement ${variable} est absente`);
    this.name = "EmailConfigError";
    this.variable = variable;
  }
}

/** Une variable exigée : absente = le produit refuse d'envoyer et le dit. */
export function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new EmailConfigError(name);
  return value;
}

/** Une variable facultative : absente ou vide = `null`. */
export function optional(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}
