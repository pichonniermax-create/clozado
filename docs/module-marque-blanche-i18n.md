# Marque blanche et internationalisation — jetons dérivés, logo, textes, langues, devises

Notes de chantier, même rôle que `docs/module-ciblage-contenu.md`. Cahier
des charges reçu le 2026-08-26 (« CHANTIER — MARQUE BLANCHE ET
INTERNATIONALISATION »). Ce document est l'étape 1 : l'état des lieux, la
méthode de dérivation des couleurs, le choix de la bibliothèque
d'internationalisation et le schéma — avant toute ligne de code.

État des lieux au commit `58274c9` (2026-08-26, `main`).

---

## 0. Ce qui existe — exploration

### 0.1 La marque, aujourd'hui

- **La règle en vigueur jusqu'ici** (refonte UI, étape 3, `docs/refonte-ui.md`
  §« Identité Clozado seule ») : la barre latérale porte la marque Clozado
  (`BrandMark` : le carré « C » bleu et le mot Clozado, une seule
  définition pour la coquille, la connexion et l'accueil) ; le nom de
  l'organisation vit dans l'en-tête comme un CONTEXTE ; la marque du client
  ne s'affiche que sur la vitrine `/partage/[token]` (logo + couleur
  d'accent) et dans les emails de newsletter. **Le cahier des charges
  inverse cette règle** pour l'espace de travail ; elle reste vraie pour la
  connexion publique et l'espace gestionnaire.
- **`organizations`** porte déjà un socle : `logo_url` (un lien vers une
  image hébergée ailleurs — pas de téléversement), `logo_lockup_text`,
  `primary_color`, `secondary_color`, `ink_color`, `background_color`,
  `heading_font_family` (+ pile de secours), `font_family` (+ pile),
  `border_radius`. Tout cela sert le **gabarit des emails**
  (`render-email.ts`, `RenderBrand`) et la vitrine de partage
  (`partner-share-view.tsx` : `brand.primaryColor || DEFAULT_BRAND_PRIMARY`,
  `brand.logoUrl`). Aucune de ces colonnes ne touche l'application.
- **L'écran « Marque & réglages »** (`/settings`) : nom affiché, « Logo (lien
  vers une image) » en champ URL, « Couleur principale » en **champ texte
  hexadécimal** avec un carré de couleur à côté, « Police » en champ texte.
  C'est l'écran à refaire.
- **Les jetons du système de design** (`src/app/globals.css`, Tailwind v4 +
  shadcn, tout en OKLCH) : `--primary`/`--primary-foreground` (bouton
  principal, liens, marque, `--ring`, `--chart-1`), `--accent`/
  `--accent-foreground` (survol des lignes), `--sidebar-*` dont
  `--sidebar-accent`/`--sidebar-accent-foreground` (la ligne active de la
  navigation), les neutres teintés sur la teinte du bleu (chroma
  0,004–0,02), et les trois couleurs sémantiques `--success`, `--warning`,
  `--destructive` — **jamais décoratives**. Un bloc `.dark` complet existe
  mais aucun écran ne le pose. Le bouton principal dérive son survol par
  opacité (`hover:bg-primary/80`). Usages dans le code : `bg-primary` 16,
  `text-primary` 16, `border-primary` 8, `bg-accent` 24,
  `text-accent-foreground` 18, `ring-ring` 7, `bg-sidebar-accent` 2 —
  autrement dit **toute la marque passe par une poignée de variables CSS** :
  les redéfinir par organisation suffit, aucun composant n'a de couleur en
  dur.
- **Favicon** : `src/app/favicon.ico`, statique. **Emails système** :
  uniquement le lien de connexion, envoyé par le fournisseur Nodemailer
  d'Auth.js (`src/auth.ts`) avec **le gabarit par défaut d'Auth.js — en
  anglais (« Sign in to … »)**, depuis `EMAIL_FROM` (une seule adresse pour
  tout le produit). Aucun email d'invitation n'existe : un compte se crée
  par `/inscription` (organisation + admin) ; l'ajout de membres n'est pas
  construit. Aucune variable d'URL publique (`APP_URL`) n'existe — le lien
  magique utilise l'hôte de la requête.
