# Module ciblage et contenu — cibles vivantes, identité éditoriale, veille, composer

Notes de chantier, même rôle que `docs/module-relationnel.md` et
`docs/module-analytique.md`. Cahier des charges reçu le 2026-08-25
(« CHANTIER — CIBLAGE ET CONTENU »). Ce document commence par l'état des
lieux et les trois réponses de conception demandées avant toute ligne de
code (étape 1). Le schéma et les migrations viendront à l'étape 2, après
arbitrage.

État des lieux au commit `c040c90` (2026-08-25, `main`).

---

## 0. Ce qui existe — exploration

### 0.1 Les contacts : tout ce qu'un critère de cible peut lire est déjà en base

`contacts` (par organisation, FK composites, pierre tombale `deleted_at`) :
`kind` personne/société, `name`, `email`, `phone`, `company_name`/
`company_id`, `job_title`, `city`, `postal_code`, `country`, `birth_date`,
`owner_id` (conseiller), `source` (`manual` | `import` | `external` |
`lead`), `created_at`. Autour : `contact_tags` + `contact_tag_assignments`
(étiquettes par organisation, verrouillées par FK composites), `deals`
(`contact_id`, `status_id` → `deal_statuses.outcome` gagné/perdu/NULL,
`pipeline_id`, `owner_id`, `lead_id`, `created_at`), `leads`
(`contact_id`, `origin_id` — l'origine d'acquisition), `activities`
(`contact_id`, `occurred_at` — la dernière interaction), `tasks`.

Donc les critères du cahier des charges — étiquettes, type personne/
société, ville, pays, conseiller attribué, présence d'affaires (en cours,
gagnée, perdue, dans telle étape, dans tel pipeline), ancienneté, origine —
se lisent tous sur des colonnes existantes. **Aucune colonne nouvelle n'est
nécessaire pour exprimer un critère** ; ce qui manque, c'est l'objet
« cible » qui les porte, et un seul endroit qui les compile en SQL.

Index en place : `contacts (organization_id, name) WHERE deleted_at IS
NULL`, `(organization_id, owner_id)`, `(organization_id, created_at)` ;
`contact_tag_assignments` clé primaire `(contact_id, tag_id)` ; `deals
(organization_id, contact_id)`, `(organization_id, pipeline_id,
status_id)` ; `leads (organization_id, contact_id)`, `(organization_id,
origin_id)` ; `activities (organization_id, contact_id, occurred_at)`.
`listContacts` ne filtre aujourd'hui que par texte, conseiller et UNE
étiquette (pages de 50).

### 0.2 Le composer : des cibles-personas sans contacts, pas d'historique, pas de matière

- `mail_targets` (par organisation : `slug`, `label`, `persona`,
  `audience_label`, `editorial_voice` NOT NULL, `accent_color`,
  `default_signatory_id`, `position`) — c'est l'IDENTITÉ ÉDITORIALE, et
  rien d'autre : **aucun critère, aucun lien avec `contacts`**. Une cible
  est un texte injecté dans le prompt (`buildUserMessage` dans
  `src/lib/ai/anthropic.ts`). L'identité tient dans un seul champ libre ;
  le cahier des charges en demande cinq facettes (qui, préoccupations,
  niveau de connaissance, ton, centres d'intérêt) plus « ce qu'on ne lui
  dit pas ».
- `newsletters` (`organization_id`, `target_id` NOT NULL, `title`,
  `subject`, `preheader`, `brief`, `created_by`) + `newsletter_blocks`
  (sept types : titre, texte, chiffre_cle, fiches, cta, bouton,
  separateur — **pas de bloc article ni de bloc source**). **Ni statut, ni
  `sent_at`, ni destinataires** : l'information « cette newsletter a été
  envoyée à ces contacts » n'existe nulle part (constat déjà noté dans
  `docs/module-relationnel.md` §B) ; la fiche contact affiche une section
  « Newsletters » honnêtement vide.
- `verified_figures` (`label`, `value`, `position`) — la SOURCE UNIQUE des
  chiffres autorisés, lue par le prompt ET par la revue déterministe
  (`src/lib/newsletter/review.ts`). **Sans source ni date** : le cahier des
  charges exige les deux sur tout chiffre affiché.
- La génération : `POST /api/newsletters/ai/design` → `getDesignContext`
  (organisation, cible, signataire, chiffres) → `AnthropicProvider`
  (`@anthropic-ai/sdk`, modèle `ANTHROPIC_MODEL` ou `claude-sonnet-5`,
  outil `emit_newsletter` forcé, prompt système composé depuis la base et
  mis en cache, flux NDJSON) → `reviewNewsletter` (chiffres non autorisés,
  CTA multiples, longueurs objet/préheader) — le résultat et sa revue
  arrivent ensemble au client. Aucun outil de recherche ni de lecture web
  n'est branché aujourd'hui.
