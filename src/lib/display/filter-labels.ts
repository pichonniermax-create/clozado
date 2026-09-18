import { ME_TOKEN, type FilterCondition } from "./filters";

/**
 * UNE CONDITION, EN FRANÇAIS — jamais la syntaxe brute. `activite:last:30`
 * se lit « Dernière activité : 30 derniers jours », pas « last:30 ».
 * Cette fonction sert des deux côtés : les pastilles rendues par le
 * serveur et le constructeur ouvert dans le navigateur doivent dire
 * EXACTEMENT la même chose.
 *
 * `label` traduit une valeur de liste en son nom. Quand elle rend `null`,
 * c'est que l'identifiant ne désigne plus rien : la condition reste
 * affichée, et le dit — la retirer élargirait la liste en silence.
 */
export type FilterTranslator = (key: string, values?: Record<string, string | number>) => string;

export function describeCondition(
  condition: FilterCondition,
  t: FilterTranslator,
  resolve: (field: string, value: string) => string | null
): string {
  const field = t(`fields.${condition.field}`);
  // `moi` n'est PAS un identifiant : il n'est dans aucune liste d'options, et le chercher dedans le faisait
  // passer pour un élément supprimé. Il est résolu ici, une fois, pour que personne ne l'oublie ailleurs.
  const label = (f: string, value: string) => (value === ME_TOKEN ? t("moi") : resolve(f, value));
  const [a, b] = condition.values;
  switch (condition.operator) {
    case "empty":
      return t("phrase.empty", { champ: field });
    case "ct":
      return t("phrase.ct", { champ: field, valeur: a });
    case "sw":
      return t("phrase.sw", { champ: field, valeur: a });
    case "gt":
      return t("phrase.gt", { champ: field, valeur: a });
    case "lt":
      return t("phrase.lt", { champ: field, valeur: a });
    case "bt":
      return t("phrase.bt", { champ: field, min: a, max: b });
    case "before":
      return t("phrase.before", { champ: field, valeur: a });
    case "after":
      return t("phrase.after", { champ: field, valeur: a });
    case "last":
      // Ce que l'utilisateur a demandé à voir en clair : « 30 derniers jours », pas « last:30 ».
      return t("phrase.last", { champ: field, jours: Number(a) });
    case "eq":
      return t("phrase.eq", { champ: field, valeur: label(condition.field, a) ?? t("element_supprime") });
    case "ne":
      return t("phrase.ne", { champ: field, valeur: label(condition.field, a) ?? t("element_supprime") });
    case "in":
      return t("phrase.in", {
        champ: field,
        valeurs: condition.values.map((v) => label(condition.field, v) ?? t("element_supprime")).join(", "),
      });
    case "is":
      return t("phrase.is", { champ: field, valeur: a === "vrai" ? t("vrai") : t("faux") });
  }
}

/** Une condition désigne-t-elle quelque chose qui n'existe plus ? (la pastille le signale) */
export function isDangling(condition: FilterCondition, resolve: (field: string, value: string) => string | null): boolean {
  if (condition.type !== "liste") return false;
  return condition.values.some((v) => v !== ME_TOKEN && resolve(condition.field, v) === null);
}
