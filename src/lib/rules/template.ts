/**
 * LE GABARIT D'UNE RÈGLE (§5.3) : un objet et un corps en texte, avec des
 * variables entre accolades LIMITÉES à une liste sûre — toute autre
 * accolade est refusée à l'enregistrement (`invalidTemplateTokens`),
 * jamais rendue en silence. Le rendu remplace chaque variable par sa
 * valeur ; une accolade qui aurait survécu (données anciennes) reste
 * telle quelle, visible — jamais un trou muet.
 */

export const RULE_TEMPLATE_VARIABLES = [
  "prenom",
  "nom",
  "nom_complet",
  "societe",
  "organisation",
  "expediteur",
  "lien_rdv",
] as const;
export type RuleTemplateVariable = (typeof RULE_TEMPLATE_VARIABLES)[number];

const TOKEN = /\{([^{}]*)\}/g;

function isVariable(name: string): name is RuleTemplateVariable {
  return (RULE_TEMPLATE_VARIABLES as readonly string[]).includes(name);
}

/** Les accolades interdites d'un texte : jetons inconnus (`{age}`) et accolades orphelines. Vide = gabarit acceptable. */
export function invalidTemplateTokens(text: string): string[] {
  const invalid = new Set<string>();
  const rest = text.replace(TOKEN, (whole, name: string) => {
    if (!isVariable(name)) invalid.add(whole);
    return "";
  });
  for (const char of rest) {
    if (char === "{" || char === "}") invalid.add(char);
  }
  return [...invalid];
}

export function templateUsesVariable(text: string, variable: RuleTemplateVariable): boolean {
  return text.includes(`{${variable}}`);
}

export function renderRuleTemplate(text: string, values: Record<RuleTemplateVariable, string>): string {
  return text.replace(TOKEN, (whole, name: string) => (isVariable(name) ? values[name] : whole));
}
