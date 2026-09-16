# Décisions du chantier B — « Aujourd'hui »

Le registre des quatorze décisions que le chantier B attend (elles viennent
de `docs/plan-stabilisation.md` §7 ; la migration 0019 ne sera rédigée
qu'après). Une ligne par décision : ce qu'elle change pour la personne qui
utilise le produit, ce qu'elle coûte, la recommandation, et ta réponse.
Tant qu'une réponse manque, la recommandation N'EST PAS appliquée — rien
n'est construit dessus.

État au 2026-09-16 : **aucune réponse reçue** ; le chantier B ne démarre
qu'après (ordre de travail du 2026-09-16 : après le chantier C partie 1 et
les quatre audits, un ordre global B, C, D, E, F est proposé et validé
avant toute construction).

| # | Décision | Ce que ça change à l'écran | Recommandation | Effort | Migration | Ta réponse |
|---|---|---|---|---|---|---|
| V1 | Supprimer `/suivi` (écran, entrée du menu, badge) au profit des cartes d'« Aujourd'hui » | Une entrée de menu en moins ; les partages sans réponse, les commissions à encaisser et les affaires sans suite vivent dans « Aujourd'hui » | oui | S | non | |
| V2 | Supprimer les quatre tuiles d'urgence et la liste « À traiter en priorité » du tableau de bord | Le tableau de bord devient « Aujourd'hui » : une liste, pas des tuiles qui comptent deux fois la même situation | oui | S | non | |
| V3 | Supprimer `generateAutoTasks` et les trois règles de tâches automatiques ; FERMER (pas supprimer) les tâches automatiques encore ouvertes | Plus de tâches « En retard » créées par le produit ; les anciennes restent lisibles dans « Achevées » | oui — fermer plutôt que supprimer | S | oui (fermeture par la migration) | |
| V4 | Retirer le badge « Tâches » ; un seul badge, sur « Aujourd'hui » | Un seul compteur dans le menu | oui | S | non | |
| V5 | Supprimer le déclencheur de règle `share_unanswered` (règles existantes désactivées par la migration, journalisées) | Une option de moins dans le formulaire de règle ; « Aujourd'hui » porte déjà le cas | oui | S | oui (désactivation) | |
| V6 | Remplacer les trois seuils de partage par `sans_nouvelles_days` (défaut 10 jours, réglable) ; garder `share_expiring_soon_days` et `commission_unpaid_days` | Une seule notion de « sans nouvelles », un seul réglage | oui ; 10 vient de l'exemple du cahier de la File | M | oui (colonne) | |
| V7 | Les clics d'email ne sont plus des « nouvelles » | La tuile « Dernière interaction » change de valeur pour certains contacts : un clic n'est pas une réponse | oui | S | non | |
| V8 | Le filtre « moi » par défaut sur « Aujourd'hui », « Toute l'équipe » en option pour l'admin | Chacun voit d'abord ce qui l'attend, lui | oui | S | non | |
| V9 | PRM désactivé par défaut pour tout nouvel espace ; activé par la migration pour les espaces qui ont déjà un partenaire ou un partage | Un espace neuf ne voit ni Partenaires ni Partages tant qu'il ne les active pas | oui | M | oui (`organizations.prm_enabled` + remplissage) | |
| V10 | Un espace neuf sans PRM est semé sans l'étape « Partagée » | Un pipeline à une étape de moins pour qui ne partage pas | oui | S | non | |
| V11 | Semer quatre motifs de perte par défaut, dans la langue de l'organisation, pour toute organisation qui n'en a aucun (proposition : « Taux ou conditions concurrents », « Projet abandonné ou reporté », « Sans réponse », « Hors critères ») | « Perdue » propose des motifs dès le premier jour | oui ; libellés à ta main | S | oui (semis) | |
| V12 | Réécrire la phrase d'accueil « Clozado n'est pas un CRM » et la métadonnée « assistance marketing » | Deux phrases publiques | à toi : c'est le discours de vente | S | non | |
| V13 | La visite guidée ne se lance plus seule ; premiers pas réordonnés (contacts, affaire, adresse postale, marque…) | La première semaine commence par le CRM, pas par la marque | oui | S | non | |
| V14 | Sur `/taches`, `/contacts` et la liste des affaires, le filtre par conseiller vaut la personne connectée par défaut (organisation à plusieurs), « Tout le monde » à un clic, mémorisé | Chacun voit d'abord ses fiches et ses tâches | oui | S | non (mémorisation par cookie ; en base si les préférences d'affichage du chantier C arrivent avant) | |

## Ce qui dépend d'une réponse

- La migration 0019 (`docs/plan-stabilisation.md` §6, chantier B, étape 2)
  contient V3, V5, V6, V9 et V11 : elle n'est rédigée qu'une fois ces cinq
  lignes répondues.
- L'écran « Aujourd'hui » (§2.2) dépend de V1, V2, V4, V7, V8.
- V12 et V13 sont indépendantes et peuvent se faire à part.

## Ce qui ne dépend d'aucune réponse

Le mobile (§5 : appeler et écrire en un geste depuis la fiche, le kanban au
doigt) — première étape du chantier B, sans migration.
