# Module de rédaction de mails — dossier de reconstruction

> Écrit pour un architecte qui va reconstruire ce module dans un autre produit,
> **multi-client** (plusieurs organisations, chacune avec sa propre marque et
> ses propres contenus), **sans accès à ce code**. Toutes les informations
> ci-dessous viennent du code du dépôt `S2C` tel qu'il existe aujourd'hui.
> Quand une information n'a pas été trouvée dans le code, c'est noté
> explicitement — rien n'est deviné.
>
> Périmètre : le **Module 1 — Mailing** de CLAUDE.md (composition de
> newsletters en blocs, génération IA, traduction, export HTML email-safe).
> Le module 2 (Veille) et le module Contacts (brouillons d'emails personnels
> aux clients en transaction) ne sont décrits que là où ils **alimentent** le
> module mailing (panier d'articles, indicateurs de marché) — ce sont des
> modules voisins, pas le sujet principal de ce document.

---

## 1. À quoi sert le module, et parcours utilisateur

### 1.1 Objectif

Un éditeur interne (~5 admins) compose une newsletter marketing en blocs
(titre, texte, chiffre clé, CTA, fiches, image, article, bouton, séparateur,
espace), génère un premier jet avec l'IA à partir d'un brief, ajuste, traduit
en anglais, vérifie un score de qualité en direct, prévisualise le rendu HTML
réel (desktop/mobile), puis **exporte du HTML** dans un format compatible
avec l'outil d'envoi externe (HubSpot ou Brevo). **L'outil n'envoie jamais de
mail lui-même** — il s'arrête à la génération du HTML, que l'équipe colle
ensuite dans HubSpot/Brevo.

Trois cibles fixes pilotent le ton, les blocs suggérés et les CTA proposés :
- **NL1** — B2C Découverte (acheteur non-résident qui découvre le crédit en
  France)
- **NL2** — B2C Projet identifié (prospect avec un projet concret)
- **NL3** — B2B Partenaires (agents, gestionnaires de patrimoine, notaires)

### 1.2 Parcours utilisateur, écran par écran

**Écran 1 — Entrée du composer (`/newsletters/new`)**, tant qu'aucun bloc n'a
été démarré (`started = false` dans `composer.tsx`) :

1. **« 1. Destinataire »** — une grille de 3 cartes cliquables (NL1/NL2/NL3),
   chacune avec son label, son badge d'audience (B2C/B2B) et une description
   courte du persona. Le choix de la cible active le reste de l'écran.
2. **« 2. Brief — laissez l'IA composer »** — un textarea de brief (placeholder
   adapté à la cible choisie), un sélecteur de longueur segmenté
   **Court / Moyen / Long** (avec un hint de fourchette de caractères et de
   nombre de sections), puis un gros bouton primaire **« Concevoir avec
   l'IA »**. C'est le chemin principal (IA-first), pas une option parmi
   d'autres.
3. Sous le bouton IA, un séparateur « ou », puis deux options secondaires
   côte à côte : **« Partir d'un modèle »** (applique le template pré-écrit de
   la cible) et **« Partir de zéro »** (éditeur vide).
4. Si un « panier veille » contient des articles (déposés depuis le module
   Veille — `sessionStorage`, `BASKET_EVENT`), une carte liste chaque article
   avec un retrait unitaire (×) et un bouton **« Insérer »** qui les convertit
   en blocs `article` (chacun garde son propre lien).

Un lien externe alimente cet écran : la page Personas envoie vers
`/newsletters/new?target=<NL_x>&brief=<texte>` (« Rédiger pour ce persona »),
et le module Veille peut aussi préremplir `target`/`brief` en query string.

**Écran 2 — Éditeur + aperçu live (`started = true`)** — deux colonnes,
`lg:grid-cols-2` :

- **Barre d'outils** (en haut, pleine largeur) : bouton retour
  (« Recommencer »), champ titre interne, badge de cible, toggle de langue
  **FR / EN** (générer l'EN si absent), score qualité affiché en direct
  (`xx/100`), boutons **Brouillon** (sauver dans la bibliothèque), **Enregistrer /
  Mettre à jour** (persiste dans la table kanban `newsletters`), **Copier**
  (le HTML), et trois boutons d'export : **Standard**, **HubSpot**, **Brevo**.
- **Colonne gauche (édition)** :
  - Carte **« Brief & IA »** — brief, longueur, deux boutons : **Concevoir
    avec l'IA** et **Objet + préheader** (génération dédiée).
  - Carte panier veille (si non vide).
  - Carte **« Blocs »** — palette de boutons « + Type de bloc » (10 types),
    puis la liste triable par glisser-déposer (`@dnd-kit`) des blocs actifs.
    Chaque bloc (`SortableBlock`) a son propre formulaire de champs selon son
    type ; le focus sur un champ marque le bloc comme « actif » pour la
    prévisualisation.
  - Carte **Score qualité** (`QualityPanel`) — barème détaillé, un critère par
    ligne avec coche/croix, points gagnés/max, et un hint quand incomplet.
  - Carte **« Réglages <LANG> »** (sous le pli, secondaire) — objet, préheader,
    UTM campagne.
  - Carte **« Membres »** — tag d'un membre interne sur la newsletter une fois
    enregistrée (notifications internes, hors périmètre de ce document).
- **Colonne droite (aperçu, sticky)** — `PreviewPane` : un `<iframe
  sandbox="allow-same-origin">` chargé avec le **HTML réel exporté** (pas une
  maquette séparée), toggle Desktop (600px) / Mobile (375px), et surlignage +
  scroll automatique vers le bloc en cours d'édition (`id="blk-<blockId>"`
  injecté dans le HTML, ciblé côté client).

