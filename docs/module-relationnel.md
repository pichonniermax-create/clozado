# Module relationnel — contacts, tâches, pipeline

Notes de chantier, même rôle que `docs/module-prm.md`. Ce document commence
par les trois décisions d'architecture demandées avant toute ligne de code
(étape 1 de l'ordre de travail). Le schéma complet et les migrations
viendront à l'étape 2, après validation.

État des lieux au moment de l'analyse : commit `3b7d810`.

---

## A. Unification pipeline ↔ affaires existantes

### Ce que `deals` porte déjà

`title`, `client_name` (texte libre), `type_id` et `status_id` (tous deux
des lignes de table PAR ORGANISATION, verrouillées par FK composites),
`estimated_amount` numeric(12,2), `description`, `created_by`, timestamps.
Les statuts (`deal_statuses`) ont déjà : slug, label, couleur, position —
par organisation.

### La proposition : `deal_statuses` DEVIENT la table des étapes

Le produit possède déjà une table d'étapes configurables par organisation :
`deal_statuses`. Créer une table `pipeline_stages` à côté donnerait deux
systèmes d'état concurrents sur le même objet — exactement la maladie que
la décision A interdit. Donc :

- **Nouvelle table `pipelines`** (par organisation : libellé, position).
  Plusieurs par organisation (crédit, placement, transaction).
- **`deal_statuses` s'enrichit** : `pipeline_id` (FK composite vers
  `pipelines(id, organization_id)`), `probability` (entier 0–100,
  indicatif), `outcome` (`won` | `lost` | NULL — marqueur technique fixe,
  pas une valeur métier : mêmes libellés pour tout le monde, seule
  l'appartenance d'une étape à ce marqueur est configurable).
- **`deals` s'enrichit** : `pipeline_id` (FK composite ; l'étape d'une
  affaire doit appartenir à son pipeline — contrainte à poser),
  `expected_close_date`, `probability` (dérogation optionnelle à celle de
  l'étape ; NULL = celle de l'étape), `owner_id` (conseiller responsable,
  FK users), `loss_reason_id` (FK composite vers nouvelle table
  `loss_reasons` par organisation), `contact_id` (FK composite vers
  `contacts`, NULLABLE — les affaires existantes n'ont qu'un
  `client_name`).
- **Migration des données** : un pipeline par défaut créé par organisation
  existante ; ses `deal_statuses` actuels lui sont rattachés tels quels
  (libellés, couleurs, positions conservés) ; toutes les affaires
  existantes pointent vers ce pipeline. Rien ne change à l'écran pour un
  client actuel tant qu'il ne crée pas de second pipeline.

### Historique des changements d'étape

