# Plan de construction — lots 1 à 4 (2026-09-17)

Ce document remplace l'audit complet C partie 2 pour ses ajouts (2.1, 2.2,
2.3, A bis) : il n'en garde que ce qui sert à construire. Les trois
inventaires qui le nourrissent (état d'affichage écran par écran, module
Partenaires et notions d'origine, benchmark sourcé des vues) sont
conservés dans le scratchpad de la session et résumés ici en faits.

Lecture des « lots 1 à 4 » : les quatre constructions désignées comme
prochaines après les correctifs — à confirmer avant le premier commit.

| Lot | Objet | Origine de la commande | Migration |
|---|---|---|---|
| 1 | État d'affichage mémorisé, période partagée, vues enregistrées, filtres, colonnes et densité | C partie 3, nouvelle étape 3 (« priorité de construction après les correctifs ») | oui |
| 2 | Origine et propriétaire d'un contact : « Apporté par », conseiller dès la création, import CSV, une seule notion d'origine | ajout 2.1 (conception rattachée à C partie 3 étape 5) | oui |
| 3 | **Constructeur de filtres** (étape 0), puis module Partenaires : liste en tableau chiffré, fiche en lecture, définitions uniques, « sans apport depuis N jours » | ajout 2.2 ; filtres commandés le 2026-09-18 | oui |
| 4 | Barre de navigation fine (Brevo), panneau, favoris, clavier, mobile | C partie 3, nouvelle étape 2 | oui (favoris, épingle) |

Ordre proposé : 1 → 2 → 3 → 4. Le lot 1 porte l'infrastructure de
préférences que 3 et 4 réutilisent ; le lot 2 pose l'apport partenaire dont
les chiffres du lot 3 dépendent ; le lot 4 dépend des jetons du chantier H
(voir §4).

**Arbitrage du 2026-09-18** — le constructeur de filtres, laissé de côté au
lot 1, ouvre le **lot 3** (§3.0) plutôt que le lot 4 : le lot 3 construit
justement une liste chiffrée avec tri, filtres, vues et colonnes, il lui
faut ce moteur de toute façon, et le poser d'abord le rend disponible du
même coup sur les contacts et les affaires. Le lot 4 (barre de navigation)
ne partage rien avec lui. Il arrive après le lot 2 : filtrer les contacts
par « apporté par » suppose que la colonne existe.

---

## 1. État d'affichage et vues enregistrées

### 1.1 Faits mesurés dans le code (inventaire du 2026-09-17)

- **Aucun choix d'affichage ne survit à un aller-retour de navigation** :
  filtres, tri, page, onglet, vue kanban/liste, période repartent à zéro
  dès qu'on quitte l'écran par la barre latérale — ses entrées sont des
  `href` nus (`navigation.ts:50-80`). Survivent seulement quatre cookies
  (thème, visite, premiers pas, organisation active du super admin) et
  deux clés de colonnes en `localStorage`
  (`clozado:colonnes:analytique-funnel-origines`,
  `clozado:colonnes:analytique-partenaires`, `column-chooser-table.tsx`).
- **Tout ce qui est un choix vit déjà dans l'URL** — c'est la bonne base :
  contacts (`q`, `conseiller`, `page`, `nouveau`), affaires (`vue`,
  `pipeline`, `etape`, `conseiller`, `tri`, `dir`, `page`, la sélection
  analytique `cohorte`/`atteint`/`jusqua`/`issue`/`motif`/`depuis`),
  tâches (`conseiller`, `page`, `tache`), emails reçus (`onglet`, `page`),
  règles/journal (`regle`, `resultat`), analytique (`periode`, `du`, `au`,
  `conseiller`, `type`, `pipeline`, `origine`), réglages (ancre).
- **Deux périodes par défaut incohérentes** : `90j` sur le tableau de bord
  (`DASHBOARD_PERIOD`, `packs.ts:145`), `tout` en analytique
  (`DEFAULT_PERIOD`, `search-params.ts:35`) ; le contrôle segmenté du
  tableau de bord écrase tout autre paramètre ; seul le lien « Tout
  l'analytique » propage la période, la barre latérale non ; Partenaires
  n'a pas de période.
- **Aucune table de préférences, aucun mécanisme de vues** (grep
  `saved_views|user_preferences` : documentation seulement). Ni densité,
  ni regroupement, ni taille de page (constantes 50/50/50/25/50).
- **Ni densité ni groupement** ne sont des choix ; les ~46 `<details>` ne
  persistent jamais leur état (c'est voulu : ouverture dérivée des données
  ou de `?nouveau=1`).
- Anomalies à corriger au passage : `/cibles/[id]` perd `q` en paginant ;
  « Premiers pas » masqués sans geste pour les remontrer.

### 1.2 Ce que font les autres (sources dans le rapport conservé)

- Linear : les filtres principaux sont dans l'URL, les options d'affichage
  sont mémorisées **par personne** et survivent à la navigation ; « Set as
  default » impose un défaut au workspace, chacun le surcharge ; vues
  privées ou partagées ; vues fournies « All / Active / Backlog », « My
  issues » ; page d'accueil = vue favorite.
- HubSpot : une vue est **privée par défaut**, partageable (Team /
  Everyone), 50 vues par utilisateur, modification réservée au créateur et
  au Super Admin ; onglets épinglés par personne ; filtres non enregistrés
  perdus au rafraîchissement ; « Standard views » fournies (« My contacts »,
  « New deals this month ») ; un utilisateur limité à ses fiches ne voit
  que les siennes même dans une vue partagée.
- Pipedrive : filtres privés (invisibles même aux admins) ou partagés,
  colonnes enregistrées avec le filtre.
- Notion : identifiant de vue dans l'URL (`?v=`), filtres « pour moi »
  sans enregistrer.
- Attio : filtres éphémères par personne, vue enregistrée « pour tous ».

Ce qu'on retient : URL pour tout ce qui se partage, compte pour ce qui se
mémorise, vue privée par défaut, partage réservé à l'admin (plus strict que
HubSpot, conforme au brief), vues fournies modifiables et masquables.