- Le brief est une page blanche : la fiche contact peut le préremplir
  (« Rédiger une newsletter pour ce contact », `createNewsletterForContactAction`,
  cible choisie parmi celles de l'organisation), rien d'autre.
- **Aucun écran n'administre les cibles, les chiffres vérifiés, les
  signataires ni les presets de CTA** : seul `scripts/seed-newsletter-demo.ts`
  en crée. Une organisation née par `/inscription` n'a aucune cible, et
  `/newsletters/new` lui répond « Aucun groupe de destinataires n'est
  configuré » — une impasse. L'écran des cibles de ce chantier la comble.
- `organizations` porte déjà le profil éditorial (`tagline`,
  `tone_of_voice`, `editorial_guidelines`) et le **pack métier**
  (`business_pack`, quatre packs en données dans
  `src/lib/metrics/packs.ts`) : c'est de lui que viendront les cibles et
  les sujets de veille par défaut (« viennent de son métier, pas d'une
  liste figée dans le code »).

### 0.3 L'infrastructure

- Base : Neon en HTTP (`drizzle-orm/neon-http`) — pas de transaction
  classique, `db.batch()` pour l'atomicité ; migrations par
  `npm run db:migrate:http`.
- Vercel : **aucun `vercel.json`/`vercel.ts`, donc aucun cron**. Next 16
  fournit `after()` (`next/server`) : un travail lancé après l'envoi de la
  réponse, tenu en vie par `waitUntil` sur Vercel jusqu'au `maxDuration`
  de la route (doc embarquée `after.md`, § Platform Support).
- `src/lib/rate-limit.ts` : limiteur en mémoire, par instance — suffisant
  pour freiner un bouton « Actualiser », pas pour une garantie globale.
- IA : un seul fournisseur (Anthropic) derrière `AIProvider` ; SDK
  `@anthropic-ai/sdk` 0.120. Les outils serveur `web_search` et
  `web_fetch` de ce fournisseur sont disponibles sans dépendance nouvelle.
- **Sources officielles, sondées le 2026-08-25 depuis cet environnement,
  toutes SANS clé** :
  - BCE, Data Portal (`data-api.ecb.europa.eu`, CSV/JSON) : taux de la
    facilité de dépôt 2,25 % au 2026-08-25 ; taux long terme France (10
    ans, critère de convergence) 3,85 % en 2026-07 ;
  - Eurostat (`ec.europa.eu/eurostat/api/dissemination`, JSON-stat) :
    IPCH France, variation annuelle ;
  - Banque de France Webstat (nouveau portail Opendatasoft, API Explore
    v2.1) : 200 sans clé, 42 169 jeux de données au catalogue — OAT,
    taux d'usure, taux des crédits à l'habitat, Livret A y vivent (séries
    exactes à identifier par un appel réel à l'étape 4, pas de mémoire) ;
  - INSEE BDM (`api.insee.fr/series/BDM`) : 200 sans clé — IPC, IRL,
    indices Notaires-INSEE.

  **Aucune dépendance externe nouvelle n'est nécessaire pour les
  indicateurs de marché.**

---

## 1. Les trois points de conception

### 1.1 Comment et à quelle fréquence les sources sont interrogées — coût, fiabilité, source muette

**Un seul chemin de code, deux déclencheurs (un troisième en option).**
`refreshWatch(organizationId)` est idempotent et borné (60 s de budget,
10 s par source, sources les plus anciennement collectées d'abord ; ce qui
ne tient pas dans le budget attend le tour suivant). Il est appelé :

1. **À la visite** : quand l'écran Veille s'ouvre et que la dernière
   collecte de l'organisation date de plus de 24 h, la page rend
   immédiatement l'état connu (« mis à jour il y a 26 h — collecte en
   cours ») et lance la collecte en arrière-plan avec `after()`. La page ne
   ralentit jamais ; l'utilisateur voit le résultat au rechargement ou par
   un rafraîchissement automatique léger de la section. Une organisation
   qui n'ouvre jamais la veille ne coûte rien.
2. **Par un bouton « Actualiser maintenant »**, borné à une collecte par
   10 minutes et par organisation (verrou en base : une ligne de collecte
   `started_at` sans `finished_at` datant de moins de 5 min bloque un
   second départ — pas le limiteur en mémoire).
3. **En option, un cron Vercel quotidien** (`vercel.ts` → `crons`, route
   protégée par `CRON_SECRET`) qui parcourt les organisations dont la
   collecte est périmée, pour que la matière soit fraîche AVANT la visite.
   Plan Hobby : deux crons au plus, une fois par jour, à l'heure près ;
   plan Pro : à la minute. **Recommandation : 1 + 2 maintenant, 3 quand le
   plan le permet** — le cron n'est qu'un préchauffage, jamais le seul
   mécanisme (une source ne doit pas dépendre d'un plan Vercel).

**Fréquences** (par organisation) : sources thématiques et concurrentielles
au plus une fois par 24 h — la matière sert des newsletters hebdomadaires
ou mensuelles, pas un fil d'actualité. Indicateurs de marché : une lecture
par jour et par indicateur au plus, mais **partagée entre toutes les
organisations** : un taux de la BCE n'appartient à personne, le stocker
quatre fois avec quatre dates différentes serait faux. C'est la seule
donnée du chantier sans `organization_id` (voir §2, décision à prendre) ;
ce qu'une organisation en fait — l'indicateur qu'elle suit, la copie
datée et sourcée dans SES chiffres vérifiés — reste scopé.

**Comment, par type de source :**

| Source | Mécanisme | Ce qui est stocké |
|---|---|---|
| Site ou flux déclaré (thématique, concurrent) | découverte du flux RSS/Atom depuis la page d'accueil (`<link rel="alternate">`, `/feed/` des WordPress — le cas courant chez les cabinets), puis lecture HTTP directe du flux depuis le serveur ; analyse XML | titre, lien canonique, date, source, pays, langue — **jamais la description ni l'extrait du flux** |
| Sujet sans flux (recherche thématique) | outil serveur Anthropic `web_search` (résultats datés, restreints au sujet et au pays ; `allowed_domains` quand l'organisation a déclaré ses sources) | idem |
| Concurrent sans flux | `web_search` restreint à son domaine, une requête par concurrent et par collecte | idem, rattaché au concurrent |
| Résumé original d'un article | l'article est lu au moment de la collecte (`web_fetch`), le modèle écrit un résumé de deux ou trois phrases, classe par thème et note l'angle ; **le texte lu n'est jamais écrit en base** ; avant d'enregistrer le résumé, un contrôle déterministe vérifie qu'aucune suite de 12 mots du résumé n'apparaît dans le texte d'origine — sinon le résumé est refusé et l'article reste « sans résumé » plutôt qu'avec une reprise | résumé original, thèmes, angle |
| Indicateur de marché | appel HTTP à l'API officielle (BCE, Eurostat, Webstat, INSEE), lecture déterministe du JSON/CSV, aucune IA | valeur telle que publiée, période, date de collecte, source et lien — une ligne par (indicateur, période) |

La **règle de droit d'auteur** tient structurellement, pas par discipline :
le composer ne reçoit JAMAIS le texte d'un article — seulement nos résumés,
les titres, les sources et les liens. Un modèle ne peut pas reprendre une
formulation qu'il n'a pas lue. La revue déterministe (étape 6) vérifie en
plus que chaque source citée dans l'email est bien un article du panier
(liste blanche d'URL) avec son lien, et que l'email ne recopie pas nos
propres résumés au-delà de courtes suites de mots.

**Coût** (ordre de grandeur, une organisation active : 5 sujets, 5
concurrents, 20 articles nouveaux par jour résumés) :

- flux RSS, APIs officielles : gratuit (quelques secondes de fonction par
  jour) ;
- `web_search` : 10 par jour ≈ 3 $ par mois (10 $ les 1 000 recherches) ;
- résumés (≈ 5 000 jetons lus par article, 150 écrits) : Haiku 4.5
  ≈ 0,006 $ l'article ≈ 3,6 $ par mois ; Sonnet 5 (le modèle actuel du
  composer) ≈ 0,012 $ ≈ 7 $ par mois ; Opus 5 ≈ 0,03 $ ≈ 17 $ par mois ;
- classification et écart de contenu : un appel par jour sur les titres ≈
  moins de 0,50 $ par mois.

Soit **5 à 20 $ par mois et par organisation qui utilise la veille**, zéro
pour les autres. Le choix du modèle est le tien (voir §3) — je ne
descends pas en gamme pour le prix sans ta décision.

**Fiabilité, et une source qui ne répond plus.** Chaque source porte
`last_fetched_at`, `last_ok_at`, `last_error` (texte lisible :
« délai dépassé », « 404 », « flux illisible »), `consecutive_failures`.
Une source en échec n'empêche jamais les autres (`Promise.allSettled`),
ne perd jamais ses articles passés, est retentée avec un recul croissant
(1 h, 6 h, 24 h, puis chaque jour) et s'affiche « injoignable depuis le …
(cause) » avec un bouton « Réessayer ». Après 30 jours d'échecs elle passe
« en sommeil » : plus interrogée, toujours affichée, réveillable d'un
clic. Une API officielle muette laisse la dernière observation affichée
AVEC sa date (« au 2026-07 ») — un chiffre ancien daté vaut mieux qu'un
chiffre absent, et jamais qu'un chiffre inventé. Dédoublonnage : URL
canonique (hôte en minuscules, sans paramètres de suivi `utm_*`/`fbclid`,
sans fragment), unique par organisation ; un même article vu par deux
sources compte une fois, rattaché aux deux.

### 1.2 Comment un segment reste rapide sur plusieurs milliers de contacts — mesuré

**Le principe** : une cible-segment stocke ses critères (JSON validé par
un schéma zod), et UNE fonction `segmentCondition(organizationId,
criteria)` les compile en une condition SQL sur `contacts c` — un critère
= une condition (`c.city = …`, `EXISTS (… contact_tag_assignments …)`,
`EXISTS (… deals JOIN deal_statuses …)`, `NOT EXISTS (…)`, `c.created_at
< now() - …`), combinées par AND ; « au moins une de ces étiquettes »
est un OR à l'intérieur d'un critère. Cette fonction sert au compte, à la
liste paginée, à l'appartenance d'un contact et à la photographie des
destinataires (§1.3) : une définition, quatre lecteurs. Rien n'est
matérialisé, rien n'est mis en cache — recalculé à chaque consultation,
comme l'exige le cahier des charges.

**Mesures** (jeu `_perf-test`, organisation jetable détruite ensuite ;
étiquettes ajoutées par hachage : une sur trois, une sur cinq, une sur
cinquante ; 500 affaires ; temps depuis le code, aller-retour HTTP Neon
compris, médiane de 5 après une passe de chauffe) :

| Segment | 5 000 contacts | | 50 000 contacts | |
|---|---|---|---|---|
| | compte | page de 50 | compte | page de 50 |
| tous les contacts vivants (référence) | 18 ms | 18 ms | 25 ms | 18 ms |
| étiquette « Investisseur » (1/3) | 21 ms | 21 ms | 32 ms | 19 ms |
| « Investisseur » SANS « Primo-accédant » | 25 ms | 26 ms | 38 ms | 19 ms |
| « VIP » (1/50) | 18 ms | 18 ms | 27 ms | 24 ms |
| ville Lyon, pays France | 19 ms | 18 ms | 25 ms | 18 ms |
| personnes physiques d'un conseiller | 18 ms | 18 ms | 22 ms | 18 ms |
| au moins une affaire en cours | 19 ms | 20 ms | 19 ms | 19 ms |
| affaire dans l'étape « Partagée » | 18 ms | 19 ms | 18 ms | 18 ms |
| aucune affaire | 19 ms | 19 ms | 29 ms | 18 ms |
| fiche créée il y a plus de 30 jours | 20 ms | 20 ms | 31 ms | 17 ms |
| étiquette + pays + affaire en cours + conseiller | 21 ms | 22 ms | 21 ms | 20 ms |
| appartenance d'UN contact à 11 cibles (un seul SELECT) | 21 ms | | 19 ms | |

À 5 000 contacts, la latence est celle de l'aller-retour Neon (~18 ms) :
l'exécution SQL elle-même prend 3,8 ms pour l'étiquette (jointure par
index) et 4 ms pour la combinaison (index `contacts_org_owner_idx`,
`deals_org_contact_idx`, clé primaire des étiquettes). À 50 000, le
planificateur passe en parcours séquentiel des lignes de l'organisation
(16 836 étiquetages) et exécute encore en 21 ms. **Le critère d'acceptation
(5 000 contacts) est tenu avec une marge de dix fois**, sans aucun index
nouveau. Le compte affiché en permanence dans l'éditeur de critères coûte
une requête de 20 ms par frappe (avec un délai de 300 ms) ; celui du
composer, une requête à l'ouverture.

**Jusqu'où ça tient, et quoi faire ensuite.** Le seul coût qui croît avec
le volume est le parcours des étiquetages et des contacts d'UNE
organisation : 3,8 ms pour 1 700 étiquetages, 21 ms pour 17 000. En
prolongeant linéairement — une extrapolation, pas une mesure — l'exécution
atteindrait ~200 ms vers 150 000 contacts étiquetés dans une seule
organisation, cent fois la taille d'un cabinet. Le jour venu : un index
`contact_tag_assignments (organization_id, tag_id, contact_id)` (aujourd'hui
la clé primaire sert « les étiquettes de ce contact », pas « les contacts
de cette étiquette ») rend le critère étiquette lisible par index seul ;
puis `(organization_id, country)` / `(organization_id, city)` si une
organisation dépasse quelques dizaines de milliers de fiches. L'index sur
les étiquettes coûte rien et se pose dès la migration de l'étape 2 si tu
es d'accord — les mesures ci-dessus sont faites SANS lui, pour ne pas
embellir.

### 1.3 Les critères d'une cible changent alors que des newsletters lui ont été envoyées — l'historique reste juste

**Le principe** : une cible est VIVANTE (recalculée), un envoi est un FAIT.
L'histoire ne se recalcule jamais depuis des critères vivants : elle est
photographiée au moment où elle se produit.

- L'outil n'envoie pas (hors périmètre). Le moment de vérité est donc un
  geste manuel : **« Marquer comme envoyée »**, avec la date (aujourd'hui
  par défaut, modifiable — on peut le dire après coup). C'est le seul
  moment où l'audience est figée.
- À cet instant, la cible est évaluée et ses membres sont écrits dans une
  table de destinataires : (newsletter, contact, organisation) — plus,
  sur la newsletter, la photographie de l'audience (les critères tels
  qu'ils étaient, le libellé de la cible, le nombre). Une cible statique
  (sélection manuelle) est photographiée de la même façon.
- Ensuite, **modifier, dupliquer, désactiver la cible ne change rien au
  passé** : « envoyée le 12 mai à 1 214 contacts — Investisseurs à Lyon »
  reste vrai pour toujours, même si la cible s'appelle autrement, filtre
  autrement ou n'existe plus. Une cible ne se supprime pas : elle se
  désactive (`archived_at`) ; `newsletters.target_id` continue de pointer
  vers elle. L'éditeur prévient : « 3 newsletters ont été envoyées à cette
  cible ; leur historique ne change pas », et propose la duplication.
- Un contact qui entre dans le segment APRÈS l'envoi n'est pas dans la
  photographie : il n'a pas reçu, et la fiche ne le dira pas. Un contact
  supprimé (pierre tombale) garde ses lignes de destinataire, comme ses
  affaires : le nombre reste juste, le nom devient « Contact supprimé ».
- **L'anti-répétition lit la photographie, pas les critères** : au choix
  d'une cible, « ce qui a déjà été envoyé récemment » = les newsletters
  marquées envoyées dont les destinataires recoupent les membres ACTUELS
  du segment (recouvrement en pourcentage, sujets traités, sources
  utilisées, date). Une cible dont les critères ont changé montre donc
  honnêtement ce que ses membres d'aujourd'hui ont réellement reçu, même
  sous un autre découpage. La fiche contact liste, elle, ce que CE contact
  a reçu — la section « Newsletters » cesse d'être vide.
- Les « sujets traités » viennent de la newsletter elle-même : son objet,
  les thèmes des articles du panier qu'elle a utilisés (table de liaison
  newsletter ↔ article, qui sert aussi à signaler « déjà utilisé » dans le
  panier), et les thèmes que la génération déclare.
- Volume : une ligne par contact et par envoi — 1 000 contacts × 50
  envois par an = 50 000 lignes par an et par organisation, avec un index
  (organisation, contact) et un index (newsletter) : négligeable.

---

## 2. Ce que le schéma devra porter (aperçu — le détail à l'étape 2)

Pour donner la forme, pas encore les colonnes :

- `mail_targets` s'enrichit : nature (`segment` | `static`), critères
  (jsonb, validés par le code), l'identité éditoriale en cinq facettes
  structurées + « ce qu'on ne lui dit pas » (composées dans le prompt —
  l'actuel `editorial_voice` devient l'une d'elles), `archived_at`
  (désactivation), `description` ; une table de membres pour les cibles
  statiques.
- `newsletters` : `sent_at` (marquée envoyée), photographie de l'audience ;
  table des destinataires ; table de liaison avec les articles utilisés ;
  thèmes déclarés.
- `verified_figures` : `source`, `source_url`, `as_of` (date de la donnée),
  `indicator_key` quand le chiffre vient d'un indicateur de marché (mis à
  jour automatiquement, jamais à la main) — tout chiffre affiché porte sa
  date et sa source.
- Veille (par organisation) : sujets, sources (flux/site/concurrent, pays,
  langue, santé), articles (titre, lien canonique, date, source, pays,
  langue, résumé original, thèmes, angle — **ni corps, ni extrait**),
  panier (par organisation, article, ajouté par, utilisé dans), collectes
  (journal des exécutions).
- Indicateurs de marché : catalogue (clé, libellé, source, unité,
  périodicité, spécification d'appel — des DONNÉES, par métier, dans le
  code comme les packs) et observations (clé, période, valeur, date de
  collecte) — **sans organisation** (donnée publique partagée, voir §3) ;
  l'abonnement d'une organisation à un indicateur, lui, est scopé.
- Cibles, sujets et indicateurs par défaut : dans `packs.ts`, par pack
  métier, instanciés en lignes de l'organisation à sa demande (« créer les
  cibles du pack Courtier en crédit ») puis modifiables — jamais lus depuis
  le code par les écrans.

