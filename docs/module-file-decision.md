# Chantier « File de décision » (le Tinder du pipe)

Commandé le 2026-09-15. Une couche AU-DESSUS du CRM : toute affaire ouverte
sans activité depuis N jours remonte dans une file traitée carte par carte,
et chaque carte impose une décision. Interdit de refactorer les écrans CRM :
on ajoute des points d'entrée (lien, badge, bandeau). Tout seuil, plafond,
motif et libellé vient de la base ; détection déterministe, aucun appel IA.

Ce document porte l'audit de l'étape 0, la définition retenue, le schéma
proposé et les décisions à trancher. Il sera complété étape par étape.

## 0. Audit (étape 0, 2026-09-15) — ce qui existe, ce qui manque

Lu par neuf lecteurs sur des sujets disjoints puis contredit par trois
contradicteurs (déterminisme, isolation, conformité au cahier). Chaque
constat renvoie au code.

### 0.1 Les tables existent

- **Affaires** = `deals` (`src/db/schema/deals.ts`) : `organization_id`,
  `pipeline_id`, `status_id` (l'étape), `owner_id` NULL-able, `contact_id`,
  `estimated_amount`, `created_at`, `updated_at`. Aucune colonne d'état
  (archivée, supprimée, dernière activité). Aucun geste de suppression ni
  d'archivage d'affaire n'existe (grep `deleteDeal|archiveDeal|delete(deals)`
  vide) ; les six tables filles cascadent sur un DELETE.
- **Étapes** = `deal_statuses` par organisation et par pipeline
  (`outcome` NULL | won | lost). « Affaire ouverte » = `deal_statuses.outcome
  IS NULL` de l'étape courante — définition unique, réécrite dans chaque
  requête (`src/lib/metrics/volumes.ts:43-52`, funnel, pertes, fiche
  contact, vitrine). Un pipeline peut n'avoir AUCUNE étape perdue
  (`createPipeline` ne crée que « nouveau ») ou en avoir plusieurs ; le
  motif de perte est FACULTATIF au kanban (`changeDealStage`,
  `src/db/queries/deals.ts:194-203`).
- **Activités** : quatre sources datées, toutes écrites par un geste humain
  (utilisateur ou partenaire), jamais par un cron :
  `activities.occurred_at` (appel, email, rendez-vous, note ; `deal_id`
  NULL-able), `deal_stage_changes.changed_at` (passage d'étape, utilisateur
  ou partenaire par jeton), `deal_events.created_at` (journal PRM, enum
  fixe), `tasks.completed_at` (tâche achevée). Le journal unifié d'une
  affaire les fusionne à la lecture (`src/db/queries/activities.ts`).
- **Onboarding** : « premiers pas », huit étapes cochées PAR LES DONNÉES
  (`src/lib/onboarding/steps.ts`, `src/db/queries/onboarding.ts`) ; visite
  guidée ancrée par `data-tour` (`src/lib/tour/steps.ts`).
- **Seuils par organisation** : précédent direct — cinq colonnes
  `integer NOT NULL DEFAULT` sur `organizations` (`share_pending_reminder_days`…,
  `src/db/schema/organizations.ts:43-63`), lues par `/suivi`. Aucun écran
  ne les règle. Aucune table de réglages plateforme n'existe (38 fichiers de
  schéma) ; la seule table sans organisation est le catalogue de marché,
  « exception assumée » (`src/db/schema/market.ts:13-17`).
- **Motifs de perte** = `loss_reasons` par organisation (lignes, jamais un
  enum) : créer et supprimer seulement (un motif référencé est
  insupprimable, FK NO ACTION) ; pas de renommage, pas de désactivation ;
  AUCUN motif par défaut semé pour une organisation neuve (la carte naît
  vide) — seule la démo en a.

### 0.2 Ce que la lecture a révélé et qui change la commande

1. **`deals.updated_at` n'est pas une activité.** Bougé par une correction
   de montant, un changement de responsable, la tombale d'un contact, une
   fusion, le rattachement d'une origine — et JAMAIS par une note, un
   partage, une tâche achevée. À exclure (le cahier le demandait).