### 1.3 Modèle de données (migration 0021, STOP avant application)

| Table | Colonnes | Rôle |
|---|---|---|
| `user_preferences` | `user_id`, `organization_id`, `key` (texte), `value` (jsonb), `updated_at` ; clé primaire (`user_id`, `organization_id`, `key`) ; FK composites vers `users` et `organizations` | l'état d'affichage par personne ET par organisation : `periode` (globale), `ecran:<écran>` (le dernier état d'un écran : ses paramètres d'URL), `vue-par-defaut:<écran>`, `colonnes:<tableau>`, `densite`, plus tard `favoris`/`epingle` (lot 4) |
| `saved_views` | `id`, `organization_id`, `owner_user_id`, `screen` (contacts, affaires, partenaires, taches, newsletters, emails-recus, veille), `name`, `definition` (jsonb : filtres, colonnes et ordre, tri, groupement, densité, période), `shared` (bool, admin seulement), `position`, `created_at`, `updated_at` ; FK composite `(owner_user_id, organization_id)` | les vues nommées ; les vues fournies d'origine sont des lignes semées par organisation (`owner_user_id` NULL, `shared` vrai), modifiables et masquables (`hidden_view_ids` dans `user_preferences`) |

Isolation : `organization_id` partout, lecture par `orgScope`, écriture
sur l'organisation effective seulement ; une vue partagée d'un member ne
lui montre jamais plus que son rôle (les filtres sont rejoués côté serveur
dans les requêtes existantes, jamais des identifiants de fiches figés).

### 1.4 Étapes et preuves

1. **Trois niveaux de mémoire** : chaque écran écrit son état dans
   `user_preferences` (action serveur `rememberScreenState`, appelée à la
   navigation, débouncée) ; les entrées de `NAVIGATION` deviennent des
   liens vers le dernier état de l'écran (lus côté serveur dans la
   coquille : une lecture, mémoïsée par requête) ; « Réinitialiser
   l'affichage » par écran et global. Preuve : période « Depuis le début »
   choisie → Contacts → retour : toujours « Depuis le début » ; idem après
   rechargement et depuis un autre navigateur (session forgée neuve) ; URL
   copiée en fenêtre privée après connexion → écran identique.
