/**
 * LA MODIFICATION EN PLACE, champ par champ (chantier « les fiches
 * deviennent modifiables ») — le contrat partagé par le composant d'écran
 * et les actions serveur des quatre fiches (contact, société, partenaire,
 * affaire). Pur : aucun import de base, aucun composant.
 *
 * Une écriture porte TOUJOURS trois choses : le champ, sa valeur, et la
 * VERSION de la fiche telle qu'elle a été chargée à l'écran. La version est
 * la seule protection contre l'écrasement silencieux : si quelqu'un d'autre
 * a modifié la fiche entre-temps, le serveur refuse et l'écran se recharge.
 */

/** La version d'une fiche = son `updated_at`, en ISO. */
export function versionOf(row: { updatedAt: Date }): string {
  return row.updatedAt.toISOString();
}

export type InlinePatch = {
  /** Le nom du champ, tel que la liste blanche du serveur le connaît. */
  field: string;
  /** La valeur brute saisie ; « » signifie « vide » pour un champ facultatif. */
  value: string;
  /** La version de la fiche au moment où l'écran l'a chargée. */
  version: string;
};

export type InlineSaveResult =
  | {
      ok: true;
      /** Ce qu'il faut afficher désormais (un montant formaté, le libellé d'une liste) ; la valeur brute à défaut. */
      display?: string;
      /** La nouvelle version, pour que la modification suivante ne se croie pas périmée. */
      version: string;
    }
  | {
      ok: false;
      /** La phrase à montrer, déjà traduite par le serveur. */
      error: string;
      /**
       * La fiche a changé ailleurs : l'écran doit se recharger pour montrer
       * l'état réel avant toute nouvelle saisie.
       */
      stale?: boolean;
    };

/**
 * La fiche a-t-elle bougé depuis que l'écran l'a chargée ? Comparaison à la
 * milliseconde sur `updated_at`. Une version absente ou illisible est
 * traitée comme périmée : on ne devine pas.
 */
export function isStale(current: { updatedAt: Date }, version: string): boolean {
  const seen = Date.parse(version);
  return Number.isNaN(seen) || seen !== current.updatedAt.getTime();
}