2. **La règle « un member voit ses transactions » n'existe pas dans le
   produit.** `orgScope` traite admin et member à l'identique ; le kanban et
   la table montrent toute l'organisation à un member ; `createDeal` ne pose
   JAMAIS `owner_id` (le formulaire ne le propose pas) ; n'importe quel member
   peut changer le responsable de n'importe quelle affaire ; et le rôle
   member est « inatteignable » par l'interface (audit, pas d'invitation de
   membre). Une file strictement `owner_id = moi` serait VIDE dans un espace
   réel. → décision D1.
3. **Un email reçu du client ne touche pas l'affaire.** La confirmation
   d'un email ingéré crée une `activities` avec `contact_id` seulement
   (`src/lib/email/inbound/confirm.ts:69-75`) ; emails envoyés et
   rendez-vous sont rattachés au contact, sans `deal_id`. Le produit a déjà
   une « dernière interaction » PAR CONTACT = GREATEST(activités, RDV tenus,
   clics) (`src/db/queries/engagement.ts:34-47`). → décision D2.
4. **Deux sémantiques de « jour » coexistent** : fenêtre glissante en
   instants pour les seuils (`daysBetween` = floor(ms / jour),
   `src/db/queries/deal-follow-up.ts:15-20`, partagé avec les tâches
   automatiques ; `now() - make_interval` dans les règles) ; jour
   CALENDAIRE du fuseau de l'organisation pour les échéances (`parseDueDate`
   stocke la date à 00:00Z, comparée à `todayAsStoredDate(fuseau)`,
   `src/db/queries/tasks.ts:27-47`). Il n'existe PAS de « fin de journée
   dans le fuseau de l'organisation ». Le seuil suit la première, les dates
   de retour la seconde.
5. **Une FK composite `ON DELETE SET NULL` est impossible** : Postgres met
   TOUTES les colonnes à NULL, `organization_id` compris — le schéma le
   documente (`src/db/schema/deal-events.ts:67-72`). Le journal des décisions
   ne peut pas « survivre par SET NULL » à la suppression d'une affaire.
6. **Sans transaction (neon-http), un geste = un `db.batch`** (qui, lui,
   est transactionnel : `drizzle-orm/neon-http/session.js:117-132`). Journal
   puis DELETE en deux appels séparés laisserait une ligne « supprimée »
   pour une affaire vivante si le DELETE échoue.
7. **`changeDealStage` sort en silence** quand l'étape visée est l'étape
   courante (`deals.ts:181`) : la file doit refuser ce cas avant d'appeler.
8. **Le partenaire agit par jeton sans regarder l'état de l'affaire** :
   `applyPublicShareAction` ne teste que `outcome` et le pipeline
   (`src/db/queries/deal-shares-public.ts:207-215`) — il pourrait faire
   avancer une affaire archivée.
9. **Migration 0018 (invitations) n'est appliquée qu'en local.** Le
   migrateur applique en UNE passe tout ce qui suit la dernière ligne
   enregistrée et n'écrit le journal qu'à la fin : `npm run db:migrate:http`
   exécutera 0018 PUIS 0019. L'accord à demander porte sur les DEUX. Et
   0019 ajoute des colonnes à `deals`/`organizations` : un code poussé AVANT
   la migration casse chaque `select` (pas de tolérance 42P01 pour une
   colonne) → protocole « migrer PUIS pousser » (docs/module-demo.md §2).
10. **Aucune mécanique existante ne couvre « affaire sans activité »** :
    la pile « sans suite » de `/suivi` et la tâche automatique
    `deal_accepted_stale` mesurent un PARTAGE accepté (clé `share_id`), pas
    l'affaire ; le moteur de règles ne connaît que le contact. Rien ne
    s'affiche nulle part comme « affaire sans mouvement ». La file sera la
    troisième définition d'inactivité du dépôt (contact, cible, affaire) et
    doit être nommée comme telle.
11. **Tout se calcule à la lecture, jamais par cron** : le plan Hobby
    n'accepte que deux crons quotidiens, tous deux pris ; `/suivi`, le badge,
    les tâches automatiques sont recalculés à chaque requête. La file fera de
    même (une requête ; un COUNT séparé pour le badge).