2. **Période partagée** : un seul paramètre `periode` (30j, 90j, 12m, tout,
   plage personnalisée `du`/`au`), un seul défaut (`90j`), un seul
   composant de choix affiché en permanence sur tableau de bord,
   analytique et partenaires ; mémorisé dans `user_preferences.periode`.
3. **Vues enregistrées** : menu « Vues » sur chaque liste ; créer,
   renommer, dupliquer, supprimer ; personnelle par défaut, « partager à
   l'équipe » réservé à l'admin ; vue d'accueil par module et par
   personne ; URL `?vue=<id>` partageable ; vues fournies (« Mes
   contacts », « Mes affaires en cours », « Sans activité », « Signées ce
   mois », « Partenaires actifs »). Preuve : vue partagée par l'admin
   visible chez Thomas, vue personnelle non ; URL d'une vue chez un member
   → rien de plus que son rôle (`scripts/test-isolation.ts` étendu).
4. **Filtres** : combinables sur les champs du modèle (opérateurs par
   type), filtres rapides « moi », période, étape, statut ; compte de
   résultats et pastilles retirables. Réutilise `parseDealSelection`,
   `parseMetricFilters` et le moteur de critères des cibles.
5. **Colonnes et densité** : `ColumnChooserTable` passe de `localStorage`
   à `user_preferences` ; colonne figée ; densité confortable/compacte.
6. Non-régression de rapidité : les mesures du chantier C rejouées
   (`scripts/_tmp-p4-mesures.ts`, 10 passes) avant et après.

### 1.5 Ce qui a été construit (2026-09-18)

Migration **0021** appliquée en local puis en production : `user_preferences`
(clé primaire personne × organisation × clé, valeur `jsonb`, contrainte de
forme sur la clé) et `saved_views` (propriétaire nullable = vue fournie
matérialisée, `shared`, `screen` borné, `definition` `jsonb`). La clé
étrangère composite vers `users` annoncée en §1.3 n'existe pas : `users`
n'a pas d'unicité sur (`id`, `organization_id`) — c'est déjà la convention
de `contacts.owner_id`. L'appartenance est tenue par la requête, qui filtre
sur l'organisation effective.

- **Le registre des écrans** (`src/lib/display/screens.ts`) déclare, pour
  chacun, la LISTE BLANCHE de ses paramètres : rien d'autre n'est jamais
  mémorisé ni enregistré dans une vue. `erreur`, `info`, `nouveau`,
  `tache`, `contact` en sont exclus par construction.
- **Trois niveaux de mémoire** : l'adresse reste la vérité ; le compte
  garde le dernier état de chaque écran (`RememberDisplay`, une action
  serveur débouncée après la navigation, jamais pendant le rendu) ; les
  entrées de navigation mènent à l'écran tel qu'on l'a laissé (une seule
  lecture dans la coquille, mémoïsée par requête).
- **Période partagée** : un seul défaut (`90j`, `DEFAULT_PERIOD`), un seul
  composant (`PeriodPicker`) sur le tableau de bord et l'analytique,
  `DASHBOARD_PERIOD` supprimé. Nouveau préréglage « Ce mois-ci » (mois
  calendaire du fuseau de l'organisation). La mémoire de période n'est
  jamais effacée par une adresse muette — seulement écrasée par un choix.
- **Vues enregistrées** sur contacts, affaires, tâches et partenaires :
  menu unique, créer, renommer, mettre à jour, dupliquer, supprimer,
  partager (admin seulement), vue d'accueil par module, `?v=<id>`
  partageable. Les cinq vues fournies vivent en CODE (aucun semis à
  rattraper) ; une modification par l'admin crée la ligne qui les éclipse.
  `conseiller=moi` est résolu pour qui regarde : une vue partagée dit
  « les miens » à chacun et ne fait fuiter aucun identifiant.
- **Filtres** : filtres rapides (moi, personnes/sociétés, sans activité,
  actifs/inactifs), pastilles retirables, compte de résultats, tri par nom,
  création ou activité sur les contacts.
- **Colonnes et densité** : `ColumnChooserTable` écrit dans le compte (le
  navigateur reste le refuge de qui n'a pas d'organisation) ; densité
  confortable ou compacte sur les listes.
- **Réinitialiser l'affichage** : par écran (menu « Vues ») et global (menu
  de compte) — les vues enregistrées survivent.

