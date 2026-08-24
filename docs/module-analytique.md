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

## Avancement

- **Étape 1 — audit** : ce document. STOP.