12. **Le visiteur de la démo publique est `{ role: "admin", readOnly: true }`** :
    le proxy refuse ses actions serveur, mais la page doit AUSSI rendre
    l'état lecture seule et aucune route GET ne doit agir
    (docs/module-demo.md §1.4).
13. **Petits faits utiles** : `listDeals` est du code mort ; deux
    conventions de garde admin coexistent (prendre `assertOrgAdmin`) ; la
    convention des jours à l'écran est `fmt.days(n)` (« 12 j ») ;
    `fmt.relative` rend la date absolue au-delà de 7 jours ; aucun composant
    Notice/Alert n'existe (dette listée dans docs/refonte-ui.md) ; aucun
    hook de raccourcis clavier partagé (motif `use-block-history.ts`) ; pas
    de swipe de carte dans le socle (le kanban a tranché « boutons
    explicites au doigt ») ; `deal_events` n'a pas d'index
    `(organization_id, deal_id)`.

## 1. Définition déterministe de « dernière activité » d'une affaire

`last_activity_at` = **MAX** des instants suivants, tous lus en base :

| # | Source | Colonne de date | Condition | Qui écrit |
|---|--------|-----------------|-----------|-----------|
| 1 | `deals` | `created_at` | plancher — une affaire neuve n'est jamais stagnante avant N jours | création |
| 2 | `deal_stage_changes` | `changed_at` | toutes les lignes de l'affaire | utilisateur, partenaire par jeton |
| 3 | `activities` | `occurred_at` | `deal_id = affaire`, tous types, toute direction | saisie manuelle |
| 4 | `tasks` | `completed_at` | `deal_id = affaire AND status = 'done'` | achèvement d'une tâche |
| 5 | `deal_events` | `created_at` | `deal_id = affaire AND type IN (share_sent, share_accepted, share_declined, share_revoked, commented, commission_updated)` | utilisateur, partenaire |
| 6 | selon D2 | `activities.occurred_at` (`contact_id = deals.contact_id AND deal_id IS NULL`) et `appointments.starts_at` (contact, `status = 'scheduled' AND starts_at <= now`) | les interactions avec LE CLIENT de l'affaire | saisie, ingestion, Calendly |

**Ne comptent pas** : `deals.updated_at` ; `deal_events` `share_viewed`
(passif), `share_expired` (système), `deal_created`/`status_changed`
(redits par 1 et 2), `origin_changed` (modification de champ) ; les tâches
ouvertes ; les emails envoyés, ouvertures et clics ; les rendez-vous à
venir ; les décisions de la file elles-mêmes (elles portent leurs propres
dates de retour, voir §2).

Précisions vérifiées : les lignes `deal_stage_changes.reconstructed` sont
incluses sans filtre — celles insérées par la migration 0009 datent de
`created_at` (déjà le plancher), les autres sont de vraies observations ;
`occurred_at` peut être saisi a posteriori (le journal date le fait, pas la
saisie) mais jamais plus de 5 min dans le futur ; rouvrir ou supprimer une
tâche, ou la tombale d'un contact, peuvent faire REMONTER une affaire (source
non monotone, assumé).

**Jours de stagnation** = `daysBetween(last_activity_at, now)` (floor
ms / 86 400 000, fonction existante) — tranches de 24 h glissantes, comme
`/suivi`. En SQL : `floor(extract(epoch from (now - last)) / 86400)`, même
résultat. **Un seul `now`** calculé en JS par requête HTTP (`cache()` de
React) et passé en paramètre lié à toute requête : le badge, la liste et la
carte voient le même instant — jamais `now()` Postgres.

**Seuil applicable** = `COALESCE(deal_statuses.stagnation_days de l'étape
courante, organizations.stagnation_days, platform_settings.stagnation_days)`
; la source retenue (`stage` | `organization` | `platform`) est rendue sur
la carte. **Stagnante ⇔ jours ≥ seuil.**

## 2. Appartenance à la file — précédence écrite

Soit `today` = `todayAsStoredDate(fuseau de l'organisation)` (00:00Z de la
date du jour dans le fuseau) et `now` l'instant de la requête.