Chaque bloc `chiffre_cle` propose un sélecteur **« Depuis la veille »**
(`IndicatorPicker`) qui va chercher `/api/veille/indicators` et pré-remplit
valeur/label/légende avec un indicateur de marché **sourcé et daté** (ex. taux
d'usure) — c'est le mécanisme qui remplace toute saisie manuelle non sourcée.
Chaque bloc `cta` propose un sélecteur **« Destination (preset S2C) »** listant
les URL autorisées pour la cible (jamais de champ URL vide par défaut).

**Écran « Brouillons » (`/brouillons`)** — bibliothèque des newsletters en
cours (table `drafts`, distincte de `newsletters`), listées par date de
modification, avec cible, longueur, nombre de blocs ; bouton **Rouvrir**
(retour au composer via `?draft=<id>`) et suppression avec confirmation
(`DeleteDraftButton`).

**Édition d'une newsletter enregistrée (`/newsletters/[id]`)** — recharge le
composer avec les données persistées (`loadNewsletter`), y compris ses blocs
normalisés.

> Non trouvé dans le code : aucun écran de **kanban visuel** (colonnes Idée →
> Rédaction → Relecture → Planifié → Envoyé) n'existe dans l'UI. Le statut
> `newsletterStatus` (`idee|redaction|relecture|planifie|envoye`) est bien
> défini dans le schéma Drizzle et sur la table `newsletters`, mais aucun
> fichier de `src/app` ni `src/components` ne le lit ni ne le modifie — le
> kanban prévu par CLAUDE.md reste au stade de schéma, pas de fonctionnalité
> livrée. Le point d'entrée réel de navigation est « Mailing » →
> `/newsletters/new` (toujours l'écran de composition), pas une liste/kanban.

### 1.3 Fonctions annexes du composer

- **Traduction FR→EN** (`translateToEn`) : traduit le corps + adapte objet et
  préheader ; crée une version EN **sans écraser** la version FR (paire de
  versions `fr`/`en` dans l'état du composer, `Version = { blocks, subject,
  preheader }`).
- **Export à 3 formats** : `standard` (HTML complet avec `<style>` en tête,
  utile en aperçu/téléchargement générique), `brevo` et `hubspot` (HTML
  entièrement inline, sans balise `<style>`, auto-suffisant — voir §6).
- **Copier le HTML** dans le presse-papiers.
- **Décoration UTM automatique** au rendu : chaque URL sortante des blocs
  reçoit `utm_source=newsletter&utm_medium=email&utm_campaign=<slug>` si un
  UTM campagne est renseigné (jamais s'il écrase un paramètre déjà présent).

---

## 2. Tables de base de données (Postgres via Drizzle)

Toutes les tables ci-dessous viennent de `src/lib/db/schema.ts`. Les tables
directement utilisées par le module mailing sont en gras dans les titres ;
les tables d'un module voisin ne sont listées que si le mailing les lit
(indicateurs de marché) ou les alimente (panier veille → blocs `article`,
via `sessionStorage`, sans table dédiée).

### **`newsletters`** — la newsletter « source de vérité » kanban

| Colonne | Type | Rôle |
|---|---|---|
| `id` | uuid PK | |
| `title` | text, défaut `"Sans titre"` | Titre interne (jamais envoyé) |
| `target` | enum `NL1\|NL2\|NL3` | Cible — pilote ton/blocs/CTA |
| `status` | enum `idee\|redaction\|relecture\|planifie\|envoye`, défaut `idee` | Statut kanban prévu au schéma ; **`envoye` est un marqueur manuel** coché après envoi externe. Non exposé dans l'UI actuelle (voir §1.2). |
| `lang` | enum `fr\|en`, défaut `fr` | Langue de cette version enregistrée |
| `subject` | text nullable | Objet email |
| `preheader` | text nullable | Préheader (texte de prévisualisation caché) |
| `utmCampaign` | text nullable | Slug de campagne UTM |
| `brief` | text nullable | Brief saisi, réutilisé par « Concevoir avec l'IA » |
| `scheduledAt` | timestamptz nullable | **Non trouvé dans le code** : colonne présente mais aucun formulaire ni action ne l'écrit — hook non câblé |
| `qualityScore` | integer, défaut 0 | Recalculé **côté serveur** à chaque sauvegarde (jamais fait confiance au client) |
| `htmlCache` | text nullable | **Non trouvé dans le code** : colonne présente au schéma mais jamais écrite par `saveNewsletter` — cache prévu, non branché |
| `sentAt` | timestamptz nullable | **Non trouvé dans le code** : idem, colonne au schéma sans écriture applicative trouvée |
| `createdBy` | uuid → `users.id`, `ON DELETE SET NULL` | |
| `createdAt`, `updatedAt` | timestamptz | |

### **`newsletter_blocks`** — blocs normalisés d'une newsletter enregistrée

| Colonne | Type | Rôle |
|---|---|---|
| `id` | uuid PK | |
| `newsletterId` | uuid → `newsletters.id`, `ON DELETE CASCADE` | |
| `type` | enum `article\|chiffre_cle\|fiches\|cta\|titre\|texte\|image\|bouton\|separateur\|espace` | Type de bloc |
| `position` | integer, défaut 0 | Ordre d'affichage (0-based) |
| `payload` | jsonb, défaut `{}` | Contenu spécifique au type, validé par un schéma zod côté application (pas de contrainte SQL) |
| `lang` | enum `fr\|en`, défaut `fr` | |

À chaque sauvegarde (`saveNewsletter`), **tous les blocs d'une newsletter sont
supprimés puis réinsérés** dans une transaction (`DELETE` puis `INSERT` en
bloc) — modèle volontairement simple pour un éditeur de blocs, pas d'upsert
fin par bloc.

### **`drafts`** — bibliothèque de brouillons (snapshot autonome)

Table distincte de `newsletters` : ici le contenu est **inline en jsonb**
(pas de table enfant), pensée pour être sauvée/listée/rouverte/supprimée
comme une bibliothèque, indépendamment du kanban.

| Colonne | Type | Rôle |
|---|---|---|
| `id` | uuid PK | |
| `title` | text, défaut `"Sans titre"` | |
| `target` | enum `NL1\|NL2\|NL3` | |
| `length` | enum `court\|moyen\|long`, défaut `moyen` | Volume de génération choisi |
| `blocks` | jsonb `unknown[]`, défaut `[]` | Snapshot des `EditorBlock[]` (newsletter) OU, pour un brouillon de mail personnel (module Contacts), le contexte de génération |
| `subject` | text nullable | |
| `preheader` | text nullable | |
| `contactId` | uuid → `contacts.id`, `ON DELETE CASCADE`, nullable | **Non nul uniquement** pour les brouillons de mail personnel du module Contacts (hors périmètre mailing) — la requête `listDrafts()` filtre explicitement `contactId IS NULL` pour ne montrer que les brouillons newsletter dans `/brouillons` |
| `body` | text nullable | Corps texte brut — utilisé seulement par les mails personnels (module Contacts), jamais par le composer newsletter en blocs |
| `createdBy` | uuid → `users.id`, `ON DELETE SET NULL` | |
| `createdAt`, `updatedAt` | timestamptz | |

### **`templates`** — modèles de structure de blocs (schéma seulement)

| Colonne | Type | Rôle |
|---|---|---|
| `id` | uuid PK | |
| `target` | enum `NL1\|NL2\|NL3` | |
| `name` | text | |
| `blocks` | jsonb, défaut `[]` | Tableau de définitions de blocs |
| `createdAt` | timestamptz | |

**Important** : cette table SQL existe au schéma mais **n'est lue par aucun
code applicatif trouvé**. Les modèles réellement utilisés par le bouton
« Partir d'un modèle » sont **codés en dur** dans
`src/lib/newsletter/templates.ts` (`TEMPLATES: Record<TargetId,
NewsletterTemplate>`), pas chargés depuis cette table. À reconstruire pour du
multi-client : cette table est le bon point d'ancrage pour rendre les modèles
gérables par organisation — mais dans ce dépôt, elle est un vestige non
branché.

### **`market_indicators`** — couche « indicateurs marché » (lue par le mailing)

Alimentée par le module Veille (sources `type=data`), **lue** par le composer
via `/api/veille/indicators` (le sélecteur « Depuis la veille » du bloc
`chiffre_cle`) et par `/api/newsletters/ai/design` (injectée dans le prompt
IA comme données réelles utilisables). Append-only, une ligne par
`(indicatorKey, period)` (contrainte unique) — permet un historique/tendance.

| Colonne | Rôle |
|---|---|
| `id` | uuid PK |
| `indicatorKey` | clé stable (ex. `oat_10y`) |
| `label` | libellé humain |
| `valueText` | valeur exactement comme publiée (ex. `"3,85"`) |
| `valueNum` | valeur numérique parsée si possible |
| `unit` | unité d'affichage |
| `period` | période d'observation telle que publiée (`ISO`, `"2026-06"`, `"2026-T2"`) |
| `sourceName`, `sourceUrl`, `sourceId` | traçabilité de la source |
| `fetchedAt` | horodatage de collecte |

### `users` — auteurs (référencée par `createdBy`)

`id`, `email` (unique), `passwordHash` (bcrypt), `name`, `role`
(`admin\|redacteur`), `lastLogin`, `createdAt`. Auth.js email/mot de passe.

### Tables du schéma non utilisées par le mailing (pour mémoire)

`images`, `sources`, `news_items`, `competitor_emails`, `events`,
`event_notes`, `mentions`, `notifications`, `app_settings`, `articles`,
`personas`, `contacts`, `tasks` — modules voisins ou futurs (Module 2/3,
calendrier, tagging). Le module `personas` a un lien d'usage **vers** le
mailing (bouton « Rédiger pour ce persona » → `?target=&brief=`) mais aucune
donnée persona n'entre dans les tables mailing elles-mêmes.

---

## 3. Fichiers principaux et rôle de chacun

### Domaine / logique pure (`src/lib/newsletter/`)

| Fichier | Rôle |
|---|---|
| `blocks.ts` | Modèle de domaine des blocs : `BLOCK_TYPES` (10 types), `BLOCK_META` (labels/描述/icônes FR), un schéma **zod** de payload par type (`BLOCK_PAYLOAD_SCHEMAS`), `defaultBlock()`, `parseBlockPayload()`. Source de vérité unique sur la forme d'un bloc. |
| `targets.ts` | Les 3 cibles (`TARGETS: Record<TargetId, TargetMeta>`) : label, persona, audience B2C/B2B, thèmes suggérés, blocs par défaut, couleur d'accent UI, signataire, et surtout `editorial` — le texte d'identité éditoriale injecté tel quel dans le prompt IA (voix, angle, à éviter). C'est ce champ qui fait qu'un NL1 ne se lit pas comme un NL2/NL3. |
| `cta-presets.ts` | Les URL de destination autorisées (`CTA_PRESETS`), par langue, avec libellé de bouton et slug UTM ; `PRESETS_BY_TARGET` associe les presets pertinents à chaque cible ; `applyPresetToPayload()` remplit un bloc CTA d'un coup. |
| `templates.ts` | Les 3 modèles de structure codés en dur (un par cible), utilisés par « Partir d'un modèle ». Chaque bloc CTA du modèle est pré-rempli via `cta-presets.ts`. |
| `length.ts` | Cibles de volume Court/Moyen/Long (nombre de caractères idéal + fourchette ±10 %), `bodyCharCount()` (compte les caractères du texte lisible à travers les blocs), `lengthFit()`. |
| `quality.ts` | Scoreur de qualité 0-100, pur, sans I/O (9 critères pondérés, testé unitairement). Voir détail §1.2/§7. |
| `copywriter.ts` | Contrôle qualité déterministe post-génération (pas d'IA) : détecte CTA multiples, pavés de texte, emojis, mauvais signataire, **chiffres potentiellement inventés** (regex de figures non vérifiées / non placeholder / non citées « valeur (source, date) »), objet/préheader hors gabarit. Fournit aussi `clampSubject()`/`clampPreheader()` (troncature déterministe sans réécriture IA) et les seuils `SUBJECT_MAX=42`, `PREHEADER_MAX=85`. C'est le filet de sécurité qui décide si une passe de resserrement IA doit tourner. |
| `translate.ts` | Traduction FR↔EN : `collectTranslatable()` (pure, extrait les champs traduisibles d'un bloc → liste de chaînes + setters) puis appel IA, plus `localizeBlockUrls()`/`localizeUrl()` qui substitue les URL FR par leur équivalent EN connu (`URL_PAIRS`, une seule paire trouvée dans le code : le simulateur). |
| `utm.ts` | `decorateUrl()`/`decorateBlocksWithUtm()` — ajoute les paramètres UTM à toute URL http(s) d'un bloc sans écraser les paramètres déjà présents. |
| `render-email.ts` | Orchestration du rendu : `renderNewsletterHtml()` (react-email → HTML complet), `renderNewsletterHtmlEmailSafe()`/`renderNewsletterHtmlHubSpot()` (même rendu passé dans `inlineSafeHtml()`), `renderNewsletterText()` (fallback texte brut). |
| `email-safe.ts` | `inlineSafeHtml()` — transforme le HTML complet en HTML « durci » pour import HubSpot/Brevo : retire tout bloc `<style>`, retire les ancres `id="blk-*"` (usage éditeur seulement), nettoie les lignes vides. Pure, testée unitairement sans rendu React. |
| `actions.ts` | Server actions Drizzle (`"use server"`) pour la table `newsletters`/`newsletter_blocks` : `saveNewsletter` (recalcul du score serveur, transaction delete+insert des blocs), `loadNewsletter`, `listNewsletters`, `deleteNewsletter` (garde d'auteur : suppression seulement par le créateur). |
| `drafts.ts` | Server actions (`"use server"`) pour la table `drafts` : `saveDraft` (upsert), `deleteDraft`. Entrée validée par un schéma zod dédié (`draftInput`). |
| `drafts-queries.ts` | Lectures de `drafts` côté RSC : `listDrafts()` (newsletters seulement, `contactId IS NULL`, dégrade en liste vide si la table n'est pas encore migrée), `getDraft(id)`. |

### Rendu email (`src/emails/`)

| Fichier | Rôle |
|---|---|
| `newsletter-email.tsx` | Le template **react-email** complet. Constantes de marque en dur (couleurs hex, polices avec fallback web-safe), un composant `Box()` qui **force le padding/background sur `<td>` plutôt que sur le `<table>`** (contournement HubSpot documenté en commentaire — voir §6), un renderer par type de bloc (`BlockNode`), un regroupement des `chiffre_cle` consécutifs en une rangée de KPI sur 3 colonnes de largeur fixe (`KpiRow`/`toSegments`), le lockup de logo partagé header, le head avec `<style>` responsive + `@font-face`, et le retrait d'une éventuelle signature en texte brut héritée d'anciens drafts (`stripPlainSignature`) car la signature officielle n'est **plus générée par bloc** — elle est prévue pour être ajoutée à l'import côté client (décision produit, cf. commentaire dans le fichier).

### IA (`src/lib/ai/`)

| Fichier | Rôle |
|---|---|
| `types.ts` | Interface `AIProvider` (contrat que le reste de l'app utilise, jamais un SDK vendeur en dur) + tous les types d'entrée/sortie par fonction. |
| `anthropic.ts` | Implémentation Anthropic de `AIProvider`. Tous les prompts système, schémas d'outils (`strict: true`, tool use forcé), et logique d'appel. Détaillé intégralement en §4. |
| `index.ts` | Factory `getAIProvider()` — un seul provider aujourd'hui, point d'extension pour router par variable d'env plus tard. |

### Routes API (`src/app/api/newsletters/`)

| Fichier | Rôle |
|---|---|
| `ai/design/route.ts` | `POST /api/newsletters/ai/design` — orchestre la génération complète : design → ajustement de longueur (1 passe) → sourcing web des placeholders restants → passe copywriter de resserrement. Détaillé en §4. |
| `ai/subject/route.ts` | `POST /api/newsletters/ai/subject` — génère objet + préheader, puis les tronque déterministiquement (`clampSubject`/`clampPreheader`) et renvoie une revue `reviewCopy`. |
| `translate/route.ts` | `POST /api/newsletters/translate` — valide le body (zod), appelle `translateNewsletter()`. |
| `render/route.ts` | `POST /api/newsletters/render` — rend un draft (non persisté) en HTML ; c'est la **même route** qui sert l'aperçu live (format `standard`) et l'export (`brevo`/`hubspot`). Applique la décoration UTM avant rendu. |

### Composants UI (`src/components/newsletter/`)

| Fichier | Rôle |
|---|---|
| `composer.tsx` | Le composant client principal — tout l'état du composer (versions FR/EN, blocs, brief, longueur, UTM, ids persistés), les appels aux routes IA/traduction/rendu, le rendu débouncé (400 ms) de l'aperçu, l'écran d'entrée IA-first/modèle-first, l'écran éditeur+aperçu deux colonnes. |
| `sortable-block.tsx` | Un bloc draggable (`@dnd-kit/sortable`) avec son formulaire de champs par type (`BlockFields`), le sélecteur de preset CTA, l'intégration de `IndicatorPicker` sur les blocs chiffre clé. |
| `preview-pane.tsx` | Le panneau d'aperçu live — iframe sandboxée chargée avec le HTML réel, toggle desktop/mobile, surlignage du bloc actif via manipulation DOM directe de l'iframe (pas de re-rendu du HTML pour le highlight). |
| `quality-panel.tsx` | Affichage du barème de score (liste de critères avec coche/croix + hint). |
| `indicator-picker.tsx` | Sélecteur d'indicateur de marché sourcé pour le bloc chiffre clé, alimenté par `/api/veille/indicators`. |
| `draft-actions.tsx` | Bouton de suppression d'un brouillon avec confirmation. |

### Pages (`src/app/(app)/`)

| Fichier | Rôle |
|---|---|
| `newsletters/new/page.tsx` | Point d'entrée du composer ; lit les query params `target`/`brief`/`draft` pour préremplir depuis Personas/Veille ou rouvrir un brouillon. |
| `newsletters/[id]/page.tsx` | Édition d'une newsletter déjà enregistrée (`loadNewsletter`). |
| `brouillons/page.tsx` | Liste de la bibliothèque de brouillons. |

---

## 4. Comment l'IA est appelée

### 4.1 Fournisseur, modèles, mécanisme de fiabilité

- **Fournisseur** : Anthropic exclusivement (`@anthropic-ai/sdk`), derrière
  l'interface `AIProvider` — aucun autre fournisseur de texte n'est câblé
  dans le module mailing (Gemini/OpenAI n'existent que côté clés d'env pour
  la génération d'**images**, non branchée dans ce module — voir §5).
- **Modèle principal** : `process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6"`
  — utilisé pour la conception (`designNewsletter`), l'ajustement de longueur
  (`resizeNewsletter`), le resserrement (`tightenNewsletter`), l'objet/préheader
  (`generateSubject`, `adaptSubject`), la traduction (`translateStrings`), et
  les brouillons de mail personnel du module Contacts.
- **Modèle « économique »** : `process.env.ANTHROPIC_CLASSIFY_MODEL ||
  "claude-haiku-4-5-20251001"` — utilisé pour le sourcing web de chiffres
  (`sourceFigures`, avec l'outil de recherche web) et la recherche thématique
  veille. Raison documentée en commentaire : « token economy — le brief
  mandate Haiku pour summarize/classify, pas Sonnet ».
- **Sortie structurée forcée** : chaque appel utilise le **tool use strict**
  (`strict: true` sur le schéma JSON de l'outil) avec `tool_choice: { type:
  "tool", name: "..." }` — jamais de parsing de texte libre. Commentaire du
  code : plus robuste que le format de sortie natif et indépendant d'une
  version de zod donnée.
- **Prompt caching** : chaque bloc système stable est envoyé avec
  `cache_control: { type: "ephemeral" }` ; les éléments volatils (cible,
  brief, longueur) vont dans le message utilisateur, après le préfixe mis en
  cache.
- **Détection de troncature** : si `message.stop_reason === "max_tokens"`,
  l'appel lève une erreur explicite plutôt que de renvoyer un JSON d'outil
  amputé silencieusement (bug historique documenté en commentaire : « long
  mail displayed incomplete »). `max_tokens: 8192` pour design/resize/tighten
  (un mail « long » ≈ 5 900 caractères + enveloppe JSON flirtait avec
  l'ancien plafond de 4000 et revenait tronqué).
- **Recherche web serveur** : outil Anthropic natif
  `web_search_20250305` (`max_uses: 3`), utilisé pour le sourcing de chiffres
  et la recherche thématique veille — jamais pour la génération elle-même.

### 4.2 Le prompt système de génération (reproduit intégralement)

C'est le prompt central du module — celui qui pilote `designNewsletter`,
`resizeNewsletter`, `tightenNewsletter`, `generateSubject` et `adaptSubject`
(même bloc système, envoyé avec `cache_control: ephemeral`) :

```
Tu es le rédacteur marketing de S2C (Société2Courtage), courtier en crédit immobilier pour acheteurs NON-RÉSIDENTS et expatriés en France (clientèle internationale : Dubaï, Singapour, Londres, New York).

TON DE MARQUE (strict) :
- Expert, direct, premium, jamais condescendant. Pas de jargon superflu. Position assumée.
- En français : un courtier qui connaît son métier. En anglais : professional but warm.
- Nom affiché : « S2C » (jamais « Société2Courtage »). Tagline : « Mortgage for International Buyers ».
- INTERDIT : emojis, superlatifs creux, promesses chiffrées non sourcées, conseil fiscal/juridique hasardeux.

CONTENU :
- CHIFFRES (RÈGLE ABSOLUE) : n'invente JAMAIS un chiffre, un prix, un taux, un délai ni un montant. Par ordre de priorité :
  1) DONNÉES INTERNES S2C, vraies, utilisables telles quelles : 910 dossiers financés · 64 pays · 680 M€ · 95 % de taux de succès.
  2) DONNÉES RÉELLES SOURCÉES fournies dans le message (indicateurs Banque de France : taux d'usure, OAT…) : utilise-les en priorité dans les blocs chiffre_cle, TOUJOURS citées au format « valeur (source, date) » — ex. « 5,29 % (Banque de France, T3 2026) ». Jamais sans leur date.
  3) TOUT AUTRE chiffre (prix au m², délai, apport…) → un PLACEHOLDER entre crochets : [apport %], [délai], [prix m²]. Il sera sourcé ensuite ou complété à la main. Un chiffre sans source fournie = crochet, sans exception (interdit : « délai moyen 3 semaines », « 87 % d'acceptation », « taux à 3,4 % »).
- Pas de conseil fiscal ou juridique catégorique (non-résident, LMNP, SCI, plus-values) : informe et invite à échanger avec S2C, sans trancher.
- IDENTITÉ ÉDITORIALE PAR CIBLE : le message fournit l'identité de la cible (qui est le lecteur, la voix à prendre, ce qu'il faut éviter). Elle PRIME sur le ton générique — un NL1 (découverte pédagogue) ne doit JAMAIS se lire comme un NL2 (conseiller de dossier) ni comme un NL3 (confrère technique B2B).

URLs S2C utilisables pour les CTA (sinon laisse url vide) :
- Simulateur : https://societe2courtage.com/simulateur-credit-immobilier/
- Webinaire : https://societe2courtage.com/webinaire/
- RDV Jeevanthy (B2C NL1/NL2) : https://meetings-eu1.hubspot.com/jeevanthy/jeevanthy
- RDV Thomas (B2B NL3) : https://meetings-eu1.hubspot.com/meetings/thomas-nivert

BLOCS DISPONIBLES (utilise l'outil emit_newsletter) :
- titre (text, level 1-3) — titre court et concret, level 1 pour le titre principal
- texte (text) — UN paragraphe = UNE idée, 2-3 phrases MAX
- chiffre_cle (value, label, caption) — une donnée mise en avant : UNIQUEMENT un chiffre vérifié (cf. liste) OU un [placeholder]. Jamais une métrique inventée.
- cta (title, text, buttonLabel, url) — l'UNIQUE encart d'appel à l'action
- bouton (label, url) — bouton seul (compte comme le CTA unique)
- separateur — séparateur visuel

RÈGLES DE COPIE — PERCUTANT, MOBILE-FIRST (quelle que soit la tonalité éditoriale) :
- 1 idée = 1 bloc. Un bloc de fond : 3 à 5 phrases DENSES (2 courts paragraphes max, séparés par une ligne vide dans le MÊME bloc). Jamais de pavé : chaque paragraphe reste court et lisible en diagonale au téléphone.
- ENTAME par le chiffre / la donnée concrète (fenêtre, montant, échéance, ou un [placeholder]), jamais par une intro générique. INTERDIT : « Dans un contexte… », « Nous tenions à vous informer… », « Chère cliente, cher client… ».
- UN SEUL CTA dans toute la newsletter (un seul bloc cta OU un seul bouton). Ne multiplie pas les liens.
- Longueur du corps : ADAPTÉE à la longueur demandée dans le message (court / moyen / long). Un mail plus long = PLUS de sections utiles (nouveaux angles concrets, données sourcées ou [placeholders]), JAMAIS du remplissage ni des chiffres inventés. Toujours en blocs scannables.

PROFONDEUR — COURT ≠ CREUX (aussi impératif que le punch) :
- Chaque section de fond porte TROIS niveaux, dans le même bloc : le CONSTAT (le fait, le chiffre), le MÉCANISME (pourquoi c'est comme ça), l'IMPLICATION (ce que ça change concrètement pour le lecteur et son dossier). Pas trois phrases mécaniques — mais les trois niveaux doivent y être.
- Test de chaque bloc : « et donc, pour moi, qu'est-ce que ça change ? ». Si la réponse n'est pas dans le bloc, il est creux → complète-le ou supprime-le.
- INTERDIT : une punchline seule, un chiffre lâché sans lecture, un constat sans conséquence, une transition creuse. Chaque idée va jusqu'au bout.
- SPÉCIFICITÉ MÉTIER obligatoire : parle de ce qui compte pour un acheteur NON-RÉSIDENT/expatrié — revenus en devise étrangère, assurance emprunteur non-résident, banques ouvertes aux profils internationaux, structuration du dossier, calendrier jusqu'à l'acte, contrainte du taux d'usure. BANNIS toute généralité qui pourrait figurer dans n'importe quelle newsletter immobilière.
- La matière DENSE (conditions, étapes, comparaisons, critères banque par banque) passe par les blocs FICHES, pas par des paragraphes empilés.
- TAUX D'USURE et OAT (données fournies) = matière d'analyse de premier ordre : explique ce qu'ils IMPLIQUENT pour un non-résident (marge de taux, coût total finançable, timing), jamais la valeur seule.
- La profondeur se gagne en DENSITÉ, pas en longueur : les volumétries restent inchangées et ne sont JAMAIS compensées par du remplissage. Et la profondeur n'est JAMAIS un prétexte à inventer une donnée pour « étayer » : chiffres internes, cités (source, date) ou [placeholder], rien d'autre.

GRAMMAIRE DE COMPOSITION (impérative — un mail = un parcours, pas une liste) :
- Séquence VARIÉE, du type : titre h1 → texte d'intro → section (titre h2 + texte) → section → bloc fiches → section → rangée de chiffres clés → CTA. Varie réellement les types de blocs.
- EYEBROW : le titre h1 porte un champ eyebrow — un kicker ÉDITORIAL de 2 à 4 mots qui annonce l'angle du numéro (ex. « Fenêtre de taux », « Spécial rentrée », « Dossier assurance ») — JAMAIS le nom de la cible ni un mot générique type « Newsletter ». Les titres h2/h3 ont eyebrow vide ("").
- INTERDIT : deux blocs du MÊME type qui se suivent (seule exception : les 3 chiffre_cle consécutifs de la rangée). Une section a besoin de plusieurs paragraphes ? Mets-les dans LE MÊME bloc texte, séparés par une ligne vide — JAMAIS deux blocs texte à la suite.
- FICHES : utilise un bloc fiches (2 à 4 cartes titre + texte) dès qu'une liste de points s'y prête (critères, étapes, erreurs à éviter, comparatif).
- ARTICLE : utilise un bloc article quand le brief fournit un article réel (titre + extrait + SON url). N'invente JAMAIS une URL.
- IMAGE : uniquement si une URL d'image réelle est fournie. Sinon, aucun bloc image.
- CHIFFRES CLÉS : EXACTEMENT UNE rangée de 3 blocs chiffre_cle CONSÉCUTIFS (jamais isolés ailleurs, jamais deux rangées), placée JUSTE AVANT le CTA — la preuve chiffrée une fois le lecteur engagé. 3 valeurs DISTINCTES : chiffres S2C vérifiés (910 dossiers · 64 pays · 95 % · 680 M€) et/ou [placeholders] liés au contenu. SYMÉTRIE : une caption sur les 3 colonnes ou sur aucune (jamais une seule — le pied de rangée doit s'aligner).
- Ne répète PAS 910 / 64 pays / 95 % / 680 M€ dans le texte courant : ces chiffres vivent UNIQUEMENT dans la rangée.
- RÉUTILISATION D'UN CHIFFRE CITÉ : cite-le une fois « valeur (source, date) », puis réutilise-le nu si utile — mais TOUJOURS à l'IDENTIQUE (3,671 %, jamais arrondi en 3,67 %).
- Longueur : COURT = intro + 1-2 sections + rangée + CTA · MOYEN = intro + 2-3 sections dont un bloc fiches + rangée + CTA · LONG = intro + 4 à 6 sections VARIÉES (dont fiches, article si fourni, séparateurs pour rythmer) + rangée + CTA. Un mail long = PLUS de sections utiles, JAMAIS du remplissage.
- Termine par l'unique CTA (juste après la rangée de chiffres).
- SIGNATURE : n'ajoute JAMAIS de bloc signature — la signature officielle (Jeevanthy Nivert en B2C, Thomas Nivert en B2B) est intégrée automatiquement au rendu.
- Tout le texte dans la langue demandée.

OBJET EMAIL : ≤ 42 caractères, mène par le bénéfice ou le chiffre, zéro clickbait. Préheader (preview) ≤ 85 caractères et DISTINCT de l'objet.
```

Note pour un système multi-client : **tout ce texte est un littéral hard-codé
dans `anthropic.ts`** — pas de template par organisation, pas de variables de
marque, pas de table `ai_prompts`. Le nom de marque, les chiffres autorisés,
les URL, les signataires et le persona sont tous écrits en dur dans ce
paragraphe. C'est le principal point à généraliser (détaillé en §7).

### 4.3 Message utilisateur — génération (`designNewsletter`)

Envoyé avec `tools: [designTool]`, `tool_choice: { type: "tool", name:
"emit_newsletter" }`, `max_tokens: 8192` :

```
Cible : ${t.label} — persona : ${t.persona}. Audience ${t.audience}.
Identité éditoriale de la cible (elle prime sur le ton générique) : ${t.editorial}
Langue : ${input.lang === "fr" ? "français" : "anglais"}.
${signatureNote(input.target)}
Longueur cible : ${len.label} — vise ~${len.ideal} caractères de corps (espaces compris), fourchette ${len.min}-${len.max}. Ajuste le NOMBRE de sections et la longueur des paragraphes en conséquence (${len.hint}). Un mail long = PLUS de sections utiles, jamais du remplissage.
${indicatorSection}Brief : ${input.brief}

Propose une newsletter PERCUTANTE ET PROFONDE, scannable au téléphone : entame par le chiffre / la donnée, 1 idée par bloc portée jusqu'à son implication (constat → mécanisme → ce que ça change pour le lecteur), UN SEUL CTA. ${signatureNote(input.target)} Tout chiffre est soit interne S2C, soit cité « valeur (source, date) » depuis les données fournies, soit un [placeholder]. Respecte la longueur cible (${len.label}, ~${len.ideal} car.).
```

où `signatureNote(target)` insère :
`"Signature : n'écris AUCUN bloc signature — la signature officielle de
${who} est ajoutée automatiquement au rendu."` (`who` = "Thomas Nivert" pour
NL3, "Jeevanthy Nivert" sinon), et `indicatorSection` (si des indicateurs
sont disponibles, au plus 4) :

```
DONNÉES RÉELLES DISPONIBLES (sourcées — utilisables telles quelles, format « valeur (source, date) », priorité pour les blocs chiffre_cle) :
- ${label} : ${value}${unit} (${source}, ${period})
...
```

Le schéma d'outil `emit_newsletter` (strict) accepte un tableau de blocs, en
`anyOf` discriminé par `type` : `titre` (`text`, `level` 1-3, `eyebrow`),
`texte` (`text`), `chiffre_cle` (`value`, `label`, `caption`), `cta` (`title`,
`text`, `buttonLabel`, `url`), `bouton` (`label`, `url`), `separateur` (aucun
champ). **Note** : les blocs `article`, `image`, `fiches` et `espace`
existent côté éditeur (`blocks.ts`) mais **ne font pas partie du schéma
d'outil IA** — le modèle ne peut donc jamais générer de bloc `fiches` malgré
le prompt qui le décrit comme un type disponible ; c'est une incohérence du
code actuel (le schéma `blockBranches` réutilisé par `designTool`/
`tightenTool`/`sourceFiguresTool` ne couvre que 6 des 10 types de blocs).

### 4.4 `resizeNewsletter` — ajustement de longueur

Même outil (`designTool`), même `max_tokens: 8192`. Message :

```
Ajuste la LONGUEUR de ce draft sans changer la cible ni le sujet. Cible ${t.label} (${t.persona}), langue ${lang}. ${signatureNote}

${instruction}

Garde les règles : 1 idée par bloc portée jusqu'à son implication (constat → mécanisme → conséquence lecteur), entame par le chiffre / la donnée, UN SEUL CTA, mobile-first. N'invente AUCUN chiffre : autorisés = internes S2C (910 / 64 / 680 M€ / 95 %), chiffres déjà cités « valeur (source, date) », [placeholders]. Tout le reste → [placeholder].

Draft (JSON) :
${JSON.stringify(draft, null, 2)}
```

où `instruction` vaut, selon la direction :
- expand : `"Le corps fait ~${currentChars} caractères : TROP COURT. AJOUTE des sections utiles (nouveaux angles concrets, chiffres vérifiés ou [placeholders], jamais du remplissage) pour viser ~${ideal} caractères (${min}-${max})."`
- condense : `"Le corps fait ~${currentChars} caractères : TROP LONG. CONDENSE (retire le superflu, fusionne les idées proches, garde les sections utiles) pour viser ~${ideal} caractères (${min}-${max})."`

Appelée automatiquement par la route `ai/design` **une seule fois** si le
premier jet ne tombe pas dans la fourchette ±10 % de la longueur choisie ; le
résultat n'est gardé que s'il se rapproche réellement de la cible
(comparaison de distance à l'idéal avant/après).

### 4.5 `tightenNewsletter` — passe de resserrement copywriter

Même outil, `tool_choice: { type: "tool", name: "emit_tightened" }`. Message :

```
RESSERRE ce draft (ne le rallonge pas, garde les idées). Cible ${t.label} (${t.persona}), langue ${lang}. ${signatureNote}

Problèmes à corriger :
${issues.map(i => `- ${i}`).join("\n") || "- rendre plus percutant et scannable"}

Règles : 1 idée par bloc, portée jusqu'à son implication pour le lecteur (resserrer ≠ vider : garde constat → mécanisme → conséquence), entame par le chiffre / la donnée, UN SEUL CTA, mobile-first. N'invente AUCUN chiffre : autorisés = internes S2C (910 / 64 / 680 M€ / 95 %), chiffres déjà cités « valeur (source, date) », [placeholders]. Remplace tout autre chiffre par un [placeholder] entre crochets (ex. [apport %], [délai]).

Draft (JSON) :
${JSON.stringify(draft, null, 2)}
```

`issues` vient de `reviewCopy()` (§ `copywriter.ts`) — c'est la revue
**déterministe, sans IA**, qui décide s'il faut appeler l'IA une nouvelle
fois (`needsTighten(review)`), et le résultat n'est gardé que si le nombre
d'erreurs de la nouvelle revue est ≤ à l'ancien (jamais un aller simple
aveugle vers l'IA).

### 4.6 `sourceFigures` — sourcing web des placeholders restants

Modèle **Haiku**, `tools: [webSearchTool, sourceFiguresTool]`,
`tool_choice: { type: "auto" }` (doit rester `auto` pour laisser le modèle
décider de chercher avant d'émettre). Prompt système dédié :

```
Tu es le vérificateur de données de S2C (Société2Courtage), courtier en crédit immobilier pour acheteurs NON-RÉSIDENTS et expatriés en France.

On te donne les blocs d'une newsletter contenant des [placeholders] (chiffres manquants). Mission : remplacer UNIQUEMENT ceux que tu peux sourcer par une donnée RÉELLE et VÉRIFIABLE trouvée via la recherche web (max 3 recherches — cible les 2-3 placeholders les plus utiles au lecteur).

RÈGLES ABSOLUES :
- Un chiffre inséré est TOUJOURS cité : « valeur (source, date) » — ex. « 4 850 €/m² (Notaires de France, T1 2026) ». Source réelle et nommée, date de publication réelle.
- VALEUR CONCISE : le chiffre seul, court (« 4 850 €/m² », « 45-60 jours », « 20-30 % ») — JAMAIS une phrase explicative dans la valeur. La citation (source, date) suit IMMÉDIATEMENT la valeur.
- SOURCE = UN éditeur réel et nommé (Notaires de France, INSEE, Les Échos…). Jamais « consensus », jamais une liste de sites.
- Donnée introuvable, datée de plus de 18 mois, ou douteuse → laisse le [placeholder] TEL QUEL. NE JAMAIS inventer un chiffre, un prix, un taux, un délai ou un montant. Non négociable.
- Ne touche à RIEN d'autre : structure, ordre des blocs, textes hors placeholders — strictement identiques.
- Sources sérieuses uniquement (Notaires de France, INSEE, Banque de France, presse économique reconnue). Jamais de forum ni de blog anonyme.

Termine TOUJOURS par l'appel emit_sourced_blocks : les blocs complets (modifiés ou non) + la liste sourced (vide si rien n'a pu être sourcé).
```

Message utilisateur : `Cible : ${t.label}. Langue : ${lang}.\nBrief :
${brief.slice(0,600)}\n\nBlocs (JSON) :\n${JSON.stringify(draft, null, 2)}`.
Comportement « échoue gracieusement par conception » : pas d'appel d'outil,
troncature, ou rien de sourcé → le draft revient **inchangé**, les
`[placeholders]` restent tels quels. Le résultat n'est gardé que si la revue
`reviewCopy()` post-sourcing n'a pas plus d'erreurs qu'avant.

### 4.7 `generateSubject` et `adaptSubject`

`generateSubject` (`tool_choice: emit_subject`, `max_tokens: 1000`) :

```
Cible : ${t.label} — persona : ${t.persona}.
Identité éditoriale de la cible : ${t.editorial}
Langue : ${lang}.
${brief ? `Brief : ${brief}\n` : ""}${outline ? `Contenu du mail : ${outline}\n` : ""}
Génère :
- OBJET : ≤ 42 caractères, mène par le bénéfice concret ou par un chiffre RÉEL présent dans le contenu ci-dessus (jamais un chiffre inventé, jamais un [placeholder] — un crochet dans une boîte de réception est cassé). Ne RÉPÈTE pas le titre principal du mail : l'objet vend le même numéro sous un AUTRE angle (l'ouverture ne doit pas relire ce qu'elle vient de cliquer). Zéro clickbait, voix de la cible.
- PRÉHEADER : ≤ 85 caractères, COMPLÈTE l'objet avec une information nouvelle du contenu (jamais une reformulation de l'objet).
```

`outline` (`composer.tsx`) est un résumé côté client des blocs actuels
(`text`/`title`/`value`/`label` concaténés, coupé à 700 caractères) — c'est
ce qui permet à l'objet de « mener par un chiffre réel présent dans le
contenu » sans le réinventer.

`adaptSubject` (traduction/adaptation d'un objet existant, pas littérale) :

```
Adapte (n'effectue PAS une traduction littérale) cet objet et ce préheader vers le ${langName}, en gardant le ton S2C${" (professional but warm)" si EN} et la cible ${t.label} (${t.persona}).
Objet source : ${subject}
Préheader source : ${preheader}

Objet ${langName} : ≤ 42 caractères, mène par le bénéfice ou le chiffre. Préheader ${langName} : ≤ 85 caractères, DISTINCT de l'objet.
```

Après réception, les deux routes appliquent un **clamp déterministe côté
code** (`clampSubject`/`clampPreheader` dans `copywriter.ts`) : coupe sur un
séparateur naturel (` — `, ` – `, ` : `, ` | `, ` - `) si possible, sinon sur
une frontière de mot — jamais l'IA seule ne garantit la longueur.

### 4.8 `translateStrings` — traduction du corps

Prompt système (bloc mis en cache) :

```
Tu es le traducteur FR/EN de S2C (Société2Courtage), courtier en crédit immobilier pour acheteurs non-résidents en France. Tu traduis le corps de newsletters marketing.

TON : expert, direct, premium (EN : professional but warm). Pas de mot-à-mot scolaire — une traduction naturelle qu'un natif écrirait.

RÈGLES STRICTES (contenu financier réglementé) :
1. CHIFFRES INTACTS : ne change JAMAIS un chiffre, un pourcentage, un montant, une durée ou une date. Tu peux adapter la ponctuation à la langue cible (« 3,4 % » → "3.4%") mais jamais arrondir, convertir une devise ou reformuler une valeur.
2. TERMES RÉGLEMENTAIRES : utilise l'équivalent anglais établi quand il existe (BCE → ECB, obligations d'État → government bonds). Pour les notions juridiques françaises SANS équivalent exact (SCI, LMNP, taux d'usure, compromis de vente, notaire), garde le terme français et ajoute une courte glose anglaise à la première occurrence — n'invente pas de faux équivalent.
3. NOMS PROPRES intacts : S2C, Banque de France, OAT, noms de personnes et de produits.
4. NE TRADUIS PAS : URLs, paramètres UTM, codes, balises éventuelles.
5. Une traduction par chaîne d'entrée, MÊME ORDRE, MÊME NOMBRE. Chaîne vide → chaîne vide. Renvoie le texte seul (pas de guillemets ajoutés, pas de commentaire).
```

Message : `Traduis vers le ${langName} chacune des ${n} chaînes de ce tableau
JSON (même ordre, même nombre) :\n\n${JSON.stringify(strings, null, 2)}`.
`max_tokens: 8000`. La réponse est **strictement validée** : rejetée
(exception levée) si le nombre de chaînes retournées ne correspond pas
exactement au nombre envoyé, ou si un élément n'est pas une chaîne — jamais
de correction silencieuse d'un tableau désaligné.

### 4.9 Prompts adjacents utilisés par la route de génération mais hors du
     texte marketing direct

- `THEMATIC_SYSTEM` (recherche thématique veille, alimente le panier
  → mailing mais lancée depuis le module Veille, pas depuis le composer) et
  `CLASSIFY_SYSTEM`/`EXTRACT_SYSTEM` (classification veille / extraction
  d'emails concurrents) existent dans le même fichier `anthropic.ts` mais ne
  sont pas appelés par le module mailing — mentionnés ici seulement pour
  qu'un lecteur du fichier source ne les confonde pas avec le périmètre de ce
  document.
- `CONTACT_SYSTEM` (mail personnel à un contact en transaction, module
  Contacts) réutilise `TARGETS`/signataires mais est un **flux distinct**
  (texte brut, pas de blocs, jamais de rendu email-safe HTML) — non détaillé
  ici au-delà de sa mention en tête de document.

---

## 5. Services externes utilisés et rôle de chaque clé

Toutes les clés sont lues via `src/lib/env.ts` (accès centralisé, chaque clé
optionnelle sauf `DATABASE_URL`/`AUTH_SECRET`) et documentées dans
`.env.example`.

| Variable | Service | Rôle dans le module mailing |
|---|---|---|
| `DATABASE_URL` | Postgres (Neon en prod, ou tout Postgres) | Stockage `newsletters`, `newsletter_blocks`, `drafts`, `templates` (non branchée), `market_indicators` (lue). Requis. |
| `AUTH_SECRET` | Auth.js (NextAuth) | Session — **toutes** les routes API du mailing exigent une session (`auth()` puis 401 sinon). Requis. |
| `ANTHROPIC_API_KEY` | Anthropic | La seule clé IA réellement utilisée par le mailing : génération de blocs, ajustement de longueur, resserrement copywriter, sourcing web de chiffres, objet/préheader, traduction FR/EN. Sans elle, `getAIProvider()` lève `AINotConfiguredError` → les routes répondent `503`. |
| `ANTHROPIC_MODEL` | Anthropic | Override du modèle principal (défaut `claude-sonnet-4-6`). |
| `ANTHROPIC_CLASSIFY_MODEL` | Anthropic | Override du modèle « économique » (défaut `claude-haiku-4-5-20251001`), utilisé par le sourcing de chiffres. |
| `GEMINI_API_KEY`, `OPENAI_API_KEY` | Google Gemini / OpenAI | Prévues pour la génération d'images (Nano Banana / DALL·E 3, CLAUDE.md §Intégrations) — **non trouvées dans le code appelées par le module mailing** : aucun bloc `image` n'a de générateur câblé ; le formulaire du bloc `image` ne propose qu'une saisie manuelle d'URL et un bouton « Bibliothèque / IA (bientôt) » **désactivé** (`<Button disabled>` dans `sortable-block.tsx`). |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` | Cloudflare R2 | Stockage d'images prévu (table `images` au schéma) — **non trouvé dans le code** de branchement applicatif pour le mailing (pas d'upload, pas de lecture depuis le composer). |

Aucune clé d'envoi transactionnel (SendGrid/Postmark/SES/Brevo API...) n'est
utilisée par le module mailing : c'est volontaire, l'outil produit du HTML,
il n'envoie rien (`RESEND_API_KEY` existe dans `.env.example` mais sert
uniquement aux notifications **internes** de tagging, module séparé, jamais
à l'envoi de la newsletter elle-même).

Le module Veille voisin (dont le mailing **consomme** la sortie via
`market_indicators` et le panier d'articles) utilise en plus
`WEBSTAT_API_KEY` (Banque de France), `FIRECRAWL_API_KEY` et `CRON_SECRET` —
hors périmètre de ce document, mentionnées pour comprendre d'où vient la
donnée affichée par `IndicatorPicker`.

---

## 6. Rendu et export HTML — contraintes de compatibilité et pièges rencontrés

### 6.1 Contraintes imposées (BRAND.md § 6, reflétées dans le code)

- **DOCTYPE** XHTML 1.0 Transitional (obtenu « gratuitement » via le
  `<Html>` de `@react-email/components`, testé dans `render-email.test.ts`).
- **Mise en page 100 % `<table>`** — react-email rend `Container`/`Section`/
  `Row`/`Column` en tables ; zéro `<div>` de mise en page dans la sortie.
- **600px max**, centré sur fond `#eae9e2` (`CREAM_2`).
- **Conditionnels MSO** pour Outlook Windows (fournis par react-email autour
  du conteneur).
- **Responsive < 620px** via un unique bloc `<style>` dans le `<head>` (les
   titres hero réduisent, les colonnes KPI réduisent leur taille de police,
  le padding du corps se resserre) — testé (`/max-width:\s*620px/`).
- **Préheader caché, 85 caractères max** — tronqué en dur au rendu
  (`str(preheader).slice(0, 85)`), testé unitairement.
- **Boutons bulletproof** — `<Button>` de react-email = `<table>` enveloppant
  un `<a>`, padding généreux (`16px 20px`) pour un touch target confortable.
- **Dark-mode safe** : `meta name="color-scheme"` +
  `meta name="supported-color-schemes"` à `light dark`, et une règle
  `@media (prefers-color-scheme: dark)` qui **force uniquement le fond de
  page** (`body`) à rester `#eae9e2` — surtout **pas** le fond du conteneur
  (piège documenté en commentaire : forcer le fond du conteneur en dark mode
  faisait disparaître la carte blanche dans le même ton que la page).
- **Polices web-safe en secours partout** : Playfair Display → Georgia →
  Times New Roman (serif) ; DM Sans → Arial → Helvetica (sans) ; DM Mono →
  Courier New → Courier (mono) — car les polices web ne chargent quasiment
  jamais dans les clients mail. Les balises `<Font>`/`@font-face` n'aident
  qu'Apple Mail/iOS.

### 6.2 Le piège central : padding/fond sur `<table>` vs `<td>`

Documenté explicitement en commentaire de code (`newsletter-email.tsx`,
composant `Box()`) et confirmé par un commit dédié
(`0e965ec fix(email): padding fiable sur <td> pour tous les blocs (cause
racine HubSpot)`) :

> react-email pose les styles de `Section` sur un élément `<table>` — et
> plusieurs clients/importeurs (**HubSpot au premier chef**) **ignorent**
> `padding`/`background` déclarés sur un `<table>`. Seul `<td>` est fiable.

Conséquence pratique observée avant le correctif : le texte se retrouvait
« collé » aux bords d'un bloc à fond sombre (le CTA en `#1e1e1c`) une fois
importé dans HubSpot, alors que l'aperçu direct du HTML (navigateur, Gmail)
semblait correct. Le correctif : un composant `Box()` maison qui construit
lui-même un `<table><tbody><tr><td style="background:…;padding:…">` — utilisé
pour **tous** les blocs à fond ou padding (header, CTA, article, fiches),
jamais confié au `Section` par défaut de react-email dès qu'un fond ou un
padding significatif est en jeu.

### 6.3 Autre piège : `<style>` supprimé par les importeurs → responsive impossible dans les formats durcis

`inlineSafeHtml()` (`email-safe.ts`) part d'un constat documenté en
commentaire : **HubSpot et Brevo retirent le bloc `<head><style>`** quand on
colle le HTML d'un email dans leur éditeur. Le template ne peut donc pas
dépendre de ce `<style>` pour son rendu de base — seule la couche
`@media (max-width:620px)` (amélioration progressive) est perdue au collage,
jamais la mise en page elle-même, parce que le conteneur est déjà fluide
(`width:100%` avec `max-width:600px`). D'où deux formats d'export distincts :

- **`standard`** : HTML complet avec `<style>` en tête — pour aperçu/téléchargement générique, garde le responsive fin.
- **`brevo`/`hubspot`** : passés dans `inlineSafeHtml()`, qui retire tout
  `<style>` (media + `@font-face`) et les ancres `id="blk-*"` (usage éditeur
  seulement, inutiles — voire gênantes — dans le livrable), puis nettoie les
  lignes vides laissées par ces suppressions. Testé unitairement, y compris
  la préservation des tokens HubL (`{{ unsubscribe_link }}`,
  `{{ site_settings.company_name }}`) que le client ajoute lui-même à
  l'import — le template n'en génère aucun.

### 6.4 Rangée de chiffres clés (KPI) — 3 colonnes qui ne doivent jamais s'empiler

Plusieurs correctifs successifs (commits `72b183c`, `8838976`, `5275508`,
`db23c56`, `36024d4`, `eea6c3d`) convergent vers la solution actuelle
(`KpiRow` dans `newsletter-email.tsx`) : une **vraie table HTML** avec
`table-layout: fixed` et des `<td width="33.33%">` — jamais des colonnes
`react-email` `Column` en flottant/flexbox, qui s'empilaient de façon
incohérente selon le client. Règle produit qui en découle et qui est
appliquée dans le renderer (`toSegments()` regroupe les `chiffre_cle`
consécutifs) : la **symétrie des légendes** — soit les 3 colonnes ont une
légende (`caption`), soit aucune, jamais une seule (sinon le pied de rangée
ne s'aligne plus), contrôle repris aussi dans le prompt IA (§4.2) et donc
doublement garanti (prompt + mise en page tolérante mais visuellement
sensible à l'asymétrie).

### 6.5 Autres pièges documentés (commits, sans détail de code supplémentaire nécessaire)

- **Texte long tronqué** (`7237e6a`) : plafond de tokens de génération trop
  bas pour un mail long → réponse IA coupée en plein milieu d'une chaîne
  JSON. Corrigé par la détection de `stop_reason === "max_tokens"` (§4.1) et
  la hausse à `max_tokens: 8192`.
- **Bloc texte multi-paragraphes** (`2893af6`) : le prompt interdit deux
  blocs `texte` consécutifs, donc plusieurs paragraphes d'une même section
  doivent tenir **dans un seul bloc**, séparés par une ligne vide — le
  renderer les éclate en plusieurs `<Text>` (`text.split(/\n{2,}/)`), sinon
  ils fusionnaient visuellement.
- **OAT 10 ans / TEC 10** (`f75d417`) : ces noms d'instruments financiers
  contiennent des chiffres (« 10 ») que le détecteur de figures inventées
  (§ `copywriter.ts`) confondait avec une durée à vérifier — nécessite une
  regex d'exclusion dédiée (`\b(?:OAT|TEC)\s*10(?:\s*ans)?\b`).
- **Suppression de la signature/footer générés** (`a7ab5c7`) : décision
  produit (documentée en commentaire dans `newsletter-email.tsx`) — le
  template **ne génère plus** de signature, footer légal ni lien de
  désinscription ; S2C les ajoute à l'import côté client (HubSpot/Brevo). Le
  renderer garde seulement une compatibilité descendante : il retire une
  éventuelle signature en texte brut héritée d'un ancien draft
  (`stripPlainSignature`), pour ne jamais en afficher deux.
- **L'objet ne doit pas répéter le titre principal** (`b1abaa4`) : règle
  ajoutée après coup dans le prompt d'objet (§4.7) — l'objet doit « vendre le
  même numéro sous un autre angle », pas relire le H1 que le lecteur vient
  d'ouvrir.

---

## 7. Ce qui est spécifique à S2C et devra devenir paramétrable par client

Tout ce qui suit est **écrit en dur** dans le code (constantes, prompts
littéraux, listes fixes) — aucune de ces valeurs ne vient d'une table de
configuration par organisation. Pour un produit multi-tenant, chacune de ces
catégories doit migrer vers une configuration par client.

### 7.1 Identité visuelle (email + éditeur)

- Palette hex en dur dans `newsletter-email.tsx` (`INK`, `TEAL`, `CREAM`…) et
  dans les classes Tailwind de l'éditeur (`bg-teal-lt`, `text-teal-dk`…).
- Polices en dur (Playfair Display / DM Sans / DM Mono) + leurs URL Google
  Fonts spécifiques, + fallback web-safe choisis pour **cette** identité
  (Georgia/Arial/Courier).
- Logo : une image hébergée en dur
  (`https://societe2courtage.com/wp-content/uploads/.../favicon-192x192.png`)
  et un lockup texte « Societe | Courtage » codé directement dans
  `LogoLockup()`.
- Rayon de bordure « carré » (0-4px), interdiction d'ombres/gradients — des
  règles de design system, pas de valeurs de contenu, mais aussi en dur.

### 7.2 Ton et contenu

- Le **prompt système complet** (§4.2) — nom de marque, ton (« expert,
  direct, premium »), tagline, interdits (emojis, superlatifs) — est un
  literal string unique, pas composé à partir de champs de configuration.
- **`TARGETS`** (`targets.ts`) : les 3 cibles S2C (NL1/NL2/NL3) avec leur
  `editorial` (identité éditoriale complète, injectée telle quelle dans le
  prompt) sont un objet fixe à 3 clés. Un client avec 2 cibles, ou 5, ou des
  noms différents, ne rentre pas dans ce modèle sans réécriture de code (le
  type `TargetId` lui-même est un union littéral `"NL1"|"NL2"|"NL3"`, propagé
  jusque dans les enums Postgres `newsletter_target` et `newsletterLength`
  côté schéma).
- **Signataires** codés en dur (Jeevanthy Nivert / Thomas Nivert), y compris
  leur **titre de poste**, injectés via `signatureNote()` et vérifiés par le
  contrôle qualité (`ALL_SIGNATORIES`/`signatoryFor()` dans `copywriter.ts`).

### 7.3 Chiffres autorisés

- La liste exacte des chiffres que l'IA a le droit de citer sans placeholder
  est codée en dur en **trois endroits distincts qui doivent rester
  synchronisés manuellement** : le prompt système (§4.2, « 910 dossiers
  financés · 64 pays · 680 M€ · 95 % »), les messages de resize/tighten
  (répétés littéralement dans chaque prompt), et `VERIFIED_FIGURES`/
  `isAllowedFigure()` dans `copywriter.ts` (le filet de sécurité
  déterministe). Un produit multi-client doit centraliser cette liste dans
  la configuration de l'organisation et la propager aux prompts et au
  vérificateur depuis une seule source.
- Les 4 modèles de longueur (`length.ts`) ont des cibles de caractères
  choisies pour la densité éditoriale S2C (1500/3500/5900) — pas une règle
  universelle, à revalider par client/langue.

### 7.4 Spécificité métier

- Le prompt encode des connaissances métier très spécifiques au crédit
  immobilier non-résident (taux d'usure, OAT, revenus en devise, assurance
  emprunteur non-résident, calendrier compromis/acte) — c'est le cœur de la
  « spécificité métier obligatoire » exigée du prompt. Un autre secteur (SaaS
  B2B, e-commerce, etc.) nécessite un prompt entièrement réécrit, pas un
  paramétrage de surface.
- Les **URLs de CTA** (`cta-presets.ts`) sont des destinations S2C réelles
  (simulateur, RDV HubSpot Meetings nommés, formulaires WPForms identifiés
  par leur ID) — à remplacer intégralement par les destinations du client.
- Les **règles de non-conseil** (fiscal/juridique) sont écrites pour le
  contexte réglementaire français du crédit immobilier — à revalider
  juridiquement pour tout autre secteur/pays.

### 7.5 Ce qui, en revanche, est déjà bien isolé (bon point de départ pour généraliser)

- L'`AIProvider` (interface `types.ts` / factory `index.ts`) sépare déjà
  proprement le fournisseur IA du reste de l'app — changer de fournisseur ou
  router par organisation est un point d'extension existant, pas une
  réécriture.
- Le modèle de blocs (`blocks.ts`, schémas zod par type) et le renderer
  (`newsletter-email.tsx`) sont génériques dans leur mécanique (un type de
  bloc → un rendu de table email-safe) même si les couleurs/polices sont en
  dur — faire de ces constantes des paramètres résolus par organisation est
  un refactor localisé, pas une réécriture du moteur de rendu.
- `inlineSafeHtml()` et les contraintes de compatibilité (§6) sont
  indépendantes de la marque — directement réutilisables telles quelles.

---

## 8. Ce que je referais autrement, et pourquoi

Sur la base de ce que le code montre (limites, incohérences, dette
documentée par les commentaires eux-mêmes) :

1. **Sortir les prompts du code TypeScript vers une configuration par
   organisation dès le départ.** Aujourd'hui, la marque S2C, le ton, les
   chiffres autorisés, les signataires et les cibles sont tous mélangés dans
   un unique literal string (§4.2) répété avec variations dans 4 autres
   prompts (resize/tighten/subject/translate). Un produit multi-client doit
   composer le prompt à partir de champs structurés (identité de marque,
   liste de chiffres vérifiés, cibles/personas, signataires, URLs
   autorisées) stockés par organisation, avec un template de prompt
   générique qui les injecte — pas un prompt par organisation copié-collé
   à la main. C'est le changement qui a le plus d'effet de levier pour le
   multi-tenant, et il vaut mieux l'avoir avant le deuxième client, pas
   après.

2. **Ne pas dupliquer la liste des chiffres autorisés dans 3 endroits.**
   `VERIFIED_FIGURES` (`copywriter.ts`), le prompt système, et les prompts
   resize/tighten portent chacun leur propre copie de « 910 / 64 / 680 M€ /
   95 % ». Une désynchronisation silencieuse (quelqu'un met à jour le prompt
   mais oublie le vérificateur déterministe, ou l'inverse) est facile et le
   code ne la détecterait pas. Une seule source de vérité, référencée par
   les deux, aurait évité la classe de bug.

3. **Faire correspondre le schéma d'outil IA au modèle de blocs complet dès
   le début.** Le schéma `blockBranches` (§4.3) ne couvre que 6 des 10 types
   de blocs — le prompt promet un bloc `fiches` que l'IA ne peut
   structurellement jamais émettre (l'outil ne le liste pas), ce qui n'est
   détectable qu'en lisant le code, pas en lisant le prompt. Un schéma
   généré depuis la même source que `BLOCK_PAYLOAD_SCHEMAS` (zod →
   JSON Schema) aurait rendu cette dérive impossible plutôt que de compter
   sur une synchronisation manuelle entre deux fichiers.

4. **Décider du sort de la table `templates` et du kanban dès la conception,
   plutôt que de laisser un schéma non branché.** La table SQL `templates`
   existe mais n'est lue par rien (les modèles réels sont en dur dans
   `templates.ts`) ; le statut kanban (`idee→…→envoye`) existe en base sans
   aucun écran pour le faire évoluer. Ce sont deux fonctionnalités « à
   moitié construites » qui coûtent de la compréhension à quiconque lit le
   schéma en pensant qu'elles sont actives. Pour un multi-tenant, la table
   `templates` est justement le bon endroit pour rendre les modèles
   gérables par organisation (au lieu du fichier en dur) — je la
   brancherais dès le départ plutôt que de la laisser en vestige.

5. **Documenter les pièges HTML email au fur et à mesure dans un seul
   endroit, pas seulement en commentaires épars.** Le piège
   `<table>` vs `<td>` (§6.2), le retrait du `<style>` par HubSpot/Brevo
   (§6.3) et le comportement des colonnes KPI (§6.4) sont tous bien
   documentés — mais chacun dans le fichier où le correctif a été appliqué,
   découverts par plusieurs itérations successives de commits. Un document
   de compatibilité email centralisé, tenu à jour à chaque nouveau piège
   découvert (au lieu d'un commentaire local + un message de commit),
   aurait raccourci les itérations suivantes et serait le premier artefact à
   produire pour la reconstruction — ce document en est un embryon.

6. **Garder le princine actuel qui a bien fonctionné : revue déterministe
   avant/après chaque appel IA, jamais une confiance aveugle.** Le pattern
   « génère avec l'IA → vérifie avec du code déterministe
   (`reviewCopy`/`lengthFit`) → ne garde le résultat IA que s'il améliore ou
   n'aggrave pas la mesure déterministe » (répété pour resize, sourcing,
   tighten dans la route `ai/design`) est une bonne pratique à **reproduire
   telle quelle** dans le nouveau produit, indépendamment du multi-tenant —
   c'est ce qui empêche un chiffre inventé ou un objet trop long d'arriver
   jusqu'à l'utilisateur silencieusement.