- **Domaine** : aucune notion de domaine par organisation ; `slug` existe
  (« utile pour de futures URLs propres »). Next 16 fournit `proxy.ts`
  (l'ancien `middleware`) pour lire l'hôte avant le rendu.

### 0.2 La langue, aujourd'hui

- **Tout est en français, dans le code** : ~130 fichiers `.tsx`, 29 pages ;
  72 fichiers de `src/app`, 59 de `src/components`, 56 de `src/lib` et 52
  de `src/db` contiennent des textes accentués — libellés, états vides,
  messages d'erreur levés dans les requêtes et affichés tels quels par les
  actions (`withError(errorMessage(error))`), textes des formulaires,
  navigation (`navigation.ts`, en données), registre des indicateurs
  analytiques (`METRICS`), packs métier, gabarits de cibles et de veille,
  catalogue des indicateurs de marché, phrases des critères
  (`describeCriteria`), messages de la revue reformulés dans l'éditeur.
  `<html lang="fr">` est fixe.
- **Les formats sont centralisés** dans `src/lib/format.ts` (dates en
  `fr-FR` et fuseau `Europe/Paris` via `PRODUCT_TIMEZONE`, `formatEuros` en
  EUR, pourcentages, durées, temps relatif, pays) — 52 usages. Quelques
  `Intl` ont échappé : `dashboard.ts` (`formatEurosPlain`, « € » en dur),
  `kanban-board.tsx` (date courte `fr-FR`), `watch/periods.ts` et
  `watch/indicators.ts` (`fr-FR`) ; `tasks.ts`, `activities.ts` et
  `send-status-card.tsx` utilisent `Intl` pour des CLÉS techniques
  (`en-CA` → « AAAA-MM-JJ »), pas pour l'affichage.
- **La langue des contenus générés** existe déjà et ne sera pas touchée :
  `lang: "fr" | "en"` dans `POST /api/newsletters/ai/design`, et le gabarit
  email (`render-email.ts`, `<html lang="fr">` à faire suivre).
- **La langue des contenus du client** (noms de cibles, étapes,
  étiquettes, personas, sujets de veille) est déjà la sienne : saisie par
  lui, stockée telle quelle, jamais traduite. Un point à trancher : les
  **gabarits fournis par le métier** (cibles, sujets, sources) sont des
  textes français instanciés en lignes du client — voir §3.

---

## 1. La dérivation des couleurs — méthode, avant le code

### 1.1 Principe

Le client choisit UNE couleur (`primary_color`, la colonne existante —
elle sert déjà les emails et la vitrine : une seule couleur de marque, pas
deux). Le système en dérive, par une fonction PURE et DÉTERMINISTE
(`deriveBrandTokens(hex, theme)`), l'ensemble des variables CSS de la
marque, et **vérifie chaque paire texte/fond qu'il émet** au moment de la
dériver. Rien de dérivé n'est stocké : seule la couleur choisie l'est ; les
variables sont recalculées au rendu de la coquille (une trentaine
d'opérations arithmétiques, négligeable) et posées sur l'élément racine de
l'espace de travail — **pas sur la page de connexion ni sur l'espace
gestionnaire**, qui gardent les valeurs Clozado de `globals.css`.

Le calcul se fait en **OKLCH** (teinte perceptuelle, clarté L de 0 à 1,
chroma C) — l'espace dans lequel `globals.css` est déjà écrit : éclaircir
ou assombrir une couleur en OKLCH garde sa teinte perçue, ce que HSL ne
garantit pas (le jaune vire au vert en s'assombrissant). Les contrastes
sont mesurés avec la **luminance relative WCAG 2.x** (la référence des
audits d'accessibilité, valeur légale en Europe via l'EN 301 549) : texte
≥ 4,5:1 (AA), composants et bordures ≥ 3:1. Aucune dépendance : les
conversions sRGB ↔ OKLab ↔ OKLCH tiennent en quarante lignes, la luminance
en dix.

### 1.2 Les jetons dérivés (thème clair — le thème sombre est le miroir)

| Jeton | Dérivation | Garantie vérifiée |
|---|---|---|
| `--primary` (surface : bouton principal, marque, `--chart-1`) | la couleur choisie, telle quelle — SAUF si son contraste avec le fond de page est < 3:1 (une couleur trop claire ferait un bouton invisible) : on baisse L par pas de 0,02, teinte et chroma conservées, jusqu'à 3:1 | `primary` / `background` ≥ 3:1 |
| `--primary-foreground` (texte posé sur `primary`) | blanc si contraste(blanc, primary) ≥ 4,5 ; sinon l'encre du système (`--foreground`, L 0,21) si elle atteint 4,5 ; sinon le noir | ≥ 4,5:1 **toujours** : contraste(blanc, c) × contraste(c, noir) = 21 pour toute couleur c, donc le meilleur des deux vaut au moins √21 ≈ 4,58 — c'est un théorème, pas un espoir |
| `--primary-hover`, `--primary-active` | L − 0,05 et L − 0,09 (thème clair ; + en sombre), chroma conservée | le même `primary-foreground` reste ≥ 4,5 sur les deux ; sinon le pas est réduit |
| `--primary-ink` (texte à la couleur de marque : liens, libellé de la ligne active, icônes) | départ de `primary`, L baissée par pas de 0,02 jusqu'à ≥ 4,5 sur le fond de page ET sur les cartes (blanc) ; si la teinte sort du gamut sRGB en s'assombrissant, la chroma est réduite par dichotomie jusqu'à y rentrer | `ink` / `background` ≥ 4,5, `ink` / `card` ≥ 4,5 |
| `--primary-soft` (fond léger : ligne active de la navigation, badges, états sélectionnés) | teinte de la marque, L 0,955, chroma min(C, 0,04) | `ink` / `soft` ≥ 4,5 (sinon `soft` est éclairci) ; `soft` / `background` ≥ 1,1 (visible mais discret) |
| `--ring` | = `primary` (l'anneau de focus est déjà posé à 50 % d'opacité par les composants) | — |
| `--sidebar-primary`, `--sidebar-accent`, `--sidebar-accent-foreground`, `--sidebar-ring` | = `primary`, `soft`, `ink`, `primary` | héritées des lignes ci-dessus |
| `--accent`, `--accent-foreground`, et les neutres teintés (`--muted`, `--secondary`, `--border`, `--sidebar`) | la teinte de la marque à chroma minuscule (0,004–0,02, exactement les valeurs actuelles, seule la teinte change) | inchangés en clarté : contrastes identiques à aujourd'hui |

Ne bougent **jamais** : `--success`, `--warning`, `--destructive` (et leurs
`-foreground`), `--foreground`, `--background`, `--card`, les polices, les
rayons, les espacements — ce sont les jetons du système. Le bouton
principal passera de `hover:bg-primary/80` (opacité) à `--primary-hover`
(dérivé et vérifié) — une correction du système, pas une option du client.

Le gamut : OKLCH décrit des couleurs que sRGB ne sait pas afficher ; après
chaque ajustement la couleur est ramenée dans sRGB en réduisant la chroma
(jamais la clarté, qui porte le contraste), et les contrastes sont mesurés
sur la valeur sRGB réellement affichée.

### 1.3 Ce que voit le client — l'avertissement, et ce que le système fait à sa place

La même fonction rend, avec les jetons, un **diagnostic** que le sélecteur
affiche en clair :

- couleur très claire (L > 0,85 ou contraste < 3:1 sur le fond) :
  « Cette couleur est trop claire pour porter un bouton : le système
  l'assombrit pour les boutons et les liens, et la garde telle quelle pour
  les fonds légers. » ;
- couleur claire mais valide, texte blanc illisible (par exemple un jaune,
  un vert pomme) : « Le texte des boutons sera foncé sur cette couleur. » ;
- couleur très foncée (L < 0,25) : « Les survols seront peu visibles sur
  une couleur aussi sombre : le système les éclaircit. » ;
- gris (C < 0,02) : « Sans teinte, l'interface sera neutre — c'est permis. » ;
- couleur très saturée (C > 0,25) : « Cette couleur est très vive : liens
  et fonds légers seront adoucis pour rester lisibles. ».

Jamais un refus, jamais une erreur : **il est impossible de produire une
interface illisible** — la couleur choisie est toujours acceptée, et ce qui
s'affiche est ce que la fonction a vérifié.

### 1.4 Preuve prévue (étape 2)

Un jeu de cas limites fixé d'avance, dérivé par la fonction et contrôlé
par un script : blanc `#ffffff`, noir `#000000`, gris `#808080`, jaune pur
`#ffff00`, vert néon `#00ff00`, magenta `#ff00ff`, rose pâle `#ffe4e1`,
bleu marine `#000080`, orange `#ff6600`, bleu Clozado `#2563eb`, plus les
huit palettes proposées — pour chacun, toutes les paires texte/fond
émises avec leur contraste, et captures des vrais éléments (bouton, lien,
badge, ligne active) dans les deux thèmes.

---

## 2. L'internationalisation — le choix de la bibliothèque

### 2.1 Ce qu'il faut

Trois langues qui ne se confondent pas : l'INTERFACE (par utilisateur,
mémorisée ; défaut par organisation), les CONTENUS GÉNÉRÉS (déjà en
place), les CONTENUS DU CLIENT (jamais traduits). Pas de langue dans l'URL
(le choix est celui de l'utilisateur, pas de l'adresse) ; des textes dans
les composants serveur ET client ; des pluriels et des genres (« 1 contact
», « 2 contacts », « 1 newsletter a été marquée envoyée » / « 3 newsletters
ont été… ») ; les dates, montants et pourcentages selon la langue ET la
devise de l'organisation ; des emails composés hors de React (Auth.js) dans
la langue du destinataire ; ajouter une langue = ajouter un fichier, sans
toucher au code ; et une preuve mécanique qu'aucune chaîne visible ne
reste dans le code.

### 2.2 Les options

| | `next-intl` 4.13 | `next-intlayer` | `paraglide-js` (inlang) | Dictionnaires maison (`getDictionary`, la doc Next) |
|---|---|---|---|---|
| App Router, composants serveur et client | natif (`getTranslations` / `useTranslations`), Next 16 dans ses peerDependencies | natif | compilé, framework-agnostique, adaptateur Next | à écrire (provider client à faire soi-même) |
| Sans langue dans l'URL | oui (`getRequestConfig` lit la langue où l'on veut : session, cookie, base) | oui | oui | oui |
| Pluriels, genres, variables | ICU MessageFormat complet | ICU-like | fonctions typées par message, pluriels par langue | à écrire |
| Dates, nombres, devises | `useFormatter` / `getFormatter` sur `Intl`, fuseau et langue de la requête | oui | non (Intl à la main) | Intl à la main |
| Hors React (emails Auth.js, erreurs levées en base) | `createTranslator(locale, messages)` | partiel | oui (fonctions pures) | oui |
| Clés typées, clé manquante = erreur de build | oui (types générés depuis `fr.json`) | oui | oui (le plus strict) | non |
| Ajouter une langue | un fichier JSON + une ligne dans la liste | idem | idem + recompilation | un fichier |
| Poids client | ~15 ko gzip + les messages effectivement utilisés | plus lourd | ~0 (fonctions inlinées) | ~0 |
| Maturité, usage | la référence de l'App Router depuis 2023, 1 M de téléchargements/semaine | jeune | jeune, tooling inlang | — |

### 2.3 Recommandation : `next-intl`, sans routage par langue

Parce qu'elle couvre les trois besoins qui coûtent cher à écrire soi-même
— ICU (pluriels et genres du français), formats sur `Intl` alignés sur la
langue de la requête, et `createTranslator` pour les emails et les
messages d'erreur levés hors de React — et parce que « ajouter une langue
sans toucher au code » y est littéral : `src/messages/de.json` et une
entrée dans la liste des langues. Une dépendance, donc **ta décision**.

Mise en place prévue : `createNextIntlPlugin` dans `next.config.ts`,
`src/i18n/request.ts` où `getRequestConfig` résout la langue — celle de
l'utilisateur (`users.locale`), sinon celle de l'organisation
(`organizations.default_locale`), sinon `fr` — et charge
`src/messages/<langue>.json`, `NextIntlClientProvider` dans la coquille
(messages du namespace nécessaire seulement), `<html lang>` qui suit.
Messages **par écran** (`veille.empty.title`, `targets.form.label`) avec
un namespace `common` (boutons, états, erreurs). Les erreurs levées par
les requêtes deviennent des clés (`AppError("targets.errors.duplicate",
{label})`) traduites par l'action au moment de revenir à l'écran — plus
une phrase française cachée dans une requête. Les données de l'interface
qui vivent en code (navigation, registre des indicateurs, packs, catalogue
de marché, phrases des critères) portent des CLÉS, pas des textes.

**Les gabarits du métier** (cibles, sujets, sources) sont des contenus
instanciés en lignes du client : ils sont fournis **dans la langue par
défaut de l'organisation** au moment de l'instanciation (fr et en dans les
gabarits), puis appartiennent au client — jamais retraduits. Décision
réversible, notée ici.

Le `format.ts` central reste LE point d'entrée (une seule définition par
format) : chaque fonction reçoit — ou lit dans la requête — la langue, la
devise (`organizations.currency`) et le fuseau (`organizations.timezone`)
de l'organisation ; les quatre `Intl` échappés sont ramenés dedans ;
`formatEuros` devient `formatMoney` (CHF pour une organisation suisse).