Périmètre : affaires de l'organisation de la personne
(`getOwnOrganizationOrThrow`, jamais `orgScope` nu — un super admin en vue
globale verrait toutes les organisations), dont l'étape courante a
`outcome IS NULL`, restreintes selon D1.

1. **Archivée** (`archived_at IS NOT NULL`) : dans la file si et seulement si
   `wake_at IS NOT NULL AND wake_at <= today` → raison « réveil prévu le X ».
   Sinon exclue, quoi que disent les autres colonnes.
2. Sinon, **reportée** (`review_at > today`) : exclue.
3. Sinon, **retour** (`review_at <= today` et `last_activity_at <=
   review_set_at`, aucune activité depuis la décision) : dans la file →
   raison « retour prévu le X, aucune activité depuis N jours ».
4. Sinon **règle normale** : dans la file si `jours ≥ seuil` → raison
   « Aucune activité depuis N jours — étape {étape} — seuil de l'étape :
   S jours » (ou « seuil global : S jours », ou « seuil plateforme »).

Tri : `last_activity_at ASC, id ASC` (déterministe à date égale). L'écran
montre la PREMIÈRE carte + un COUNT (« X restantes ») — une décision
retire la carte, la suivante devient la première ; jamais la liste entière
en mémoire.

La raison est rendue côté serveur par un traducteur passé à la requête
(`TranslatorOf<"decisions.queries">`, motif de `queries/activities.ts`),
ICU fr + en (`{days, plural, one {# jour} other {# jours}}`) ; le libellé
d'étape vient de `deal_statuses.label`.

## 3. Schéma proposé (migration 0019, appliquée avec 0018)

### Tables nouvelles

1. **`platform_settings`** — une ligne : `id smallint PK CHECK (id = 1)`,
   `stagnation_days int NOT NULL CHECK 1..365`, `postpone_limit int NOT NULL
   CHECK 0..99`, `updated_at`, `updated_by uuid → users SET NULL`. Déclencheur
   `platform_settings_delete_guard` (modèle `organizations_delete_guard`,
   0017) : la ligne ne se supprime pas. Semée par la migration (valeurs D10).
   Modifiable par le VRAI super admin (`requireSessionUser`, jamais la
   substitution). Deuxième table sans organisation du produit → D11.
2. **`platform_reason_defaults`** — `id`, `kind text CHECK ('loss','deletion')`,
   `locale text`, `label text`, `position int`, `active bool`, horodatages ;
   unique `(kind, locale, label)`. Les libellés instanciés dans chaque
   organisation neuve DANS SA LANGUE (`default_locale`), modifiables par le
   super admin. Semée fr + en par la migration.
3. **`deal_deletion_reasons`** — par organisation : `organization_id`
   (cascade), `label`, `position`, `active bool DEFAULT true`, horodatages ;
   unique `(organization_id, label)`, unique `(id, organization_id)` (cible
   de FK composite). Semée par la migration pour les organisations existantes
   (`INSERT … SELECT … WHERE NOT EXISTS`, dans leur langue) et à la naissance
   pour les neuves (insert non exécuté ajouté au `db.batch` de
   `createOrganizationWithAdmin` + les trois scripts qui appellent
   `seedDefaultDealStatuses` + le semis démo).