`deal_events` journalise déjà `status_changed`, mais en texte (le libellé),
inutilisable pour calculer des durées par étape. Proposition : nouvelle
table `deal_stage_changes` (organization_id, deal_id, from_status_id NULL
au premier passage, to_status_id, changed_at, acteur user OU partenaire —
même contrainte d'attribution que `deal_events`). Le journal humain
(`deal_events`) continue d'être écrit en parallèle : l'un raconte, l'autre
mesure. Les durées par étape se calculent par différence entre lignes
consécutives d'une même affaire.

### Cohabitation avec le PRM — le point sensible

La route publique (`deal-shares-public.ts`) permet à un partenaire, via son
jeton, de CHANGER le statut de l'affaire (borné aux statuts de
l'organisation du partage). Avec le pipeline, cela devient : un tiers sans
compte peut déplacer une affaire dans le pipeline — y compris vers
« gagné »/« perdu », ce qui fausserait les métriques et déclencherait des
motifs de perte sans motif. **Proposition** : la route publique n'offre au
partenaire que les étapes du pipeline de l'affaire SANS marqueur
won/lost — clore une affaire reste un geste de l'organisation. C'est un
changement de comportement du PRM existant, signalé ici pour arbitrage.

Tout le reste du PRM est indifférent à l'enrichissement : partages,
commissions, suivi et vitrine lisent `deal.status_id` et ses libellés,
qui ne changent pas de nature.

---

## B. Origine des contacts

### Champs d'anticipation de la synchronisation (sans la construire)

Sur `contacts` :

- `source` : `manual` | `import` | `external` (protocole technique fixe —
  enum acceptable, comme `deal_share_status`).
- `external_system` : texte libre nullable (« hubspot », « pipedrive »…) —
  pas d'enum : on ne connaît pas la liste des CRM du marché.
- `external_id` : identifiant du contact dans le système d'origine,
  nullable.
- `last_synced_at` : timestamp nullable.
- Contrainte CHECK : `external_system` et `external_id` sont remplis
  ensemble ou nuls ensemble ; `source = 'external'` ⇔ remplis.
- Index unique partiel `(organization_id, external_system, external_id)
  WHERE external_system IS NOT NULL` : jamais deux fiches locales pour le
  même enregistrement distant.

### Règle de résolution de conflit — explicite, écrite ici

1. Le CRM externe est la source de vérité des champs d'IDENTITÉ et de
   COORDONNÉES qu'il fournit (nom, email, téléphone, société…).
2. Ce qui naît DANS Clozado n'est jamais écrasé par une synchro : notes,
   étiquettes, tâches, affaires, journal d'activité, attribution.
3. Si la fiche a été modifiée localement APRÈS `last_synced_at`
   (`updated_at > last_synced_at`), une future synchro ne doit PAS écraser
   en silence : elle marque le conflit et le montre à l'utilisateur, qui
   tranche champ par champ.
4. La granularité par champ (colonnes fantômes mémorisant la dernière
   valeur synchronisée de chaque champ) est volontairement REJETÉE
   aujourd'hui : elle double le schéma pour un besoin hypothétique. La
   règle 3 suffit à garantir qu'aucune donnée locale ne se perd — au prix
   de conflits à résoudre à la main, ce qui est le bon défaut.

### Newsletters « reçues » — constat d'existant

Le module mailing n'envoie rien : il exporte du HTML collé ensuite dans
HubSpot/Brevo, et ses `mail_targets` sont des personas, pas des
destinataires. **L'information « ce contact a reçu telle newsletter »
n'existe donc nulle part aujourd'hui.** La fiche contact prévoira
l'emplacement (section vide expliquant d'où viendra l'information), rien de
plus — conforme au « si l'information existe » du cahier des charges.

---

## C. Données personnelles

### Champs collectés — chacun avec son usage, rien « au cas où »

| Champ | Usage identifié |
|---|---|
| `kind` (personne physique / morale) | exigé par le cahier des charges ; conditionne l'affichage de la fiche |
| `name` (affichage), `first_name`/`last_name` (personnes) | identité, recherche, tri |
| `email`, `phone` | coordonnées, recherche, détection de doublons |
| `company_name` (texte) + `company_id` (lien fiche morale) | le CSV importé apporte un nom de société en texte ; le lien structuré se pose quand la fiche morale existe. Affichage : le lien prime sur le texte |
| `job_title` | qualification du contact (fiche) |
| `city`, `postal_code`, `country` | dossiers immobiliers = localisation ; clientèle non-résidente = pays. Pas de rue : aucun usage identifié (pas de courrier dans le produit) |
| `birth_date` | le conseil patrimonial est structuré par l'âge (retraite, assurance-vie, horizon) — à retirer si jugé superflu |
| `notes` | mémoire libre du conseiller |
| `owner_id` | attribution à un conseiller (exigence du cahier des charges) |
| étiquettes | table `contact_tags` par organisation + table de jonction |

AUCUN champ financier sur la fiche (les montants vivent sur les affaires),
AUCUNE donnée sensible au sens réglementaire — et pas de champ libre qui y
invite (le champ notes est le seul texte libre, comme partout ailleurs).

### Export

Une action serveur produit un JSON complet : fiche + étiquettes + affaires
liées + tâches + journal d'activité + journal des accès à sa fiche.
Aucune exigence de schéma au-delà de FK propres. Livré à l'étape 3.

### Suppression réelle — anonymisation destructrice en place

La ligne `contacts` SURVIT en pierre tombale : tous les champs d'identité
passent à NULL, `name` devient « Contact supprimé », `deleted_at` est posé.
Ce qui est détruit réellement :

- notes de la fiche, activités et tâches rattachées au contact (leur
  contenu PARLE de la personne) — suppression physique ;
- `deals.client_name` des affaires liées → « Client supprimé » (c'est de
  l'identité dénormalisée).

Ce qui est préservé : les affaires elles-mêmes (montants, commissions,
partages, journal PRM), toujours reliées à la pierre tombale via
`contact_id` — la traçabilité « ces 3 affaires concernaient le même
client » survit sans dire qui il était. Limite assumée et documentée : un
nom cité à la main dans un texte libre du journal PRM (commentaire d'un
partenaire) n'est pas récrit — le journal d'affaires trace la relation
entre professionnels, pas la personne.

L'alternative DELETE + `contact_id` SET NULL est rejetée : elle perd la
cardinalité (impossible de savoir que trois affaires concernaient le même
client) et disperse la preuve de suppression.

### Journal des accès

Table `contact_access_log`
(organization_id, contact_id FK composite, user_id, action
`view` | `export` | `delete` | `merge`, created_at). Écrit côté serveur au
rendu de la fiche, à l'export, à la suppression, à la fusion. Pas de purge
automatique pour l'instant (à décider quand le volume le justifiera).

---

## Questions ouvertes posées à l'arbitrage (étape 1)

1. **A** — `deal_statuses` devient la table des étapes (pas de table
   parallèle) : d'accord ?
2. **A** — la route publique cesse d'offrir les étapes won/lost au
   partenaire (changement de comportement PRM) : d'accord ?
3. **B** — règle de conflit ci-dessus (externe prime, local jamais écrasé
   en silence, pas de granularité par champ) : d'accord ?
4. **C** — email et téléphone en colonnes simples (pas de table enfant
   multi-coordonnées) pour la v1 : d'accord ?
5. **C** — `birth_date` et `city/postal_code/country` : à garder ou à
   retirer (arbitrage minimisation vs usage métier) ?
6. **C** — pierre tombale plutôt que DELETE : d'accord ?

---

## Espace super admin — substitution d'organisation (ajouté en cours d'étape 3)

Un super admin n'a pas d'organisation propre ; or créer un contact, une
affaire ou importer un CSV EXIGE une organisation. Correction structurelle
(demandée après test réel) : un bandeau permanent, visible du seul super
admin, permet de choisir l'organisation dans laquelle il travaille.

- Le choix vit dans le cookie `clozado-active-org` (un an — survit aux
  sessions), posé par une server action réservée au rôle réel super_admin.
- LA SUBSTITUTION VIT DANS `requireUser()` (src/lib/session.ts) : un super
  admin scopé devient, pour tout le produit, un admin de l'organisation
  choisie. Aucun écran ni module n'a besoin de connaître le mécanisme —
  newsletters comprises. `requireSessionUser()` donne l'identité réelle,
  réservé à la coquille (le bandeau).
- Un utilisateur normal qui forgerait le cookie n'obtient rien : le cookie
  n'est lu que si le rôle de SESSION est super_admin (vérifié par test).

## Limites connues, assumées

- **L'import CSV ne crée que des personnes physiques.** Les sociétés se
  créent à la main et se lient ensuite. À traiter quand un client importera
  un vrai fichier mixte : détection d'une colonne « type », ou création
  automatique des personnes morales depuis la colonne société.
- Un nom cité à la main dans un texte libre du journal PRM (commentaire de
  partenaire) n'est pas récrit par la suppression-tombale (§C).

---

## Étape 6 — activité unifiée et intégration aux modules existants

### Le journal : une fusion à la lecture, pas une table

Il n'existe pas de table « journal ». Chaque source garde ses lignes et son
contrat, et `src/db/queries/activities.ts` les fusionne à la lecture :

| Source | Ce qu'elle apporte |
|---|---|
| `activities` | ce qui est saisi à la main : appel, email, rendez-vous, note |
| `deal_stage_changes` | chaque passage d'étape, structuré (avant → après, couleurs, marqueur gagné/perdu) |
| `deal_events` | ce que le PRM raconte : partages (envoyé, consulté, accepté, refusé, révoqué, expiré), commentaires, commissions |
| `tasks` achevées | ce qui a été fait (badge de la règle pour une tâche générée) |
| `deals.created_at` | la naissance de l'affaire, synthétisée depuis la ligne elle-même |

Deux types de `deal_events` sont volontairement ignorés : `status_changed`
(dit mieux par `deal_stage_changes`) et `deal_created` (dit par la ligne
`deals`, ce qui couvre aussi l'affaire d'avant le journal PRM, qui n'a ni
événement de création ni première ligne d'étape). Vérifié en base au moment
de la décision : aucun `status_changed` n'existait sans sa ligne structurée
— pas de dédoublonnage à écrire.

La fiche contact voit aussi ce qui arrive à **ses affaires** : c'est ce qui
rend la vue unifiée (appeler un client et lire, dans la même file, que son
dossier a été partagé puis accepté). La fiche affaire voit ce qui la
concerne. Le tableau de bord voit toute l'organisation (8 dernières entrées).

Volume borné par construction : chaque source est limitée en base (100),
triée par date, puis fusionnée et tronquée — jamais une table entière en
mémoire. Ordre : le plus récent d'abord (un journal se lit comme un fil,
l'ancien « Historique » de la fiche affaire, chronologique, est remplacé).

Attribution : utilisateur interne, partenaire (marqué « (partenaire) »), ou
« Système » — réservé à l'absence d'acteur. La révocation d'un partage porte
désormais son acteur (`revokeDealShare` reçoit l'utilisateur) : un geste
humain n'est plus affiché comme un automate.

`src/db/queries/deal-events.ts` (l'ancien journal de la fiche affaire) est
supprimé : plus aucun lecteur.

### Saisie rapide d'une interaction

Sur les deux fiches, en tête du journal : type, texte, date facultative.

- Texte facultatif sauf pour une note (« une note sans texte n'a rien à
  dire ») ; un appel sans compte rendu est une trace légitime.
- Date vide = maintenant. Une date saisie est lue comme une heure de Paris
  (`src/lib/timezone.ts`, même convention que les échéances des tâches).
- Une date à venir est refusée : le journal consigne ce qui a eu lieu ; pour
  un rendez-vous à venir, on crée une tâche.
- Consignée depuis une **affaire**, l'interaction est aussi rattachée au
  client de l'affaire : elle apparaît sur sa fiche, part dans son export, et
  disparaît avec sa pierre tombale (elle parle de lui). Si le client a déjà
  été supprimé, elle vit sur l'affaire seule.
- Seules les interactions saisies se suppriment ; le reste est de
  l'histoire, on ne la récrit pas.
- Les erreurs reviennent sur la fiche en paramètre d'URL dédié
  (`erreurJournal`), distinct de celui de la section tâches (`erreur`) :
  deux formulaires sur la même fiche, deux messages jamais confondus.

### Fuseau d'affichage — correction transverse

`formatDate`/`formatDateTime` (`src/lib/format.ts`) rendaient l'heure du
serveur — UTC sur Vercel — donc une interaction consignée à 10 h se serait
affichée 08 h. Le fuseau produit est centralisé dans `src/lib/timezone.ts`
et appliqué au formatage. Touche par construction tous les affichages de
date du produit (newsletters comprises : « modifiée le … » gagne deux
heures d'exactitude). C'est le seul fichier du socle UI modifié à cette
étape, pour cette raison.

### Newsletter depuis une fiche contact

« Rédiger une newsletter pour ce contact » crée un **brouillon** dont le
brief est pré-rempli depuis la fiche, puis ouvre l'éditeur existant dessus
(`/newsletters/[id]`). Le composer n'est pas modifié : il reçoit une
newsletter comme une autre, via `saveNewsletter`, qui vérifie que le groupe
de destinataires appartient à l'organisation.

Contenu du brief : identité professionnelle (nom, fonction, société, ville),
étiquettes, affaires en cours avec leur étape, et une ligne « Objectif de
l'email : (à préciser) ». **Jamais** les notes privées du conseiller ni la
date de naissance : le brief part au modèle d'IA, on n'y met que ce qu'un
email pourrait légitimement refléter.

Limite connue : aucun lien structuré newsletter ↔ contact n'existe en base
(`newsletters` n'a pas de `contact_id`). La section « Newsletters » de la
fiche reste donc honnête (l'historique d'envoi n'existe pas, l'outil
n'envoie rien) et ne liste pas les brouillons écrits pour la personne. Poser
cette colonne est une décision de schéma dans le périmètre du composer —
à arbitrer, pas prise seule.

### Tableau de bord — les trois modules

- Rangée « aujourd'hui » : À faire (tâches en retard + du jour, rouge s'il
  y a du retard), À relancer, Sans suite, À encaisser.
- Rangée « dossiers » : Contacts, Affaires en cours (montant au pipeline),
  Gagnées, Partages actifs.
- « À faire aujourd'hui » : les 6 premières tâches échues ou du jour,
  achevables d'un clic (exigence « depuis n'importe quelle vue »), renvoi
  vers l'écran des tâches pour le reste.
- « À traiter en priorité » (PRM, inchangé) et « Activité récente »
  (journal de l'organisation).
- Ouvrir le tableau de bord **génère les tâches automatiques** comme
  l'écran des tâches (idempotent ; le tableau de suivi déjà calculé pour
  les tuiles est réutilisé) — sinon la tuile « À relancer » et la liste
  « à faire » se contrediraient tant qu'on n'a pas ouvert `/taches`.
- Trois états : `loading.tsx` et `error.tsx` ajoutés (la vue globale super
  admin est inchangée).

### Preuves

- `npm run db:test-isolation` est réécrit, **autonome et réversible** : deux
  organisations jetables (`_iso-a`, `_iso-b`) avec un jeu complet chacune,
  44 contrôles — lectures et écritures par les mêmes fonctions que les
  écrans, puis rejets par la base elle-même (FK composites, code 23503) —
  et suppression vérifiée à zéro reliquat. Ne touche à aucune organisation
  existante.
- `scripts/perf-dataset.ts` crée désormais aussi 3 000 interactions et
  1 000 passages d'étape (le journal et les durées les lisent).

### Pagination de l'écran des tâches — corrigé à la mesure

Trouvé par la mesure HTTP à l'échelle du jeu de performance : `/taches`
rendait TOUTES les tâches ouvertes de l'organisation (1 334 dans le jeu),
chacune avec son panneau d'édition — 2,5 s de rendu pour 41 ms de requête,
et une entorse à « pagination côté serveur ». Les tâches ouvertes se lisent
désormais par pages de 50 (comme les contacts et les affaires), les plus
urgentes d'abord (échéance croissante,
sans échéance en dernier) ; les totaux des quatre piles sont comptés en
base, l'en-tête de pile dit « (total) · N sur cette page », les actions
reviennent à la page courante, une page au-delà de la dernière ramène à la
dernière. Les achevées récentes restaient déjà limitées à 30.

### Indexation — à décider quand le volume le justifiera

Les nouvelles lectures du journal s'appuient sur les index existants
(`activities`, `deal_stage_changes`, `tasks`) sauf deux : `deal_events`
(aucun index hors clés) et `tasks (organization_id, status, completed_at)`.
Les mesures à l'échelle du jeu de performance (voir le message de commit de
l'étape 6) tiennent l'exigence des 300 ms sans eux ; une migration d'index
sera proposée le jour où les volumes réels s'en approchent — jamais
appliquée sans accord.
