/**
 * Le nom d'affichage d'une fiche après modification (plan de
 * stabilisation, D3). Le formulaire d'une personne ne porte pas de champ
 * « nom d'affichage » : il se recompose de prénom + nom. Avant, une fiche
 * importée avec `name = « Jean Dupont »` et prénom/nom vides perdait son
 * nom dès qu'on saisissait le seul prénom (« Jean »). Règle : le nom se
 * recompose seulement quand prénom ET nom sont là ; avec un seul des deux,
 * le nom actuel reste — on ne réduit jamais un nom, on le complète.
 */
export function displayNameAfterUpdate(
  current: { name: string; kind: "person" | "company" },
  input: { name?: string | null; firstName?: string | null; lastName?: string | null }
): string {
  const name = input.name?.trim() ?? "";
  if (current.kind === "company") return name || current.name;
  const first = input.firstName?.trim() ?? "";
  const last = input.lastName?.trim() ?? "";
  if (first && last) return `${first} ${last}`;
  return current.name || first || last || name;
}