4. **`deal_decisions`** — le journal :
   `id`, `organization_id` (cascade), `deal_id uuid NULL`, instantané
   `deal_title`, `client_name`, `estimated_amount` (survivent à la
   suppression), `user_id uuid → users SET NULL` (FK simple : un super admin
   substitué n'a pas d'organisation), `action text CHECK IN ('follow_up',
   'stage_change', 'postpone', 'lost', 'archive', 'delete')` (vocabulaire
   technique fixe, convention récente text + CHECK), `presence_reason text
   CHECK IN ('stale', 'review', 'wake')`, `threshold_source text NULL CHECK
   IN ('stage', 'organization', 'platform')`, `threshold_days int NULL`,
   `stagnation_days int NOT NULL`, `last_activity_at timestamptz NOT NULL`,
   `queued_since timestamptz NOT NULL` (entrée estimée dans la file :
   `last_activity_at + seuil`, ou `review_at`/`wake_at` pour un retour),
   `loss_reason_id`, `deletion_reason_id`, `to_status_id`, `task_id uuid →
   tasks(id) SET NULL` (FK simple : `tasks` n'a pas d'unique
   `(id, organization_id)`), `review_at`, `wake_at`, `comment`, `decided_at`.
   FK composites **NO ACTION** : `(deal_id, organization_id) → deals`,
   `(loss_reason_id, organization_id) → loss_reasons`,
   `(deletion_reason_id, organization_id) → deal_deletion_reasons`,
   `(to_status_id, organization_id) → deal_statuses`. À la suppression
   d'une affaire, le `db.batch` nullifie explicitement `deal_id` des lignes
   de journal AVANT le DELETE (voir §4). Index : `(organization_id,
   decided_at)`, `(organization_id, deal_id, decided_at)`, `(organization_id,
   user_id, decided_at)`, `(organization_id, action, decided_at)`. Ajoutée à
   `COUNTED_TABLES` du journal démo et au « zéro reliquat » de
   `test-isolation`.

### Colonnes ajoutées

