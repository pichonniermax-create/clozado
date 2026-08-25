# Module analytique et funnel — notes de chantier

Même rôle que `docs/module-prm.md` et `docs/module-relationnel.md`. Ce
document commence par l'audit demandé avant toute construction (étape 1 de
l'ordre de travail) : ce qui est réellement journalisé aujourd'hui, ce qui
manque, et ce qu'il faudra corriger AVANT de calculer quoi que ce soit —
un événement non enregistré au bon moment est définitivement perdu.

État des lieux au commit `35527d6`, base de production interrogée le
2026-08-24 (2 organisations, 1 affaire, 1 partage, 1 commission, 1 tâche,
0 contact, 0 interaction, 0 passage d'étape).

---

## 1. Ce qui est journalisé aujourd'hui, et comment

Légende des colonnes : **où** (table), **quand** (horodatage disponible),
**qui** (acteur), **écrit par** (point d'écriture dans le code),
**depuis** (le commit à partir duquel l'événement existe — avant, rien).

### Affaires et pipeline

| Événement | Où | Quand | Qui | Écrit par | Depuis |
|---|---|---|---|---|---|
| Création d'affaire | `deals.created_at` | oui | `created_by` | `queries/deals.ts` createDeal | toujours |
| Création d'affaire (journal) | `deal_events` type `deal_created` | oui | user | idem | PRM (`0005`) |
| **Passage d'étape** (structuré, avant → après) | `deal_stage_changes` | `changed_at` | user OU partenaire | createDeal (ligne initiale, from NULL), changeDealStage (kanban, fiche), route publique (partenaire) | étape 4 du module relationnel (`f1d1914`) |
| Passage d'étape (texte) | `deal_events` type `status_changed` | oui | user / partenaire | changeDealStage, route publique | PRM |
| Motif de perte | `deals.loss_reason_id` — **valeur courante seulement** | non (pas d'horodatage propre) | — | changeDealStage (vers une étape perdue), updateDealDetails | étape 4 |
| Montant, probabilité, clôture prévue, responsable | `deals.*` — valeur courante | non | — | updateDealDetails | étape 4 |
| Changement de pipeline | n'existe pas (geste jamais construit) | — | — | — | — |
| Gagné / perdu | dérivé : passage vers une étape dont `outcome` = `won` / `lost` | via `changed_at` | via la ligne d'étape | — | étape 4 |

Point important : les marqueurs gagné/perdu sont **configurables par
organisation** (`deal_statuses.outcome`). Les deux organisations existantes
ont bien « Acceptée » = gagné et « Perdue » = perdu (seedé), mais une
organisation qui retirerait ses marqueurs n'aurait plus ni signature ni
perte mesurables — à dire dans l'état « pas encore assez de données ».

### Partages (PRM)

| Événement | Où | Quand | Qui | Écrit par | Depuis |
|---|---|---|---|---|---|
| Envoi | `deal_shares.sent_at` + `deal_events` `share_sent` | oui | user | `queries/deal-shares.ts` createDealShare | PRM |
| **Consultation par le partenaire** | `deal_events` `share_viewed` — **jamais écrit** | — | — | personne : la route publique GET ne journalise rien | — |
| Acceptation / refus | `deal_shares.responded_at` + `status` + `deal_events` `share_accepted` / `share_declined` (motif de refus dans `message`) | oui | partenaire | `queries/deal-shares-public.ts` applyPublicShareAction | PRM |
| Révocation | `deal_shares.revoked_at` + `deal_events` `share_revoked` | oui | user (acteur depuis l'étape 6) | revokeDealShare | PRM |
| Renvoi du lien | révocation + **nouveau** partage — **aucun lien entre les deux lignes** | oui | user | reissueDealShare | PRM |
| Expiration | `deal_shares.expires_at` (fixé à l'envoi) ; `deal_events` `share_expired` seulement quand quelqu'un ouvre un lien expiré | dérivable | — | checkAccessible | PRM |
| Commentaire du partenaire | `deal_events` `commented` | oui | partenaire | route publique | PRM |
| Changement d'étape par le partenaire | `deal_stage_changes` + `deal_events` | oui | partenaire | route publique | étape 4 |

### Commissions

| Événement | Où | Quand | Qui | Écrit par | Depuis |
|---|---|---|---|---|---|
| Création (prévue) | `commissions.created_at` | oui | (le partage) | createDealShare | PRM |
| **Confirmation** | `commissions.state` + `updated_at` ; `deal_events` `commission_updated` avec le message « Commission confirmée. » | **approximé** par `updated_at` | user | `queries/commissions.ts` confirmCommission | PRM |
| **Règlement** | `commissions.state` + `updated_at` ; `deal_events` message « Commission marquée réglée. » | **approximé** | user | markCommissionSettled | PRM |

`updated_at` écrase la date de confirmation dès que la commission est
modifiée à nouveau (le règlement, par exemple) : le délai confirmée →
réglée n'est aujourd'hui **pas calculable** proprement — l'écran de suivi
le documente déjà comme une approximation.

### Tâches

| Événement | Où | Quand | Qui | Écrit par | Depuis |
|---|---|---|---|---|---|
| Création (manuelle ou générée) | `tasks.created_at`, `auto_rule`, source | oui | `created_by` (NULL pour une générée) | createTask, generateAutoTasks | étape 5 |
| Achèvement | `tasks.completed_at` | oui | **personne** (pas de `completed_by`) | completeTask | étape 5 |
| Réouverture | `completed_at` remis à NULL — **l'achèvement précédent est effacé** | — | — | reopenTask | étape 5 |

### Contacts et interactions

| Événement | Où | Quand | Qui | Écrit par | Depuis |
|---|---|---|---|---|---|
| Création de contact | `contacts.created_at`, `source` (`manual` / `import` / `external`) | oui | `created_by` | createContact, importContacts | étape 3 |
| Interaction (appel, email, rendez-vous, note) | `activities.occurred_at` (date réelle, antidatable) + `created_at` | oui | `created_by` | createActivity | étape 6 |
| Suppression (tombale), fusion | `contacts.deleted_at`, `contact_access_log` | oui | user | deleteContact, mergeContacts | étape 3 |
| Attribution à un conseiller | `contacts.owner_id`, `deals.owner_id` — **valeur courante** | non | — | update | étape 3-4 |

### Arrivées de leads, visites, simulations

**Rien.** Le produit n'a aujourd'hui :

- aucune notion de lead (pas de table, pas de statut, pas d'écran) ;
- aucun simulateur, aucune page publique de capture, aucune API ou webhook
  d'entrée — un contact ne peut naître que par saisie manuelle ou import CSV
  (`source` = `manual` | `import` ; `external` est prévu pour une future
  synchro CRM, jamais utilisé) ;
- aucun champ d'origine : ni simulateur, ni page, ni source/medium/campagne
  (UTM), ni identifiant de visiteur — sur les contacts comme sur les
  affaires ;
- aucun événement de visite, de simulation démarrée ou terminée.

Le funnel d'acquisition (visite → simulation démarrée → terminée → lead →
contact) n'a donc **aucune donnée source**, et rien ne relie une affaire à
une origine. C'est le manque structurant de ce chantier.

### Ce qu'on a vérifié en base (pas en relisant le code)

- 1 affaire, antérieure à l'étape 4 : **aucune ligne d'étape**, aucun
  événement de création — ses durées par étape partiraient de son premier
  déplacement, sa date de création n'est connue que par `deals.created_at`.
- 1 partage en attente, `responded_at` NULL, 0 événement de réponse et
  0 événement de consultation (cohérent : jamais écrit).
- 1 commission `prevue`, 0 événement `commission_updated`.
- `deal_events` : **aucun index** hors clé primaire ; `deal_shares` :
  aucun index de lecture (seul le hash du jeton) ; `commissions` : aucun ;
  `deal_stage_changes` : (organisation, affaire, date) seulement — rien par
  étape ; `contacts` et `deals` : rien par date de création.

---

## 2. Les manques, précisément

Classés par ce qu'ils empêchent de mesurer. **S** = schéma (migration à
montrer et à faire valider), **C** = code seulement, **D** = données
(rattrapage idempotent).

| # | Manque | Empêche | Correction proposée | Type |
|---|---|---|---|---|
| 1 | `share_viewed` jamais écrit | délai envoi → consultation, taux de partages jamais ouverts | journaliser la **première** consultation (route publique GET), dédupliquée par partage | C |
| 2 | Renvoi de lien = deux partages sans lien | taux d'acceptation par partenaire faussé (le partage remplacé compte comme sans réponse), délai de réponse compté depuis le mauvais envoi | `deal_shares.replaces_share_id` (FK composite, posée par reissueDealShare) ; les métriques prennent la chaîne comme UN partage, envoyé à la date du premier | S |
| 3 | Confirmation et règlement de commission non horodatés | délai confirmée → réglée, vieillissement des commissions | `commissions.confirmed_at`, `commissions.settled_at` ; rattrapage depuis `deal_events` (messages fixes « Commission confirmée. » / « marquée réglée. »), sinon `updated_at` ; le suivi et la génération de tâches abandonnent l'approximation | S + D |
| 4 | Motif de perte non historisé (valeur courante, effacée si l'affaire ressort de l'étape perdue) | répartition des pertes par motif **à la date de la perte** | `deal_stage_changes.loss_reason_id` posé au passage vers une étape perdue, mis à jour si le motif est corrigé tant que l'affaire y est | S |
| 5 | Affaires d'avant l'étape 4 sans ligne d'étape initiale (1 en production) | durée de la première étape, délai création → signature pour ces affaires | rattrapage idempotent : ligne `from NULL → étape courante` à `deals.created_at`, acteur `created_by` — l'historique intermédiaire est perdu, assumé | D |
| 6 | Achèvement de tâche sans auteur, effacé à la réouverture | (rien de demandé par ce chantier) | rien pour l'instant — noté | — |
| 7 | Responsable et type d'affaire : valeur courante seulement | analyses « par conseiller » et « par type » lisent l'état courant, pas l'état au moment de l'événement | assumé et documenté dans la définition des métriques (réaffectations rares) | — |
| 8 | Aucune donnée d'acquisition ni d'origine | tout le funnel amont, et la question qui justifie le prix du produit (quelle origine génère des affaires signées) | voir §3 — **contrat d'entrée à arbitrer** | S + API |
| 9 | Index absents sur les colonnes que l'analytique filtrera et triera | requêtes à la volée non bornées ; risque pour les écrans quotidiens | une migration d'index (§4) | S |

---

## 3. L'acquisition : ce qu'il faut créer, et ce qui doit être arbitré

Il n'y a rien à corriger ici, il y a tout à créer. Proposition minimale,
pour que le funnel soit une chaîne continue **traçable jusqu'à l'affaire
signée** :

### Le modèle

- **`leads`** : une arrivée. Par organisation. `contact_id` (la fiche créée
  ou retrouvée), `received_at`, `simulator` (texte : quel simulateur),
  `page` (URL ou identifiant de la page), `source`, `medium`, `campaign`
  (UTM, texte libre), `visitor_id` (identifiant anonyme posé côté site,
  optionnel), `simulation_started_at` / `simulation_completed_at`
  (transmis par le simulateur), `payload` (réponses de la simulation,
  jsonb, jamais interprété par le produit). Un contact peut avoir plusieurs
  leads ; le premier fait foi pour « lead → premier contact effectif ».
- **`acquisition_events`** : `visit`, `simulation_started`,
  `simulation_completed`, avec `visitor_id`, `occurred_at`, `simulator`,
  `page`, UTM. Sans identité (anonyme) tant que le lead n'est pas arrivé ;
  le lead porte le même `visitor_id`, ce qui relie la chaîne.
- **Origine sur l'affaire** : `deals.lead_id` posé à la création de
  l'affaire depuis le lead le plus récent du contact (figé : une affaire
  garde son origine même si le contact reçoit d'autres leads ensuite).
  C'est ce qui permet « quelle origine génère des affaires qui se signent ».
- `contacts.source` gagne la valeur `lead`.

### L'entrée — le point à arbitrer

Les simulateurs et les pages ne sont pas dans le produit : ils vivent sur
les sites des clients. Il faut donc un **contrat d'API public**, et c'est
une décision irréversible (les intégrations côté client en dépendront) :

1. **`POST /api/leads`** — reçoit un lead (identité + origine + horodatages
   de simulation), authentifié par une **clé d'API par organisation** (à
   créer, gérée dans Marque & réglages, jamais affichée deux fois — même
   discipline que le jeton de partage). Crée ou complète la fiche contact
   (même règle que l'import : email connu ⇒ compléter, jamais écraser).
2. **`POST /api/events`** — reçoit `visit` / `simulation_started` /
   `simulation_completed` avec un `visitor_id` généré côté site. Appelable
   depuis le navigateur (clé publique distincte, limitée en débit) ou
   depuis le serveur du simulateur.
3. Plus tard, éventuellement : un **extrait JavaScript** fourni par Clozado
   qui pose le `visitor_id` et envoie les visites tout seul — pas dans ce
   chantier tant que le contrat ci-dessus n'est pas validé.

Questions à trancher avant l'étape 2 (elles changent le schéma) :

- Les simulateurs actuels peuvent-ils appeler une API (côté serveur ou
  navigateur) ? Sont-ils développés par le client, par Clozado, par un
  tiers ?
- Faut-il mesurer les **visites** dès maintenant (identifiant de visiteur,
  extrait JavaScript sur les sites clients), ou démarrer le funnel à
  **simulation démarrée** (événement que le simulateur sait émettre) ?
- Ce qui identifie une origine : simulateur + page + UTM (source, medium,
  campagne) en texte libre — ou une liste d'origines configurée par
  organisation (lignes de table, comme les étapes) ? Le texte libre est
  plus simple à intégrer ; la liste configurée est plus propre à filtrer.
- Un lead dont l'email correspond à une fiche existante : compléter la
  fiche (proposé), ou créer un doublon signalé ?

Sans réponse, l'étape 2 ne peut construire que les corrections 1 à 5 et 9.

---

## 4. Index à poser (migration de l'étape 2)

Pour que le calcul à la volée reste borné par organisation et par date :

- `deal_events (organization_id, created_at)` et
  `deal_events (organization_id, share_id, type)` ;
- `deal_shares (organization_id, partner_id, sent_at)` et
  `deal_shares (organization_id, status)` ;
- `commissions (organization_id, state)` ;
- `deal_stage_changes (organization_id, to_status_id, changed_at)` ;
- `tasks (organization_id, status, completed_at)` ;
- `contacts (organization_id, created_at)`, `deals (organization_id, created_at)` ;
- sur les nouvelles tables : `leads (organization_id, received_at)`,
  `leads (organization_id, contact_id)`, `acquisition_events
  (organization_id, visitor_id, occurred_at)`.

---

## 5. Conception technique retenue (à confirmer à l'étape 2)

- **Calcul à la volée, en SQL** : médianes et moyennes par
  `percentile_cont` / `avg` sur les tables d'événements, filtrées par
  organisation et par période, jamais les tables entières en mémoire ni
  d'agrégation en JavaScript.
- **Une seule définition par métrique** : un module `src/lib/metrics/`
  (définition, exclusions, seuil d'observations, requête) consommé par tous
  les écrans et par l'export CSV — jamais une somme refaite dans une page.
  Seuil proposé : un indicateur calculé sur **moins de 5 observations est
  masqué**, l'écran dit combien il en manque.
- **Jusqu'où ça tient** : avec les index ci-dessus, une organisation de
  50 000 affaires / 300 000 événements reste sous 100 ms par indicateur ;
  vers **1 million d'événements par organisation**, les percentiles
  dépassent la demi-seconde et il faudra des tables de cumul quotidien
  (rollups) rafraîchies par une tâche planifiée — à ce moment-là seulement.
  À mesurer avec le jeu de performance avant d'y croire.
- **Écrans quotidiens** : l'analytique vit sur ses propres routes
  (`/analytique/*`), n'ajoute rien à la coquille ; mesures avant/après sur
  le jeu de 5 000 contacts (référence actuelle : tableau de bord 205 ms,
  contacts 139 ms, tâches 238 ms, suivi 120 ms en build de production).

---

---

## Étape 2 — corrections des manques et couche de définition des métriques

### Migration `0009_analytique_corrections`, appliquée le 2026-08-24

Relue et validée avant application ; rejouable (rattrapages idempotents).

- `deal_shares.replaces_share_id` (FK composite vers le partage remplacé) —
  posé par « Renvoyer le lien » : pour l'analytique, une chaîne de renvois
  est UN partage, envoyé à la date du premier.
- `commissions.confirmed_at`, `commissions.settled_at` — posés à la
  transition par confirmCommission / markCommissionSettled ; reconstruits
  depuis les événements « Commission confirmée. » / « Commission marquée
  réglée. » (seuls libellés jamais écrits par le produit, inchangés dans
  l'historique git ; aucune autre valeur en base). **Aucun repli sur
  `updated_at`** : une commission confirmée ou réglée sans événement garde
  NULL = date inconnue, que l'analytique écarte et compte à part. La
  contrainte `commissions_state_dates_consistency` ne vérifie que la
  cohérence (une prévue n'a aucune date, une confirmée pas de règlement,
  un règlement jamais avant sa confirmation), sans exiger la présence des
  dates — les trois états sont ceux de l'enum, en ajouter un revisitera la
  contrainte. À l'application : 1 commission, `prevue`, rien à
  reconstruire.
- `deal_stage_changes.loss_reason_id` — le motif AU MOMENT de la perte,
  posé par changeDealStage vers une étape perdue, reporté par
  updateDealDetails si le motif est corrigé tant que l'affaire y est.
- `deal_stage_changes.reconstructed` — vrai pour une ligne RECONSTITUÉE
  par un rattrapage (ligne d'étape initiale déduite de `deals.created_at`,
  motif reporté depuis la valeur courante) : une reconstruction, pas une
  observation. L'analytique les exclut des durées et les compte à part.
  À l'application : 1 ligne initiale reconstituée (l'affaire du
  2026-08-21), 0 motif reporté.

### Correction sans migration

`share_viewed` est enfin écrit : la PREMIÈRE consultation d'un partage par
le partenaire (route publique GET), une seule fois par partage, attribuée
au partenaire. Le suivi et la génération de tâches lisent désormais
`confirmed_at` ; une commission dont la date de confirmation est inconnue
se liste « date de confirmation inconnue » et ne déclenche pas la règle
« commission non réglée » (on ne compte pas des jours depuis une date
qu'on n'a pas).

### La couche de définition — `src/lib/metrics/`

- `definitions.ts` : LE registre. Une entrée par métrique : définition
  exacte en français, exclusions, comportement quand les données manquent,
  seuil. C'est le seul endroit où une métrique est définie ; les écrans et
  l'export le consomment, jamais un calcul refait dans une page.
- `types.ts` : le résultat d'une durée (`n`, médiane et moyenne en jours,
  `hidden`, `missing`, lignes écartées) et la règle du seuil appliquée UNE
  fois (`finishStat`) — un écran ne décide jamais lui-même d'afficher.
- `filters.ts` : période (sur l'événement qui CLÔT l'observation),
  conseiller, type, pipeline (valeur courante de l'affaire, assumé) ;
  `organizationOf` refuse toute requête sans organisation — jamais le mode
  « voit tout », un agrégat ne traverse pas la frontière entre clients.
- `durations.ts` : la famille « délais et durées », en SQL
  (`percentile_cont`, `avg`, fenêtres), bornée par l'organisation ; les
  lignes reconstituées et les dates inconnues sont écartées et comptées.

### Le catalogue (copie du registre au 2026-08-24 — la définition fait foi dans `definitions.ts`)

| Métrique | Unité | Définition | Exclut | Données insuffisantes |
|---|---|---|---|---|
| **Temps passé par étape** (`stage_duration`) | jours | Pour chaque étape du pipeline, durée entre l'entrée d'une affaire dans l'étape et sa sortie (le passage suivant), médiane et moyenne sur les passages terminés. Une affaire qui revisite une étape compte un passage par visite. | Le passage en cours (l'affaire y est encore) ; les lignes reconstituées après coup (ligne d'étape initiale déduite de la date de création) — comptées à part, jamais dans la durée. | Masqué en dessous de 5 observations ; l'écran indique combien il en manque. |
| **Délai création → signature** (`creation_to_won`) | jours | Durée entre la création de l'affaire et sa PREMIÈRE entrée dans une étape marquée « gagné », médiane et moyenne sur les affaires signées. | Les affaires jamais gagnées ; une entrée en étape gagnée reconstituée après coup ; une organisation sans étape marquée « gagné » n'a pas de signature mesurable. | Masqué en dessous de 5 observations ; l'écran indique combien il en manque. |
| **Délai entre deux étapes consécutives** (`stage_pair_delay`) | jours | Pour chaque paire d'étapes qui se suivent dans un pipeline, durée entre la première entrée d'une affaire dans la première et sa première entrée dans la seconde, sur les affaires qui ont atteint les deux — médiane et moyenne. | Les affaires qui n'ont pas atteint la seconde étape ; les paires non consécutives ; les entrées reconstituées. | Masqué en dessous de 5 observations ; l'écran indique combien il en manque. |
| **Délai partage → réponse du partenaire** (`share_response_delay`) | jours | Durée entre l'envoi d'un partage et la réponse du partenaire (acceptation ou refus). Un lien renvoyé ne compte pas comme un nouveau partage : la durée part du PREMIER envoi de la chaîne. | Les partages sans réponse (en attente, révoqués sans réponse, expirés) ; les partages remplacés par un renvoi (seul le dernier de la chaîne porte la réponse). | Masqué en dessous de 5 observations ; l'écran indique combien il en manque. |
| **Délai commission confirmée → réglée** (`commission_settlement_delay`) | jours | Durée entre la confirmation d'une commission et la déclaration de son règlement, médiane et moyenne sur les commissions réglées dont les deux dates sont connues. | Les commissions non réglées ; celles dont la date de confirmation est inconnue (confirmées avant que la date soit journalisée) — comptées à part, jamais remplacées par une date plausible. | Masqué en dessous de 5 observations ; l'écran indique combien il en manque. |
| **Délai lead → premier contact effectif** (`lead_to_first_contact`) | jours | Durée entre l'arrivée d'un lead et la première interaction consignée avec la personne (appel, email ou rendez-vous — pas une note), médiane et moyenne. | Les leads sans interaction consignée ; les notes (elles ne sont pas un contact) ; les contacts arrivés autrement que par un lead. | Indisponible tant que l'entrée des leads n'est pas branchée (migration B du module analytique) ; ensuite, masqué en dessous de 5 observations ; l'écran indique combien il en manque. |

Seuil commun : 5 observations.

### Vérifié contre la base (deux organisations jetables, détruites après)

Six affaires aux durées connues → temps par étape (n = 6, médiane 3,5 j,
passage reconstitué écarté et compté, passage en cours non compté, filtre
de période sur la fin du passage), délai création → signature (médiane
5,5 j), paires d'étapes consécutives (4 paires, celles jamais atteintes
masquées), délai partage → réponse depuis le premier envoi d'une chaîne
de renvoi (le partage remplacé ne compte pas), délai commission (dates
observées, une date inconnue écartée et comptée), contrainte refusant une
date sur une commission prévue, motif de perte posé au passage puis
corrigé, `share_viewed` écrit une seule fois pour deux consultations,
organisation voisine à zéro partout, super admin sans organisation refusé.

---

## Acquisition — conception retenue avec l'utilisateur (avant la migration B)

Arbitrages du 2026-08-24 : entrée des leads **serveur à serveur** avec clé
d'API (jamais dans du JavaScript) ; **visites mesurées dès maintenant** ;
liste d'origines **configurée par organisation + débordement libre**,
rapprochement ensuite ; lead à email connu ⇒ **compléter la fiche et
journaliser** l'enrichissement ; le système **fonctionne en dégradé** pour
une organisation qui n'a rien branché ; `/api/events` **restreint par
domaine d'origine**.

### `deals.lead_id` — figé, mais jamais changé en silence

- À la création : le lead le plus récent du contact **reçu avant** la
  création, automatiquement (une affaire créée à la main sur un contact qui
  a déjà un lead hérite de son origine).
- Après coup : un lead arrivé **après** la création n'est jamais rattaché
  tout seul — il n'a pas généré l'affaire. La fiche affaire porte un champ
  **Origine** : le lead rattaché ou « aucune », le choix parmi les leads du
  contact, ou le détachement. Chaque changement manuel est journalisé
  (`deal_events` type `origin_changed`, avec l'acteur et le libellé) et
  visible dans le journal unifié. L'écran de rapprochement signale « N
  affaires sans origine chez des contacts qui ont un lead ».
- Pour l'analytique, l'affaire compte sous l'origine rattachée au moment du
  calcul ; le journal garde la trace des changements.

### La clé d'API (`api_keys`)

- **Où** : table `api_keys`, une ligne par clé, par organisation, plusieurs
  clés possibles (une par intégration).
- **Forme** : 256 bits d'aléa, montrée **une seule fois** à la création,
  stockée **hachée** (SHA-256, comme le jeton de partage) — `key_hash`
  unique sert à l'authentification, `key_prefix` (les premiers caractères)
  sert à la reconnaître dans la liste, jamais à la reconstituer. Un dump de
  la base ne donne accès à aucune clé.
- **Rotation** : on crée une nouvelle clé (affichée une fois), on bascule
  l'intégration, on **révoque** l'ancienne (`revoked_at` : refusée à
  l'authentification, conservée pour l'historique — les leads reçus y
  restent liés). Les deux vivent en parallèle le temps de la bascule ;
  `last_used_at` dit si l'ancienne sert encore avant de la couper.
- Gestion dans Marque & réglages, réservée à l'admin de l'organisation ;
  débit limité par clé sur `/api/leads`.

### L'extrait JavaScript et les visites

- **Rien de branché** : aucune visite, aucun lead — le funnel amont affiche
  l'état « pas encore branché » avec l'extrait à poser et la clé à créer ;
  le funnel commercial, les délais, les pertes fonctionnent ; l'origine des
  affaires est « inconnue » et les filtres par origine le montrent tel quel.
  Aucune erreur, aucun écran vide muet.
- **Ce qui vit chez le client** : une seule ligne, un **chargeur** minuscule
  (`<script src="https://<clozado>/s.js" data-site="<site_key>">`), qui ne
  change jamais de contrat ; il charge l'extrait courant depuis Clozado. La
  logique se met donc à jour **côté Clozado**, sans redéploiement chez le
  client. L'extrait pose un `visitor_id` en première partie (localStorage,
  repli cookie), envoie la visite (`sendBeacon`, jamais bloquant), expose
  `clozado.track("simulation_started" | "simulation_completed", {…})` pour
  les simulateurs, et **échoue en silence** : jamais une exception sur la
  page du client.
- **Évolution sans casser** : le contrat de `/api/events` est **versionné
  dans la charge** (`v: 1`) ; les changements sont **additifs** (jamais un
  champ retiré, jamais un sens changé) ; une rupture = un nouveau numéro de
  version que le serveur sert en parallèle de l'ancien, jamais à sa place.
  Une installation ancienne continue de fonctionner indéfiniment.
- **Identification et garde-fous** : `organizations.site_key` (identifiant
  public opaque, généré par la base) désigne l'organisation ;
  `organizations.allowed_domains` liste les domaines acceptés — en-tête
  `Origin` vérifié, **vide = rien d'accepté** ; débit limité par site et par
  IP ; aucune adresse IP stockée, aucune identité dans les événements.

### À refaire sur données réelles

Les vérifications de la migration `0009` (rattrapages) ont tourné sur des
organisations jetables et sur une base quasi vide (1 ligne dans
`deal_events`) : c'est la logique qui est validée, pas le comportement sur
du volume. **À rejouer sur de vraies données** dès qu'il y en aura.

---

## La collecte — ce qui est construit (branche `analytique-collecte`)

### Migrations `0010` (index) et `0011` (acquisition), appliquées

Relues avant application, avec les quatre corrections demandées :
`leads.contact_id` nullable et `ON DELETE SET NULL` (l'attribution survit à
la personne : voir la purge ci-dessous) ; les clés de site dans une table
`site_keys` (plusieurs actives, révocation datée — rotation sans casser les
installations) ; `acquisition_rejections` (un compteur par organisation,
motif et détail — le fail-closed n'est jamais silencieux) ; plafonds de
taille et de débit dans les routes.

### Le contrat d'entrée (versionné, additif)

**`POST /api/leads`** — serveur à serveur. En-tête `Authorization: Bearer
clz_…` (clé d'API de l'organisation). Corps JSON ≤ 64 Ko :
`email` (ou `phone`), `name` / `first_name` / `last_name`, `phone`,
`company`, `job_title`, `city`, `postal_code`, `country`, `origin`,
`simulator`, `page_url`, `referrer`, `utm_source` / `utm_medium` /
`utm_campaign`, `visitor_id` (celui de l'extrait, pour relier la chaîne),
`simulation_started_at` / `simulation_completed_at` (ISO 8601), `payload`
(objet ≤ 16 Ko et ≤ 200 clés, jamais interprété). Réponses : `201`
`{ lead_id, contact_id, matched_existing_contact, enriched_fields }` ;
`400 invalid_payload` (avec les champs en cause) ; `401` (clé absente,
inconnue ou révoquée — sans distinguer) ; `413 payload_too_large` (rien
n'est enregistré) ; `429 rate_limited` (120/min par clé et par IP). Email
connu ⇒ la fiche est **complétée** (champs vides seulement, jamais
name/email), et le lead garde `matched_existing_contact` + les champs
enrichis — le journal unifié affiche « Lead reçu · origine — fiche
existante complétée : ville, fonction ».

**`POST /api/events`** — navigateur, via l'extrait. Corps `text/plain` (pas
de pré-vol CORS) : `{ v: 1, site: <clé de site>, events: [ { kind: visit |
simulation_started | simulation_completed, visitor_id, occurred_at?,
page_url?, referrer?, utm_*?, simulator?, origin? } ] }`, ≤ 16 Ko, ≤ 20
événements. Accepté seulement si l'en-tête `Origin` est un domaine déclaré
par l'organisation ; `404` clé inconnue ou révoquée, `403` domaine absent
ou non déclaré (compté), `413`, `429` (600/min par clé de site, 120/min
par IP). Une date hors fenêtre (7 jours en arrière, 5 minutes en avant) est
remplacée par « maintenant ». Aucune IP stockée.

**`GET /s.js`** — l'extrait : `<script src="https://<clozado>/s.js"
data-site="<clé de site>" async>` (+ `data-origin`, `data-simulator`
facultatifs). Identifiant de visiteur en première partie (localStorage,
repli cookie), visite envoyée au chargement (page, referrer, UTM),
`clozado.track("simulation_started" | "simulation_completed", { simulator,
origin })`, file `window.clozado.q` acceptée avant chargement, envoi par
`sendBeacon`, échec silencieux. Cache 5 minutes : la logique se met à jour
côté Clozado.

**Le limiteur de débit est en mémoire, par instance** (même limite honnête
que la route de partage, `src/lib/rate-limit.ts`) : il freine, il ne
garantit pas. À centraliser (Postgres ou Redis) si l'abus devient réel.

### Les écrans

- **Marque & réglages → Collecte** : état (visites, simulations, leads sur
  30 jours, derniers reçus ; « rien n'est branché » sinon), **refus comptés**
  avec le conseil (« ajoute ce domaine s'il est à toi »), ligne de script
  par clé de site active (création, révocation — jamais la dernière active),
  domaines autorisés (un par ligne, normalisés), clés d'API (création avec
  la valeur affichée **une fois**, préfixe, dernier usage, révocation).
- **Analytique → Origines** : à rapprocher (textes reçus inconnus, avec
  leur poids ; rattacher à une origine existante ou nouvelle —
  rétroactif), origines configurées, et **affaires sans origine chez des
  contacts qui ont un lead** (le cas « créée à la main, lead identifié
  après coup »).
- **Fiche affaire → Origine** : le lead rattaché, le choix parmi les leads
  du contact ou le détachement — chaque changement journalisé
  (`origin_changed`).
- **Journal unifié** : « Lead reçu · origine » sur la fiche contact et le
  fil de l'organisation.

### La purge RGPD, précisément

À la suppression d'un contact (tombale), le lead **reste**, rattaché à la
tombale comme les affaires, et garde : date d'arrivée, origine (rattachée
et texte brut), simulateur, page, referrer, UTM, dates de simulation, clé
utilisée, champs enrichis (des noms de champs, pas des valeurs). Sont
**purgés** : `payload` (les réponses de la simulation) et `visitor_id` (le
lien vers la navigation). L'export réglementaire d'un contact inclut ses
leads, réponses comprises, tant qu'il n'est pas supprimé.

### Vérifié — sur des organisations jetables, pas sur des données réelles

Ce qui suit valide la **logique** ; la base réelle ne contient encore
aucun lead ni aucune visite. API (46 contrôles) : clés, refus 401/400/413,
complétion sans écrasement, débordement et rapprochement rétroactif,
domaine absent/non déclaré/déclaré avec compteurs, plafonds, rotation des
clés de site, `s.js`, origine posée à la création et jamais après coup,
rattachement/détachement journalisés, purge RGPD, isolation (dont rejet
par la base d'un lead qui mélangerait deux organisations). Navigateur
(17 contrôles) : un « site client » servi localement avec la ligne de
script → visite, simulation démarrée (file) et terminée (bouton) reçues
avec page, UTM et origine ; identifiant stable entre chargements ; lead
envoyé côté serveur avec le même identifiant ; fiche contact et affaire
créée depuis la fiche (origine posée) ; affaire passée en « gagné » ;
**chaîne continue lue en base : origine → visite → simulation → lead →
contact → affaire gagnée** ; réglages (ligne de script, domaine, clé
affichée une fois, refus visible), écran des origines (rapprochement), zéro
erreur console.

## Étape 3 — délais et durées (branche `analytique-collecte`)

### L'écran `/analytique/delais`

Entrée « Délais » de la section Analytique. Tout ce qu'il affiche vient de
`delaysReport()` — un seul objet, que l'export CSV (étape 6) écrira tel
quel — et passe par UN composant, `DurationTable` : médiane ET moyenne
côte à côte, le nombre d'observations toujours visible, chiffres
tabulaires alignés à droite, et sous chaque indicateur ce qui est en
cours ou écarté (« 3 affaires dans l'étape aujourd'hui », « 1 passage
reconstitué écarté », « 1 commission réglée écartée (date de confirmation
inconnue) »). Un indicateur sous le seuil n'affiche aucun chiffre : la
ligne dit « masqué : il manque N observations ».

- **Le cycle** : lead → premier contact, création → signature, partage →
  réponse du partenaire, commission confirmée → réglée — dans l'ordre de la
  vie d'une affaire.
- **Temps passé par étape**, par pipeline : les étapes intermédiaires
  seulement (une étape finale ne se quitte pas : rien à mesurer). Le
  libellé d'une étape ouvre la liste des affaires qui y sont aujourd'hui
  (`/affaires?vue=liste&pipeline=…&etape=…`) — l'analyse mène au geste.
- **D'une étape à la suivante**, par pipeline : les paires consécutives,
  jamais depuis une étape finale.
- **Définitions** : les six entrées du registre, repliées (`<details>`
  natif — pas d'info-bulle inventée, la décision reste ouverte), avec
  mesure, exclusions, filtres, données insuffisantes, et « ce qui compte »
  (ce qui crée une observation). Les libellés d'indicateurs y renvoient.

**Les trois états.** Chargement et erreur : `loading.tsx` / `error.tsx` du
segment `/analytique`. « Pas encore assez de données » : pas un écran vide
mais l'inventaire — pour chaque indicateur, `n/5`, ce qui est en cours ou
écarté, et la phrase du registre qui dit quel geste crée une observation ;
gestes proposés : ouvrir le pipeline, brancher la collecte. Le même bloc
sert quand des filtres ne laissent rien passer (« Rien ne se calcule avec
ces filtres », retirer les filtres). Un filtre sans objet le dit (« sans
origine » sur lead → premier contact). Vue globale super admin : refusée
avec l'explication, jamais un agrégat qui traverserait deux organisations.

### Les filtres — l'URL est le filtre

`src/lib/metrics/search-params.ts` : les mêmes paramètres sur toutes les
vues du module et sur l'export, pour qu'un lien copié garde sa sélection.
`periode` (`30j`, `90j`, `12m`, défaut = depuis le début, le plus
d'observations possible avant de restreindre), `du` / `au` (jours de
Paris, borne haute **incluse**, priment sur le préréglage), `conseiller`,
`type`, `pipeline`, `origine`. Tout identifiant qui n'est pas un UUID est
ignoré, jamais transmis à la base ; une date mal formée aussi. Les
sélecteurs n'apparaissent que s'il y a de quoi choisir (un seul
conseiller, un seul pipeline : rien à filtrer ; aucune origine configurée :
pas de sélecteur d'origine).

**L'origine d'une affaire est celle de son lead** (`deals.lead_id`). Le
filtre accepte une origine configurée, ou deux valeurs spéciales :
`a-rapprocher` (lead reçu avec un texte non rattaché — Analytique →
Origines) et `inconnue` (affaire sans lead). Sur lead → premier contact,
l'origine est celle du premier lead du contact et « sans lead » est sans
objet.

**La période porte sur l'événement qui clôt chaque délai** (fin de passage,
signature, réponse, règlement, première interaction) ; conseiller, type et
pipeline sont ceux de l'affaire aujourd'hui ; lead → premier contact lit le
conseiller de la fiche contact et ignore type et pipeline (il se mesure
avant toute affaire). Chaque entrée du registre porte désormais son champ
`filters` qui le dit, et `howToFeed` (ce qui crée une observation).

### La couche, ce qui a changé

- `lead_to_first_contact` est **mesurable** : par contact, son PREMIER
  lead, puis la première interaction effective (appel, email, rendez-vous
  — pas une note) consignée à partir de cette arrivée. Écartés : les
  interactions antérieures au lead (la relation existait déjà), les notes,
  les contacts venus autrement, les fiches supprimées (leurs interactions
  le sont aussi). Les contacts venus par un lead sans interaction sont
  comptés à part (`pending`) : de la matière à venir.
- `DurationStat.pending` : les observations en cours (passage où
  l'affaire est encore, lead sans premier contact) — affichées, jamais
  comptées.
- `stage_duration` et `stage_pair_delay` excluent les étapes finales
  (définition mise à jour dans le registre).
- **Défaut corrigé** dans `stagePairDelays` : les filtres (conseiller,
  type, pipeline, période) étaient posés dans le `ON` d'un `LEFT JOIN` et
  n'excluaient aucune paire — un filtre par conseiller rendait le même
  nombre que sans filtre. Les paires observées sont maintenant calculées
  d'abord (jointure interne, filtres, période), puis rattachées aux étapes.
  Vérifié : conseiller 2 → n = 1 là où il y a 7 paires.
- `formatDuration` (`lib/format.ts`) : « 12 min », « 7 h », « 3,5 j »,
  « 42 j » — une décimale sous dix jours, aucune au-delà.

### Vérifié — sur des organisations jetables, pas sur des données réelles

Script temporaire contre la vraie base, deux organisations jetables
détruites après (`_delais-a` : 8 contacts, 8 leads, 8 affaires aux dates
connues, 8 partages dont une chaîne de renvoi, 7 commissions ; `_delais-b`
témoin), **47 contrôles** : chaque métrique à la valeur attendue (médianes
6 j, 8 j, 3,5 j, 3 j, 4 j, 2 j, 3 j), note et interaction antérieure au
lead écartées, fiche supprimée écartée, second lead ignoré, passage
reconstitué écarté et compté, 3 affaires en cours, étapes finales absentes,
paires jamais depuis une étape finale ; filtres conseiller (sur l'affaire /
sur la fiche), type sans effet sur le lead, pipeline, origine configurée,
« à rapprocher », « sans origine » (sans objet), période sur l'événement
qui clôt (début, fin exclue) ; isolation (B ne voit que B, A ne voit pas
l'affaire de B, super admin sans organisation refusé) ; paramètres d'URL
(UUID invalide ignoré, jours de Paris, borne incluse, préréglages) ;
formats. **Navigateur** (Chromium, build de production, session forgée,
27 contrôles) : l'écran d'A avec ses chiffres et ses mentions, l'entrée de
navigation, le libellé d'étape qui ouvre la liste des affaires, le
préréglage 90 j (commissions visibles, étapes masquées), le formulaire
(conseiller 2 → « rien ne se calcule » + inventaire, sélecteur conservé),
bornes du/au, valeurs spéciales d'origine, paramètres invalides (200,
écran normal), définition dépliée, petit écran sans débordement ; B : état
« pas encore assez de données » avec l'inventaire et les gestes, aucune
donnée d'A, sélecteurs absents ; super admin en vue globale ; zéro erreur
console.

### Performance — mesures, et jusqu'où ça tient

**Écrans quotidiens — avant / après.** Même protocole que la refonte UI :
jeu `_perf-test` (5 000 contacts, 500 affaires, 2 000 tâches, 3 000
interactions, 1 000 passages), build de production, session forgée, temps
de réponse complet, médiane de 7 requêtes. Référence (main, avant ce
chantier) → cette branche : tableau de bord 205 → 188 ms, contacts 139 →
142 ms, tâches 238 → 251 ms, suivi 120 → 127 ms ; affaires (kanban)
210 ms, liste 143 ms. Dans le bruit de mesure : l'analytique vit sur ses
propres routes et n'ajoute rien à la coquille. L'écran des délais sur ce
jeu : 143 ms (135 ms avec une période) ; Origines : 126 ms.

**Volume — à partir de quand ça casse.** Organisation jetable
`_perf-analytique` générée côté base : 70 000 affaires, 266 153 passages
d'étape, 14 047 partages répondus, 9 342 commissions réglées, 35 000
contacts venus par un lead, 24 425 interactions — soit, pour un cabinet
qui signe 500 affaires par an, un siècle d'activité. Temps mesurés depuis
le code de l'écran (aller-retour HTTP Neon compris, sur le compute de
développement, médiane de 3 exécutions) :

| Requête | 70 000 affaires |
|---|---|
| Temps passé par étape | 633 ms |
| Paires d'étapes consécutives | 729 ms |
| Création → signature | 123 ms |
| Lead → premier contact | 100 ms |
| Partage → réponse | 70 ms |
| Commission confirmée → réglée | 37 ms |
| **L'écran** (les six en parallèle) | **1,7 s** (1,5 s avec une période de 90 j) |

Deux réécritures au passage, validées par les 47 contrôles : les paires
d'étapes (3,3 s → 0,73 s : le planificateur recalculait l'agrégat pour
chaque étape de départ, avec 800 000 sondes d'index sur `deals` — un seul
passage à fenêtre par affaire, agrégat `MATERIALIZED`) et lead → premier
contact (477 → 100 ms : jointure agrégée au lieu d'une sous-requête
corrélée par contact). Les deux requêtes d'étapes lisent tout l'historique
de l'organisation (fenêtre par affaire, puis tri pour la médiane) et
croissent linéairement avec lui — la période ne borne pas la lecture, elle
filtre à la fin. **Le choix « à la volée » tient jusqu'à ~300 000
passages par organisation** (l'écran sous 2 s) ; vers **1 million de
passages** (≈ 250 000 affaires) les deux requêtes d'étapes dépasseront
2,5 s chacune et l'écran 6 s. À ce moment-là, et seulement à ce
moment-là : tables de cumul par organisation, étape et jour (compte,
somme, histogramme des durées pour la médiane), rafraîchies par une tâche
planifiée — l'écran lira les cumuls, le registre restera la seule
définition. La base réelle en est aujourd'hui à moins d'un pour cent de ce
volume.

## Étape 4 — le funnel de conversion, relié à l'acquisition (branche `analytique-collecte`)

### L'écran `/analytique/funnel`

Entrée « Funnel » de la section Analytique, avant Délais. Tout ce qu'il
affiche vient de `funnelReport()` (`src/lib/metrics/funnel.ts`) — un seul
objet, `{ chain, pipelines, origins }`, que l'export CSV (étape 6) écrira
tel quel — et passe par UN composant, `FunnelSteps` : un pas par ligne, sa
barre proportionnelle au pas le plus large (une seule teinte, la couleur
ne porte aucune identité : elle dessine l'entonnoir), son nombre, le taux
de passage depuis le pas précédent et la déperdition, chiffres tabulaires
en encre de texte. Un pas sans objet le dit à la place de sa barre ; un
taux masqué dit ce qui lui manque (« masqué : il manque 2 observations au
pas précédent »). Les mêmes filtres que les délais (`AnalyticsFiltersBar`,
l'URL est le filtre).

- **La chaîne — de la visite à la signature** : visiteurs → simulations
  démarrées → terminées → leads reçus → contacts établis → affaires issues
  de ces leads → gagnées. Sous les pas, ce qui manque au suivant (« 6 leads
  sans premier contact consigné », « 3 perdues · 3 en cours ») et, avec
  plusieurs pipelines, la répartition par pipeline en liens.
- **Par étape du pipeline** (un bloc par pipeline) : « 9 affaires créées
  depuis le début, dont 8 issues d'un lead », puis chaque étape
  intermédiaire (le libellé ouvre les affaires qui l'ont atteinte), sa
  déperdition en deux liens (« 1 perdue depuis cette étape · 2 en cours,
  au plus loin ici »), et « Gagnées » en dernière ligne avec le total des
  perdues et des en cours.
- **Par origine — laquelle génère des affaires qui se signent** : un
  tableau, une ligne par origine configurée (même à zéro : c'est une
  information), « À rapprocher » et « Sans origine (aucun lead) » quand
  elles portent quelque chose ; visiteurs, simulations, leads, contacts
  établis, affaires, gagnées, lead → affaire, affaire → gagnée ; tri par
  gagnées puis affaires puis leads. Le libellé d'une origine filtre tout
  l'écran dessus.
- **Définitions** : les onze entrées de la famille `funnel` du registre,
  repliées (`metricsOfFamily("funnel")`).

**Les trois états.** Chargement et erreur : le segment `/analytique`.
« Pas encore de quoi dessiner le funnel » : l'inventaire pas par pas (le
nombre, ou pourquoi le pas est sans objet) et la phrase du registre qui
dit ce qui crée une observation ; gestes : créer une affaire, brancher la
collecte. Le même bloc quand des filtres ne laissent rien passer
(« Rien ne se compte avec ces filtres »). Le mode DÉGRADÉ est par pas, pas
par écran : une organisation sans extrait voit ses trois pas amont « pas
encore branché : aucune visite n'a jamais été reçue » avec le lien pour
poser l'extrait, et son funnel commercial entier ; sans lead, les pas de
leads le disent de même. Vue globale super admin : refusée, sur l'écran et
sur la liste quand elle porte une sélection.

### Les définitions retenues — ce qui a été tranché

- **Deux cohortes, dites à l'écran.** La chaîne suit les LEADS reçus dans
  la période jusqu'à aujourd'hui (contactés, devenus affaires, gagnés,
  quelle que soit la date) ; le funnel d'un pipeline suit les AFFAIRES
  créées dans la période jusqu'à aujourd'hui. Un taux de conversion est
  une propriété d'une cohorte ; compter des flux par période (créées ce
  mois, gagnées ce mois) donne deux nombres dont le rapport n'est pas un
  taux. Les trois pas amont, anonymes, comptent les navigateurs distincts
  de la période (identifiant de l'extrait, jamais une IP) — l'unité change
  au pas du lead, l'écran le dit.
- **« A atteint l'étape »** = entrée dans l'étape ou dans une étape
  intermédiaire plus avancée du même pipeline, ou gagnée aujourd'hui : une
  affaire glissée de la première à la troisième étape a atteint la
  deuxième — elle est allée au moins aussi loin. La première étape compte
  toutes les affaires créées. Une entrée reconstituée compte (c'est le fait
  d'être entré qui compte, pas la date). Les étapes finales ne sont pas des
  pas : gagné est l'arrivée, perdu est la déperdition.
- **Gagnée, perdue, en cours = l'état COURANT** (celui du kanban) ; la
  déperdition d'une étape = les perdues (à l'étape la plus avancée qu'elles
  ont atteinte) + les en cours (au plus loin dans cette étape, même
  redescendues) — ce qui fait que « atteint k − atteint k+1 = perdues +
  en cours » exactement, vérifié sur chaque étape.
- **Contact établi** = la règle du délai lead → premier contact effectif
  (appel, email, rendez-vous consigné à partir de l'arrivée ; pas une note,
  pas une interaction antérieure, pas une fiche supprimée). Une affaire
  créée sans interaction consignée n'y compte PAS : le pas mesure ce qui
  est consigné. Conséquence assumée : un taux peut dépasser 100 % (plus
  d'affaires que de contacts établis, plus de leads que de simulations
  terminées mesurées) — affiché tel quel avec la phrase qui l'explique, la
  déperdition devient sans objet. Jamais plafonné, jamais une inférence à
  la place d'une observation.
- **Les taux passent par le seuil, pas les nombres.** Un compte est un
  fait (3 leads sont 3 leads) et s'affiche toujours ; un taux calculé sur
  moins de 5 observations au pas précédent est masqué (`finishRate`,
  `types.ts`, la règle appliquée une fois). Le taux se calcule depuis le
  dernier pas MESURABLE : un pas sans objet est sauté.
- **Les filtres, pas par pas** (le registre le dit sur chaque entrée) :
  période sur l'événement (visites), l'arrivée du lead (chaîne) ou la
  création (pipeline) ; conseiller — sans objet sur les visites (elles ne
  sont rattachées à personne : les trois pas amont deviennent sans objet),
  fiche contact pour les leads, responsable pour les affaires ; type et
  pipeline à partir des affaires seulement ; origine partout — et le
  filtre « sans origine » rend la chaîne entière sans objet (elle part des
  leads) pendant que le funnel par pipeline compte les affaires sans lead.

### Le clic mène à la liste — exactement ce qui est compté

La liste des affaires accepte désormais les paramètres de l'analytique
(`periode`, `du`, `au`, `type`, `origine`, `conseiller`) plus quatre
paramètres de sélection : `cohorte=lead` (la période porte sur l'arrivée
du lead, pas sur la création), `atteint=<étape>`, `jusqua=<étape>` (au
plus loin dans l'étape, pas gagnée), `issue=gagnee|perdue|en-cours`.
`parseDealSelection` (`search-params.ts`) les valide comme le reste — un
identifiant qui n'en est pas un est ignoré — et `listDealsTable` applique
`dealSelectionCondition` (`funnel.ts`) telle quelle : la condition SQL
« a atteint l'étape » de la liste et l'agrégat du funnel sont deux
formulations de la même règle, dans le même fichier, et la vérification
prouve qu'elles comptent pareil (8 combinaisons de filtres × 17 liens).
Une étape d'un autre pipeline ou d'une autre organisation donne une
condition FAUSSE, jamais « tout » ; une étape finale demandée comme
« atteinte » ne donne rien. Sur la liste, un bandeau dit la sélection en
toutes lettres (« Affaires perdues créées sur les 30 derniers jours, au
plus loin dans « Partagée » — 1 affaire, exactement ce que le funnel a
compté »), avec « Revenir au funnel » (mêmes filtres) et « Retirer la
sélection » ; les filtres natifs (étape courante, conseiller) la gardent
par champs cachés ; repasser au kanban l'efface (le kanban ne filtre pas).

Pas de liste pour les pas anonymes (visiteurs, simulations) ni pour les
leads : la liste des contacts n'a pas de filtre par lead. La liste la plus
actionnable qui manque est « les leads sans premier contact consigné » —
le nombre est affiché, la liste est à construire quand l'écran des
contacts saura filtrer par lead (noté, hors de cette étape).

### Vérifié — sur des organisations jetables, pas sur des données réelles

Script temporaire contre la vraie base, deux organisations jetables
détruites après (`_funnel-a` : 8 navigateurs, 5 simulations démarrées,
3 terminées, 10 leads dont un second lead pour la même personne et un lead
vieux de 100 jours, 9 affaires aux chemins connus — gagnée, perdue depuis
Partagée, saut direct en négociation, gagnée d'un coup, perdue d'un coup,
créée à la main sans lead, fiche supprimée après création ; `_funnel-b`
témoin ; `_funnel-c` vide), **87 contrôles** : chaque pas de la chaîne à
la valeur attendue (note, interaction antérieure au lead et fiche
supprimée écartées ; second lead compté ; origine figée sur le dernier
lead antérieur ; lead conservé après la tombale), les taux (62,5 %, 60 %,
40 %, 25 %) et les masquages (bases 3 et 4), le funnel du pipeline
(atteint 9/6/4, perdues 1/1/1, en cours 2/1/1, gagnées 2 masqué,
« déperdition = perdues + en cours » sur chaque étape), le tableau par
origine (lignes, tri, taux, ligne « sans origine » sans amont), les
filtres (30 j sur l'arrivée du lead ET sur la création, conseiller sur la
fiche puis sur l'affaire avec les visites sans objet, type à partir des
affaires, origine configurée, à rapprocher, sans origine), **la liste
rend exactement les comptes du funnel** pour créées / gagnées / perdues /
en cours / atteint / perdues depuis / en cours au plus loin / chaîne, sur
8 combinaisons de filtres, paramètres d'URL invalides ignorés, isolation
(B ne voit rien de A, une étape de A demandée par B donne zéro, le
pipeline de B demandé par A donne zéro, super admin sans organisation
refusé, aucune affaire de B ne peut référencer un lead de A — FK
composite), l'organisation vide (« pas encore branché » partout, pipeline
à zéro), et la suppression complète. **Navigateur** (Chromium, build de
production, session forgée, 47 contrôles) : l'écran d'A et ses chiffres,
l'entrée de navigation, le clic sur « Partagée » → liste « ayant atteint
« Partagée » — 6 affaires » avec 6 lignes et la sélection gardée dans les
champs cachés, retour au funnel, « 1 perdue depuis cette étape » → liste
d'une affaire (D2), retirer la sélection, le kanban qui l'efface, les
préréglages, le formulaire de filtres (conseiller → visites sans objet),
le clic sur une origine, « sans origine », paramètres invalides (200,
écran normal), petit écran sans débordement, B en dégradé (visites jamais
reçues, ses seules données), C vide (inventaire et gestes, puis « rien ne
se compte avec ces filtres »), super admin en vue globale sur l'écran et
sur la liste ; zéro erreur console.

### Performance — mesures, et jusqu'où ça tient

**Écrans quotidiens — avant / après.** Même protocole (jeu `_perf-test`,
build de production, session forgée, médiane de 7). Référence (étape 3) →
cette étape : tableau de bord 188 → 153 ms, contacts 142 → 124, tâches
251 → 230, suivi 127 → 123, affaires kanban 210 → 193, liste 143 → 134,
délais 143 → 130 ; le funnel sur ce jeu : 128 ms (128 ms sur 90 jours).
Rien n'a bougé : la liste des affaires n'ajoute sa condition de sélection
que lorsque l'URL en porte une. Un piège rencontré, à connaître : après
le jeu de volume ci-dessous (70 000 affaires insérées puis supprimées), le
tableau de bord mesurait 280–300 ms sans qu'une ligne y ait changé — les
statistiques du planificateur reflétaient encore le volume disparu ; un
`VACUUM ANALYZE` des tables touchées l'a ramené à sa référence. Mesurer
les écrans quotidiens AVANT un jeu de volume, ou analyser après.

**Volume — à partir de quand ça casse.** Organisation jetable
`_perf-analytique` générée côté base (`generate_series`, jamais ligne à
ligne) : 70 000 affaires (la moitié issues d'un lead), 182 000 passages
d'étape, 35 000 contacts venus par un lead, 24 500 interactions, 150 000
événements de visite et de simulation, trois origines. Temps depuis le
code de l'écran (aller-retour HTTP Neon compris, médiane de 3) :

| Requête | 70 000 affaires |
|---|---|
| La chaîne (`funnelChain`, 3 requêtes) | 223 ms |
| Par pipeline (`pipelineFunnels`) | 354 ms |
| Par origine (`funnelByOrigin`, 4 requêtes) | 278 ms |
| **L'écran** (`funnelReport`, les trois en parallèle) | **835 ms** (124 ms sur 90 jours) |
| Liste après un clic : « a atteint l'étape 2 » (page + total) | 765 ms |
| Liste : « au plus loin dans l'étape 2, perdues » | 354 ms |
| Liste : chaîne (cohorte lead), gagnées | 94 ms |
| Liste sans sélection (référence) | 104 ms |

Le plan du funnel par pipeline est sain (`EXPLAIN ANALYZE` : jointures par
hachage, un seul passage sur les 182 000 lignes, agrégat matérialisé,
381 ms) et croît linéairement avec l'historique : sans période, la
cohorte est toute l'organisation. **Le choix « à la volée » tient jusqu'à
~300 000 passages par organisation** (l'écran sous 2 s, comme les
délais) ; vers un million de passages, l'écran dépassera 5 s et il faudra
les mêmes cumuls quotidiens que pour les délais — plus une colonne
« étape la plus avancée atteinte » posée sur l'affaire à chaque passage,
qui rendrait le funnel ET la liste instantanés. La liste « a atteint »
est la plus coûteuse (un `EXISTS` par affaire pour le total) : 0,8 s à
70 000 affaires, à surveiller à partir de 150 000. La base réelle en est à
moins d'un pour cent de ce volume. Pour mesurer plus tard :
`pipelineFunnelQuery(org, filters)` est exposée à cette fin seule.

## Étape 5 — pertes, partenaires, commissions (branche `analytique-collecte`)

Deux écrans, deux familles du registre (`losses`, `partners`), et la liste
des affaires qui rend chaque ligne de l'analyse des pertes.

### `/analytique/pertes` — l'analyse des pertes

Entrée « Pertes » de la navigation. Tout vient de `lossesReport()`
(`src/lib/metrics/losses.ts`) : le résumé de la période (« 7 affaires
perdues depuis le début, 310 000 € de montant estimé perdu (1 sans
montant) · 2 gagnées sur la même période · taux de perte 78 % »), puis
quatre répartitions par UN composant, `BreakdownTable` (libellé, affaires,
part, montant perdu, et « n sans montant » sous le montant) : par motif,
par étape de départ, par conseiller, par type d'affaire. Chaque ligne
ouvre la liste des affaires qu'elle compte. Les trois définitions de la
famille, repliées.

**Ce qui a été tranché.**

- **Une perte = une affaire AUJOURD'HUI dans une étape marquée « perdu »**
  (l'état courant, celui du kanban et du funnel), datée, située et
  motivée par sa DERNIÈRE entrée dans l'étape perdue, lue dans le journal
  des passages : le motif AU MOMENT de la perte (`deal_stage_changes.
  loss_reason_id`, correction 4 de l'étape 2), pas la valeur courante de
  la fiche ; l'étape de départ = celle d'où l'affaire est tombée (« dès la
  création » si elle est née perdue). Une affaire perdue puis rouverte
  n'est pas une perte ; une affaire perdue, rouverte, reperdue compte une
  fois, à sa dernière perte. Le montant perdu = le montant estimé
  (valeur courante, assumé) ; sans montant → compté à part, et une ligne
  dont AUCUNE affaire ne porte de montant s'écrit « — » (« montant
  inconnu » dans le résumé), jamais 0 € — même règle pour les
  commissions, dans les cellules comme dans les phrases.
- **Une perte antérieure au journal** (ligne d'entrée reconstituée à la
  date de création) a une date inconnue : écartée du calcul et comptée à
  part, montant compris (« 1 perte antérieure au journal écartée, 15 000 €
  — jamais datées par une valeur plausible »).
- **Le taux de perte** = perdues / (perdues + gagnées) sur la période,
  gagnées suivant la même règle (dernière entrée dans une étape gagnée,
  état courant) ; masqué sous 5 affaires closes. Les parts des lignes
  sont masquées sous 5 pertes ; nombres et montants s'affichent toujours.
- **La période porte sur la date de la perte** — une cohorte de plus,
  après la création (funnel) et l'arrivée du lead (chaîne). La liste des
  affaires l'exprime par `cohorte=perte`, plus `motif=<id|sans-motif>` et
  `depuis=<étape|creation>` ; `lostDealCondition` (dans `losses.ts`) est
  la condition qu'applique la liste — la même règle que l'agrégat, prouvée
  égale ligne par ligne. Le bandeau dit la sélection (« Affaires perdues
  depuis le début (à la date de la perte), motif « Projet abandonné » —
  3 affaires ») et renvoie aux pertes.
- Pas de lien pour la ligne « sans responsable » (le filtre conseiller ne
  sait pas dire « personne ») ; sans pipeline en jeu (plusieurs pipelines,
  aucun filtre), les lignes ne sont pas des liens et l'écran le dit.

### `/analytique/partenaires` — partenaires et commissions

Entrée « Partenariats » de la navigation (« Partenaires » désigne déjà les
fiches, dans Dossiers). Tout vient de `partnersReport()` (`src/lib/
metrics/partners.ts`). Trois blocs : **par partenaire** (partages,
acceptés, refusés, sans réponse détaillé « 1 en attente · 1 expiré · 1
révoqué », taux d'acceptation, délai de réponse « méd. · moy. · n »,
gagnées, taux de transformation, commissions acquises, commissions
prévues ; une ligne « Ensemble » ; le nom ouvre la fiche), **l'encours de
commissions à aujourd'hui** (prévues vivantes, confirmées non réglées,
réglées, prévues devenues caduques), **le vieillissement des confirmées
non réglées** (0–30, 31–60, 61–90, > 90 jours, le nombre au-delà du
seuil de relance de l'organisation, les dates de confirmation inconnues à
part). Les sept définitions de la famille, repliées.

**Ce qui a été tranché.**

- **Un partage = une chaîne de renvois de lien**, la définition déjà
  posée pour les délais (`shareChainsCte`, sortie de `durations.ts` pour
  être partagée) : envoyé à la date du premier lien ; son issue, sa
  réponse et sa commission sont celles de son DERNIER lien (le renvoi
  copie la commission sur le nouveau lien : compter les deux doublerait).
  Issues : accepté, refusé, sans réponse = en attente, expiré (date
  d'expiration passée, jamais un état stocké), révoqué sans renvoi.
- **Les partages de la période sont une cohorte** (premier envoi dans la
  période), suivie jusqu'à aujourd'hui — comme le funnel. Conséquence à
  connaître : le délai de réponse par partenaire borne sur l'ENVOI, l'écran
  Délais borne sur la RÉPONSE ; les deux le disent.
- **Taux d'acceptation = acceptés / envoyés** (un partage sans réponse
  n'est pas accepté ; refusés et sans réponse affichés à côté), masqué
  sous 5 envoyés. **Taux de transformation = gagnées / acceptés** (l'affaire
  aujourd'hui gagnée), masqué sous 5 acceptés. Une ligne « Ensemble » avec
  les mêmes règles, calculée dans la couche.
- **Commissions générées par partenaire** : acquises = confirmées + réglées
  (montant calculé, figé à la confirmation) ; prévues = vivantes seulement
  (partage en attente ou accepté). **L'encours** est un état à aujourd'hui
  — la période ne s'y applique pas, l'écran le dit ; les filtres d'affaire
  (conseiller, type, pipeline, origine), si. Les prévues d'un partage
  refusé, révoqué, expiré ou remplacé sont **caduques**, comptées à part :
  sans cette ligne, chaque renvoi de lien gonflerait les prévues. Une
  commission sans montant calculé compte dans le nombre, pas dans la
  somme (« 1 sans montant »).
- **Vieillissement** depuis `confirmed_at` observé ; une date de
  confirmation inconnue est écartée et comptée (« 1 confirmée à la date
  inconnue, 600 € »). Le seuil de relance est celui de l'organisation
  (`commission_unpaid_days`), la même règle que la pile « commissions à
  encaisser » du suivi — et le total de cette pile est PROUVÉ égal aux
  « confirmées non réglées » de l'analyse (même somme, même nombre).
- Un partenaire inactif sans partage dans la période n'apparaît pas ; un
  partenaire actif sans partage apparaît à zéro.

### Vérifié — sur des organisations jetables, pas sur des données réelles

Script temporaire contre la vraie base (`_p5-a` : 12 affaires aux chemins
connus — perdue depuis Partagée, depuis Nouveau, depuis En négociation,
sans motif, hors période, rouverte, perdue-rouverte-reperdue, née perdue,
perdue avant le journal (reconstituée), gagnée, gagnée hors période,
gagnée puis rouverte ; 4 partenaires dont un inactif ; 11 partages —
accepté, refusé, en attente, expiré, renvoyé puis accepté, révoqué, réglé,
confirmé à la date inconnue, sans commission, commission sans montant ;
`_p5-b` témoin ; `_p5-c` vide), **59 contrôles** : pertes (7 datées,
310 000 €, 1 sans montant, 1 reconstituée écartée, 2 gagnées, taux 77,8 %,
les quatre répartitions à la valeur attendue avec la dernière perte de
D7 sous son second motif, parts, clés spéciales), filtres (30 j sur la
date de la perte, conseiller, type avec parts masquées, combinés), **la
liste rend exactement chaque ligne** (toutes les pertes, chaque motif,
chaque étape de départ, chaque conseiller, chaque type, sur 5
combinaisons de filtres ; la reconstituée jamais listée ; « nées perdues
sans motif » = D8), paramètres d'URL, partenaires (6 partages dont la
chaîne comptée une fois, 2/1/1/1/1 par issue, 33,3 %, délai masqué à 3
réponses, transformation masquée à 2 acceptés, 1 000 € acquis, 2 400 €
prévus avec le dernier lien ; Deux : 80 %, médiane 1 j / moyenne 1,2 j
n = 5, 1 400 € acquis, 1 sans montant ; ensemble 11/6/2/3, 54,5 %, 33,3 %),
commissions (prévues 3, confirmées 2 = 1 600 €, réglées 1, caduques 4 =
1 400 €, vieillissement 0–30 j, date inconnue à part, seuil 14 j dépassé
par 1, **égalité avec le total du suivi**), filtres (30 j n'affecte pas
l'encours ; type ; conseiller), isolation (B ne voit que B, un motif ou
une étape de A demandés par B donnent zéro et réciproquement, super admin
sans organisation refusé sur les deux, aucune commission ne référence un
partage d'une autre organisation), organisation vide, suppression
complète. **Navigateur** (Chromium, build de production, 38 contrôles,
rejoués sur le build final) : l'écran des pertes et ses chiffres, la
ligne dont l'unique affaire n'a pas de montant écrite « — » (jamais
0 €), le clic sur un motif → liste de 3 affaires avec le bandeau, retour,
« nées perdues » → D8, préréglage 30 j, formulaire type sur 30 j (1
perte, part masquée), paramètres invalides ;
l'écran des partenaires (les deux lignes — dont la commission prévue
sans montant écrite « — » —, l'ensemble, l'inactif absent, l'encours, le
vieillissement, le seuil, la date inconnue), le nom qui
ouvre la fiche, 30 j sans effet sur l'encours ; petit écran sans
débordement ; B ; C (les deux états vides) ; super admin ; zéro erreur
console.

### Performance — mesures, et jusqu'où ça tient

### Performance — mesures, et jusqu'où ça tient

**Écrans quotidiens — avant / après.** Même protocole (jeu `_perf-test`,
build de production, session forgée, médiane de 7). Référence (étape 4) →
cette étape : tableau de bord 153 → 166 ms, contacts 124 → 140, tâches
230 → 231, suivi 123 → 127, affaires kanban 193 → 185, liste 134 → 132,
délais 130 → 137, funnel 128 → 124 ; les deux nouveaux écrans sur ce
jeu : pertes 127 ms, partenaires 127 ms. Deux passes ont été faites : la
première, juste après le `VACUUM ANALYZE` et la création du jeu, était
plus lente de 5 à 30 ms partout (tableau de bord 195, tâches 252, kanban
206 — caches froids) ; la seconde est celle retenue. Dans le bruit de
mesure : la coquille n'a pas changé, et la liste des affaires n'ajoute la
condition de perte que lorsque l'URL porte `cohorte=perte`.

**Volume — à partir de quand ça casse.** Organisation jetable
`_perf-analytique` générée côté base : 70 000 affaires (14 000 aujourd'hui
perdues, motif tiré parmi trois ou aucun ; une sur sept sans montant),
182 000 passages d'étape, 22 000 partages (20 000 envoyés à quatre
partenaires, dont 2 000 renvoyés — l'ancien lien révoqué, le nouveau
accepté), 22 000 commissions (8 996 prévues vivantes, 1 323 confirmées
non réglées, 677 réglées, 11 004 caduques). Temps depuis le code de
l'écran (aller-retour HTTP Neon compris, médiane de 3) :

| Requête | 70 000 affaires |
|---|---|
| **Pertes** (`lossesReport` : l'agrégat, les gagnées et quatre listes de libellés, en parallèle) | **106 ms** (81 ms sur 90 jours) |
| **Partenaires et commissions** (`partnersReport`, 4 requêtes en parallèle) | **182 ms** (93 ms sur 90 jours) |
| Liste après un clic : pertes, motif « Taux concurrent » (page + total) | 132 ms |
| Liste : toutes les pertes | 163 ms |
| Liste sans sélection (référence mesurée à l'étape 4) | 104 ms |

Pourquoi c'est cinq à huit fois moins cher que le funnel sur le même
volume : les pertes ne lisent que les passages VERS une étape perdue (ou
gagnée), par l'index (organisation, étape d'arrivée, date) de la
migration 0010 — un cinquième du journal ici, moins dans la vraie vie —
puis une dernière entrée par affaire ; les partenaires parcourent une
fois les chaînes de partages de l'organisation et joignent affaires et
commissions en une passe. Les deux croissent avec le nombre de pertes et
de partages de l'organisation, pas avec tout le journal ; la condition de
la liste est un `EXISTS … LIMIT 1` par affaire sur l'index (organisation,
affaire, date). **Le choix « à la volée » tient ici bien au-delà de la
limite posée pour le funnel et les délais** (~300 000 passages) : en
prolongeant linéairement — une extrapolation, pas une mesure — ces deux
écrans resteraient sous 500 ms à 300 000 passages et sous 2 s vers un
million de passages ou 300 000 partages. Les cumuls quotidiens prévus
pour les délais et le funnel viendront donc avant que ces écrans en aient
besoin ; le jour venu, la même table de cumuls (organisation, étape,
jour) porte les pertes en y ajoutant le motif et l'étape de départ. La
base réelle en est à moins d'un pour cent de ce volume.

Un piège de génération, à connaître : insérer les 70 000 premiers
passages d'étape en une seule instruction a échoué (rien d'écrit, la
table est restée vide) ; par tranches de 14 000 lignes (hachage de
l'affaire modulo 5), chaque instruction a pris de 35 s à 3 min sur le
compute de développement, et le jeu complet une quarantaine de minutes —
un générateur reprenable (chaque étape ne s'exécute que si sa table est
vide), à relancer tel quel s'il est interrompu. Mesurer les écrans
quotidiens après `VACUUM ANALYZE`, comme à l'étape 4.

## Étape 6 — le tableau de bord piloté par le pack métier, et les exports (branche `analytique-collecte`)

### 6a — l'export CSV de toute vue analytique, avec les filtres appliqués

Un lien « Exporter en CSV » dans la barre de filtres commune
(`AnalyticsFiltersBar`, prop `exportView`) ouvre
`GET /api/analytique/export?vue=<delais|funnel|pertes|partenaires>&…`
avec EXACTEMENT les paramètres de l'écran : le fichier contient ce que
l'écran montre, filtres compris.

- **La route** (`src/app/api/analytique/export/route.ts`) : `requireUser`
  (session, substitution du super admin comprise — sans organisation,
  400 : rien à exporter, un agrégat ne traverse pas la frontière entre
  clients), `parseMetricFilters` sur les mêmes paramètres que la page,
  puis `exportTables()` et `csvDocument()`. `Cache-Control: no-store`.
- **La projection** (`src/lib/metrics/export.ts`) : les quatre rapports
  des écrans — `delaysReport`, `funnelReport`, `lossesReport`,
  `partnersReport` — projetés en tableaux, jamais un calcul refait : l'écran
  et le fichier lisent le même objet. Les règles d'affichage sont celles
  des écrans : un indicateur masqué est une cellule vide et la colonne
  « Affichage » dit ce qui lui manque (« masqué : il manque 3 observations
  pour afficher un chiffre », « … au pas précédent », « … pertes pour
  afficher une part ») ; un montant dont rien n'est connu est vide, jamais
  0 ; un compte sans objet est vide, la note dit pourquoi. `periodPhrase`
  passe dans la couche (`src/lib/metrics/period-phrase.ts`) : l'export en
  a besoin, et une bibliothèque n'importe pas un composant.
- **Le dialecte** (`src/lib/csv.ts`, LE sérialiseur du produit) :
  séparateur « ; » (Excel en français ouvre en colonnes sans assistant, la
  virgule étant décimale), CRLF, UTF-8 avec BOM (sans lui, Excel lit les
  accents de travers), nombres à la virgule décimale, deux décimales au
  plus, sans séparateur de milliers ni unité (l'unité est dans l'en-tête),
  « oui » / « non », guillemets doublés quand il le faut ; `parseCsvDocument`
  fait le chemin inverse pour les vérifications.
- **Le fichier** : `clozado-<vue>-<période>-<jour>.csv` (`tout`, `30j`,
  `90j`, `12m` ou `perso`). D'abord le tableau « Export Clozado » — vue,
  organisation, période en mots, bornes, conseiller, type, pipeline,
  origine (libellés, jamais des identifiants), exporté le, seuil
  d'affichage, format — puis les tableaux de l'écran dans son ordre,
  chacun avec son titre et sa ligne d'en-tête, séparés d'une ligne vide.
  Un fichier par vue, ni archive ni « format long » : ce que l'écran
  montre, tel quel dans Excel.
- **Les tableaux.** Délais : le cycle (médiane, moyenne en jours décimaux,
  observations, affichage, en cours, écartées reconstituées / date
  inconnue), puis par pipeline le temps par étape et d'une étape à la
  suivante. Funnel : la chaîne (nombre, taux, déperdition, affichage, note
  — leads sans premier contact, perdues · en cours…), par pipeline (la
  cohorte, chaque étape avec perdues depuis / en cours ici, Gagnées,
  Perdues et En cours au total), par origine (les sept comptes, les deux
  taux, l'affichage des taux, les comptes sans objet). Pertes : sur la
  période (perdues, écartées, gagnées, taux), puis par motif, étape de
  départ, conseiller, type (affaires, part, affichage de la part, montant
  perdu, sans montant). Partenaires : par partenaire (26 colonnes, dont
  chaque taux avec son affichage et le délai avec ses observations, puis
  la ligne Ensemble — délai « non calculé pour l'ensemble »), l'encours
  par état, le vieillissement (tranches, au-delà du seuil, date de
  confirmation inconnue).
- **Au passage** : l'écran Délais listait TOUTES les définitions du
  registre (il n'y avait qu'une famille à l'étape 3) — il liste la sienne,
  comme les autres écrans.
- **Hors export** : Origines (un écran de rapprochement et de
  configuration, pas une vue analytique) ; le tableau de bord (6b).

### Vérifié (6a) — sur des organisations jetables, pas sur des données réelles

Script temporaire contre la vraie base ET le serveur de production
(`_p6-a` = le jeu de l'étape 5 aux chiffres connus, `_p6-b` témoin),
**77 contrôles** : pour les 4 vues × 6 combinaisons de filtres (sans
filtre, 30 j, conseiller, type + 90 j, origine inconnue, bornes libres),
le fichier reçu par HTTP est **cellule pour cellule égal** à la projection
du rapport calculée en mémoire — la route est la couche ; les chiffres
connus du jeu dans le fichier (7 pertes, 310 000 €, 1 sans montant, taux
77,78 %, reconstituée écartée 15 000 €, Projet abandonné 3 · 42,86 % ·
70 000 € · 1 sans montant, En négociation au montant VIDE, part masquée
sur 30 j + Placement « il manque 4 pertes pour afficher une part »,
Confrère Deux 5 · 80 % · méd. 1 j · acquises 1 400 € · prévues VIDES (1
sans montant), Ensemble 11 · 6 · 2 · 3 · 54,55 %, encours prévues 3 /
caduques 4, vieillissement, inactif absent, chaîne à 7 pas avec « Leads
reçus » sans objet, cohorte 12 / gagnées 2 / perdues 8 / en cours 2, les
quatre indicateurs du cycle vides quand le rapport masque) ; cohérence
entre rapports (7 pertes datées + 1 reconstituée = les 8 perdues du funnel,
qui compte l'état courant) ; préambule (vue, organisation, période,
conseiller « Alice », origine « Sans origine (aucun lead) », bornes libres
en mots, paramètres invalides ignorés → « depuis le début », « Tous ») ;
nom de fichier ; isolation (B : les 4 vues sans rien de A, 1 perte de
5 000 € motif B) ; sans session → redirigé vers /login sans contenu ; vue
inconnue → 400 ; super admin sans organisation → 400 ; suppression
complète. **Navigateur** (Chromium, build de production, 20 contrôles) :
sur les 4 écrans le lien pointe sur la route avec `vue=…`, le clic
télécharge `clozado-<vue>-tout-<jour>.csv` avec BOM et préambule ; pertes :
le nombre à l'écran = celui du fichier ; partenaires : l'ensemble de
l'écran = celui du fichier ; funnel : les affaires créées ; avec
`?periode=30j&type=…` le lien et le fichier gardent les filtres
(`clozado-pertes-30j-…`, Période et Type dans le préambule, 1 perte) ;
petit écran sans débordement, lien visible ; zéro erreur console. Un
piège de vérification : `Response.text()` de `fetch` retire le BOM au
décodage — le contrôler sur les octets.

**Performance** : rien n'est ajouté aux écrans quotidiens ni aux écrans
analytiques (un lien) ; un export coûte le rapport de sa vue, déjà mesuré
(à 70 000 affaires : délais 1,7 s, funnel 835 ms, pertes 106 ms,
partenaires 182 ms), plus une sérialisation de quelques centaines de
lignes, négligeable.

## Avancement

- **Étape 1 — audit** : `ea0de94`. STOP.
- **Étape 2 — corrections + couche de métriques** : migration `0009`
  appliquée, code branché, registre et famille « délais » en place. STOP.
- **Collecte** (branche `analytique-collecte`, à relire avant `main`) :
  `dbc6352` migrations `0010` (index) et `0011` (acquisition) appliquées ;
  `a8491d5` `/api/leads`, `/api/events`, `s.js`, réglages Collecte,
  Analytique → Origines, origine des affaires, purge RGPD.
- **Étape 3 — délais et durées** (même branche) : `/analytique/delais`,
  filtres dans l'URL, lead → premier contact mesurable, filtre origine,
  défaut des paires corrigé. STOP.
- **Étape 4 — funnel de conversion relié à l'acquisition** (même
  branche) : `/analytique/funnel` (chaîne, par pipeline, par origine),
  famille `funnel` du registre (onze définitions), `finishRate`, la liste
  des affaires qui rend exactement ce que le funnel compte (`cohorte`,
  `atteint`, `jusqua`, `issue`). STOP.
- **Étape 5 — pertes, partenaires, commissions** (même branche) :
  `/analytique/pertes` et `/analytique/partenaires`, familles `losses`
  (trois définitions) et `partners` (sept), la liste des affaires qui
  rend chaque ligne des pertes (`cohorte=perte`, `motif`, `depuis`).
  STOP.
- **Étape 6a — exports CSV** (même branche) : `/api/analytique/export`,
  `src/lib/metrics/export.ts`, `src/lib/csv.ts`, le lien dans la barre de
  filtres. 6b (pack métier, tableau de bord) : en cours — migration à
  soumettre.
