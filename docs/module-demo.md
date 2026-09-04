# Module démo — mode démo réinitialisable, démo publique en lecture seule, didacticiel

Notes de chantier, même rôle que `docs/module-engagement.md`. Cahier des
charges reçu le 2026-09-03 (« NOUVEAU CHANTIER : DÉMO »), repris le
2026-09-04 : les deux sessions du 03/09 sont mortes avant d'écrire ce
document (la seconde avait consigné les trois décisions du chantier
engagement, corrigé les textes qui promettaient une heure, et monté la base
locale de preuve du §1.5 — ces trois choses sont conservées).

**Le but, unique** : une vidéo de prospection de trois minutes — un inconnu
comprend le produit sans que l'utilisateur soit derrière lui. Trois
livrables : un mode démo réinitialisable avec un jeu de données crédible,
une démo publique en lecture seule accessible sans compte, un didacticiel
guidé dans le produit.

**La contrainte de sécurité, relue deux fois** : le produit envoie de vrais
emails et ingère de vraies réponses. L'organisation de démo est marquée
comme telle EN BASE ; toute réinitialisation refuse de s'exécuter si elle
n'est pas marquée (garde-fou en base ET en code) ; aucun email ne part de
la démo — blocage AU TRANSPORT, un clic sur « Envoyer » produit une
simulation visible ; les crons ignorent la démo ; la lecture seule de la
démo publique est imposée CÔTÉ SERVEUR (une requête forgée est rejetée) ;
`orgScope` partout ; aucune organisation réelle n'est visible depuis la
démo.

État des lieux au commit `1a51fb0` (2026-09-03, `main`).

---

## 0. Ce qui existe — inventaire (sous-étape 1)

### 0.1 Les organisations et l'isolation

- `organizations` (`src/db/schema/organizations.ts`) : marque, profil
  éditorial, seuils PRM, pack métier, langue/devise/fuseau, domaine
  d'expédition, pied de page, jeton d'ingestion, envois automatiques.
  **Aucune colonne ne dit qu'une organisation est une démo** — ni `kind`,
  ni `is_demo`, ni statut (vérifié dans la base réelle, §0.10).
- `users` : `role` (`super_admin` | `admin` | `member`),
  `organization_id` — CHECK `users_role_organization_consistency` : un
  super admin n'a JAMAIS d'organisation, un admin/membre en a TOUJOURS une.
- **Toutes les colonnes `organization_id` du produit sont `NOT NULL` avec
  `ON DELETE CASCADE`** (48 tables), `users.organization_id` compris.
  Rattachement indirect : `newsletter_blocks` (par `newsletter_id`,
  cascade), `cta_preset_targets` (par `cta_preset_id` et `target_id`,
  cascade). Sans organisation, par construction : `market_observations`,
  `market_indicator_status` (catalogue partagé), `inbound_rejections`.
  **Conséquence : supprimer la ligne `organizations` emporte tout ce qui
  appartient à l'organisation.** C'est le mécanisme de `scripts/
  perf-dataset.ts destroy` et de `scripts/test-isolation.ts`, prouvé.
- Le seul déclencheur SQL du produit, `email_suppressions_keep_unsubscribed`
  (migration 0016), refuse la suppression d'une désinscription **tant que
  son organisation existe** — il laisse passer la cascade venue de la
  suppression de l'organisation. Une suppression table par table serait
  refusée ; une suppression par la ligne `organizations` passe.
- `orgScope(user, column)` (`src/db/scope.ts`) : super admin sans filtre,
  admin/membre filtré sur SON organisation, admin sans organisation →
  `false`. `assertOrgAccess` pour une donnée déjà chargée. Toutes les
  écritures des requêtes `organizations.ts` portent leur `WHERE` sur
  `user.organizationId`, jamais sur un id fourni.
- `requireSessionUser()` / `requireUser()` (`src/lib/session.ts`) : l'auth
  est imposée par le layout du groupe `(app)` puis rappelée par chacune des
  31 pages. Le super admin choisit une organisation par le cookie
  `clozado-active-org` (`setActiveOrganizationAction`) et devient `admin`
  de cette organisation dans `requireUser()` — la substitution vit là, pas
  dans les écrans. **Il n'existe ni `middleware.ts` ni `proxy.ts`.**

### 0.2 Les seeds et fixtures existants

| Script | Ce qu'il fait | Réutilisable pour la démo ? |
|---|---|---|
| `scripts/seed-demo.ts` (`db:seed-demo`) | deux organisations « Courtier Dupont » / « PME Martin » avec des admins aux **adresses réelles** de l'utilisateur | Non : ce sont ses organisations de test (§0.10), pas une démo publique. Ne pas y toucher. |
| `scripts/seed-prm-demo.ts` | statuts par défaut (`seedDefaultDealStatuses`), types d'affaire, partenaires | Le motif (idempotence par libellé) |
| `scripts/seed-newsletter-demo.ts` | profil éditorial, signataire, cible, chiffres vérifiés | Le seul `db.insert(signatories)` du dépôt |
| `scripts/perf-dataset.ts` | 5 000 contacts dans `_perf-test`, `create`/`status`/`destroy` | Le motif `create/status/destroy`, la génération par listes et hachage, la suppression par la ligne `organizations` |
| `scripts/test-isolation.ts` | preuve de l'isolation par FK composites | Le harnais `ok/ko` |
| `src/db/queries/signup.ts` `createOrganizationWithAdmin` | **la naissance d'une organisation** : UN `db.batch` — `organizations` + `users(admin)` + pipeline et 5 statuts (`buildDefaultPipelineInserts`) + une clé de site | Le chemin de naissance, à réutiliser tel quel |

Ce qui ne naît PAS avec une organisation et qu'un jeu de données doit
créer : `deal_types`, `loss_reasons`, `contact_tags`, `origins`,
`mail_targets` (`createPackTargets` par pack métier), `signatories`,
`cta_presets`, `verified_figures`, `api_keys`, sujets/sources de veille
(`createPackWatchDefaults`), indicateurs suivis (`followIndicators`),
`rules`, `business_pack`. Helpers d'écriture idempotents réutilisables :
`seedDefaultDealStatuses`, `createPackTargets`, `createPackWatchDefaults`,
`followIndicators`, `createContactTag`, `createOrigin`, `createLossReason`,
`createDealType`, `createPartner`, `createContact`, `createDeal`
(pose l'étape initiale et l'événement), `createDealShare` (partage +
événement + commission en un lot), `createTask`, `createActivity`,
`createManualAppointment`, `createRule` (version 1 du gabarit),
`insertWatchItems`, `receiveEvents`, `receiveLead`. Sans helper (insertion
brute) : `cta_presets`, `cta_preset_targets`, `signatories`. Le driver
`neon-http` n'a pas de transaction : les naissances groupées passent par
`db.batch` avec des ids générés côté application.

### 0.3 L'espace gestionnaire

Le super admin SANS organisation choisie voit sur `/dashboard` la liste des
organisations avec « Travailler dans cette organisation »
(`src/app/(app)/dashboard/page.tsx`, branche `!user.organizationId`) ; le
bandeau `SuperAdminBar` (sticky, `bg-warning/15`) porte le sélecteur. Il
n'existe aucun écran réservé au super admin : « l'espace gestionnaire »
est cette liste. C'est là que vivront la carte Démo (§1.9) et la
réinitialisation.

### 0.4 Le transport email — un point de passage, deux contournements

- **`deliverMessages(messages, content, origin)`** (`src/lib/email/
  deliver.ts`) : la remise au fournisseur de lignes `email_messages` déjà
  écrites — donc `organizationId` connu pour chaque message. Appelants :
  `runSend` (newsletters, lots de 100), `sendTestEmail`, `sendAutomaticWave`
  et `sendRuleDraft` (règles). Dessous, `sendEmail` / `sendBatch`
  (`resend.ts`) parlent HTTP à Resend.
- **Contournement 1** — `notify_owner` (`src/lib/rules/evaluate.ts:187`) :
  `sendEmail(...)` direct vers l'adresse du responsable, sans ligne
  `email_messages` ; `context.org` est disponible.
