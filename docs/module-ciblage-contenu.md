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

## Avancement

- **Étape 1 — exploration et conception** : `5cdf435`. STOP.
- **Étape 2 — schéma et migration `0013`** : accord reçu le 2026-08-26 ;
  migration appliquée sur la base (journal `drizzle.__drizzle_migrations` :
  14 migrations ; 11 tables et 8 colonnes nouvelles vérifiées par lecture du
  catalogue), puis committée et poussée : `7137a28`. STOP.
- **Étape 3 — cibles** : segments vivants, identité éditoriale, écrans,
  composer, « marquée envoyée », fiche contact — prouvée à blanc (26
  contrôles) et au navigateur (33 étapes), mesurée sur 5 000 contacts.
  STOP.