---

## 3. Décisions demandées à l'étape 1

Les trois réponses ci-dessus, et ce qui les conditionne :

1. **Déclenchement de la collecte** : à la visite + bouton (recommandé),
   cron quotidien en préchauffage quand le plan Vercel le permet — quel
   est le plan actuel (Hobby / Pro) ?
2. **Dépendance externe — analyse XML des flux RSS/Atom** : `fast-xml-parser`
   (MIT, sans dépendance, la référence) — ou un analyseur maison minimal
   (RSS 2.0 + Atom, ~150 lignes, plus fragile sur les flux exotiques).
   Recommandation : la dépendance.
3. **Outils serveur Anthropic** `web_search` (recherche thématique et
   concurrentielle) et `web_fetch` (lecture d'un article au moment du
   résumé, rien n'est stocké) — même fournisseur qu'aujourd'hui, 10 $ les
   1 000 recherches. D'accord ?
4. **Modèle pour les résumés et la classification** : Sonnet 5 (le défaut
   actuel du composer, un seul modèle partout), Haiku 4.5 (deux fois moins
   cher sur ces tâches courtes) ou Opus 5 — ton choix, coûts en §1.1.
5. **Indicateurs de marché** : BCE, Eurostat, Banque de France Webstat,
   INSEE — tous accessibles sans clé (vérifié) ; un catalogue par métier
   en données. Les observations sont la seule table SANS organisation du
   chantier (donnée publique partagée) — exception assumée à l'isolation,
   à valider.
6. **« Marquer comme envoyée »** (geste manuel daté) comme l'événement qui
   fige l'audience — d'accord ? (l'envoi effectif reste hors périmètre.)
7. **Index `(organization_id, tag_id, contact_id)`** sur les étiquetages
   dans la migration de l'étape 2 (coût nul, mesures faites sans lui).

---

## Étape 2 — le schéma et la migration `0013_ciblage_contenu`

Rien n'est renommé ni supprimé : des colonnes et des tables s'AJOUTENT.
Toute table métier porte `organization_id` et des FK composites vers ses
parents (cible, contact, newsletter, article, sujet, source) — une ligne
fille ne peut jamais référencer la ligne d'une autre organisation, même
règle qu'ailleurs dans le produit. Le SQL généré par drizzle-kit a été
relu et corrigé à la main (voir « Ordre » ci-dessous) ; il est commenté en
tête de fichier.

### Cibles — `mail_targets` enrichie, `mail_target_members`

- `kind` (`segment` | `static`, CHECK) et `criteria` (jsonb, validé par
  le code, `{}` = tous les contacts vivants) : la nature « segment
  vivant ». Les cibles existantes (les personas de démo) deviennent des
  segments sans critère — « tous les contacts » — jusqu'à ce qu'on les
  édite ; l'écran le dira.
- L'identité éditoriale en six facettes : `persona` (qui — colonne
  existante), `concerns` (préoccupations), `knowledge_level`,
  `editorial_voice` (ton et voix — **colonne conservée telle quelle**,
  devenue facultative), `interests`, `avoid` (ce qu'on ne lui dit pas).
  Pourquoi ne pas renommer `editorial_voice` en `tone` : un renommage
  passe par une question interactive de drizzle-kit (créée ou renommée ?)
  qu'un script ne peut pas répondre, et une erreur y détruit la colonne
  avec ses données ; le nom reste, le sens est documenté au schéma.
  Pourquoi les facettes sont facultatives : une cible peut naître de ses
  critères et recevoir son identité ensuite ; l'écran montre ce qui manque
  (« identité incomplète »), et le prompt compose avec ce qui est rempli.
- `description` (à quoi sert la cible, pour l'équipe, jamais dans le
  prompt), `archived_at` (désactivation — une cible ne se supprime pas,
  l'historique la référence), `unique (id, organization_id)` (cible des
  FK composites).
- `mail_target_members` (organisation, cible, contact, ajouté le) : les
  membres d'une cible statique. Index (organisation, contact) pour « de
  quelles cibles ce contact fait partie ».

### Envois — `newsletters` enrichie, `newsletter_recipients`, `newsletter_sources`

- `sent_at` (marquée envoyée à cette date, déclarée et modifiable ; NULL =
  brouillon), `sent_marked_by`, `audience_snapshot` (jsonb : libellé et
  nature de la cible, critères, nombre — la photographie), `topics`
  (text[] : les sujets traités, déclarés par la génération et modifiables
  — ce que l'anti-répétition montre), `unique (id, organization_id)`,
  index (organisation, `sent_at`).
- `newsletter_recipients` (organisation, newsletter, contact ; clé
  (newsletter, contact)) : la cible évaluée à l'instant du marquage,
  contact par contact. Index (organisation, contact) : la fiche contact.
  Suppression en cascade avec la newsletter ; un contact n'est jamais
  supprimé physiquement (pierre tombale), ses lignes restent.
- `newsletter_sources` (organisation, newsletter, article) : les articles
  du panier utilisés — « déjà utilisé », et la citation des sources.

### Chiffres — `verified_figures` enrichie

`source_name`, `source_url`, `as_of` (la période telle que publiée),
`as_of_date` (triable), `indicator_key` (quand le chiffre vient d'un
indicateur de marché : rafraîchi par la collecte, jamais à la main ;
unique par organisation). Les lignes d'avant le chantier ont ces champs à
NULL : elles s'affichent « à compléter » et **ne sont plus citées par l'IA
tant qu'elles le sont** — la règle « aucun chiffre sans sa date et sa
source » s'applique aussi aux chiffres internes (source = l'organisation,
date = quand c'était vrai). Décision réversible, dans le code.

### Veille — `watch_topics`, `watch_sources`, `watch_items`, `watch_basket_items`, `watch_runs`

- `watch_topics` : les sujets déclarés (`label`, `search_terms`,
  `search_languages` — « fr », « en » : sources françaises ET anglophones
  au choix), `archived_at` (un sujet ne se supprime pas : des articles s'y
  rattachent).
- `watch_sources` : sites/flux thématiques et concurrents (`kind` =
  `source` | `competitor`, CHECK), `site_url`, `feed_url` (déclaré ou
  découvert ; NULL = recherche web restreinte au domaine), `country`
  (ISO-2, affiché avec chaque article), `lang`, `topic_id`, et la SANTÉ :
  `last_fetched_at`, `last_ok_at`, `last_error` (lisible),
  `consecutive_failures`, `asleep_at` (30 jours d'échecs), `archived_at`.
  Unique (organisation, nature, site).
- `watch_items` : **titre, lien canonique (+ empreinte unique par
  organisation), éditeur, date de publication (NULL = inconnue, jamais une
  valeur plausible), pays, langue, résumé ORIGINAL, état du résumé
  (`pending` | `done` | `refused` — une suite de 12 mots de l'original
  détectée, jamais stocké — | `failed`), modèle du résumé, thèmes, angle,
  chemin de découverte (`feed` | `search`), écarté par l'utilisateur
  (`dismissed_at`).** Il n'existe AUCUNE colonne pour le corps ni
  l'extrait : la règle de droit d'auteur est tenue par le schéma. Index
  (organisation, date), (organisation, sujet), (organisation, source).
- `watch_basket_items` : le panier, UN par organisation (partagé par
  l'équipe — décision réversible : « l'utilisateur met de côté », mais ce
  qu'il met de côté sert la newsletter de l'organisation), avec qui l'a
  ajouté.
- `watch_runs` : le journal des collectes (déclencheur `visit` | `manual`
  | `cron`, début, fin, sources ok/en échec, articles nouveaux/résumés,
  erreur) — et le verrou : une collecte commencée il y a moins de cinq
  minutes et non finie bloque un second départ.

### Indicateurs de marché — `market_observations`, `market_indicator_status`, `organization_indicators`

- `market_observations` (clé, période telle que publiée, premier jour de
  la période, valeur telle que publiée, valeur numérique, unité, source,
  lien, date de collecte ; clé (indicateur, période)) : **la seule table
  du produit sans organisation** — donnée publique partagée, exception
  validée à l'étape 1. Le catalogue (clé, libellé, source, unité,
  périodicité, spécification d'appel, métiers) vit dans le code, en
  données, comme les packs.
- `market_indicator_status` : la santé de chaque indicateur (une API
  officielle muette laisse la dernière observation affichée AVEC sa date).
- `organization_indicators` : les indicateurs qu'une organisation suit
  (préremplis depuis son pack, modifiables) — scopé.

### Étiquettes — l'index décidé à l'étape 1

`contact_tag_assignments (organization_id, tag_id, contact_id)` : « les
contacts qui portent cette étiquette » ; la clé primaire ne servait que
l'autre sens.

### Ordre, rejouabilité, validation

- **Ordre corrigé à la main** : drizzle-kit plaçait les FK composites vers
  `mail_targets(id, organization_id)` et `newsletters(id, organization_id)`
  AVANT les contraintes UNIQUE qu'elles référencent (ajoutées tout en
  bas) — Postgres refuse, et le migrateur HTTP n'ayant pas de transaction,
  l'état serait resté partiel. Les deux UNIQUE sont remontées avant la
  première FK.
- `IF NOT EXISTS` sur les `CREATE TABLE`, `CREATE INDEX` et `ADD COLUMN`
  : rejouable après un échec au milieu ; les `ADD CONSTRAINT` ne le sont
  pas (Postgres ne le permet pas) — commenté en tête du fichier.
- **Validée à blanc avant d'être montrée** : les 67 ordres exécutés dans
  une transaction Neon terminée par une division par zéro — tout est
  annulé, mais une erreur DDL se serait vue avant. Résultat : 67 ordres
  sans erreur, zéro table `watch_*`/`market_*` laissée en base. Le build
  de production (TypeScript compris) passe avec le nouveau schéma ; le
  code adapté : `editorialVoice` devient `string | null` dans le contrat
  de l'IA, la ligne du prompt s'omet quand elle est vide.
- **Pas de push avant l'application** : un push sur `main` déploie, et un
  schéma qui connaît des colonnes absentes de la base casserait
  `/newsletters/*` en production (Drizzle sélectionne toutes les colonnes
  du schéma). Ordre tenu : accord → application → commit → push.

## Étape 3 — les cibles : segments vivants, identité éditoriale, écrans

### Ce qui est construit

- **`/cibles`** : la liste des cibles actives avec, pour chacune, sa
  description en phrases (`describeTarget`) et son **nombre réel de
  contacts** — les cinq ou dix comptes en UN aller-retour (`UNION ALL`,
  `countMembersByTarget`) ; l'état vide propose « Créer les N cibles du
  métier « X » » et « Créer une cible à la main » ; les gabarits du pack pas
  encore instanciés restent proposés en dessous ; les cibles désactivées
  sont rangées derrière un chevron. Trois états (`loading.tsx`,
  `error.tsx`, vide). Entrée « Cibles » dans la navigation (Outils).
- **`/cibles/new`** et **`/cibles/[id]`** : le même formulaire
  (`TargetForm`, champs contrôlés — la saisie reste à l'écran quand
  l'action revient avec une erreur) : nom, « à quoi elle sert » (jamais
  transmis à l'IA), nature (segment vivant / sélection manuelle),
  l'**éditeur de critères**, puis l'**identité éditoriale** en six facettes
  (qui, ce qui la préoccupe, niveau de connaissance, ton, ce qui
  l'intéresse, ce qu'on ne lui dit pas), l'étiquette d'audience et le
  signataire par défaut. La page d'une cible ajoute : la **liste réelle**
  des contacts (pages de 50, liens vers les fiches), la gestion d'une
  sélection manuelle (recherche = celle de l'écran des contacts, cases à
  cocher, « Déjà dans la cible », « Retirer »), « **Déjà envoyé à ces
  contacts** » (l'anti-répétition), les gestes Dupliquer / Désactiver /
  Réactiver, « Écrire une newsletter pour cette cible » (→
  `/newsletters/new?cible=…`), l'avertissement « N newsletters ont été
  envoyées à cette cible ; leur historique ne change pas », la mention
  « identité incomplète : … », un `not-found.tsx` propre.
- **L'éditeur de critères** (`CriteriaEditor`) : une ligne par critère,
  une phrase par ligne, tout ce qui n'est pas renseigné vaut « peu
  importe » — type de fiche, étiquettes (au moins une de / aucune de),
  âge, adresse email, ville, pays (valeurs des fiches en suggestion),
  conseiller, ancienneté de la fiche, sans interaction depuis, présence
  d'affaires, étape, pipeline (si plusieurs), comment la fiche est entrée,
  origine d'acquisition. En bas, l'**aperçu permanent** : le nombre à cet
  instant, « dont N sans adresse email », cinq noms — recalculé 300 ms
  après chaque changement par `previewSegmentAction`, avec la même
  fonction SQL que la liste et le compte.
- **Le composer** : le sélecteur dit « Investisseurs · 1 214 contacts »
  et, sous la barre, `TargetInsight` charge le nombre réel et « **Déjà
  reçu par ces contacts — à ne pas répéter** » (objet, date, part de la
  cible, sujets). `/newsletters/new` accepte `?cible=` ; sans cible,
  l'écran renvoie vers `/cibles` au lieu de l'impasse d'avant. Une cible
  désactivée reste proposée, marquée, sur l'éditeur d'une newsletter qui
  la vise.
- **« Marquer comme envoyée »** (`SendStatusCard`, sous l'éditeur) : une
  date (aujourd'hui par défaut, lue à midi heure de Paris — jamais minuit
  UTC), les sujets traités, un bouton. `markNewsletterSent` écrit les
  destinataires ET la photographie en **un seul ordre SQL** (CTE
  modifiante + `UPDATE`) : atomique par construction, sans transaction. La
  photographie porte le libellé, la nature, les critères ET leur
  description en phrases (une étiquette renommée plus tard ne change pas
  ce qui a été envoyé). « Annuler le marquage » efface les deux. La liste
  `/newsletters` montre « Envoyée le … à N contacts — Investisseurs » /
  « Brouillon » ; une newsletter envoyée ne se supprime plus depuis la
  liste (annuler le marquage d'abord).
- **La fiche contact** : « Dans les cibles : … » (un SELECT, un booléen
  par cible active — `listTargetsOfContact`) et « Newsletters reçues »
  (la photographie, même pour une pierre tombale).

### Le format des critères — décision réversible

`mail_targets.criteria` = un objet plat validé par zod
(`src/lib/targets/criteria.ts`) : `kind`, `tagsAny`, `tagsNone`, `cities`,
`countries`, `ownerIds`, `hasEmail`, `ageMin`/`ageMax`, `deals`
(`any | open | won | lost | none`), `dealStageIds`, `dealPipelineIds`,
`createdMoreThanDays`/`createdLessThanDays`, `inactiveForDays`, `sources`,
`originIds`. Les critères se combinent par ET, une liste se lit « au moins
un de », `{}` = tous les contacts vivants. Pas d'arbre ET/OU imbriqué : un
OU entre critères différents se règle par deux cibles ; une clé `anyOf`
pourra s'ajouter sans casser l'existant. UNE fonction compile en SQL
(`segmentCondition`, `src/db/queries/mail-targets.ts`), et
`memberCondition` la choisit ou prend la sélection manuelle : le compte, la
page de membres, l'appartenance d'un contact et la photographie des
destinataires lisent la même définition.

### Les cibles par défaut viennent du métier

Chaque pack (`src/lib/metrics/packs.ts`) porte `targets` : cinq gabarits
(`src/lib/targets/templates.ts`), avec critères et identité en six facettes
— courtier en crédit : primo-accédants, investisseurs, clients financés,
projets en cours, sans nouvelles ; CGP : clients, prospects en réflexion,
chefs d'entreprise, préparation de la retraite (50 ans et plus), jeunes
actifs ; assurance : assurés emprunteurs, professionnels et indépendants,
clients assurés, prospects en cours, sans nouvelles ; tout métier : tous
les contacts, clients, prospects, sociétés, sans nouvelles.
`createPackTargets` les instancie en lignes de `mail_targets` (idempotent
par slug — relancer ne crée que ce qui manque, ne touche jamais une cible
existante) et crée les étiquettes nommées par libellé (« Investisseur »)
si elles n'existent pas. Aucun écran ne lit les gabarits pour s'afficher.
« Sans nouvelles depuis six mois » = fiche créée il y a plus de 180 jours
ET sans interaction depuis 180 jours : la première version (interaction
seule) attrapait une fiche créée la veille — vu au navigateur, corrigé.

### Autres décisions réversibles

- Un contact sans adresse email compte dans la cible (c'est un contact) ;
  l'aperçu et rien d'autre dit « dont N sans adresse email » ; le critère
  « seulement les fiches avec une adresse email » existe.
- Une sélection manuelle garde ses membres si on la repasse en segment
  (ils reviennent si on revient) ; dupliquer une sélection copie ses
  membres.
- L'anti-répétition regarde les douze derniers mois, dix envois au plus,
  et ne montre que ceux qui recoupent les membres actuels.
- La photographie n'est prise qu'au marquage ; une newsletter marquée par
  erreur se « démarque » (destinataires et photographie effacés, sujets
  conservés).

### Mesures — 5 000 contacts, avec l'index de l'étape 2

Jeu `_perf-test` (5 000 contacts, étiquettes par hachage : « Investisseur »
1/3, « Primo-accédant » 1/5, « VIP » 1/50 ; 500 affaires ; 3 000
interactions — `scripts/perf-dataset.ts`, qui pose désormais ces
étiquettes), les MÊMES fonctions que les écrans, temps depuis le code,
aller-retour Neon compris, médiane de 5 après chauffe ; détruit ensuite,
`VACUUM ANALYZE` fait, zéro reliquat.

| Segment | membres | compte | page de 50 | aperçu |
|---|---|---|---|---|
| tous les contacts vivants (référence) | 5 000 | 20 ms | 20 ms | 20 ms |
| étiquette « Investisseur » (1/3) | 1 668 | 19 ms | 20 ms | 19 ms |
| « Investisseur » sans « Primo-accédant » | 1 363 | 21 ms | 22 ms | 21 ms |
| « VIP » (1/50) | 122 | 20 ms | 21 ms | 20 ms |
| ville Lyon, pays France | 428 | 19 ms | 20 ms | 20 ms |
| personnes avec une adresse email | 5 000 | 21 ms | 20 ms | 20 ms |
| au moins une affaire en cours | 300 | 19 ms | 21 ms | 19 ms |
| affaire dans l'étape « Partagée » | 100 | 20 ms | 22 ms | 20 ms |
| aucune affaire | 4 500 | 20 ms | 20 ms | 20 ms |
| fiche créée il y a plus de 30 jours | 0 | 18 ms | 17 ms | 18 ms |
| sans interaction depuis plus de 90 jours | 2 551 | 21 ms | 21 ms | 21 ms |
| étiquette + pays + affaire en cours + email | 86 | 21 ms | 24 ms | 23 ms |

Compte des 5 cibles du pack en un aller-retour : 24 ms. Appartenance d'un
contact aux 5 cibles : 57 ms (trois allers-retours : la fiche, les
cibles, le SELECT). Anti-répétition d'une cible : 19 ms. Tout est à la
latence de l'aller-retour Neon (~18 ms) : **le critère d'acceptation
(5 000 contacts) est tenu, sur l'écran réel**, et la marge mesurée à
l'étape 1 jusqu'à 50 000 reste valable (même SQL, plus l'index).

### Preuves

- **À blanc** (`scripts/_tmp-cibles-proof.ts`, supprimé) : deux
  organisations jetables `_cible-a` (courtier) et `_cible-b` (CGP), 26
  contrôles par les mêmes fonctions que les écrans — cinq cibles par
  organisation, différentes, sans code spécifique, instanciation
  idempotente, étiquettes créées ; **segment recalculé 0 → 1 → 2 → 1 en
  posant puis retirant une étiquette** ; appartenance d'une fiche ;
  critères d'affaires (gagnée / en cours), d'âge, combinés, casse ignorée
  sur la ville ; sélection manuelle (contact d'une autre organisation
  ignoré par le code, puis **refusé par la base** — FK composite, code
  23503) ; isolation (B ne lit ni ne marque rien de A) ; marquage :
  destinataires figés, photographie avec sa description, sujets
  dédoublonnés ; **la cible bouge après l'envoi (3 membres), la
  photographie reste à 2 ; les critères et le libellé changent, la
  photographie garde ceux d'alors** ; anti-répétition sur la cible revue ;
  fiche « 1 newsletter reçue » ; désactivation sans perte d'historique ;
  duplication avec membres ; annulation du marquage ; nettoyage à zéro.
- **Au navigateur** (`scripts/_tmp-browser.ts`, supprimé ; build de
  production, session forgée pour l'admin d'une organisation jetable
  `_cible-nav`) : 33 étapes vues, zéro erreur console, zéro `pageerror`,
  zéro réponse 5xx — état vide de `/cibles` → cinq cibles créées d'un
  clic ; page d'une cible ; **poser l'étiquette sur une fiche → la fiche
  dit « Dans les cibles : Investisseurs » et la cible passe de 0 à 1** ;
  création par critères avec l'aperçu « 3 contacts aujourd'hui · dont 1
  sans adresse email » puis « 3 contacts dans cette cible » ; sélection
  manuelle (recherche, coche, ajout) ; composer « 1 contact réel » puis
  marquage « Envoyée le … à 1 contact — Investisseurs » ;
  `/newsletters/new?cible=` présélectionne « Investisseurs · 1 contact »
  et montre « Déjà reçu par ces contacts » ; fiche « Newsletters reçues
  (1) » ; liste avec badge ; annulation ; dupliquer / désactiver /
  réactiver ; 404 propre. Captures relues.
- Critères d'acceptation couverts ici : segment recalculé (script +
  navigateur) ; deux organisations, cibles différentes sans code
  spécifique ; segments rapides sur 5 000 contacts (mesures). Restent aux
  étapes suivantes : aucun contenu d'article stocké (4), email citant ses
  sources (6), aucun chiffre sans date ni source (4 et 6).

### Ce que cette étape ne fait pas encore

Le prompt de génération n'est pas modifié : seule la facette « ton »
(`editorialVoice`) y entre, comme avant ; la composition depuis les six
facettes et la matière du panier est l'étape 6. Les chiffres vérifiés
« à compléter » (source, date) et leurs écrans sont l'étape 4.

## Étape 4 — la veille thématique, les indicateurs de marché, le panier

### Ce qui est construit

- **`/veille`** : l'état de la collecte (« dernière collecte il y a 3 h :
  25 nouveaux articles, 6 résumés, 2 sources lues » / « collecte en cours —
  la page se met à jour d'elle-même », `RefreshWhileRunning`), le bouton
  « Actualiser maintenant », le **panier** (partagé par l'organisation, en
  tête quand il n'est pas vide, avec le choix de la cible et « Écrire une
  newsletter à partir de ça »), les **articles par sujet** (titre lié à la
  page d'origine, éditeur, pays, date — ou « date inconnue », jamais une
  date plausible —, flux/recherche, le résumé ORIGINAL ou son état :
  « en attente », « refusé : la formulation reprenait l'article — rien n'a
  été conservé », « impossible : réponse 403 », avec « Résumer à nouveau »),
  « Mettre de côté » / « Retirer du panier » / « Écarter », les badges
  « Déjà utilisé » / « Déjà envoyé », les **sujets** (libellé, termes de
  recherche un par ligne, langues fr/en ; modifier, désactiver, réactiver),
  les **sources** (site, flux déclaré ou découvert, pays, langue, sujet
  rattaché, et la SANTÉ : « lue il y a 2 h », « injoignable depuis le …
  (cause) — nouvel essai dans 6 h » + Réessayer, « en sommeil » + Réveiller),
  les propositions du métier (« Suivre la veille du métier « Courtier en
  crédit » (5 sujets, 3 sources, 8 indicateurs) »), le journal des cinq
  dernières collectes. Trois états (`loading.tsx`, `error.tsx`, vide).
- **`/chiffres`** : les **indicateurs de marché suivis** en tuiles (valeur
  telle que publiée en français, « depuis le 17 juin 2026 » / « au 6 août
  2026 » / « 3e trimestre 2026 », source liée, « lu il y a 11 min », « source
  muette (cause) : dernière valeur conservée », Ne plus suivre), les autres
  indicateurs du catalogue (ceux du métier d'abord), « Relire les
  indicateurs », et les **chiffres de l'organisation** : libellé, valeur
  telle qu'elle se cite, source, lien, date ou période, premier jour (pour
  trier) ; badge « À compléter » quand la source ou la date manque — et
  **le composer ne reçoit que les chiffres complets** (`listCitableFigures`,
  lue par `getDesignContext` ; le prompt les liste « valeur (source, date) »).
  Un chiffre venu d'un indicateur ne se modifie ni ne se supprime à la main
  (on cesse de suivre l'indicateur). Trois états.
- **Entrées « Veille » et « Chiffres »** dans la navigation (Outils).
- **La collecte** (`src/lib/watch/refresh.ts`) : UN chemin de code
  (`executeWatchRun`), trois déclencheurs — à la visite de `/veille` quand la
  dernière collecte terminée a plus de 24 h (`after()` : la ligne de
  collecte existe dès le rendu, l'exécution suit la réponse), le bouton
  (une par dix minutes), le cron quotidien (`vercel.json` → `/api/cron/veille`
  à 05 h 30 UTC, protégé par `CRON_SECRET`, indicateurs du catalogue puis
  organisations périmées dans la durée de la fonction). Verrou EN BASE :
  une collecte commencée il y a moins de cinq minutes et non finie bloque un
  second départ (`INSERT … WHERE NOT EXISTS`, un seul ordre) ; une ligne
  jamais finie est close « interrompue » au départ suivant. Budget 120 s
  (`maxDuration` 180 s sur la page) ; ordre : indicateurs (lus au plus une
  fois par 20 h, partagés), flux dus (quatre à la fois, 10 s chacun,
  `Promise.allSettled` par construction du pool), puis deux recherches web
  et jusqu'à douze résumés tant qu'il reste du temps ; le reste attend la
  collecte suivante — chaque étape écrit son résultat dès qu'elle l'a.
- **Les flux** (`feeds.ts`, `fast-xml-parser`) : RSS 2.0, Atom, RSS 1.0 ;
  seuls le titre, le lien et la date sont lus — `FeedEntry` n'a pas de
  champ pour la description. Découverte depuis la page d'accueil
  (`<link rel="alternate">`, puis `/feed/`, `/rss`, `/feed.xml`… ; les flux
  de commentaires écartés) au moment où la source est ajoutée. Dates RFC
  2822, ISO, ou « 2026-08-25 16:43:06 » lues à l'heure de Paris. Entrées de
  plus de 60 jours non collectées (la veille n'est pas une archive).
- **L'URL canonique** (`url.ts`) : hôte en minuscules, sans fragment ni
  identifiants, sans `utm_*`/`fbclid`/`xtor`/… , paramètres restants triés,
  barre finale et port par défaut retirés ; `url_hash` SHA-256 unique par
  organisation (`ON CONFLICT DO NOTHING`) — un article vu par deux sources
  compte une fois. Le pays d'un résultat de recherche vient du modèle ou du
  domaine national (`.fr` → FR, `.uk` → GB), sinon null.
- **Les recherches web** (`AnthropicProvider.searchArticles`) : l'outil
  serveur `web_search` — la **variante de base `web_search_20250305`**, à
  dessein : celle à filtrage dynamique fait transiter les résultats par une
  exécution de code (40 s, résultats retravaillés), là où celle-ci répond en
  6 à 8 s avec la liste brute du moteur ; une requête par appel, orientée
  pays (FR ou GB selon la langue), restreinte au domaine pour une source
  sans flux. Le modèle décrit les résultats par `emit_articles` (titre,
  date si explicite, langue, pays) mais **seules les URL réellement
  renvoyées par le moteur sont gardées** (liste blanche par URL canonique).
  La requête porte le mois courant (« taux crédit immobilier août 2026ᐧ») :
  sans lui, le moteur rend des pages de fond de l'an dernier, écartées
  ensuite par la borne des 60 jours (vu à la première collecte réelle : 25
  articles par flux, 0 par recherche). Ordre des recherches (migration
  0014) : les sujets dus — jamais cherchés, ou cherchés il y a plus de
  vingt heures (`watch_topics.last_searched_at`, affiché « cherché il y a
  3 h ») — les plus anciens d'abord, avec les sources sans flux dues selon
  leur santé ; deux par collecte ; un sujet à plusieurs termes les parcourt
  un par jour.
- **Les résumés** (`AnthropicProvider.summarizeArticle`, Sonnet 5) : la
  page est lue par la veille (`extract.ts` : scripts, styles, menus,
  en-têtes, pieds, formulaires retirés ; `<article>` le plus long, sinon
  `<main>`, sinon `<body>` ; 30 000 caractères au plus ; titre, date et
  langue déclarés par la page) et le texte est transmis au modèle avec
  l'outil `emit_summary` FORCÉ ; quand le site refuse notre lecture
  (economie.gouv.fr répond 403 à tout agent, même navigateur), le
  fournisseur lit la page lui-même (`web_fetch_20250910`, variante de base
  dont le résultat contient le document lu, 12 000 jetons au plus). Dans les
  deux cas le texte d'origine revient avec le résumé pour le **contrôle
  déterministe** (`originality.ts` : aucune suite de douze mots normalisés
  — minuscules, sans accents, sans ponctuation — du résumé dans
  l'original), puis est oublié : `saveSummaryResult` ne reçoit que le
  résumé. Refus → `summary_state = refused`, rien de stocké, « Résumer à
  nouveau » possible. Le résumé classe l'article dans les sujets de
  l'organisation (libellé exact, seulement s'il en traite principalement),
  note l'angle, la langue, et la date seulement si elle est écrite dans le
  texte. `readable = false` (menu, accueil, page vide) → `failed`.
- **Les indicateurs de marché** (`indicators.ts`, treize entrées en
  données : BCE facilité de dépôt et refinancement, €STR, OAT 10 ans
  (TEC 10), taux long terme France, taux d'usure 20 ans et plus / 10 à 20
  ans, taux effectif moyen 20 ans et plus, inflation France (IPC base 2025),
  inflation zone euro (IPCH), IRL et sa variation, prix des logements
  anciens Notaires-INSEE) et leurs **lecteurs déterministes**
  (`market-readers.ts`, aucune IA) : BCE Data Portal en CSV, Eurostat en
  JSON-stat (la dernière période qui porte une valeur), INSEE BDM en SDMX-ML,
  Banque de France Webstat par les MÉTADONNÉES du catalogue Opendatasoft —
  le portail n'expose aucun enregistrement public, mais chaque série y
  porte sa dernière période et ses deux dernières valeurs, la dernière
  d'abord (vérifié : facilité de dépôt fin février 2023 = « 2.5000,2.0000 »,
  2,50 % après 2,00 %). Séries identifiées par appel réel le 2026-08-26 —
  l'IPC base 2015 et le jeu Eurostat `prc_hicp_manr` sont arrêtés depuis
  2025, leurs remplaçants sont dans le catalogue. Observations partagées
  (`market_observations`, clé indicateur + période), santé par indicateur
  (une API muette laisse la dernière valeur affichée avec sa date), copie
  datée et sourcée dans `verified_figures` (`indicator_key`, « 2,25 % »,
  « Banque centrale européenne », « 17 juin 2026 », premier jour pour trier)
  à chaque lecture — jamais à la main.
- **Le métier fournit la veille par défaut** (`src/lib/watch/templates.ts`,
  rattaché aux packs) : sujets avec termes et langues (courtier : crédit
  immobilier, taux d'usure et conditions d'emprunt, marché immobilier,
  assurance emprunteur, aides à l'achat ; CGP : assurance-vie et placements,
  SCPI, fiscalité du patrimoine, retraite, marchés financiers fr + en ;
  assurance ; tout métier), sources publiques dont le flux a été vérifié par
  appel réel (Ministère de l'Économie, AMF épargnants et communiqués, BCE
  communiqués (EN, « Union européenne »), Bank of England (EN, GB) ; ANIL
  sans flux, cherchée par domaine sur « Crédit immobilier »), indicateurs par
  métier. `createPackWatchDefaults` est idempotent (sujet par libellé, source
  par site, indicateur par clé).
- **Le panier → le composer** : « Écrire une newsletter à partir de ça »
  (cible choisie dans le panier) ouvre `/newsletters/new?cible=…&panier=1` :
  le panneau « Matière : N articles mis de côté — chaque source utilisée
  sera citée avec son lien » (titres, éditeurs, dates, liens, NOS résumés),
  le brief prérempli (`buildBasketBrief`), et au premier enregistrement les
  articles sont rattachés (`newsletter_sources`, idempotent, FK composites)
  — la veille dit alors « Déjà utilisé », puis « Déjà envoyé » quand la
  newsletter est marquée envoyée ; un email déjà enregistré montre sa
  matière au rechargement.
- Un bug de plomberie trouvé au navigateur, corrigé pour tous :
  `withError` plaçait le paramètre APRÈS l'ancre (`/veille#sources?info=…`),
  que le serveur ne voit jamais — les messages des actions avec ancre
  n'arrivaient pas.

### Décisions réversibles

- Résumés et recherches : Sonnet 5 (`ANTHROPIC_WATCH_MODEL` pour changer),
  effort « medium » pour les résumés, « low » pour les recherches.
- Budget 120 s par collecte, deux recherches et douze résumés au plus,
  quatre flux à la fois, 10 s par source, 60 jours de fenêtre, verrou cinq
  minutes, bouton dix minutes, indicateurs relus et sujets cherchés au
  plus une fois par 20 h (le cron du matin les trouve donc dus), sommeil
  après trente jours sans succès, recul 1 h / 6 h / 24 h.
- Le panier est celui de l'organisation (partagé par l'équipe), avec qui a
  mis de côté ; « écarter » masque sans supprimer.
- Un article de recherche sans date explicite reste « date inconnue »
  (l'âge relatif du moteur — « 3 weeks ago » — n'est pas une date) ; un
  article sans sujet est classé par les thèmes du résumé.
- La requête datée du mois courant ; le pays « GB » pour une recherche en
  anglais ; « EU » (Union européenne) comme pays d'une institution européenne.
- Le texte de la source sans flux : « cherchée par domaine, à condition
  d'être rattachée à un sujet ».

### Ce que cette étape ne fait pas

- Les concurrents nommés et l'écart de contenu (étape 5) : le schéma les
  porte (`kind = competitor`), l'écran les mentionne, aucun n'est créé.
- Le prompt de génération n'est pas composé depuis les articles rattachés
  ni depuis les six facettes de l'identité ; la revue ne vérifie pas encore
  les citations ni les formulations reprises (étape 6). Aujourd'hui la
  matière arrive par le brief prérempli.
- Le taux du Livret A n'est pas au catalogue : introuvable dans le
  catalogue Webstat par son titre (seuls des encours et flux de livrets y
  sont) — à ajouter si une source officielle sans clé est trouvée.
- Les indices Notaires-INSEE n'ont pas de série « variation annuelle »
  pour l'ensemble France métropolitaine : l'indice (127,4, base 100 en
  2015) est publié tel quel.
- (Levé par la migration 0014, validée au retour de l'étape 4 : l'index
  partiel unique `watch_runs (organization_id) WHERE finished_at IS NULL`
  garantit un seul démarrage par la base — une violation d'unicité se lit
  « déjà en cours » — et `watch_topics.last_searched_at` remplace la
  rotation par compteur.)

### Preuves

- **À blanc** (`scripts/_tmp-veille-proof.ts`, supprimé) : deux
  organisations jetables `_veille-a` (courtier) et `_veille-b` (CGP), 50
  contrôles par les mêmes fonctions que les écrans — cinq sujets, trois ou
  cinq sources, huit ou sept indicateurs, différents, **sans code
  spécifique**, instanciation idempotente ; verrou (seconde collecte
  refusée), délai du bouton, visite sans délai ; **une collecte réelle :
  112 s, 2 sources lues, 25 articles nouveaux, 6 résumés, 2 recherches, 8
  indicateurs lus** ; résumés de 70 à 98 mots, aucun ne reprend le titre ;
  **aucun contenu d'article stocké — la liste des colonnes de `watch_items`
  (id, organization_id, source_id, topic_id, title, url, url_hash,
  publisher, published_at, country, lang, summary, summary_state,
  summary_model, themes, angle, discovered_via, discovered_at, dismissed_at,
  created_at, updated_at) et une ligne réelle** (« Restauration : qu'est-ce
  que la mention « fait maison » ? », economie.gouv.fr, 26 août 2026, FR,
  fr, un résumé de trois phrases, thèmes, angle « pédagogique ») ; huit
  chiffres vérifiés avec source, lien et date (« 2,25 % (Banque centrale
  européenne, 17 juin 2026) », « 5,19 % (Banque de France (Webstat), 3e
  trimestre 2026) »…), un chiffre sans source **pas citable** puis citable
  une fois complété, un chiffre d'indicateur refusé à la main, « ne plus
  suivre » retire la copie, resynchronisation idempotente ; panier,
  rattachement à une newsletter (idempotent), « déjà utilisé » puis « déjà
  envoyé », le contexte IA ne reçoit que des chiffres complets ; **B ne
  voit rien de A, ne peut rien mettre de côté (code, puis FK composite
  23503)** ; écarter/restaurer, résumer à nouveau ; santé d'une source
  muette (cause lisible, recul 1 h puis 6 h, sommeil après trente jours) ;
  destruction à zéro reliquat (les observations partagées restent, par
  construction).
- **Au navigateur** (`scripts/_tmp-browser.ts`, supprimé ; build de
  production, session forgée, organisation jetable `_veille-nav`) : 39
  étapes, zéro erreur console, zéro `pageerror`, zéro 5xx — état vide →
  « Suivre la veille du métier » → « collecte en cours » → collecte
  terminée avec 32 articles et 12 résumés visibles, pays affiché ; panier
  (1 puis 2) ; `/chiffres` : 8 tuiles, « 2,25 % depuis le 17 juin 2026 »,
  chiffre sans source « À compléter » puis complété, désabonnement ;
  cibles du métier ; « Écrire une newsletter à partir de ça » → panneau
  « Matière : 2 articles », brief prérempli, brouillon enregistré, matière
  conservée au rechargement, « Déjà utilisé » sur les deux articles ;
  source ajoutée à la main avec flux découvert (wordpress.org/news →
  /news/feed/), sujet ajouté, doublon refusé avec message lisible, article
  écarté, délai du bouton. Captures relues.
- Critères d'acceptation couverts ici : **aucun contenu d'article stocké**
  (schéma + ligne réelle), **aucun chiffre affiché sans sa date et sa
  source** (indicateurs copiés datés et sourcés ; chiffres internes « à
  compléter » non cités), deux organisations, sources différentes sans code
  spécifique. Restent : l'email qui cite ses sources (étape 6).

### Coût mesuré

Une collecte complète ≈ 2 recherches (0,02 $) + jusqu'à 12 résumés
(≈ 8 000 jetons lus, 200 écrits, Sonnet 5 : ≈ 0,02 $ l'article) ≈ 0,25 $ au
plus ; une organisation active dont la veille tourne chaque jour :
≈ 5 à 8 $ par mois, zéro pour les autres — dans l'ordre de grandeur annoncé
à l'étape 1. Flux et APIs officielles : gratuits.

## Étape 5 — la veille concurrentielle et l'écart de contenu

### Ce qui est construit

- **`/concurrents`** (entrée « Concurrents » sous Outils, à côté de la
  veille) : **l'écart de contenu d'abord** — c'est le produit du cahier :
  « trois de tes concurrents ont traité le rachat de crédit ce mois-ci, tu
  ne l'as pas fait ». Chaque ligne dit le sujet, combien de concurrents
  l'ont traité et lesquels (avec leur nombre d'articles), les angles pris
  (« guide pratique (3), comparatif »), la date du dernier article ; « Ce
  qu'ils ont publié (N) » déplie les titres publics avec leur lien ; le
  bouton **« Écrire sur ce sujet »** (cible choisie en tête de la section)
  ouvre le composer. Un brouillon qui traite déjà le sujet s'affiche « En
  préparation dans « … » » ; une newsletter marquée envoyée qui le traite
  le retire de l'écart (« Sujets que tu as aussi traités (N) », repliés,
  avec « traité dans « … » le … »). Puis **les concurrents** : nom lié,
  pays, langue, flux ou « Sans flux — cherché par domaine », la SANTÉ
  (mêmes phrases que les sources : `src/lib/watch/health.ts`, partagé),
  **ce qu'ils publient** — « 12 articles ces 30 derniers jours (≈ 3 par
  semaine) · dernier article le 24 août · sujets : taux immobilier (5),
  crédit immobilier (3) · angle dominant : guide pratique · 2 à classer à la
  prochaine collecte » — et « Ce qu'ils ont publié (N sur 60 jours) » ;
  Réessayer / Réveiller / Désactiver / Réactiver ; le formulaire (site,
  nom, flux facultatif, pays, langue). Trois états (`loading.tsx`,
  `error.tsx`, vide avec le formulaire déplié). La visite déclenche la même
  collecte que la veille quand elle a plus de 24 h ; le bouton « Actualiser
  maintenant » est le même (même délai de dix minutes).
- **Un concurrent, c'est une source de nature `competitor`** (schéma de
  l'étape 2, aucune migration) : même découverte du flux depuis la page
  d'accueil, même recherche restreinte à son domaine quand il n'a pas de
  flux — sans sujet : on suit ce qu'il publie, quel qu'en soit le thème
  (`searchJobs` : requête générique dans sa langue, `watch.search.
  competitor_terms` + le mois courant). Trois recherches par collecte au
  lieu de deux, les plus anciennes d'abord (sujets et concurrents
  confondus). Ajouter un concurrent démarre une collecte tout de suite —
  ou, si une collecte est en cours, **dès qu'elle finit** (`scheduleWatch
  Refresh(…, { queue: true })` : `after()` attend la fin, cent secondes au
  plus, puis démarre) : quatre concurrents ajoutés à la suite sont lus
  dans la foulée, pas le lendemain ni après le délai du bouton.
- **Les titres, jamais la page.** Un article de concurrent est **classé
  depuis son titre public** — sujet et angle — en un appel groupé
  (`AIProvider.classifyTitles`, outil `emit_classification` forcé,
  quarante titres par lot, trois lots par collecte au plus, Sonnet 5 en
  effort « low ») ; sa page n'est jamais lue, il n'est jamais résumé
  (`listPendingSummaries` l'exclut). Le sujet obéit à un vocabulaire
  PARTAGÉ : d'abord un sujet suivi de l'organisation (libellé exact),
  sinon un sujet déjà donné à un autre article de concurrent
  (`listCompetitorSubjects`, réinjecté dans le prompt), sinon un sujet
  nouveau de deux à quatre mots dans la langue de l'organisation — pour
  que l'écart groupe ce qui va ensemble. L'angle vient d'un **registre
  fermé** de neuf clés (`COMPETITOR_ANGLES` : guide, news, figures, alert,
  comparison, opinion, promotion, testimonial, other), stocké en clé et
  traduit à l'écran (`watch.angles.*`). En base : `summary_state = done`
  vaut « classé », `summary` reste NULL, `themes = [sujet]`, `angle` = la
  clé, `summary_model` le modèle ; un titre qui n'annonce pas un article
  (accueil, rubrique) est `failed` et ne revient pas ; un lot non rendu
  reste « en attente » pour la collecte suivante.
- **L'écart est calculé, pas généré** (`src/lib/watch/gap.ts`, pur, sans
  base) : trente jours glissants ; côté concurrents, les articles classés
  groupés par **sujet normalisé** (`normalizeSubject` : minuscules, sans
  accents ni ponctuation, mots vides retirés, pluriel simple retiré —
  « Rachat de crédits » = « Le rachat de crédit ») ; côté « toi »,
  `listTreatedSubjects` : les sujets déclarés des newsletters marquées
  envoyées dans la fenêtre (ceux que l'anti-répétition demande au
  marquage) et les thèmes ou le sujet des articles de veille qu'elles ont
  rattachés ; les brouillons touchés dans la fenêtre comptent « en
  préparation ». Un sujet de concurrent et un sujet traité se rapportent
  (`subjectsMatch`) par clés égales ou par inclusion mot à mot (« crédit
  immobilier » ⊂ « taux crédit immobilier »), jamais par un mot seul et
  court. Tri : le plus de concurrents distincts, puis d'articles, puis le
  plus récent. Chaque ligne se lit dans ses articles — rien à croire sur
  parole. La fréquence par concurrent (`competitorStats`) vient des mêmes
  articles.
- **Les articles de concurrents ne sont pas de la matière.** Ils
  n'apparaissent pas parmi les articles de `/veille` (`listWatchItems`
  exclut la nature `competitor`), les concurrents ne figurent pas dans
  ses sources (elles ont leur écran, la note du formulaire y renvoie), le
  panier les refuse (`addToBasket` → « L'article d'un concurrent ne se met
  pas de côté… »). **« Écrire sur ce sujet »** ouvre
  `/newsletters/new?cible=…&sujet=…` : le composer reçoit un brief
  (`buildGapBrief`, phrases de `watch.brief.*` dans la langue des contenus
  de l'organisation) — le sujet, combien de concurrents l'ont traité et
  lesquels, les angles pris, la règle (« ne reprends rien de ce qu'ils ont
  écrit — seul le sujet vient d'eux ; cite chaque source ») — et, comme
  matière, **nos** articles résumés sur ce sujet (`listOwnItemsOnSubject`,
  rattachés à l'enregistrement comme ceux du panier), ou la consigne
  d'écrire depuis notre expertise sans chiffre non vérifié. Aucun titre ni
  lien de concurrent n'y passe — vérifié.
- Au passage : `sourceHealth` extrait dans `src/lib/watch/health.ts`, les
  pays proposés dans `src/lib/watch/countries.ts` ; six textes français
  restés en dur sur `/veille` que le lint ne voyait pas (« date inconnue »,
  « flux », « recherche », « sujet : », « flux : », « démarrée ») et deux
  messages d'erreur de collecte dans `refresh.ts` passés en messages
  fr + en (`watch.page.*`, `watch.run.*`).

### Décisions réversibles

- **Les titres seulement.** Le cahier demande « sujets traités, fréquence,
  angles », pas des résumés : classer les titres est la lecture la plus
  stricte de « uniquement du contenu public » et de la règle de droit
  d'auteur (rien de leur texte n'entre dans le produit, même le temps d'un
  appel), c'est dix fois moins cher qu'un résumé, et c'est immédiat —
  l'écart est complet dès la première collecte au lieu de douze articles
  par jour. Si un jour on veut aussi leurs résumés, le chemin des résumés
  existe et il suffit de ne plus les exclure.
- **L'écart calculé, pas généré** : l'étape 1 prévoyait « un appel par jour
  sur les titres » ; il sert à classer, pas à rédiger l'écart — une phrase
  générée serait invérifiable, un groupement se relit.
- Fenêtre de **trente jours glissants** (« ce mois-ci » du cahier),
  soixante jours de mémoire (la borne des articles de la collecte).
- `summary_state = done` pour « classé » (colonnes existantes, aucune
  migration) ; une colonne dédiée viendrait si les deux sens divergeaient.
- Registre d'angles fermé à neuf clés — traduisible, comptable ; l'angle
  libre des résumés thématiques ne change pas.
- Un article de concurrent ne se met pas de côté : une newsletter sous la
  marque du client n'envoie pas ses lecteurs chez un concurrent et ne se
  construit pas sur son article — l'écart dit le sujet, la matière est la
  nôtre.
- Pas de concurrents par défaut dans les packs métier : un concurrent est
  propre à chaque cabinet (rien de client dans le code).
- Trois recherches par collecte (au lieu de deux) ; file d'attente d'une
  collecte derrière celle en cours, cent secondes d'attente au plus — d'où
  le `maxDuration` de `/concurrents` à 240 s (l'attente, puis le budget de
  120 s, puis la marge ; `/veille` reste à 180 s).
- URL `/concurrents` (et non `/veille/concurrents`) : la navigation active
  `/veille` sur tout `/veille/*`, deux entrées auraient été actives.

### Ce que cette étape ne fait pas

- Le composer ne compose pas encore son prompt depuis les six facettes et
  les articles rattachés, et la revue ne vérifie pas les citations ni les
  formulations reprises (étape 6) — aujourd'hui l'écart arrive par le
  brief et la matière, comme le panier.
- Un article de concurrent ne s'écarte pas à la main (rien à en faire :
  il ne se met pas de côté) ; un sujet mal classé se corrige à la
  collecte suivante seulement par ses nouveaux articles.
- Le vocabulaire des sujets est celui d'un modèle guidé (sujets suivis,
  sujets déjà vus, normalisation) : « taux immobilier » et « crédit
  immobilier » restent deux sujets — c'est lisible, et c'est le cas vu
  à la preuve. Rattacher un sujet de concurrent à un sujet suivi à la
  main serait la suite naturelle si ça gêne.

### Coût mesuré

Un lot de quarante titres ≈ 1 500 jetons lus (dont le prompt en cache),
500 écrits : ≈ 0,01 $ ; une organisation qui suit cinq concurrents : un
lot par jour au plus après la première collecte (les flux n'apportent que
le nouveau), soit ≈ 0,30 $ par mois — plus une recherche par concurrent
sans flux et par jour (0,01 $ chacune). Rien pour les flux.

### Preuves

- **À blanc** (`scripts/_tmp-competitors-proof.ts`, supprimé) : **51
  contrôles**, deux organisations jetables `_conc-a` (courtier) et
  `_conc-b` (CGP), six concurrents RÉELS déclarés par les mêmes fonctions
  que l'écran (flux découverts par appel réel : Credixia, Immobilier
  Danger, Empruntis, Nortia ; sans flux : Pretto, Primonial) ; les
  fonctions pures (normalisation, rapprochement, écart et fréquence sur un
  jeu synthétique — trois concurrents, un brouillon « en préparation »,
  une newsletter envoyée qui couvre, un article hors fenêtre, un article
  non classé) ; **une collecte réelle sur A : 33 s, 3 flux lus, 24
  articles (Credixia 10, Immobilier Danger 4, Empruntis 6, Pretto 4 par
  recherche restreinte à pretto.fr), 24 titres classés en un appel**,
  chacun avec un sujet et un angle du registre (« taux immobilier (8),
  crédit immobilier (5), assurance emprunteur (3), marché immobilier
  (2)… » ; angles figures 11, guide 9, opinion 2, news 1, comparison 1) ;
  en base `summary` NULL, `summary_state` done, `themes` = [sujet],
  `angle` = clé, et les colonnes de `watch_items` sans corps ni extrait ;
  `listWatchItems` et `listPendingSummaries` ne rendent aucun article de
  concurrent, le panier les refuse avec la clé lisible ; **l'écart : neuf
  sujets, « taux immobilier — 4 concurrents » en tête**, trié ; une
  newsletter marquée envoyée qui déclare le sujet (en MAJUSCULES) le fait
  passer en « couvert », un brouillon le laisse « en préparation » ;
  `describeGapSubject` rend concurrents, articles, angles, puis notre
  matière une fois un article de nos sources résumé sur ce sujet ; le
  brief (fr et en) ne contient aucun titre ni lien de concurrent et nomme
  le sujet, les concurrents, les angles, notre matière et la règle ; B ne
  voit rien de A (articles, écart, panier et désactivation refusés par
  l'accès) ; une seconde collecte ne reclasse rien et ne relit aucun flux
  (pas dus) ; destruction à zéro reliquat.
- **Au navigateur** (`scripts/_tmp-browser-competitors.ts`, supprimé ;
  build de production, session forgée, organisation jetable `_conc-nav`) :
  **50 contrôles, zéro erreur console, zéro `pageerror`, zéro 5xx**, le
  texte visible sans clé brute ni accolade à chaque écran — l'état vide
  (formulaire déplié, entrée « Concurrents » active dans la navigation) ;
  Credixia ajouté → « flux trouvé, la collecte démarre » → « Collecte en
  cours » → **l'écart apparaît treize secondes plus tard** (titres
  classés) avec la fréquence, les sujets et l'angle dominant du concurrent
  et « tu ne l'as pas fait » sur chaque ligne ; Immobilier Danger puis
  Pretto ajoutés à la suite → **lus par les collectes qui s'enchaînent
  (vingt secondes)**, Pretto « Sans flux — cherché par domaine » avec
  quatre articles trouvés sur son domaine ; « 3 de tes concurrents ont
  traité « taux immobilier » (6 articles) — tu ne l'as pas fait » ;
  `/veille` sans aucun concurrent, sa note renvoyant à l'écran ; « Écrire
  sur ce sujet » → le composer avec cible et sujet dans l'URL, le brief
  (sujet, « 3 concurrents l'ont traité ce mois-ci (Pretto, Credixia et
  Immobilier Danger — 7 articles) », angles, règle), aucun lien de
  concurrent, notre article en matière (« Matière : 1 article »), le
  brouillon enregistré de lui-même ; retour : « En préparation dans « Notre
  lecture du sujet » » ; marquée envoyée avec ce sujet : la ligne quitte
  l'écart, « Sujets que tu as aussi traités (1) » dit « traité dans « … »
  le 26 août 2026 » ; désactiver / réactiver Pretto ; « Actualiser »
  répond ; en anglais, l'écran entier (« Competitors », « Content gap »,
  « One of your competitors covered … — you haven't ») sans français
  résiduel, `<html lang="en">`, et le brief reste dans la langue des
  contenus de l'organisation. Captures relues. Le journal du serveur ne
  porte que des « destination stream closed early » (le script rechargeait
  la page pendant que l'auto-rafraîchissement streamait — une déconnexion
  du client, pas une erreur du produit).
- **Sur le build final** (après les dernières retouches — `health.ts`,
  les messages — et le `maxDuration` à 240 s) : `tsc` et eslint propres
  sur tout le dépôt, **5 056 messages fr/en vérifiés** (mêmes clés, syntaxe
  ICU, mêmes arguments des deux côtés), et un second passage navigateur de
  **34 contrôles, zéro échec** (organisation jetable `_conc-smoke`, session
  forgée) : Credixia ajouté par le formulaire → flux découvert → **l'écart
  en 13 s** (10 titres classés, cinq sujets), « Lu maintenant. » (la clé
  masculine), « 10 articles de concurrents connus sur soixante jours, 10
  classés », `/veille` sans le concurrent, « Écrire sur ce sujet » → le
  brief avec le sujet, le concurrent, les angles et la règle, sans aucun
  lien de concurrent, « mis de côté » disparu du libellé de la matière ;
  en anglais « Read now. », « you haven’t », aucun français résiduel ;
  désactiver puis réactiver ; zéro `pageerror`, zéro erreur console, zéro
  5xx ; destruction à zéro reliquat. Trois pièges du harnais, pas du
  produit : le contenu streamé n'est révélé qu'après `load` (attendre le
  réseau au repos avant de lire le texte), un clone détaché du `body`
  colle les blocs (« …/feedLu » — lire `innerText` sur le document
  vivant), et une capture `fullPage` montre le squelette (capturer la
  fenêtre).
- Critères d'acceptation touchés ici : **deux organisations, des
  concurrents différents, sans code spécifique** (A et B) ; **aucun
  contenu d'article stocké** — pour un concurrent, même pas lu. Reste
  l'email qui cite ses sources (étape 6).

## Avancement

- **Étape 1 — exploration et conception** : `5cdf435`. STOP.
- **Étape 2 — schéma et migration `0013`** : accord reçu le 2026-08-26 ;
  migration appliquée sur la base (journal `drizzle.__drizzle_migrations` :
  14 migrations ; 11 tables et 8 colonnes nouvelles vérifiées par lecture du
  catalogue), puis committée et poussée : `7137a28`. STOP.
- **Étape 3 — cibles** : segments vivants, identité éditoriale, écrans,
  composer, « marquée envoyée », fiche contact — prouvée à blanc (26
  contrôles) et au navigateur (33 étapes), mesurée sur 5 000 contacts :
  `38f6556`. STOP.
- **Étape 4 — veille thématique, indicateurs de marché, panier** : `/veille`,
  `/chiffres`, la collecte à trois déclencheurs, treize indicateurs lus à
  la source, le panier branché sur le composer — prouvée à blanc (50
  contrôles, une collecte réelle) et au navigateur (39 étapes). STOP.
  Migration `0014` (verrou garanti par la base, date de recherche des
  sujets) validée et appliquée au retour, avec la `0015` du chantier
  marque blanche : `c3de5c1`.
- **Étape 5 — veille concurrentielle et écart de contenu** :
  `/concurrents`, les concurrents nommés (flux ou recherche par domaine),
  les titres classés (sujet, angle) sans jamais lire une page, l'écart
  calculé et actionnable (« écrire sur ce sujet » → le composer avec le
  brief et notre matière), aucune migration — prouvée à blanc (51
  contrôles, une collecte réelle) et au navigateur (50 contrôles). STOP.
