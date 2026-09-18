import type { SavedViewScreen } from "@/db/schema/user-preferences";
import type { Messages } from "@/i18n/messages";
import { ME, type ScreenState } from "./state";

/**
 * LES VUES FOURNIES (lot 1, étape 3) — celles que toute organisation a le
 * jour où elle arrive, sans avoir rien enregistré. Elles vivent en CODE,
 * pas en base : aucune écriture au premier affichage, aucun semis à
 * rattraper sur les organisations existantes, et leur définition s'améliore
 * avec le produit. Une modification par l'admin (renommer, changer les
 * filtres, partager, masquer pour tous) crée une ligne `saved_views` sans
 * propriétaire qui porte `builtin` dans sa définition : la ligne ÉCLIPSE
 * alors la version d'origine. Chacun peut, de son côté, masquer une vue
 * fournie (préférence `vues-masquees`) sans rien imposer aux autres.
 *
 * `conseiller=moi` n'est pas un identifiant : il est résolu pour la
 * personne qui regarde (`resolveOwnerFilter`) — « Mes contacts » partagée
 * dit bien « les miens » à chacun, et ne fait fuiter l'identifiant de
 * personne.
 */
export type BuiltInView = {
  /** La clé stable, reprise dans l'identifiant public de la vue (`fournie:<key>`) et dans `definition.builtin`. */
  key: keyof Messages["ui"]["views"]["builtIn"];
  screen: SavedViewScreen;
  params: ScreenState;
};

export const BUILT_IN_VIEW_PREFIX = "fournie:";

export const BUILT_IN_VIEWS: readonly BuiltInView[] = [
  { key: "mes-contacts", screen: "contacts", params: { conseiller: ME } },
  { key: "sans-activite", screen: "contacts", params: { activite: "sans-90j" } },
  { key: "mes-affaires-en-cours", screen: "affaires", params: { vue: "liste", conseiller: ME, issue: "en-cours" } },
  { key: "signees-ce-mois", screen: "affaires", params: { vue: "liste", issue: "gagnee", periode: "mois" } },
  { key: "partenaires-actifs", screen: "partenaires", params: { statut: "actifs" } },
] as const;

export function builtInViewId(key: string): string {
  return `${BUILT_IN_VIEW_PREFIX}${key}`;
}

export function isBuiltInViewId(id: string): boolean {
  return id.startsWith(BUILT_IN_VIEW_PREFIX);
}

export function builtInViewKey(id: string): string | undefined {
  if (!isBuiltInViewId(id)) return undefined;
  const key = id.slice(BUILT_IN_VIEW_PREFIX.length);
  return BUILT_IN_VIEWS.some((v) => v.key === key) ? key : undefined;
}
