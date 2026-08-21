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