5. `organizations.stagnation_days int NULL CHECK 1..365` (NULL = valeur
   plateforme ; observable pour l'onboarding), `organizations.postpone_limit
   int NULL CHECK 0..99`.
6. `deal_statuses.stagnation_days int NULL CHECK 1..365` — la surcharge par
   étape (via `StageInput`/`updateStage`, un champ de plus dans le formulaire
   d'étape de /settings).
7. `loss_reasons.active boolean NOT NULL DEFAULT true` — désactiver sans
   supprimer (+ fonction de renommage, absente aujourd'hui, index unique
   `(organization_id, label)` à respecter).
8. `deals.review_at timestamptz NULL` (date de retour, 00:00Z comme
   `tasks.due_at`), `deals.review_set_at timestamptz NULL` (instant de la
   décision qui l'a posée), `deals.postpone_count int NOT NULL DEFAULT 0
   CHECK >= 0`, `deals.archived_at timestamptz NULL`, `deals.wake_at
   timestamptz NULL` ; CHECK `(wake_at IS NULL OR archived_at IS NOT NULL)`,
   CHECK `((review_at IS NULL) = (review_set_at IS NULL))` ; index partiels
   `(organization_id) WHERE archived_at IS NOT NULL` et `(organization_id,
   review_at) WHERE review_at IS NOT NULL`.
9. `deal_events` : index `(organization_id, deal_id, created_at)` — absent
   aujourd'hui, nécessaire au MAX par affaire.

Conventions de la migration (lues dans 0016-0018) : `IF NOT EXISTS`
partout, FK dans les `CREATE TABLE`, contraintes sur table existante en
bloc `DO $$ … IF NOT EXISTS (pg_constraint) …`, semis en `INSERT … SELECT
… WHERE NOT EXISTS` (jamais `ON CONFLICT`), snapshot drizzle-kit chaîné sur
0018 (`prevId d6345f39-…`), `when` du journal > 1789396853216, rejouée deux
fois sur la base locale (`--env-file=.env.local-demo`).

## 4. Les six gestes (étape 3) — écritures et gardes

Chaque geste : action serveur (`<form action>`, jamais une route GET qui
agit), `getDeal` + `assertOrgAccess` d'abord, refus si `user.readOnly` ou
`isDemoOrganization`, vérification que l'affaire est ENCORE dans la file à
l'instant du geste (double onglet, collègue) → `AppError` à clé sinon, puis
UN `db.batch` (écriture + journal), et `redirect(backTo)` avec
`withError`/toast — le badge suit gratuitement. Seuils et plafonds lus sur
l'organisation DE L'AFFAIRE. Tout geste remet `review_at`/`review_set_at` à
NULL avant de poser éventuellement les siens ; tout geste autre
qu'Archiver/Supprimer sur une affaire réveillée remet `archived_at`/`wake_at`
à NULL (D6).

1. **Relancer** — `createTask` (existant) avec `deal_id`, échéance
   OBLIGATOIRE (validée côté file, `createTask` l'accepte nulle), titre
   demandé sur la carte (ou généré par `translatorFor(langue de
   l'organisation)`), responsable = la personne ; puis `deals.review_at =
   échéance de la tâche`, `review_set_at = now` ; journal `follow_up`
   (`task_id`). La tâche achevée est une activité (source 4) ; non faite à
   l'échéance, l'affaire REVIENT à cette date (règle 3 du §2). Cohérent avec
   Reporter (« je m'en occupe le X » a le même effet dans les deux gestes),
   sans consommer le plafond de reports.
2. **Changer d'étape** — refus si l'étape visée est l'étape courante
   (`changeDealStage` sortirait en silence) ; `changeDealStage` (existant,
   trois écritures atomiques, vérifie organisation et pipeline) puis journal
   `stage_change` (`to_status_id`).
3. **Reporter** — date de réexamen OBLIGATOIRE, strictement > aujourd'hui
   dans le fuseau de l'organisation (min du champ = demain + contrôle
   serveur ; rend impossible « reporter à aujourd'hui » et deux reports le
   même jour) ; stockée 00:00Z (`parseDueDate`) ; `postpone_count += 1` ;
   journal `postpone`. Bouton DÉSACTIVÉ avec explication si
   `postpone_count >= plafond` (organisation sinon plateforme) — plafond
   cumulatif par affaire, jamais remis à zéro (D3).
4. **Perdue** — motif OBLIGATOIRE parmi les motifs ACTIFS de l'organisation
   (vérifié dans l'action : `changeDealStage` ne connaît pas `active`),
   commentaire facultatif ; `changeDealStage` vers l'étape perdue du
   pipeline (une seule → automatique ; plusieurs → choix sur la carte, tri
   `position, created_at, id` ; aucune → bouton désactivé + lien
   `/settings#pipelines`) ; journal `lost`. Liste de motifs vide (tous
   désactivés) → bouton désactivé + lien `/settings#motifs`.
5. **Archiver** — `archived_at = now`, `wake_at` facultatif (date, 00:00Z,
   > aujourd'hui) ; journal `archive`. Exclue de la file, de `pipeline_open`
   et, selon D4, du kanban/de la table. La vitrine partenaire et
   `createDealShare` refusent une affaire archivée (ajout d'une condition,
   D5). « Désarchiver » vit sur la liste des archivées (D4).
6. **Supprimer** — admins seulement (`assertOrgAdmin` + `assertOrgAccess`,
   clé d'erreur dédiée), motif de suppression OBLIGATOIRE (liste active de
   l'organisation), `ConfirmSubmit` destructif ; refusé si l'affaire porte
   une commission, un partage non révoqué ou un événement partenaire (la
   base ne bloque rien) ; un seul `db.batch` : `UPDATE deal_decisions SET
   deal_id = NULL WHERE deal_id = X AND organization_id = Y`, INSERT du
   journal `delete` (instantané titre/client/montant), `DELETE FROM deals
   WHERE id = X AND organization_id = Y` (cascade totale : événements,
   passages, tâches, interactions, commissions, partages). → D7.

Raccourcis clavier : `useEffect` keydown local dans le composant client de
la carte (motif `use-block-history.ts` : garde champs de saisie), touches
affichées via `<Kbd>{t(…)}</Kbd>`. Mobile (étape 7) : aucun swipe dans le
socle — composant neuf à écrire (Base UI ne balaie que Drawer/Toast) ou
boutons pleine largeur ; à trancher à l'étape 7.

## 5. Points d'entrée (étape 4), réglages (5), pilotage (6)

- **Navigation** : une entrée `{ href: "/decisions", key: "decisions",
  badge: "decisions", requiresOrganization: true }` dans la section
  « Aujourd'hui » de `navigation.ts` (barre latérale, panneau replié, menu
  « Menu » de la barre d'onglets et palette ⌘K suivent) ; `NavBadge` gagne
  `decisions` ; le layout calcule un COUNT (même prédicat SQL que la liste,
  même `now`) dans son `Promise.all`. Pas d'onglet mobile supplémentaire
  (la doc dit « quatre destinations du pouce »).
- **Tableau de bord** : bandeau « N affaires attendent une décision »
  avant la grille des tuiles, rendu seulement si N > 0 ; composant
  `ui/notice.tsx` NEUF (dette listée dans docs/refonte-ui.md), pas un
  refactor.
- **Réglages** (`/settings`) : une Card « File de décision » + ancre dans
  `SettingsNav` : seuil global (champ prérempli avec la valeur plateforme ;
  enregistrer pose la valeur, « revenir à la valeur plateforme » la remet à
  NULL), plafond de reports, motifs de perte (ajouter, renommer, désactiver,
  réactiver — la suppression existante reste), motifs de suppression ; le
  seuil par étape = un champ de plus dans le formulaire d'étape existant.
  Members : page visible, champs `disabled`, boutons masqués — et chaque
  requête d'écriture commence par `assertOrgAdmin` (la garde vit dans la
  requête, pas à l'écran).
- **Onboarding** : 9e étape « seuil de stagnation défini » cochée par
  `organizations.stagnation_days IS NOT NULL` (même structure que la couleur
  de marque : défaut appliqué, choix observable) ; effet : tout espace à 8/8
  repasse à 8/9 et revoit la carte, sauf cookie « masque ». Visite guidée :
  une étape `TOUR_STEPS` ancrée sur la file.
- **Plateforme** (vrai super admin, vue globale) : une Card sur le tableau
  de bord global ou une page `superAdminOnly` : seuil et plafond plateforme,
  libellés par défaut fr/en ; chemin à ajouter à `DEMO_FORBIDDEN_PATHS` si
  hors `/settings` et `/invitations`.
- **Pilotage** (admins seulement, `/decisions/pilotage`) : depuis
  `deal_decisions` + la file courante — en attente (COUNT), ancienneté
  moyenne de la file (jours), délai moyen entrée→décision (`decided_at -
  queued_since`, ESTIMÉ : le seuil du moment de la décision, pas
  d'historique des seuils), répartition des décisions, part du pipe ouvert
  en stagnation = affaires (ouvertes, non archivées) à `jours ≥ seuil` /
  affaires ouvertes non archivées (les retours réexamen/réveil comptés à
  part), motifs de perte les plus fréquents « décidés depuis la file »
  (l'analytique compte TOUTES les pertes : deux chiffres, deux noms). Par
  membre (`user_id`) et pour l'équipe. Hors registre `METRICS` (assumé).

## 6. Décisions à trancher avant l'étape 1

| # | Question | Options | Recommandation |
|---|----------|---------|----------------|
| D1 | Portée d'un member | (a) toute l'organisation, filtre « responsable » optionnel comme /affaires ; (b) `owner_id = moi OR (owner_id IS NULL AND created_by = moi)` ; (c) `owner_id = moi` strict (file vide en pratique) | **(b)** : respecte l'esprit du cahier sans file vide ; filtre d'affichage, pas une frontière (le CRM montre tout au member) ; appliqué à la liste, au badge, au bandeau ; le pilotage reste admin |
| D2 | Les interactions avec le CLIENT de l'affaire (activités du contact sans `deal_id`, dont l'email reçu ; rendez-vous tenus) comptent-elles ? | (a) non, seules les sources à `deal_id` ; (b) oui : activités du contact lié + rendez-vous tenus ; (c) (b) + une tâche ouverte ou un RDV à venir sort l'affaire de la file | **(b)** : sinon un client qui répond par email laisse son affaire « sans activité » ; un contact à plusieurs affaires les réveille toutes (explicable sur la carte) |
| D3 | Plafond de reports | cumulatif par affaire, jamais remis à zéro | garder tel quel |
| D4 | Archivées : visibles où ? | (a) exclues du kanban, de la table et des totaux (`AND archived_at IS NULL` dans trois requêtes) + liste « Archivées (N) » avec « Désarchiver » dans /affaires ; (b) visibles avec un badge ; (c) rien | **(a)** : « sort du pipe actif » n'a de sens visible qu'ainsi ; c'est un point d'entrée (une liste, un lien), pas un refactor ; `pipeline_open` les exclut, l'analytique historique (`dealConditions`) ne change pas |
| D5 | Partenaire et affaire archivée | (a) refus dans la vitrine et à la création d'un partage (une condition ajoutée) ; (b) réveil implicite ; (c) rien | **(a)** |
| D6 | Toute décision (sauf Archiver/Supprimer) sur une affaire réveillée la désarchive | oui / non | oui |
| D7 | Supprimer | (a) DELETE physique gardé (refus si commission, partage actif, événement partenaire) ; (b) pierre tombale exclue partout ; (c) pas de Supprimer dans la file | **(a)** : doublon et erreur de saisie sont des données qu'on VEUT voir disparaître ; la tombale imposerait le filtre d'archivage en plus large |
| D8 | Seed Dupont/Martin | script gitté idempotent `scripts/seed-decision-queue-demo.ts` : contacts + affaires titrées « [Démo file] … », RE-DATÉES à chaque exécution, `--destroy` ; ce sont des organisations VIVANTES de la base partagée | oui, avec marquage ; **un member chez Dupont exige une vraie adresse email** que tu me donnes (Auth.js par lien magique) — sinon preuve par scope forgé dans `test-isolation` seulement |
| D9 | Double signalement avec /suivi (pile « sans suite », tâche `deal_accepted_stale`, mesurés par PARTAGE) | accepter / exclure de la file les affaires à partage accepté | accepter et le dire : la file décide sur l'AFFAIRE, /suivi sur le partage |
| D10 | Valeurs plateforme semées par 0019 | seuil global, plafond | **10 jours, 3 reports** (l'exemple du cahier parle de 10 jours) |
| D11 | Où vit la valeur plateforme | (a) `platform_settings` (table sans organisation — deuxième exception à la doctrine « toute donnée appartient à une organisation ») ; (b) DEFAULT de colonne (modifiable seulement par migration, onboarding inobservable) | **(a)** : c'est ce que le cahier exige (« modifiables par super_admin ») ; doctrine amendée dans ce document |
| D12 | `loss_reasons.active` : `listLossReasons` filtre-t-elle les inactifs ? | (a) oui (kanban et fiche cessent de proposer un motif désactivé ; /settings montre les inactifs avec « réactiver ») ; (b) une liste « actifs » pour la file seule | **(a)** |
| D13 | Libellés par défaut des motifs pour les organisations EXISTANTES | backfill par 0019 seulement là où aucun motif de perte n'existe (Dupont, Martin) / jamais | backfill « si vide » |
| D14 | Nom de l'écran et de l'URL | `/decisions`, entrée « File de décision » | à valider |

## 7. Plan des étapes et protocole

| Étape | Contenu | Livraison |
|-------|---------|-----------|
| 0 | audit + proposition (ce document) | docs seul, commit + push |
| 1 | schéma Drizzle + 0019 SQL + snapshot + seeds (plateforme, motifs, Dupont/Martin) + semis à la naissance | **STOP** : SQL de 0018 ET 0019 montrés ; application sur la base partagée avec ton accord ; le code du schéma n'est poussé sur main QU'APRÈS (protocole « migrer puis pousser », sinon chaque `select` sur `deals` casse en production) ; rejouabilité prouvée deux fois en local |
| 2 | `src/db/queries/decisions.ts` (prédicat SQL unique pour liste et COUNT, `now`/`today` liés), raison rendue par traducteur, test vitest du SQL généré, contrôles `test-isolation` (file de B sans l'affaire de A, gestes croisés refusés, 23503 sur les FK composites, zéro reliquat), mesure sur `perf-dataset` (500 affaires) | commit + push, parcours A/B/C |
| 3 | écran `/decisions` (page, loading, error, état vide « pipe à jour »), six gestes, raccourcis, lecture seule démo | idem |
| 4 | badge, bandeau (composant Notice), entrée de navigation | idem |
| 5 | réglages organisation, plateforme (super admin), onboarding, visite | idem |
| 6 | pilotage admin | idem |
| 7 | mobile, trois états revus, récap + parcours complet | idem |

Convention de commit inchangée (français, détaillé, eslint propre) ; pas de
typecheck local ; `git status` propre et `git log` montrés à chaque fin
d'étape.