- **Contournement 2** — le lien de connexion (`src/auth.ts:37`) :
  nodemailer SMTP, seul `identifier` (l'email) est connu ; l'organisation
  se retrouve par `users.email → organization_id`.
- Statuts d'un message : `draft → queued → sent → delivered/…` ;
  `markMessagesSent(results)` pose `provider_message_id` (unique partiel)
  et `sent_at` ; les webhooks Resend font le reste (`recordEmailEvent`).
- Le test d'envoi part vers l'email de SESSION (jamais un contact).

### 0.5 Les crons et les travaux de fond déclenchés à la visite

- `/api/cron/envois` : `listResumableSends()` (`email-sends.ts:196`, rend
  déjà `organizationId`) puis `listOrganizationsWithActiveRules()`
  (`rules.ts:302`) → `evaluateOrganizationRules`.
- `/api/cron/veille` : `refreshAllIndicators()` (catalogue partagé, sans
  organisation) puis `listStaleOrganizations(limit)` (`watch.ts:818`) →
  `refreshWatchNow`.
- **À la visite** : `/contacts/[id]` écrit `contact_access_log`
  (`logContactAccess`, dédupliqué à l'heure) ; `/dashboard` et `/taches`
  appellent `generateAutoTasks` (tâches automatiques du suivi PRM) ;
  `/veille` et `/concurrents` lancent une collecte (`scheduleWatchRefresh`
  → `after()` → flux HTTP + modèle) quand la dernière a plus de 24 h ;
  `/chiffres` rafraîchit les indicateurs suivis dans `after()` (HTTP BCE,
  Eurostat, INSEE, Banque de France). Aucun `db.insert` littéral dans une
  page : tout passe par `src/db/queries/*`.

### 0.6 Les appels au modèle

Trois points d'entrée de `getAIProvider()` : le composeur
(`POST /api/newsletters/ai/design`, un flux par clic sur « Générer »), la
veille (`executeWatchRun` : résumés, recherche web facturée, classement) et
la signature des emails ingérés (`proposeSignature`, repli déterministe).
Les règles n'appellent jamais le modèle. Sans clé, `AINotConfiguredError`
est attrapée proprement par la veille et l'ingestion ; seule la route du
composeur la remonte à l'écran.

### 0.7 L'authentification et les pages publiques

- `src/auth.ts` : Auth.js, stratégie JWT, un seul fournisseur (lien
  magique par SMTP Resend), `callbacks.jwt` relit `users` et pose
  `id`/`role`/`organizationId` ; pas d'auto-inscription à la connexion
  (`/inscription` passe par `createOrganizationWithAdmin`).
- Trois routes API appellent `auth()` directement sans `requireUser()` :
  `/api/contacts/[id]/export` (GET, écrit le journal d'accès),
  `/api/newsletters/render` (POST, rendu pur), `/api/newsletters/ai/design`
  (POST, modèle). Quatre routes publiques écrivent sans session, par
  jeton/clé : `/api/events`, `/api/leads`, `/api/unsubscribe/[id]`,
  `/api/partage/[token]` ; plus l'action de `/desinscription/[id]`.
- Pages publiques hors `(app)` : `/partage/[token]` (le seul écran conçu
  pour un lecteur extérieur : `force-dynamic`, `robots: noindex`,
  fournisseurs next-intl/Formats/BrandStyle imbriqués aux réglages de
  l'organisation, jamais `auth()`), `/desinscription/[id]`, `/brand/…`,
  `/s.js`, `/login`, `/inscription`, `/`.
- Retour d'action : `withError(backTo, message, param)` et
  `errorMessage(error)` (`src/lib/form-actions.ts`), une `AppError` à clé
  (`errors.json`) traduite au retour, jamais une phrase en dur.

### 0.8 i18n, kit UI, états

- 27 namespaces FR/EN (3 710 lignes), 13 sérialisés côté client
  (`CLIENT_NAMESPACES`, `src/i18n/messages.ts`) ; règle ESLint
  `local/no-visible-text` (aucune chaîne visible en dur, exceptions
  motivées) et `local/client-namespaces`. Un namespace nouveau = deux JSON
  + `fr.ts`/`en.ts` + `CLIENT_NAMESPACES` s'il est lu par un composant
  client. Clé = slug du texte français.
- Kit : `PageHeader`, `StatTile`, `ListCard`, `EmptyState` (trois formes),
  `ErrorState`, `NotFoundState`, `DetailsCard`, `Sheet`, `DropdownMenu`,
  `Select`, squelettes. **Aucun** wrapper `Dialog`, `Popover`, `Tooltip`,
  `Toast` (Base UI les fournit, sans wrapper local). Trois états par écran
  par `loading.tsx` / `error.tsx` / `not-found.tsx` (21 / 13 / 5).
- Le motif « lecture seule » existe déjà : `/settings` calcule
  `readOnly = user.role !== "admin"` et le propage (`disabled`, phrase
  `lecture_seule`). Le motif « bandeau » existe : `SuperAdminBar`.
- **Aucun didacticiel, tour, onboarding** ; aucune préférence d'interface
  persistée (ni `localStorage` dans l'app, ni colonne `users`). Le seul
  cookie applicatif : `clozado-active-org`.
- Navigation : registre `NAVIGATION` (`navigation.ts`), entrées
  `requiresOrganization`, lien « Marque & réglages » en pied ; `/profil` et
  `/settings` par le menu de compte.

### 0.9 Les contrats d'insertion — l'essentiel pour un jeu de données

- Naissance : `organizations` → `users` → `pipelines` + `deal_statuses`
  (`nouveau`, `partagee`, `en_negociation`, `acceptee` won, `perdue` lost)
  → `site_keys` → `deal_types`, `loss_reasons`, `contact_tags`, `origins`,
  `partners` → `contacts` → `deals` (type, statut ET pipeline cohérents :
  FK `deals_status_pipeline_fk`) → `deal_shares`/`commissions`/`tasks`/
  `activities`.
- Couples imposés par CHECK à respecter : `email_messages.kind` ↔
  rattachements (`newsletter` ⇒ newsletter + contact ; `test` ⇒ sans
  contact ; `automatic` ⇒ règle + contact ; `manual` ⇒ contact) ;
  `newsletters.send_mode` ↔ `sent_at` ; `contacts` externes ⇒ paire
  système/id ; `appointments.status` ↔ `canceled_at` ; `commissions.basis`
  ↔ `rate`/`fixed_amount` et `state` ↔ dates ; `tasks` récurrence et
  sources automatiques ; `rules.action = send_email` ⇒ opt-in confirmé.
- Unicités globales à ne pas heurter : `users.email`,
  `inbound_emails.provider_email_id`, `email_messages.provider_message_id`
  (partiel), `email_events.provider_event_id` (partiel), `api_keys.key_hash`,
  `site_keys.key`, `deal_shares.token_hash`.
- `watch_items` ne stocke jamais le corps d'un article (droit d'auteur) :
  titre, URL, éditeur, résumé produit.

### 0.10 État réel de la base partagée (2026-09-04, lecture seule)

Deux organisations : `dupont` (Courtier Dupont, 1 utilisateur, 0 contact,
1 affaire, 1 newsletter) et `martin` (PME Martin, 1 utilisateur,
2 contacts, 1 affaire, 2 newsletters) — les organisations de test de
l'utilisateur, aux adresses réelles. Trois utilisateurs : un super admin
(l'utilisateur), deux admins. Dix-sept migrations appliquées (0000-0016,
journal `drizzle.__drizzle_migrations`). 57 tables. **Dev et production
partagent cette base.** Le script de reconnaissance
`scripts/_tmp-demo-scout2.ts` (lecture seule) a été supprimé après usage.

---

## 1. Conception

### 1.1 Le marquage en base — migration `0017_demo`

- `organizations.is_demo boolean NOT NULL DEFAULT false` — LA marque.
  Index unique partiel `organizations_single_demo` : **une seule
  organisation de démo** (la démo publique la retrouve sans ambiguïté).
- `organizations.demo_public_enabled boolean NOT NULL DEFAULT false` —
  l'interrupteur de la démo publique, avec le CHECK
  `organizations_demo_public_requires_demo` (`NOT demo_public_enabled OR
  is_demo`) : la base refuse de rendre publique une organisation qui n'est
  pas une démo. Défaut FAUX : le code de la démo publique se déploie sans
  rien exposer ; c'est l'utilisateur qui l'allume depuis l'espace
  gestionnaire, après le STOP de la sous-étape 4.
- `demo_resets` — le journal des réinitialisations (exigence « journalisation
  de chaque réinitialisation ») : `organization_id` SANS clé étrangère (le
  journal survit à la suppression de la ligne), `organization_slug`,
  `requested_by` (→ `users`, SET NULL) et `requested_by_email`, `kind`
  (`seed` = création, `reset` = suppression puis re-création), `status`
  (`running` | `done` | `failed`), `started_at`, `finished_at`, `error`,
  `deleted` (comptes par table AVANT suppression) et `created` (comptes
  APRÈS) en jsonb.
- **Déclencheur `organizations_delete_guard` (BEFORE DELETE)** : la base
  refuse de supprimer une organisation qui n'est ni marquée démo, ni une
  fixture jetable (slug commençant par `_`, convention des scripts de
  preuve : `_perf-test`, `_iso-a`, `_cron-test`, `_rules-prod`). C'est le
  « garde-fou en base » de la réinitialisation, et au passage une ceinture
  pour une base partagée par le dev et la production : une organisation
  réelle ne se supprime plus par un `DELETE` malencontreux. À confirmer
  (§3.1, D1) — sans lui, le garde-fou en base se réduit au prédicat
  `WHERE is_demo` de l'ordre de suppression.
- Le code : `resetDemoOrganization` refuse (AppError) toute organisation
  non marquée, exige le rôle super admin réel et une confirmation explicite
  (le slug retapé) ; l'ordre de suppression est `DELETE FROM organizations
  WHERE id = $1 AND is_demo` — même appelé avec un mauvais id, il ne
  supprime rien qui ne soit marqué.
- Rien n'est renommé ni supprimé ; tout est `IF NOT EXISTS` / bloc `DO`,
  rejouable, comme 0016. Texte complet au §4. **Rédigée
  (`src/db/migrations/0017_demo.sql`), rejouée deux fois sur la base
  LOCALE sans erreur (journal local : 18 entrées), JAMAIS appliquée sur la
  base partagée.**

### 1.2 Le blocage au transport

- `deliverMessages` (le point de passage) commence par
  `isDemoOrganization(messages[0].organizationId)` : si oui, **aucun appel
  à Resend** — le lot est déclaré `sent` avec des identifiants fournisseur
  `demo:<id du message>` (uniques par construction). Les messages passent
  `queued → sent` par le chemin commun (`markMessagesSent`), la newsletter
  est bien « envoyée par le produit », la vague de règles bien « partie »,
  et l'écran le dit : « Démo — envoi simulé, aucun email n'est parti »
  (carte d'envoi, journal, fiche contact reconnaissent le préfixe
  `demo:`). Aucun webhook ne suivra (pas de remise, pas d'ouverture) : les
  statistiques crédibles de la démo viennent du jeu de données (§1.6), pas
  d'une simulation d'engagement.
- Contournement 1 (`notify_owner`) : `evaluate.ts` teste
  `context.org.isDemo` avant `sendEmail` et journalise l'action comme
  faite avec le motif « simulé (démo) ».
- Contournement 2 (lien de connexion) : `sendVerificationRequest` résout
  l'organisation du destinataire ; membre d'une démo → l'email n'est pas
  envoyé (la page « vérifie ta boîte » s'affiche quand même — personne ne
  se connecte comme persona de la démo, et rien ne le dit à un inconnu).
- **La ceinture, au niveau le plus bas** : `sendEmail`/`sendBatch`
  (`resend.ts`) refusent tout destinataire dont le domaine est réservé aux
  exemples (RFC 2606/6761 : `example.com/.net/.org`, TLD `.example`,
  `.invalid`, `.test`, `.localhost`). Le jeu de données n'utilise que des
  adresses sur `.example` : même un chemin d'envoi oublié ne peut pas
  écrire à une adresse réelle. Deux nets, indépendants.

### 1.3 Les crons et les travaux de fond ignorent la démo

- `listStaleOrganizations` : `AND o.is_demo = false` ;
  `listOrganizationsWithActiveRules` et `listResumableSends` : jointure
  `organizations` avec `is_demo = false`. Un filtre par requête, à la
  source, pas dans les routes.
- À la visite : la collecte de veille et le rafraîchissement des
  indicateurs ne se lancent jamais pour une organisation démo (aucun appel
  HTTP ni modèle depuis la démo, quel que soit le visiteur) ; « Actualiser »
  répond par une information (« Démo : la collecte est désactivée, les
  éléments sont fictifs »). `logContactAccess` et `generateAutoTasks` ne
  s'exécutent pas pour un visiteur en lecture seule (§1.4) ; ils restent
  actifs pour le super admin qui travaille dans la démo.
- Le composeur (modèle) reste disponible au super admin dans la démo (pour
  la vidéo : la génération est un moment fort) ; il est fermé au visiteur
  public (aucun jeton brûlé par un inconnu).

### 1.4 La démo publique — la session de visite, la lecture seule côté serveur

**Le principe** : la démo publique, ce sont LES écrans du produit, pas une
copie. Un visiteur reçoit une *session de visite* qui le fait entrer dans
l'organisation de démo à la place de sa persona (Claire Vasseur, la
courtière fondatrice, §1.6), en lecture seule. Tout ce qui existe —
`orgScope`, la marque, la langue, les compteurs — s'applique sans qu'aucun
écran ne connaisse le mécanisme, exactement comme la substitution du super
admin.

- `GET /demo` : si une organisation `is_demo AND demo_public_enabled`
  existe, pose le cookie `clozado-demo` (JWT signé par `AUTH_SECRET` via
  `next-auth/jwt` avec son propre sel, `httpOnly`, `sameSite=lax`,
  `secure` en production, 8 heures) portant `{ org, uid, demo: true }` et
  redirige vers `/dashboard?visite=1` (le didacticiel démarre). Sinon :
  404 — **tant que l'interrupteur est éteint, la route n'existe pas.**
  `GET /demo/quitter?vers=/inscription` efface le cookie.
- `requireSessionUser()` lit le cookie de visite EN PREMIER (fermé par
  défaut : s'il est présent, c'est lui qui gagne, même si une vraie session
  coexiste) : décodage, puis vérification EN BASE que l'organisation est
  toujours démo ET publique (éteindre l'interrupteur tue toutes les
  visites à la requête suivante) → l'utilisateur effectif est
  `{ id: persona, role: "admin", organizationId: démo, readOnly: true }`.
  `OrgScopeUser` gagne `readOnly?: boolean`. Un cookie invalide est ignoré
  (retour au chemin Auth.js normal).
- **Le rejet des écritures, côté serveur, en deux couches** :
  1. `src/proxy.ts` (le middleware de Next 16 — il n'en existait pas) :
     quand le cookie `clozado-demo` est présent, toute requête autre que
     `GET`/`HEAD` est refusée, ainsi que toute action serveur (en-tête
     `Next-Action`). Une action serveur reçoit une réponse `x-action-redirect`
     vers la page courante avec `?demo=lecture-seule` (le client Next fait
     une navigation complète — vérifié dans
     `server-action-reducer.js` de Next 16.3.1) ; un POST de formulaire
     sans JavaScript reçoit un 303 vers la même adresse ; `/api/*` répond
     403. Les chemins sensibles sont refusés même en `GET` : `/settings`,
     `/profil`, `/contacts/import`, `/api/*` (réglages, clés, adresses
     d'ingestion, exports, modèle). `/demo/*`, `/login`, `/inscription`,
     `/brand/*` passent. Une requête forgée passe par le même proxy.
  2. Dans le code : `readOnly` est lu par la coquille (bandeau, menu de
     compte remplacé par « Quitter la démo » / « Créer mon compte »), les
     pages sensibles se défendent elles-mêmes (`redirect` si `readOnly`),
     les écritures « à la visite » (§1.3) sont court-circuitées, et les
     boutons d'écriture montrent l'état lecture seule (le motif de
     `/settings`). Cacher ne suffit pas, mais cacher ET refuser vaut mieux.
- **Ce qui est exposé au visiteur** (la liste exhaustive du STOP de la
  sous-étape 4, à relire avant d'allumer l'interrupteur) : `/dashboard`,
  `/taches`, `/suivi`, `/contacts`, `/contacts/[id]`, `/affaires`,
  `/affaires/[id]`, `/partenaires`, `/partenaires/[id]`, `/analytique/*`,
  `/emails-recus`, `/cibles`, `/cibles/[id]`, `/cibles/new` (formulaire,
  jamais enregistré), `/regles`, `/regles/[id]`, `/regles/new`,
  `/regles/journal`, `/veille`, `/concurrents`, `/chiffres`,
  `/newsletters`, `/newsletters/[id]`, `/newsletters/new` (composeur sans
  génération) — toutes sur les seules données de l'organisation de démo,
  fictives (§1.6). **Jamais** : `/settings` (marque, domaine, pied de page,
  adresse d'ingestion, envois automatiques), `/profil` (Calendly, lien de
  rendez-vous), `/contacts/import`, les exports CSV, les clés d'API et de
  site, les routes API, le modèle. La vitrine partenaire `/partage/[token]`
  reste ce qu'elle est (par jeton).
- Aucune organisation réelle n'est visible : le visiteur est `admin` de la
  démo, jamais super admin ; `orgScope` filtre tout ; la liste des
  organisations n'existe que pour un super admin réel.
- Rien n'est indexé (`x-robots-tag: noindex` sur `/demo` et
  `/demo/quitter`), et le bandeau dit d'entrée : « Démo publique — cabinet
  fictif, données inventées, lecture seule ».
- **Construit le 2026-09-04** : `src/lib/demo/public.ts` (ce que le proxy
  partage, sans dépendance Node), `src/lib/demo/session.ts` (le cookie de
  visite : JWT `next-auth/jwt` avec son propre sel, revérifié en base à
  chaque requête, `readDemoVisitor` en cache par requête), `src/proxy.ts`
  (la première couche), `src/app/demo/route.ts` et `/demo/quitter`,
  `requireSessionUser` qui lit la visite EN PREMIER (type `SessionUser`
  commun, `readOnly`), `resolveRequestSettings` (langue/devise/fuseau de
  la démo pour le visiteur), la coquille (`DemoBanner` + notice
  `?demo=lecture-seule`, liens de sortie à la place du menu de compte, ni
  « Nouveau » ni « Marque & réglages »), les pages sensibles qui se
  défendent (`/settings`, `/profil`, `/contacts/import` → tableau de bord),
  les travaux à la visite court-circuités (`logContactAccess`,
  `generateAutoTasks`). Entrer dans `/login` ou `/inscription` termine la
  visite (le proxy efface le cookie).
- **Piège trouvé au navigateur, le 2026-09-04 — un préchargement n'est pas
  une entrée.** Les liens de sortie du bandeau (`/demo/quitter`) étaient des
  `Link` : le routeur client de Next les précharge dès qu'ils sont à
  l'écran (`GET /demo/quitter?_rsc=… Next-Router-Prefetch: 1`), la route
  effaçait le cookie, et la visite mourait à la seconde où le tableau de
  bord apparaissait (la première preuve HTTP, sans navigateur, ne pouvait
  pas le voir ; au navigateur, `/taches` puis `/settings` renvoyaient sur
  `/login`). Trois corrections, en couches : les sorties sont des `<a>`
  sans préchargement (le motif du lien d'export de la fiche contact) ; la
  route `/demo/quitter` répond 204 sans toucher au cookie à un
  préchargement (`isRouterPrefetch`, `src/lib/demo/public.ts` — une route
  reçoit l'en-tête) ; le proxy ne termine la visite sur `/login` ou
  `/inscription` que pour une VRAIE navigation (`isNavigation` :
  `Sec-Fetch-Mode: navigate`, ou pas de Fetch Metadata), parce que Next
  retire les en-têtes « flight » (`rsc`, `next-router-prefetch`, `_rsc`)
  avant d'appeler le middleware (`server/web/adapter.js`, « Headers should
  only be stripped for middleware ») — le proxy ne peut pas voir un
  préchargement autrement. Règle générale à retenir : une route `GET` qui
  AGIT ne se lie jamais par `Link`, et le proxy ne sait pas distinguer un
  préchargement d'une transition sans les Fetch Metadata.

### 1.5 La base locale de preuve

Dev et production partagent une seule base : la migration ne s'y applique
pas sans accord, et une suppression ne s'y essaie pas. Pour construire et
prouver quand même, un Postgres local dans Docker derrière un proxy HTTP
compatible Neon (le pilote `neon-http` du produit ne parle que HTTP) :

- conteneurs `clz-pg` (`postgres:16-alpine`, volume nommé, port 5432) et
  `clz-neon-proxy` (`ghcr.io/timowilhelm/local-neon-http-proxy`, port
  4444). Après un redémarrage du Codespace : `docker start clz-pg
  clz-neon-proxy` puis `docker restart clz-neon-proxy` (le proxy doit
  démarrer après Postgres).
- `src/db/index.ts` : si `DATABASE_HTTP_ENDPOINT` est posée,
  `neonConfig.fetchEndpoint` pointe le proxy. La variable n'existe qu'en
  local (`.env.example` la documente commentée) ; sans elle, rien ne
  change. `scripts/db-migrate.ts` l'honore aussi.
- Les 17 migrations ont été rejouées sur la base locale le 03/09 (journal
  identique : 17 entrées, dernière du 2026-08-27). Un fichier
  `.env.local-demo` (ignoré par git) pointe la base locale avec une clé
  Resend volontairement invalide : même une fuite du blocage ne pourrait
  pas envoyer.
- Le harnais de preuve reste celui des chantiers précédents : build de
  production, session forgée, Chromium, FR puis EN, zéro erreur console.

### 1.6 Le jeu de données — l'histoire de Vasseur Courtage

Un cabinet de courtage en crédit immobilier et assurance emprunteur à
Nantes, fondé par **Claire Vasseur** (courtière fondatrice, l'admin, la
persona du visiteur) avec **Thomas Renard** (conseiller, membre). Domaine
`vasseur-courtage.example` ; adresses des contacts sur `courriel.example`,
`messagerie.example`, `boite.example` — des domaines réservés par l'IETF,
que rien ne route. Slug `demo`, identifiants fixes (organisation et
personnes) pour survivre aux réinitialisations. Tout est inventé ; le
bandeau et la description de l'organisation le disent.

Ce que le visiteur voit, écran par écran :

- **Partenaires** (PRM) : six apporteurs — deux agences immobilières, un
  notaire, un conseiller en gestion de patrimoine, un expert-comptable, un
  constructeur — avec des partages à tous les stades : en attente (dont un
  sans réponse depuis neuf jours et un qui expire demain → le suivi
  s'allume), acceptés, refusés, un réémis. Commissions prévues, confirmées,
  réglées, une confirmée et non réglée depuis trois semaines (la pile
  « à encaisser »).
- **Affaires et pipeline** : vingt-six affaires (crédit immobilier, rachat
  de crédit, assurance emprunteur, prêt professionnel) de 120 000 à
  520 000 €, réparties sur les cinq étapes, avec sept mois d'historique de
  passages d'étape, des dates de clôture prévues, trois perdues avec motif
  (taux concurrent, projet abandonné, refus bancaire).
- **Contacts** : une quarantaine — primo-accédants, investisseurs,
  renégociations, professionnels, clients signés (étiquettes), répartis
  entre Claire et Thomas, villes de l'agglomération nantaise ; quatre
  sociétés ; un journal d'interactions (appels, emails reçus et envoyés,
  rendez-vous, notes) sur trois mois ; trois rendez-vous à venir, un
  annulé.
- **Tâches** : quatorze ouvertes (trois pour aujourd'hui, deux en retard,
  une récurrente), huit faites, une créée par une règle.
- **Newsletters** : quatre envoyées par le produit avec leurs statistiques
  (remises, ouvertures, clics, deux rebonds, deux désinscriptions) et une
  en cours d'écriture ; trois cibles (primo-accédants, investisseurs,
  clients signés), une signataire, trois chiffres vérifiés du cabinet,
  deux boutons préréglés.
- **Engagement** : trois emails reçus (un confirmé et rattaché, un en
  attente avec sa proposition, un ignoré) ; deux règles (« sans rendez-vous
  après sept jours → tâche », « newsletter non ouverte après cinq jours →
  brouillon ») avec trois passages journalisés et une vague de deux
  brouillons en attente du clic humain.
- **Veille, concurrents, chiffres** : trois sujets, cinq sources et deux
  concurrents avec dix éléments résumés (articles fictifs, éditeurs fictifs
  sur `.example`), un passage terminé l'avant-veille ; deux indicateurs du
  catalogue suivis (le catalogue est réel et partagé — un taux BCE
  n'appartient à personne).
- **Analytique** : soixante jours de visites et de simulations avec
  origines (site, recommandation, salon, agence partenaire), dix-huit
  leads dont une partie devenus contacts puis affaires → le funnel, les
  délais, les pertes, les partenariats et les origines ont du sens.

Génération déterministe (listes fixes + générateur pseudo-aléatoire à
graine constante) : deux créations donnent le même jeu, aux dates près —
tout est relatif au jour de la création (« il y a 9 jours », « demain »),
pour que la démo soit toujours d'aujourd'hui. Une taille modeste
(≈ 1 200 lignes toutes tables confondues, insertions par lots, quelques
secondes) : un cabinet qui fonctionne, pas une base de test.

Le code : `src/lib/demo/dataset.ts` (l'histoire : listes, constantes,
identifiants fixes), `src/lib/demo/seed.ts` (`createDemoOrganization()`,
réutilise les helpers du §0.2 et la naissance de `signup.ts`, refuse si le
slug existe déjà), `scripts/demo.ts create | status` (le même code depuis
la ligne de commande, sur la base locale ou, après accord, sur la base
partagée).

### 1.7 La réinitialisation — le périmètre exact (validé le 2026-09-04)

**Périmètre validé par l'utilisateur le 2026-09-04 (« Je valide les
deux ») et construit le jour même** (`src/lib/demo/reset.ts`,
`resetDemoAction`, formulaire de la carte Démo avec le slug retapé,
`scripts/demo.ts reset --confirm=demo`). Ce qui est supprimé, et rien
d'autre :

- Un seul ordre de suppression : `DELETE FROM organizations WHERE id =
  <id fixe de la démo> AND is_demo = true` — la cascade emporte, et
  uniquement pour cette organisation : `users` (Claire, Thomas — donc leurs
  `accounts`/`sessions` Auth.js s'il y en avait), `pipelines`,
  `deal_statuses`, `deal_types`, `loss_reasons`, `contact_tags` et leurs
  affectations, `origins`, `partners`, `contacts`, `contact_access_log`,
  `deals`, `deal_stage_changes`, `deal_events`, `deal_shares`,
  `commissions`, `tasks`, `activities`, `appointments`,
  `calendar_connections`, `mail_targets`, `mail_target_members`,
  `signatories`, `cta_presets` (+ `cta_preset_targets`), `verified_figures`,
  `newsletters` (+ `newsletter_blocks`, `newsletter_recipients`,
  `newsletter_sources`), `newsletter_sends`, `email_messages`,
  `email_events`, `email_suppressions` (le déclencheur laisse passer la
  cascade), `inbound_emails`, `rules`, `rule_templates`, `rule_runs`,
  `rule_actions`, `watch_topics`, `watch_sources`, `watch_items`,
  `watch_basket_items`, `watch_runs`, `organization_indicators`,
  `organization_assets`, `site_keys`, `api_keys`, `leads`,
  `acquisition_events`, `acquisition_rejections`.
- Ce qui n'est PAS touché : les autres organisations (le prédicat
  `is_demo` et l'index unique l'interdisent), `market_observations` et
  `market_indicator_status` (catalogue partagé), `inbound_rejections`
  (sans organisation), le journal `demo_resets` (sans FK, il survit), les
  utilisateurs hors démo.
- Puis `createDemoOrganization()` recrée tout avec les mêmes identifiants
  fixes — idempotence par construction : deux réinitialisations d'affilée
  donnent le même jeu.
- Garde-fous, dans l'ordre : confirmation explicite (le slug `demo`
  retapé — toute autre saisie est refusée et dite à l'écran, sans ligne de
  journal) ; rôle super admin RÉEL (pas la substitution) ; organisation
  MARQUÉE démo (code) ; prédicat `is_demo` dans l'ordre de suppression
  (base) et déclencheur `organizations_delete_guard` (base, D1) ; un seul
  `running` à la fois ; journal `demo_resets` avant/après avec les comptes
  par table. L'interrupteur de la démo publique est conservé : une démo
  publique le reste après sa remise à zéro. Ce que la réinitialisation
  efface au passage, et c'est voulu : tout ce qui s'est accumulé depuis le
  semis (tâches automatiques matérialisées par les visites, tests d'envoi,
  vagues parties, brouillons produits par une évaluation) — la démo
  redevient celle du semis, datée d'aujourd'hui.

### 1.8 Le didacticiel

- Un parcours en huit étapes, dans l'ordre où le produit fait sens :
  bienvenue (`/dashboard`) → partenaires et partages (`/partenaires`) →
  affaires et suivi (`/affaires`) → contacts et pipeline (`/contacts`) →
  composer (`/newsletters`) → ciblage (`/cibles`) → engagement : relances,
  emails reçus, rendez-vous (`/regles`) → analytique (`/analytique/funnel`).
  Chaque étape : un titre, deux phrases, « Voir cet écran », Précédent /
  Suivant / Fermer, la progression « 3 / 8 ».
- Un composant client `TourCard` monté par la coquille `(app)`, fixé en bas
  à droite (pleine largeur en bas sur mobile), qui ne cache jamais un
  bouton d'action de l'écran.
- **État dans un cookie** (`clozado-visite` : étape courante, `en_cours` |
  `masque` | `termine`, un an), écrit côté client — indispensable : le
  visiteur de la démo n'a droit à aucune écriture serveur — et lu côté
  serveur pour rendre le bon état sans clignotement. Par navigateur, pas
  par compte : suffisant pour la vidéo et les pilotes, sans migration ; la
  voie « colonne `users` » reste ouverte si le besoin d'une reprise
  multi-appareils apparaît (§3.2).
- Démarre seul la première fois (aucun cookie) — pour un compte réel comme
  pour un visiteur (`?visite=1` force le départ) ; « Fermer » le masque ;
  « Visite guidée » dans le menu de compte et dans le bandeau démo le
  reprend où il en était.
- Tout par l'i18n : namespace `tour` (FR/EN, client). Aucune promesse
  d'heure sur les automatismes (« chaque jour, avant 9h00 » au plus).
- **Construit le 2026-09-04** : `src/lib/tour/steps.ts` (le registre des
  huit étapes, le cookie `clozado-visite` « étape|état »), `TourCard`
  (client, monté par la coquille `(app)` pour toute personne qui a une
  organisation, état initial lu du cookie côté serveur), « Visite guidée »
  dans le menu de compte et dans le bandeau de la démo (`?visite=1`
  relance depuis le début).

### 1.9 L'espace gestionnaire — la carte Démo

Sur la liste des organisations du super admin : une carte « Démo » —
l'organisation de démo (badge « Démo » dans la liste et dans le bandeau),
l'état de la démo publique (interrupteur allumé/éteint, avec le lien
`/demo` quand elle est allumée et un rappel de ce qui est exposé), la
dernière réinitialisation (date, par qui, durée, comptes) et le bouton
« Réinitialiser » (dialogue de confirmation, slug à retaper). Sans
organisation de démo : « Créer l'organisation de démo » (la création n'est
qu'une insertion, sans STOP). Actions serveur réservées au super admin
réel (`requireSessionUser`, comme `setActiveOrganizationAction`).

---

## 2. Le plan en sous-étapes et le protocole de livraison

| Sous-étape | Contenu | STOP |
|---|---|---|
| 1 — inventaire et plan | ce document, la base locale de preuve, les décisions à poser | — |
| 2 — jeu de données | migration 0017 (rédigée, appliquée EN LOCAL seulement), schéma, `dataset.ts` + `seed.ts` + `scripts/demo.ts`, blocage au transport, filtres des crons et des travaux de fond, carte Démo (création + interrupteur), preuves locales | migration (accord avant la base partagée) |
| 3 — réinitialisation | l'action de suppression + re-création, le journal, le dialogue | **suppression : périmètre §1.7 à accepter avant d'écrire** |
| 4 — démo publique | `/demo`, session de visite, `proxy.ts`, lecture seule, bandeau, chemins sensibles, preuves locales (requêtes forgées) | **exposition : liste §1.4 à accepter avant d'allumer l'interrupteur** |
| 5 — didacticiel | `TourCard`, namespace `tour`, cookie, FR/EN | — |
| 6 — preuve et documentation | depuis la production : démo consultable, réinitialisation, aucun email, aucune organisation réelle visible ; fixtures détruites | — |

**Le protocole de livraison — pourquoi une branche `demo`.** Le cahier
demande commit + push sur `main` après chaque sous-étape ET interdit
d'appliquer une migration sans accord sur la base partagée. Or dès la
sous-étape 2, le schéma Drizzle connaît `organizations.is_demo` : déployé
sur la production AVANT la migration, chaque `select` sur `organizations`
échouerait (colonne inconnue) — pousser ce code sur `main`, c'est
appliquer la migration de fait, ou casser la production. Donc :

1. la sous-étape 1 est poussée sur `main` (aucune dépendance de schéma) ;
2. les sous-étapes 2 à 5 sont committées et poussées sur la branche
   `demo` (`origin/demo` — le travail est sauvegardé à chaque sous-étape ;
   le déploiement de prévisualisation Vercel de cette branche n'a pas de
   sens et peut être ignoré) ;
3. à l'accord sur la migration : `npm run db:migrate:http` sur la base
   partagée, puis fusion de `demo` dans `main` et push — dans cet ordre,
   la production ne voit jamais le code sans la colonne ;
4. `scripts/demo.ts create` sur la base partagée (ou « Créer l'organisation
   de démo » depuis l'espace gestionnaire), puis la sous-étape 6.

---

## 3. Décisions

### 3.1 À trancher par l'utilisateur (liste courte)

- **D1 — Le déclencheur `organizations_delete_guard`** (§1.1) : la base
  refuse la suppression de toute organisation non marquée démo dont le slug
  ne commence pas par `_`. Recommandé (garde-fou en base au sens fort,
  protège aussi `dupont`/`martin` et les futurs clients). Sans lui, le
  garde-fou en base est le prédicat `WHERE is_demo` seul.
- **D2 — La migration 0017** (§4) : accord donné le 2026-09-04 avec
  l'ordre de fusionner `demo` dans `main` (protocole §2 : migrer PUIS
  fusionner) — appliquée sur la base partagée à la clôture, déclencheur D1
  compris (réversible d'un `DROP TRIGGER organizations_delete_guard ON
  organizations` si tu ne le veux pas).
- **D3 — Le périmètre de suppression** (§1.7) : VALIDÉ le 2026-09-04 ;
  construit et prouvé le jour même.
- **D4 — L'exposition publique** (§1.4, liste exhaustive) : VALIDÉE le
  2026-09-04 ; l'interrupteur est allumé en production à la clôture, depuis
  la carte Démo. La démo vit à `/demo` sur `clozado.vercel.app` ; un domaine
  dédié reste possible plus tard, sans rien changer au mécanisme.
- **D5 — Le composeur dans la démo publique** : fermé au visiteur
  (proposé, §1.3 — aucun jeton brûlé par un inconnu) ; ouvert au super
  admin dans la démo pour la vidéo. Si tu veux que le visiteur puisse
  générer, il faut un plafond par visite et par jour — à concevoir.

### 3.2 Prises (réversibles) — à contester si besoin

- Une seule organisation de démo (index unique partiel) ; slug `demo`,
  identifiants fixes.
- Le visiteur entre comme la persona admin (Claire Vasseur) en lecture
  seule, plutôt que comme un membre anonyme : il voit le produit tel qu'un
  cabinet le voit (ses tâches, son suivi, sa marque).
- La session de visite est un cookie propre (`clozado-demo`), lu avant la
  session Auth.js et prioritaire (fermé par défaut) ; `/demo/quitter`
  l'efface. Une vraie session qui coexiste n'est pas détruite.
- Deux couches de lecture seule : le proxy (toute écriture HTTP) et le
  code (`readOnly`, chemins sensibles, travaux à la visite).
- Simulation d'envoi = statut `sent` avec identifiant `demo:<id>`, dit à
  l'écran ; pas de faux événements de remise ou d'ouverture.
- La ceinture « domaines réservés aux exemples » dans `resend.ts`, valable
  pour tout le produit (personne n'a de raison d'écrire à `.example`).
- La veille et les indicateurs ne collectent jamais pour la démo (contenu
  fictif et stable) ; le catalogue partagé des indicateurs reste réel.
- Le didacticiel vit dans un cookie par navigateur, pas en base (aucune
  migration, aucune écriture serveur pour le visiteur).
- Le journal `demo_resets` sans clé étrangère vers `organizations` (il doit
  survivre à la suppression).
- La base locale de preuve (Docker) et `DATABASE_HTTP_ENDPOINT`
  env-guardée dans `src/db/index.ts` et `scripts/db-migrate.ts`.
- Branche `demo` pour les sous-étapes 2 à 5 (protocole §2).
- Les scripts `seed-demo.ts`, `seed-prm-demo.ts`, `seed-newsletter-demo.ts`
  existants ne sont pas modifiés (organisations de test de l'utilisateur).

---

## 4. La migration `0017_demo` — montrée, en attente d'accord

Rédigée à la sous-étape 2 : `src/db/migrations/0017_demo.sql` (réécrite à
la main depuis la sortie drizzle-kit : `IF NOT EXISTS`, bloc `DO`, FK dans
le `CREATE TABLE`, déclencheur), `meta/0017_snapshot.json` et le journal.
Appliquée deux fois sur la base locale (rejouable), jamais sur la base
partagée. Le contenu, dans l'ordre :

```sql
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "is_demo" boolean DEFAULT false NOT NULL;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "demo_public_enabled" boolean DEFAULT false NOT NULL;
-- La base refuse de rendre publique une organisation qui n'est pas une démo.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_demo_public_requires_demo') THEN
    ALTER TABLE "organizations" ADD CONSTRAINT "organizations_demo_public_requires_demo"
      CHECK (NOT "demo_public_enabled" OR "is_demo");
  END IF;
END $$;
-- Une seule organisation de démo.
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_single_demo" ON "organizations" ("is_demo") WHERE "is_demo";
-- Le journal des réinitialisations : sans FK vers organizations, il survit à la suppression.
CREATE TABLE IF NOT EXISTS "demo_resets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "organization_slug" text NOT NULL,
  "requested_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "requested_by_email" text,
  "kind" text NOT NULL,
  "status" text DEFAULT 'running' NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone,
  "error" text,
  "deleted" jsonb,
  "created" jsonb,
  CONSTRAINT "demo_resets_kind_check" CHECK ("kind" IN ('seed', 'reset')),
  CONSTRAINT "demo_resets_status_check" CHECK ("status" IN ('running', 'done', 'failed')),
  CONSTRAINT "demo_resets_finished_consistency" CHECK (("status" = 'running') = ("finished_at" IS NULL))
);
CREATE INDEX IF NOT EXISTS "demo_resets_started_idx" ON "demo_resets" ("started_at");
-- D1 (à confirmer) : la base refuse de supprimer une organisation qui n'est ni une démo,
-- ni une fixture jetable (slug commençant par « _ », convention des scripts de preuve).
CREATE OR REPLACE FUNCTION organizations_delete_guard() RETURNS trigger AS $$
BEGIN
  IF NOT OLD.is_demo AND OLD.slug NOT LIKE '\_%' THEN
    RAISE EXCEPTION 'organizations: seule une organisation de démo (ou une fixture « _… ») peut être supprimée (%, %)', OLD.id, OLD.slug
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS organizations_delete_guard ON "organizations";
CREATE TRIGGER organizations_delete_guard BEFORE DELETE ON "organizations" FOR EACH ROW EXECUTE FUNCTION organizations_delete_guard();
```

Rien n'est renommé ni supprimé ; les valeurs par défaut rendent les lignes
existantes valides sans remplissage. Appliquée EN LOCAL (§1.5) pour
construire et prouver ; **sur la base partagée, jamais sans accord (D2).**

---

## 5. Preuves

### 5.3 Sous-étape 3 — la réinitialisation depuis l'espace gestionnaire (2026-09-04)

`scripts/_tmp-demo-reset-ui.ts` (local, gitignoré ; refuse toute base
autre que `localhost:4444`), `next start` du build de production, session
forgée du super admin LOCAL, Chromium. **10 contrôles OK, 0 échec,
0 erreur navigateur.** Une trace à faire disparaître est d'abord ajoutée
(un contact « Trace à effacer », 45 contacts). Carte Démo : le formulaire
et son explication du périmètre sont là (« Tape « demo » pour confirmer »,
« Supprime l'organisation de démo … Rien d'autre n'est touché »). Mauvaise
confirmation (`pas-demo`) : le refus est dit à l'écran (« La confirmation
ne correspond pas »), rien n'est supprimé (45 contacts), **aucune ligne de
journal**. Bonne confirmation (`demo`) : « Démo réinitialisée en N s :
44 contacts recréés » ; l'organisation existe à nouveau avec le MÊME
identifiant fixe, slug `demo`, marquée démo ; la trace a disparu
(44 contacts, comme au semis) ; la persona est recréée avec son identifiant
fixe ; journal `kind=reset`, `status=done`, demandé par le super admin,
comptes avant (45 contacts) / après (44) ; « dernière opération :
réinitialisation, terminée » affichée. Durée du geste depuis l'écran :
32 s sur le proxy local (suppression + semis d'environ 1 200 lignes).
À blanc, le même chemin par le CLI (`scripts/demo.ts reset --confirm=demo`)
et, au moment de la migration (§5.1), la base qui refuse la suppression
d'une organisation réelle par `organizations_delete_guard`.

### 5.4 Sous-étapes 4 et 5 — la démo publique et le didacticiel, HTTP brut puis navigateur (2026-09-04)

`scripts/_tmp-demo-public-proof.ts` (local, gitignoré ; refuse toute base
autre que `localhost:4444`), `next start` du build de production sur la
base locale, deux volets. **47 contrôles OK, 0 échec, 0 erreur navigateur**
(quatrième passage — les trois premiers ont trouvé un bug produit et deux
faux échecs du harnais, ci-dessous).

- **HTTP brut, sans navigateur (30)** — l'interrupteur : éteint, `GET /demo`
  → 404 `noindex` ; allumé → 303 vers `/dashboard?visite=1` avec le cookie
  de visite `httpOnly` `SameSite=Lax`. Le visiteur : `/dashboard` 200 avec
  le bandeau et la persona Claire Vasseur ; `/settings`, `/profil`,
  `/contacts/import` → 303 `/dashboard?demo=lecture-seule` ; `/api/…` →
  403 ; fiche contact, `/taches`, `/veille` 200 — et **aucune écriture** :
  journal d'accès, tâches automatiques, collectes inchangés. Les écritures
  forgées : POST de formulaire → 303 vers la même page `?demo=lecture-seule`,
  action serveur forgée (`Next-Action`) → 200 + `x-action-redirect` (le
  client navigue), POST/DELETE `/api/…` → 403, cookie de visite + faux
  cookie Auth.js → toujours refusé, zéro contact créé. Les préchargements
  (régression, voir §1.4) : `/demo/quitter` préchargé → 204 sans
  `Set-Cookie`, `/login` préchargé (`Sec-Fetch-Mode: cors`) → cookie
  conservé, transition client → conservé, la visite vit toujours. Les
  sorties : `/login` en vraie navigation (`navigate`, par `node:http`) →
  cookie effacé, sans Fetch Metadata → effacé aussi, `/demo/quitter?vers=
  /inscription` → 303 cookie effacé, `vers=` extérieur ou `//…` → `/` ;
  interrupteur éteint → l'ancien cookie ne donne plus rien (→ `/login`).
- **Au navigateur, FR puis EN (17)** — Chromium 1280×900, `pageerror` et
  `console.error` comptés : `/demo` mène au tableau de bord de Vasseur
  Courtage avec le bandeau ; cinq secondes bandeau affiché, aucune requête
  vers `/demo/quitter`, `/login` ou `/inscription`, cookie toujours là ;
  visite guidée démarrée (« Étape 1 sur 8 ») ; ni menu « Nouveau », ni lien
  réglages dans la navigation, ni « Se déconnecter » ; liens « Créer mon
  compte » / « Quitter la démo » ; aucune clé brute ; « Suivant » mène aux
  partenaires, étape 2, cookie `clozado-visite = 1|en_cours` ; un clic
  d'écriture (« Marquer … comme faite » sur `/taches`) → retour sur la page
  avec la phrase « ce geste n'est pas disponible », rien d'écrit ;
  `/settings` renvoie au tableau de bord avec la phrase ; après « Quitter la
  démo », `/dashboard` renvoie à la connexion ; entrer dans `/login` par une
  vraie navigation termine la visite. Captures : bandeau + carte de visite
  sur le tableau de bord, notice de lecture seule sur `/taches`.
- **Ce que les passages 1 à 3 ont trouvé** : (1) le bug produit du
  préchargement (§1.4) — la preuve HTTP seule ne pouvait pas le voir, le
  navigateur l'a montré en deux lignes (`/taches` puis `/settings` →
  `/login`) ; (2) deux faux échecs du harnais : le bouton d'écriture de
  `/taches` est streamé après `load` (attendre le bouton, pas compter tout
  de suite) et le `fetch` de Node (undici) pose lui-même
  `sec-fetch-mode: cors` en ignorant l'en-tête fourni — une vraie
  navigation se simule par `node:http`.

### 5.2 Sous-étape 2 — au navigateur, build de production sur la base locale (2026-09-04)

`scripts/_tmp-demo-browser.ts` (local) : `next start` du build de
production, lancé avec le fichier d'environnement de la base locale (clé
Resend invalide), session forgée d'un super admin LOCAL (fixture de la base
Docker), Chromium 1280×900, FR puis EN, `pageerror` et `console.error`
comptés. Sur ce proxy local, un écran met 10 à 25 s : délais larges, jamais
`networkidle`. **68 contrôles OK en FR puis EN, 0 erreur navigateur** —
l'espace gestionnaire (liste avec le badge Démo, carte Démo : démo publique
fermée, bouton Ouvrir, réinitialisation en attente, dernière opération
« création, terminée »), « Travailler dans cette organisation » (bandeau
« Tu travailles dans : Vasseur Courtage », tuiles À faire 16 dont 4 en
retard / À relancer 3 / Sans suite 5 / À encaisser 3 100 €, en-tête
« 44 contacts · 17 affaires en cours · 6 partenaires actifs »), puis
contacts, fiche contact (étiquette, conseiller, interactions), affaires
(cinq étapes, montants), suivi (partage en attente, commission à
encaisser), tâches (du jour, en retard), partenaires (les six), newsletters
(quatre envoyées, un brouillon), newsletter envoyée (remis, ouverts, cliqués
ET « Démo : l'envoi est simulé »), règles (vague en attente (2) ET « la
vague sera simulée », les deux règles en phrases, « avant 9h00 »), journal
(motifs traduits), emails reçus (la demande en attente, proposition
préremplie dans les champs), veille (éléments résumés, AUCUNE collecte
lancée : runs inchangés), concurrents, chiffres, cibles, funnel, origines,
partenariats ; aucune clé brute, accolade, `MISSING_MESSAGE` ni `undefined`
sur aucun écran. Puis les gestes, depuis l'écran (24 contrôles) : « M'envoyer
un test » sur le brouillon → un message `kind=test` « sent » avec un
identifiant `demo:` ; « Envoyer les 2 emails » → les deux brouillons
« sent » avec `demo:` — zéro appel au fournisseur (clé invalide de toute
façon) ; le lien magique demandé pour la persona → la page « vérifie ta
boîte », rien ne part. Faux négatifs du harnais, corrigés en chemin : le
premier lien `/contacts/…` était l'import ; la proposition d'un email reçu
vit dans des champs préremplis, pas dans le texte ; un clic met ~20 s à
revenir sur ce serveur (attendre la base, pas un délai fixe).

### 5.1 Sous-étape 2 — à blanc, sur la base locale (2026-09-04)

`scripts/_tmp-demo-proof.ts` (local, gitignoré ; refuse toute base autre que
`localhost:4444`), sur un semis frais, avec `fetch` PIÉGÉ : tout appel vers
`api.resend.com` fait échouer la preuve, et la clé Resend du fichier
d'environnement local est invalide. **31 contrôles, tout OK** :

- marquage et identifiants (9) : organisation de démo à l'identifiant fixe,
  `is_demo` posé et démo publique fermée par défaut, `demoId` stable et de
  forme uuid v4, `isDemoOrganization` oui/non, adresses réservées
  (`.example`, `example.com`, `.invalid`) reconnues et une adresse
  ordinaire acceptée, `isSimulatedProviderId` ;
- la base refuse (3) : `is_demo = false` + `demo_public_enabled = true`
  (CHECK), une seconde organisation démo (index unique), la démo intacte
  après les deux refus ; et, au moment de la migration : suppression d'une
  organisation réelle refusée par `organizations_delete_guard`, fixture
  `_…` et organisation marquée démo supprimables ;
- le transport (6) : les deux brouillons de la vague existent ;
  `deliverMessages` d'un message de démo → `sent`, identifiant `demo:<id>`,
  zéro appel Resend ; un lot de deux aussi (le chemin `sendBatch`) ;
  `sendEmail` vers une adresse `.example` → `ResendError
  reserved_recipient` AVANT tout appel ; hors démo, un lot vers une
  adresse réservée est « rejeté » par la ceinture, zéro appel ;
- les crons (3) : la démo absente de `listStaleOrganizations` (veille
  périmée pourtant), de `listOrganizationsWithActiveRules` (deux règles
  actives pourtant), de `listResumableSends` (un envoi ouvert planté puis
  retiré) — la première version du filtre était tombée dans `claimSend`
  (même début de clause) : l'envoi à la demande y aurait été bloqué, la
  preuve l'a vu, corrigé ;
- les travaux à la visite (4) : `scheduleWatchRefresh(démo)` et
  `refreshWatchNow(démo)` → `status: "demo"` sans run créé, les deux runs
  du jeu restent seuls, `refreshOrganizationIndicators(démo)` → 0 ;
- les gestes de l'écran, simulés (3) : `sendTestEmail` → un message
  `kind=test` « sent » avec `demo:`, zéro appel ; `sendAutomaticWave` →
  les deux brouillons « sent » avec `demo:`, zéro appel ;
  `evaluateOrganizationRules` (manuel) → `done`, zéro appel — l'évaluation
  réelle a produit 16 brouillons de plus (les destinataires qui n'ont pas
  ouvert la newsletter de rentrée) : le moteur travaille sur le jeu comme
  sur un vrai cabinet ;
- la persona et l'isolation (3) : Claire Vasseur admin de la démo sur
  `.example`, aucune donnée d'une autre organisation dans la base locale,
  aucune adresse de contact hors domaine réservé.

Rejouer la preuve sur un état muté fait échouer quatre contrôles (vague
déjà partie, brouillons supplémentaires, test déjà présent) : c'est
l'état, pas le code — repartir d'un semis frais (`_tmp-local-reset.ts`,
outil local qui refuse toute autre base, puis `scripts/demo.ts create`).
Idempotence vérifiée : une seconde création refuse (`demo.deja_creee`,
journalisée `failed`) ; effacement local puis re-création → même
identifiant d'organisation, mêmes identifiants de lignes, mêmes comptes
(44 contacts, 26 affaires, 13 partages, 24 tâches, 64 interactions,
5 newsletters, 70 messages, 207 événements d'email, 3 emails reçus,
2 règles, 10 éléments de veille, 18 leads, 597 événements de visite),
en 17 à 27 s.

---

## 6. Avancement

- **Sous-étape 1 — inventaire et plan** (2026-09-04) : ce document. Les
  trois inventaires (données, i18n/UI, surface d'écriture serveur) ont été
  refaits — ceux du 03/09 étaient perdus avec les sessions. Base locale de
  preuve remontée (Docker), `DATABASE_HTTP_ENDPOINT` documentée. Décisions
  D1-D5 posées (§3.1). Suivant : sous-étape 2 sur la branche `demo`.
- **Sous-étape 2 — le jeu de données et les gardes** (2026-09-04, branche
  `demo`) : migration 0017 rédigée et rejouée EN LOCAL seulement ; Vasseur
  Courtage semé (≈ 1 200 lignes, identifiants fixes, idempotent) ; blocage
  au transport (point de passage, deux contournements, ceinture RFC 2606) ;
  crons et collectes qui ignorent la démo ; carte Démo de l'espace
  gestionnaire (création, interrupteur — éteint —, réinitialisation en
  attente d'accord). Preuves §5.1 (31 à blanc) et §5.2 (68 + 24 au
  navigateur). Les textes du jeu de données vivent dans `dataset.json` :
  les deux règles ESLint maison restent INTACTES (aucune exception ajoutée).
  Suivant : sous-étape 3 (réinitialisation, périmètre §1.7 validé), 4 et 5.
- **Sous-étapes 3, 4 et 5 — réinitialisation, démo publique, didacticiel**
  (2026-09-04, branche `demo`) : D3 et D4 validées par l'utilisateur le
  matin même. Réinitialisation (§1.7) : un seul ordre de suppression avec
  le prédicat `is_demo` évalué par la base, re-création à l'identique,
  slug retapé, journal avant/après ; carte Démo et CLI. Démo publique
  (§1.4) : `src/proxy.ts` (première couche, toute écriture refusée, chemins
  sensibles refusés même en lecture), session de visite (JWT à sel propre,
  revérifiée en base à chaque requête), `/demo` et `/demo/quitter`,
  `requireSessionUser` qui lit la visite en premier, coquille (bandeau,
  notice, liens de sortie), pages sensibles qui se défendent, travaux à la
  visite court-circuités. Didacticiel (§1.8) : huit étapes, cookie par
  navigateur, `TourCard`, reprise depuis le menu de compte et le bandeau,
  namespace `tour` FR/EN. Preuves §5.3 (réinitialisation depuis l'écran)
  et §5.4 (47 contrôles HTTP + navigateur FR/EN). Un bug produit trouvé et
  corrigé au navigateur (le préchargement `Link` de `/demo/quitter`, §1.4).
  Suivant : la clôture ordonnée par l'utilisateur — migration 0017 sur la
  base partagée, fusion `demo` → `main`, démo créée et ouverte depuis la
  production, preuve depuis la production (§5.6), scripts temporaires
  supprimés.