### 2.4 La preuve prévue (étapes 4 et 5)

- **Statique** : un script de lint maison (ESLint, règle sur le JSX et les
  littéraux passés aux attributs visibles — `placeholder`, `title`,
  `aria-label`, `alt` — et aux messages d'erreur) qui refuse toute chaîne
  contenant une lettre hors d'un appel de traduction ; sa sortie est le
  résultat demandé (« cherche et montre le résultat »).
- **Dynamique** : le passage navigateur parcourt tous les écrans dans les
  deux langues avec une session forgée et compare le texte rendu à une
  liste d'arrêt (mots français dans l'interface anglaise et l'inverse),
  mesure la navigation et les boutons (pas de retour à la ligne, pas de
  débordement) et produit les captures — la liste des écrans vérifiés
  sera donnée.

---

## 3. Le schéma — ce qui s'ajoute (projet de migration, à ton accord)

Rien n'est renommé ni supprimé.

### `organizations`

- `sender_name text` — le nom d'expéditeur des emails (utilisable tout de
  suite : « Cabinet Dupont <adresse Clozado> ») ;
- `sender_email text` — l'adresse d'expéditeur souhaitée ; **tant que le
  domaine d'expédition n'est pas vérifié, elle n'est utilisée qu'en
  `Reply-To`** (un fournisseur refuse d'envoyer depuis un domaine non
  vérifié : l'email partirait dans le spam ou ne partirait pas) ;
- `email_domain text`, `email_domain_verified_at timestamptz` — le domaine
  d'expédition et sa vérification (schéma seulement) ;
- `custom_domain text unique`, `custom_domain_verified_at timestamptz` —
  le domaine de l'application (schéma seulement) ;
- `default_locale text not null default 'fr'` — la langue par défaut de
  l'interface ;
- `currency text not null default 'EUR'` (CHECK : trois lettres majuscules,
  ISO 4217) — la devise d'affichage ;
- `timezone text not null default 'Europe/Paris'` — le fuseau ; le cahier
  ne le nomme pas, mais « vendu hors de France » le rend nécessaire : une
  organisation à Londres ou à Montréal lirait des heures fausses avec le
  `PRODUCT_TIMEZONE` actuel. Ta décision ;
- `logo_url` reste : le lien externe devient une solution de repli pour
  les organisations qui l'utilisent, le téléversement prime.

### `users`

- `locale text` (NULL = la langue de l'organisation) — le choix mémorisé.

### `organization_assets` (nouvelle table)

`(organization_id, kind)` clé primaire, `kind` ∈ {`logo_light`,
`logo_dark`, `icon`}, `mime text`, `bytes bytea`, `width int`, `height
int`, `updated_at`. Les images du logo, **stockées en base** : trois
images de 100 ko au plus par organisation, servies par une route publique
avec un cache long (`/brand/<organisation>/<kind>?v=<updated_at>`), ce
qui donne aussi l'URL absolue dont les emails ont besoin. Redimensionnement
**dans le navigateur** (canvas : PNG ou WebP, 1 200 × 400 px au plus pour
le logo, 128 × 128 pour l'icône dérivée automatiquement du logo — un SVG
est rastérisé au passage, ce qui évite d'avoir à le nettoyer de ses
scripts) : **aucune dépendance** — ni `sharp` (binaire natif) ni stockage
externe.

**Limite d'échelle, à connaître (décision validée « pour maintenant »).**
Stocker des images dans Postgres tient tant que trois choses restent
vraies : (1) le volume — 300 ko par organisation, soit 300 Mo pour mille
organisations : négligeable pour Neon, mais chaque lecture d'image traverse
la base et le pilote HTTP plutôt qu'un CDN ; (2) la fréquence — un logo et
un favicon sont demandés à chaque ouverture d'onglet, et seul le cache
(`Cache-Control: public, max-age=31536000, immutable` avec `?v=updated_at`,
et le cache CDN de Vercel sur la route) évite que ces lectures ne comptent
dans le trafic de la base ; (3) la taille unitaire — une image de plus de
1 Mo ou un fichier qui n'est pas une image (kit de marque, PDF) n'a rien à
faire dans une ligne. **Seuils de bascule** vers un stockage dédié (Vercel
Blob, public, servi par CDN) : plus de ~500 organisations avec logo, ou des
lectures d'images qui dépassent ~5 % des requêtes de la base sur le tableau
Neon, ou tout fichier de plus de 1 Mo. La bascule garde la table
(`organization_assets`) et remplace `bytes` par une URL : la route publique
redirige, les écrans et les emails ne changent pas.

### Migration `0015_marque_blanche_i18n` (la 0014 du chantier ciblage s'applique avant — décision du 2026-08-26)

```sql
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "sender_name" text;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "sender_email" text;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "email_domain" text;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "email_domain_verified_at" timestamp with time zone;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "custom_domain" text;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "custom_domain_verified_at" timestamp with time zone;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "default_locale" text NOT NULL DEFAULT 'fr';
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "currency" text NOT NULL DEFAULT 'EUR';
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "timezone" text NOT NULL DEFAULT 'Europe/Paris';
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_custom_domain_unique" ON "organizations" ("custom_domain") WHERE "custom_domain" IS NOT NULL;
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "locale" text;
CREATE TABLE IF NOT EXISTS "organization_assets" (
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "mime" text NOT NULL,
  "bytes" bytea NOT NULL,
  "width" integer NOT NULL,
  "height" integer NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("organization_id", "kind"),
  CONSTRAINT "organization_assets_kind_check" CHECK ("kind" IN ('logo_light', 'logo_dark', 'icon'))
);
```

La migration définitive sera générée par drizzle-kit depuis le schéma,
relue et validée à blanc comme les précédentes, et montrée avant
application.

---

## 4. Le domaine personnalisé — ce que ça impliquera le jour venu

Rien de construit maintenant ; rien de codé qui l'empêche. Le jour venu :

- **Domaine de l'application** (`cabinet-dupont.fr` → l'espace de
  l'organisation) : le client pose un CNAME vers Vercel ; le domaine est
  rattaché au projet par l'API Vercel (`POST /v9/projects/{id}/domains`,
  jeton d'API en variable d'environnement) et le certificat est émis par
  Vercel ; `proxy.ts` lit l'hôte, résout l'organisation par
  `custom_domain` et pose l'organisation courante avant le rendu ; les
  cookies de session sont par hôte (déjà le cas, `AUTH_TRUST_HOST` déjà
  posé) ; les liens magiques utilisent déjà l'hôte de la requête. À
  décider alors : la page de connexion sur un domaine client porte-t-elle
  la marque du client (le cahier la garde à Clozado sur le domaine
  Clozado) ; une variable `APP_URL` par défaut pour les URL absolues des
  emails.
- **Domaine d'expédition** (`contact@cabinet-dupont.fr`) : le domaine est
  déclaré chez Resend (`POST /domains`), qui rend les enregistrements DNS à
  poser (SPF, DKIM, DMARC) ; après vérification (`POST /domains/{id}/verify`)
  `email_domain_verified_at` est posé et `sender_email` devient
  l'expéditeur réel ; avant, `Reply-To`. Un écran « Domaine » montrera les
  enregistrements à copier et l'état de vérification.

---

## 5. Le plan

1. **Exploration et conception** — ce document. STOP.
2. **Jetons dérivés + sélecteur de couleur + logo**, sur `/settings` :
   `deriveBrandTokens`, le sélecteur (pastille → `<input type="color">`
   natif, pipette par l'API EyeDropper quand le navigateur l'a, huit
   palettes sobres, hexadécimal replié, aperçu en direct sur un bouton, un
   lien, un badge et une ligne de navigation active, l'avertissement), le
   téléversement du logo (clair, sombre, icône dérivée) avec aperçu en
   situation (barre latérale, connexion, email), la migration. STOP.
3. **Propagation** : la coquille (barre latérale, en-tête, favicon), les
   états qui utilisent `primary`, l'expéditeur et le nom d'expéditeur des
   emails, la vitrine de partage sur les mêmes jetons ; le nom Clozado
   disparaît de l'espace de travail (mention légale exceptée) ; la
   connexion et l'espace gestionnaire restent Clozado. Preuve : deux
   organisations, deux interfaces. STOP.
4. **Extraction des textes et français** : `next-intl`, tous les écrans,
   états vides, erreurs, formulaires, infobulles, emails système ; le lint
   qui refuse une chaîne visible dans le code. STOP.
5. **Anglais, devises, formats, emails système** : `en.json`, la langue par
   utilisateur et par organisation, `format.ts` sur langue + devise +
   fuseau, l'email de connexion dans la langue du destinataire, la preuve
   dans les deux langues sur tous les écrans.

## 6. Décisions demandées à l'étape 1

1. **La méthode de dérivation** (§1) — d'accord pour la coder telle
   quelle ? Y compris : une couleur trop claire est assombrie pour les
   boutons et les liens (jamais refusée), le bouton principal passe à un
   survol dérivé plutôt qu'à l'opacité.
2. **`next-intl`** (§2.3) — dépendance à valider ; ou `paraglide-js` si tu
   préfères le compilé sans runtime (au prix des formats à écrire).
3. **Le schéma** (§3) — dont `timezone` par organisation (non demandé,
   argumenté) et le stockage des logos en base plutôt qu'un stockage
   externe.
4. **Les gabarits du métier** instanciés dans la langue par défaut de
   l'organisation, puis contenus du client (§2.3) — réversible, mais autant
   le dire.
5. **La 0014 en attente** (chantier ciblage) : à appliquer avant la
   migration de ce chantier, ou à abandonner — la numérotation en dépend.

## Étape 2 — les jetons dérivés, le sélecteur de couleur, le logo

### Ce qui est construit

- **La dérivation** (`src/lib/brand/color.ts`, `src/lib/brand/derive.ts`) :
  la méthode du §1, telle quelle, en deux modules purs sans dépendance —
  sRGB ↔ OKLab ↔ OKLCH, luminance et contraste WCAG 2.x, retour dans le
  gamut par réduction de chroma ; puis `deriveBrandTokens(hex, thème)` →
  vingt-deux variables CSS, la liste des **paires vérifiées** (neuf, avec
  leur rapport et leur seuil) et les **diagnostics** en clair. Trois
  défauts trouvés par le jeu de cas limites AVANT tout écran, et corrigés :
  l'encre de marque n'était vérifiée que sur le fond et les cartes, pas sur
  une ligne survolée (plus sombre) — elle l'est ; le survol allait vers le
  sombre même sous un texte foncé (contraste en baisse) — il s'éloigne
  désormais du texte du bouton, et se retourne en bout d'échelle ; un blanc
  cassé perdait sa teinte (seuil de gris trop haut) — il la garde, c'est
  elle qui fait la marque une fois assombrie. Le texte d'une ligne survolée
  reste une teinte sombre de la marque (comme aujourd'hui), pas l'encre.
- **Les jetons dans le système** (`globals.css`, `@theme inline`) :
  `--primary-hover`, `--primary-active`, `--primary-ink`, `--primary-soft`
  avec les valeurs que la fonction dérive du bleu Clozado (clair et
  sombre). Le bouton principal passe de `hover:bg-primary/80` (opacité) à
  `hover:bg-primary-hover active:bg-primary-active` ; les variantes `link`
  du bouton et du badge, et l'icône de la ligne active de la navigation,
  passent à `text-primary-ink`. Les autres usages de `text-primary` dans
  les écrans (tableau de bord, bannière de sélection, avatar, définitions)
  sont pour l'étape 3, avec la propagation.
- **Le sélecteur** (`components/brand/brand-color-picker.tsx`, client) : la
  pastille ouvre le sélecteur du navigateur (`showPicker()` sur un
  `<input type="color">`), la pipette apparaît quand `window.EyeDropper`
  existe, huit palettes nommées (bleu nuit, bleu, vert forêt, bordeaux,
  ardoise, ocre, prune, anthracite), la saisie hexadécimale repliée dans un
  `<details>`, l'avertissement au-dessus de l'aperçu, et **l'aperçu sur de
  vrais éléments** : le `Button`, le `Badge`, un lien en `text-primary-ink`,
  une ligne sélectionnée sur `bg-primary-soft`, et une réplique de la barre
  latérale avec les classes exactes de `NavLink` (ligne active
  `bg-sidebar-accent text-sidebar-accent-foreground`, icône
  `text-primary-ink`, compteur `bg-primary`) — le tout sous
  `style={brandStyle(tokens)}`, la même fonction que la coquille
  appliquera à l'étape 3 : l'aperçu ne peut pas mentir. Le tableau des
  contrastes vérifiés est replié dessous. La couleur part dans le
  formulaire par un champ caché, revalidée côté serveur (`normalizeHex`).
- **Le logo** (`components/brand/brand-logo-uploader.tsx`, client ;
  `lib/brand/actions.ts` ; `db/queries/organization-assets.ts` ; route
  `GET /brand/[organisation]/[kind]`) : PNG, JPEG, WebP, GIF ou SVG →
  dessiné sur un canevas dans le navigateur, réduit à 1 200 × 400 au plus
  (et encore réduit de 30 % tant qu'il dépasse 400 ko), rendu en PNG — un
  SVG est rastérisé au passage, plus rien à nettoyer côté serveur ;
  l'icône (128 × 128, le logo « contenu » sur fond transparent) est dérivée
  de la version claire ; la version sombre est facultative. Le serveur
  revérifie la signature PNG et lit l'en-tête IHDR (dimensions) sans
  dépendance, refuse au-delà de 400 ko ou 1 600 px, écrit dans
  `organization_assets` (bytea) ; la route publique sert l'image avec
  `Cache-Control: public, max-age=31536000, immutable` quand l'adresse
  porte sa version (`?v=<updated_at>`), 300 s sinon. Aperçus **en
  situation** : la barre latérale (avec la marque par défaut sans logo), la
  page de connexion, un email (le bouton à la couleur enregistrée), le fond
  sombre (version sombre, sinon la claire et la mention), l'icône d'onglet.
  « Retirer le logo » et « Retirer la version sombre » ; un membre voit
  tout en lecture seule.
- **L'écran** `/settings` : la carte « Marque » (nom, sélecteur, police des
  emails — avec la mention qu'elle n'affecte que les emails), la carte
  « Logo », les messages d'information et d'erreur. Le champ « Logo (lien
  vers une image) » et le champ hexadécimal ont disparu ; `logo_url` reste
  en base comme repli des organisations qui l'utilisaient.

### Ce qu'il faut savoir

- Le pilote `@neondatabase/serverless` lit un `bytea` avec l'ancien
  constructeur `Buffer()` (son `parseBytea` embarqué) : Node émet un
  avertissement de dépréciation (DEP0005) à la première image lue — un
  avertissement du pilote, pas une erreur, sans effet ; à surveiller à la
  prochaine mise à jour du pilote.

### Décisions réversibles

- L'aperçu du sélecteur ne montre que le thème clair (le produit n'a pas
  de bascule sombre) ; la fonction dérive les deux, et le bloc `.dark` de
  la feuille de style porte les valeurs dérivées.
- Les couleurs des étapes de pipeline (`/settings`, un champ texte par
  étape) ne sont pas la couleur de marque : hors périmètre de ce sélecteur.
- L'icône d'onglet est toujours dérivée du logo ; un téléversement d'icône
  dédié pourra s'ajouter si un client a un logo trop large pour un carré.

### Preuves

- **À blanc** (`scripts/_tmp-brand-proof.ts`, supprimé) : vingt couleurs
  (blanc, blanc cassé `#f5f1e8`, jaune très clair `#fff59d`, jaune pur,
  rose pâle, vert néon, magenta, orange, gris, noir, bleu marine, bleu
  Clozado et les huit palettes) × deux thèmes = quarante dérivations,
  **trois cent soixante paires vérifiées, aucune sous le seuil** ; le
  théorème « max(contraste avec le blanc, contraste avec le noir) ≥ √21 »
  contrôlé sur les 4 096 couleurs de la grille 4 bits : minimum observé
  4,584 (√21 = 4,583). Le jaune très clair `#fff59d` donne un bouton
  `#988e36` à texte foncé `#141821` (5,29:1), un lien `#756a00` (≥ 4,5 sur
  le fond, une carte et une ligne survolée), un fond léger `#f5f2d3` ; le
  blanc cassé `#f5f1e8` donne un bouton taupe `#959189` à texte foncé
  (5,71:1), un lien `#6c6860` — la teinte chaude conservée.
- **Au navigateur** (`scripts/_tmp-brand-browser.ts`, supprimé ; build de
  production, session forgée, organisation jetable `_brand-nav`) : **35
  contrôles, zéro erreur console, zéro `pageerror`, zéro 5xx** (deuxième
  passe : la première avait trouvé une erreur d'hydratation React #418 —
  la pipette n'était rendue que dans le navigateur, `window.EyeDropper`
  n'existant pas au rendu serveur ; corrigée par `useSyncExternalStore`
  avec un instantané serveur « sans pipette ») — le sélecteur (huit palettes, pas de
  champ hexadécimal en clair, aperçu avec un vrai bouton, un vrai lien, une
  vraie ligne active), la palette « Bordeaux » qui teinte la ligne active,
  **le jaune très clair et le blanc cassé** : l'avertissement, les
  variables réellement posées sur l'aperçu (`--primary #988e36`,
  `--primary-foreground #141821` ; `#959189`, encre `#6c6860`) et les
  couleurs calculées par le navigateur sur le vrai bouton (`rgb(152, 142,
  54)`) et le vrai lien (`rgb(108, 104, 96)`), enregistrement et
  persistance normalisée (`#1f5f45`), logo SVG rastérisé + PNG sombre +
  icône dérivée (trois PNG en base, 1 200 × 400 au plus, 128 × 128), route
  publique versionnée immuable, 404 sur une image inconnue, retraits,
  lecture seule pour un membre. Captures relues.

## Avancement

- **Étape 2 — jetons dérivés, sélecteur, logo** : prouvée à blanc (360
  paires, aucune sous le seuil) et au navigateur (35 contrôles). STOP.
- **Étape 1 — exploration et conception** : `1a4c3f9`. Les cinq décisions
  reçues le 2026-08-26 : dérivation validée, `next-intl` validé, schéma
  validé (avec `timezone` ; logos en base « pour maintenant », limite
  d'échelle notée ci-dessus), gabarits dans la langue de l'organisation
  validés, 0014 du ciblage à appliquer AVANT — numérotation 0015.