**Preuves** : `scripts/_tmp-lot1-preuve.ts`, 30 contrôles au vert dans
Chromium sur la base locale (mémoire par écran, autre navigateur, période
partagée et cloisonnée par personne, vue personnelle invisible chez Thomas
puis visible une fois partagée, member qui ne peut ni partager ni
supprimer, densité, colonnes en base, réinitialisation) ; huit contrôles
d'isolation de plus dans `scripts/test-isolation.ts` ; 252 tests unitaires.

**Rapidité** : premier octet médian sur douze passes, un seul serveur à la
fois, base locale — `+8 %` au total (de `+4 %` sur le tableau de bord à
`+17 %` sur contacts et partenaires). La cause est structurelle et connue :
une lecture de préférences dans la coquille, une lecture de vues sur les
listes, toutes deux CONCURRENTES du reste. Un aller-retour coûte ~100 ms
par le proxy HTTP local contre 1 à 3 ms entre `fra1` et Neon
`eu-central-1` : le coût attendu en production est de quelques
millisecondes, à confirmer sur la production.

**Ce qui reste du lot 1, et où c'est parti** (arbitrage du 2026-09-18) :

| Manque | Destination |
|---|---|
| Constructeur de filtres générique (opérateurs par type, §1.4 point 4) | **lot 3, étape 0** — voir §3.0 |
| Période sur les partenaires (sans objet tant que la liste n'a aucun chiffre daté) | **lot 3**, avec les chiffres |
| Ordre des vues (`position` en base, pas réglable à l'écran) | **plus tard**, non planifié |

Effort : L. Dépend de : rien d'autre (les préférences sont le socle des
lots 3 et 4).

---

## 2. Origine et propriétaire d'un contact

### 2.0 Correction du lot 1 : la vue par défaut se désigne depuis la vue ouverte (2026-09-18)

Demandé après la validation du lot 1. Ne dépend d'aucune colonne nouvelle,
donc traité en premier, pendant que la migration 0022 attend.

**Ce qui existait déjà** : le réglage est bien par personne ET par module
(`user_preferences`, clé `vue-par-defaut:<écran>`), il se pose depuis le
menu de la vue ouverte, il vaut pour les vues fournies, et une vue
partagée par l'admin peut être choisie comme défaut par chacun sans rien
imposer aux autres.

**Ce qui manquait, et qui change** :

1. **La priorité était inversée.** L'entrée de navigation menait au
   DERNIER état de l'écran, et la vue par défaut ne servait que s'il n'y
   avait rien de mémorisé. « Elle s'ouvrira à chaque arrivée sur ce
   module » veut dire l'inverse : la vue par défaut gagne. Choix durable
   et explicite contre souvenir implicite — l'explicite l'emporte. La
   mémoire d'écran du lot 1 continue de servir partout où aucune vue par
   défaut n'est posée.
2. **Les mots.** « Ouvrir ce module sur cette vue » devient « Définir
   comme vue par défaut » ; « Ne plus ouvrir par défaut » devient
   « Retirer par défaut ».
3. **La liste des vues le dit en clair**, pas seulement par une icône.
4. **« Retirer par défaut » rend l'affichage d'origine du module** : le
   réglage ET le dernier état mémorisé de cet écran sont retirés, sinon
   on retomberait sur le souvenir d'hier plutôt que sur l'écran nu.

**Preuve attendue** (celle demandée) : une vue par défaut posée sur les
contacts, quitter le module, y revenir, elle s'ouvre ; idem après
rechargement et depuis un autre navigateur ; chez Thomas, rien n'a bougé.

### 2.1 Faits

- Trois notions coexistent sans se toucher :
  `contacts.source` (enum technique `manual|import|external|lead`, jamais
  affichée, sert au ciblage) ; `origins` ← `leads.origin_id` ←
  `deals.lead_id` (l'origine métier, la seule que l'analytique pilote) ;
  `deal_shares.partner_id` (l'apport **sortant** : un partenaire reçoit
  une affaire, jamais « un partenaire a apporté ce contact »).
- Le formulaire de création propose déjà le conseiller (`ownerId`,
  responsable par défaut corrigé le 2026-09-17) ; aucun « apporté par »,
  aucune origine. L'import CSV n'accepte ni conseiller, ni partenaire, ni
  origine (`owner_id` reste NULL, `source` = `import`). La page de partage
  PRM ne pose aucune origine.

### 2.2 Une seule notion — proposition de fusion

- **Origine** = une ligne de `origins` (déjà par organisation, éditable),
  portée par le contact : `contacts.origin_id` (FK composite). Un lead qui
  crée ou rattache un contact y copie son `origin_id` ; une affaire sans
  origine hérite de celle de son contact (`deals.lead_id` reste la trace
  fine, l'analytique lit l'une ou l'autre par une seule fonction). Les
  formulaires publics (G) et la page de rendez-vous alimentent ce même
  champ. `contacts.source` reste technique et n'est jamais montré.
- **Apporté par** = `contacts.partner_id` (FK composite vers `partners`),
  facultatif, avec `contacts.partner_attributed_at` ; l'attribution après
  coup est datée et journalisée (`activities` de type `origin_changed`,
  comme les affaires). Une origine « Partenaire » dans `origins` n'est pas
  nécessaire : l'apport est un lien, pas un libellé.
- **Conseiller** : `contacts.owner_id` existe ; ajouter
  `contacts.owner_assigned_at` (conservation de la date d'attribution,
  demandée) et l'afficher.

Migration 0022 : `contacts.origin_id`, `contacts.partner_id`,
`contacts.partner_attributed_at`, `contacts.owner_assigned_at` (+ index).

### 2.3 Étapes et preuves

1. Création : liste « Apporté par » avec recherche parmi les partenaires
   actifs, création rapide d'un partenaire sans quitter le formulaire ;
   « Conseiller attribué » visible dès la création, pré-rempli, sélecteur
   seulement à plusieurs ; liste « Origine ».
2. Fiche : les trois champs modifiables, dates d'attribution visibles.
3. Import CSV : trois colonnes de plus (conseiller par email, partenaire
   par nom, origine par libellé), rapprochées et rejetées avec motif.
4. Leads et PRM : un lead alimente `origin_id` ; un partage PRM n'y touche
   pas (l'apport reste un lien explicite).
5. Preuves : un contact créé avec apporteur et conseiller ; un import de
   trois lignes avec les trois colonnes ; l'analytique des origines
   inchangée sur la démo (mêmes chiffres avant/après, requêtes rejouées).

Effort : M. Dépend de : rien ; le lot 3 en dépend.

---

## 3. Constructeur de filtres, puis module Partenaires

### 3.0 Constructeur de filtres (étape 0, commandé le 2026-09-18)

Le manque retenu du lot 1. Une personne doit pouvoir écrire, sans
l'écrire : « montant supérieur à 200 000 ET étape égale à Négociation ET
conseiller égal à moi ». Aujourd'hui, seuls les filtres rapides nommés au
brief existent ; tout le reste demande une URL forgée à la main.

**Ce qui est demandé**

- Filtres combinables sur les champs du modèle **et sur les champs
  personnalisés**.
- Opérateurs selon le TYPE du champ :

  | Type | Opérateurs |
  |---|---|
  | Texte | contient, commence par, est, est vide |
  | Nombre et montant | supérieur, inférieur, entre |
  | Date | avant, après, entre, dans les N derniers jours |
  | Liste | est, n'est pas, fait partie de |
  | Booléen | vrai, faux |

- Combinaison **ET par défaut** ; le **OU** si on sait le rendre lisible —
  sinon on s'en passe et on le dit.
- Filtres actifs affichés et retirables un à un (les pastilles du lot 1,
  étendues), nombre de résultats visible.
- Une vue enregistrée porte ces filtres comme elle porte le reste : ils
  entrent dans `saved_views.definition`, sous la même liste blanche.

**Ce qu'il faut regarder avant de coder**

- **Les champs personnalisés n'existent pas** dans le produit : aucune
  table, aucune colonne (vérifié le 2026-09-18 sur `src/db/schema`). Ce
  qui s'en approche : les étiquettes de contact (`contact_tags`,
  `contact_tag_assignments`) et les « chiffres vérifiés »
  (`verified_figures`). Deux routes possibles, à trancher avec
  l'utilisateur : (a) le constructeur ne couvre d'abord que les champs du
  modèle et les étiquettes, les champs personnalisés arrivant avec leur
  propre construction ; (b) on construit les champs personnalisés dans le
  même lot, ce qui l'allonge nettement (définition par organisation,
  valeurs par fiche, saisie, import, migration dédiée).
- L'adresse reste la vérité (lot 1) : un jeu de filtres doit s'écrire dans
  l'URL sans devenir illisible, et rester dans la liste blanche de
  l'écran. C'est le point de conception principal — un paramètre par
  filtre ne tient pas, un JSON encodé dans l'URL se partage mal. Proposer
  la forme avant de coder.
- Réutiliser ce qui existe plutôt que d'inventer : `parseMetricFilters`,
  `parseDealSelection`, et surtout le **moteur de critères des cibles**
  (`src/lib/targets`), qui sait déjà composer des conditions typées.
- La sécurité ne bouge pas : les filtres sont rejoués côté serveur dans
  les requêtes existantes, sous `orgScope`, jamais des identifiants de
  fiches figés.

**Preuves attendues** : l'exemple de l'utilisateur construit à l'écran et
rendant le bon nombre de lignes, recalculé par requête à la main ; chaque
type d'opérateur exercé une fois ; un jeu de filtres enregistré en vue,
rouvert dans une fenêtre neuve, identique ; un member qui ouvre une vue
filtrée ne voit rien de plus que son rôle.

Effort : M à L selon la route retenue pour les champs personnalisés.
Dépend de : lot 1 (vues, pastilles, liste blanche) et lot 2 (pour filtrer
sur l'apporteur).

### 3.1 Faits

- `partners` : nom, société, métier (texte libre), email, téléphone,
  notes, actif. Pas de conseiller responsable, pas de type structuré, pas
  de date de dernier apport. Lié au produit par `deal_shares` seulement
  (partages, commissions, événements) ; aucun lien vers contacts ni leads.
- La liste est un répertoire sans chiffre, ni filtre, ni tri ; la fiche
  s'ouvre sur son formulaire d'édition, suivi des affaires partagées ;
  commissions, tâches, journal et indicateurs n'y sont pas — ils vivent
  sur `/analytique/partenaires` (partages, acceptés, refusés, sans
  réponse, taux d'acceptation, délai, gagnées, transformation, commissions
  acquises et prévues, encours, vieillissement).
- Les définitions existent déjà en code et en messages
  (`definitions.partner_*`) : un partage = une chaîne de renvois, l'issue
  du dernier lien ; acceptation = acceptés / envoyés ; transformation =
  gagnées / acceptés ; commissions acquises = confirmées + réglées.
- Aucune règle « sans apport depuis N jours » : les seuils
  d'organisation portent sur les partages et les commissions.

### 3.2 Modèle (migration 0023)

- `partners.owner_id` (conseiller responsable de la relation, FK
  composite), `partners.profession` reste libre mais suggéré parmi les
  valeurs existantes.
- `organizations.partner_stale_days` (N, défaut 60) ; règle automatique
  `partner_stale` dans `generateAutoTasks` : un partenaire actif sans
  apport (aucun `contacts.partner_id` daté ni partage) depuis N jours
  remonte dans « Aujourd'hui » comme les autres tâches automatiques —
  aucune nouvelle formule.
- Un journal de partenaire : `activities.partner_id` (FK composite,
  nullable) pour consigner un échange avec un partenaire depuis sa fiche.

### 3.3 Définitions uniques, affichées dans l'interface

| Indicateur | Définition |
|---|---|
| Contacts apportés | contacts non supprimés dont `partner_id` est ce partenaire ; l'apport est attribué à la date `partner_attributed_at` (la création, ou l'attribution après coup) |
| Affaires en cours / gagnées | affaires des contacts apportés, par issue du statut courant (sans issue = en cours) |
| Montant gagné | somme des montants estimés des affaires gagnées des contacts apportés, dans la période |
| Taux de transformation | affaires gagnées / contacts apportés, sur les contacts apportés dans la période ; masqué sous 5 contacts |
| Dernier apport | date la plus récente de `partner_attributed_at` |
| Dernier échange | date la plus récente d'une activité portant `partner_id` ou d'un événement de partage |
| Statut | actif / inactif ; « sans apport depuis N jours » = actif et dernier apport plus vieux que N |

Une origine renseignée après coup compte à sa date d'attribution, jamais
rétroactivement : les chiffres d'une période ne changent pas quand on
corrige le passé (même règle que les leads).

### 3.4 Étapes et preuves

1. Liste : le tableau partagé (lot 1) avec ces colonnes, tri, filtres,
   vues, choix de colonnes ; vue par métier et par conseiller ; totaux en
   tête (part du business issue des partenaires, évolution sur la période,
   actifs, sans apport depuis N jours).
2. Fiche : lecture d'abord, « Modifier » ; indicateurs et historique ;
   contacts apportés, affaires issues, partages PRM, échanges, tâches ;
   actions : créer un contact rattaché, créer une tâche, écrire, partager
   une affaire.
3. Définitions affichées (composant de définition existant).
4. Preuves : sur la démo, trois partenaires avec apports semés ; chaque
   chiffre recalculé à la main par requête ; la règle N jours produit une
   tâche dans « Aujourd'hui » et une seule.

Effort : L. Dépend de : lots 1 et 2.

---

## 4. Barre de navigation

Faits : 5 sections, 19 entrées, barre `w-64` fixe sans repli ni favoris
(inventaire A.2 de l'audit) ; le nom de l'organisation est rendu par
l'en-tête, la barre et le bandeau super admin.

Étapes (brief du 2026-09-17) : barre fine < 64 px à une icône par groupe
avec badges ; panneau au survol différé et au clic, épingle mémorisée
(`user_preferences`) ; favoris épinglés ; clavier et ARIA ; tactile sans
survol ; nom de l'organisation une fois ; bandeau super admin compact.

Décisions à prendre avant de coder : la forme mobile (proposition :
garder la barre inférieure existante — Accueil, Contacts, Affaires,
Tâches, Menu — jugée saine par l'audit, et faire du « Menu » le panneau
plein écran par groupes ; justification : un pouce atteint la barre du
bas, pas une barre latérale) ; et l'ordre par rapport au chantier H : si
ce lot se construit avant les jetons de H, la reprise visuelle est
prévue (une passe de jetons, aucune structure à refaire).

Preuves : largeur récupérée mesurée avant/après et colonnes visibles en
plus sur Partenaires à 1366 px ; hauteur avant la première donnée sur
Contacts, Affaires, Tableau de bord ; clics par module avec et sans
favori ; parcours clavier ; mobile sans élément coupé ; rapidité
inchangée.

Effort : M. Dépend de : lot 1 (préférences) ; jetons de H souhaitables.

---

## 5. Points d'arrêt

- Avant chaque migration (0021, 0022, 0023) : le SQL proposé, appliqué en
  local, la preuve locale, puis STOP.
- Avant toute dépendance : aucune prévue dans ces quatre lots.
- Avant le lot 4 : la forme mobile et l'ordre vis-à-vis de H.
