# Module engagement — envoi réel, domaine d'expédition, suivi d'engagement, ingestion d'emails, règles de relance

Notes de chantier, même rôle que `docs/module-ciblage-contenu.md` et
`docs/module-marque-blanche-i18n.md`. Cahier des charges reçu le
2026-08-27 (« CHANTIER — SUIVI D'ENGAGEMENT, INGESTION D'EMAILS ET RÈGLES DE
RELANCE »), **tronqué à la réception** (§1). Ce document commence par
l'état des lieux (étape 0), purement factuel, puis les décisions
irréversibles à trancher sur la seule partie reçue (Partie 1, points 1 et
2). Rien n'est conçu pour les parties manquantes ; rien n'est construit.

État des lieux au commit `2ff41f8` (2026-08-27, `main`).

---

## 0. Ce qui existe — exploration

### 0.1 Le seul email qui part aujourd'hui : le lien de connexion

- `src/auth.ts` : fournisseur Nodemailer d'Auth.js sur `smtp.resend.com:465`
  (`RESEND_API_KEY`, `EMAIL_FROM` — `onboarding@resend.dev` à défaut),
  texte rendu par `renderMagicLinkEmail` dans la langue du destinataire
  (`localeOfUser`). C'est le SEUL envoi du produit.
- `src/lib/email/sender.ts` — `emailSender(org)` : le résolveur prévu par
  le chantier marque blanche pour « le premier email qui partira au nom
  d'une organisation ». From = « Nom d'expéditeur <adresse du produit> »
  et Reply-To = `sender_email` tant que le domaine n'est pas vérifié ;
  From = `sender_email` quand `email_domain_verified_at` est posé ET que
  l'adresse est sur ce domaine. **Jamais appelé par un envoi.** Le repli
  qu'il décrit (l'adresse du produit) n'est pas celui du cahier (un
  sous-domaine mutualisé) : à réécrire, pas à contourner.
- `src/lib/email/address.ts` : `isPlausibleEmail`, `formatMailbox`
  (anti-injection d'en-tête, guillemets RFC 5322), `bareAddress`.

### 0.2 « Marquer comme envoyée » : un fait déclaré, pas un envoi

- `newsletters.sent_at`, `sent_marked_by`, `audience_snapshot` ;
  `newsletter_recipients` figés par `markNewsletterSent`
  (`src/db/queries/newsletters.ts`) en UN ordre SQL (CTE modifiante +
  UPDATE) depuis `memberCondition(target)` ; `unmarkNewsletterSent`
  efface tout. Les membres SANS adresse email sont figés aussi (le critère
  `hasEmail` d'une cible est facultatif ; `countMembersByTarget` sait
  compter `without_email`).
- L'écran : `src/components/newsletter/send-status-card.tsx` — date
  d'envoi saisie, sujets traités, « L'envoi se fait depuis ton outil
  d'emailing. Une fois parti, marque-le ici… ». Toute la carte est à
  repenser : l'envoi réel devient le geste principal.
- Le rendu `renderNewsletterHtml` (`src/lib/newsletter/render-email.ts`) :
  en-tête (logo en adresse absolue via `requestOrigin()`), blocs,
  signature. **Ni pied de page, ni lien de désinscription, ni adresse
  postale, ni « pourquoi vous recevez cet email »** — décision du module
  d'origine (docs/module-mails.md §6.5 : le client les ajoutait lui-même
  dans HubSpot/Brevo à l'import). Ce chantier la renverse : « rien ne part
  sans ».
- `src/lib/request-origin.ts` lit `x-forwarded-host` : le produit n'a
  **aucune variable d'URL publique**. Un envoi repris par un cron, un
  webhook, un lien de désinscription composé hors requête n'ont pas
  d'origine — déjà noté « à décider » dans
  docs/module-marque-blanche-i18n.md §4 (`APP_URL`).

### 0.3 Les réglages : l'expéditeur a un écran, le domaine n'en a pas

- `/settings`, section « Expéditeur des emails » : `senderName` et
  `senderEmail` — libellé « Adresse de réponse », aide « Reçoit les
  réponses de tes contacts », phrase d'explication : « Les emails envoyés
  en ton nom partent depuis l'adresse du produit, avec ton nom
  d'expéditeur devant ; ton adresse reçoit les réponses. Elle deviendra
  l'expéditeur lui-même une fois ton domaine d'envoi vérifié. »
- `email_domain`, `email_domain_verified_at` (migration 0015) : **aucune
  interface, jamais écrites**. Aucun identifiant du domaine chez le
  fournisseur, aucun enregistrement DNS mémorisé, aucun statut par
  enregistrement — tout ce que le parcours guidé doit afficher est à
  stocker (§2.3).
- « Domaines autorisés » (`allowed_domains`) = les origines acceptées par
  `POST /api/events` (acquisition). Autre chose : à ne pas confondre à
  l'écran, où les deux notions voisineront.
- Réglages régionaux : `default_locale`, `currency`, `timezone`
  (`RegionalSettingsInput`). **Il n'existe aucune « configuration du
  marché » au sens juridique** : pas de pays, pas d'adresse postale, pas de
  mention légale (SIREN, ORIAS…) dans `organizations`. `market.ts`, ce
  sont les indicateurs de marché (BCE, INSEE) — sans rapport.

### 0.4 Les contacts : aucun consentement, aucune adresse supprimée

- `contacts.email` NULL-able, non unique par organisation ; aucune colonne
  désinscrit / rebond / plainte ; `grep consent|optin|bounce` sur le schéma :
  rien. La liste des champs de la fiche est **fermée** et justifiée
  (docs/module-relationnel.md §C) : toute donnée nouvelle sur une personne
  doit être argumentée — l'adresse IP et le navigateur d'une ouverture en
  sont (§2.3, minimisation).
- `activities` (appel, email en compte rendu, rendez-vous, note — saisis à
  la main) ; le journal unifié d'une fiche (`listContactJournal`,
  `src/db/queries/activities.ts`) fusionne À LA LECTURE ce que les autres
  tables savent. Les événements d'engagement (envoyé, ouvert, cliqué,
  rebondi, désinscrit) s'y fusionneront de la même façon — jamais des
  lignes dupliquées dans `activities`.
- Pierre tombale : un contact supprimé garde ses lignes de
  `newsletter_recipients` (le compte reste juste, l'identité est effacée).
  Messages et événements suivront la même règle.

### 0.5 Les règles existantes et l'infrastructure de fond

- `tasks.auto_rule` : `share_pending`, `deal_accepted_stale`,
  `commission_unpaid`, seuils par organisation (colonnes `*_days` de
  `organizations`). Le module Règles (Partie 3, non reçue) a ce socle.
- Cron : `vercel.json` → `/api/cron/veille`, 05:30 quotidien, `CRON_SECRET`
  en `Authorization: Bearer` (refus 503 sans la variable, 401 sans le bon
  secret), `maxDuration = 300` (plan Pro). `after()`
  (`src/lib/watch/schedule.ts`) exécute après la réponse, dans la durée de
  la route (doc Next.js `after.md` relue). Verrou d'exécution **garanti par
  la base** (`watch_runs`, index partiel unique sur les lignes ouvertes,
  migration 0014, lignes ouvertes depuis plus de cinq minutes closes au
  départ suivant) : le modèle exact d'un envoi qui ne doit jamais partir
  deux fois.
- Migrations SQL écrites à la main, rejouables (`IF NOT EXISTS`, blocs
  `DO`), `npm run db:migrate:http` sans transaction ; prochaine : `0016`.
- i18n : toute chaîne visible passe par `next-intl`
  (`src/messages/{fr,en}/*.json`), lint `local/no-visible-text` sur
  `src/**` sauf `src/lib/ai`. Une newsletter est dans la langue des
  contenus de l'organisation ; la langue d'un contact n'est pas connue :
  pied de page, en-têtes de désinscription et page de désinscription
  suivront la langue de l'organisation.
- Variables présentes en local : `DATABASE_URL`, `AUTH_SECRET`,
  `RESEND_API_KEY`, `EMAIL_FROM`, `ANTHROPIC_API_KEY` ; `CRON_SECRET` sur
  Vercel seulement.

### 0.6 Ce que Resend permet (documentation lue le 2026-08-27)

- **Domaines** : `POST /domains` (`name`, `region` — `us-east-1` par
  défaut, `eu-west-1` disponible —, `custom_return_path` — `send` par
  défaut —, `open_tracking`, `click_tracking`, `tracking_subdomain`,
  `capabilities` sending/receiving) → `id`, `status`, `records[]`
  (`record`, `name`, `type` MX/TXT/CNAME, `ttl`, `status`, `value`,
  `priority`). Dans l'exemple de la doc : MX + TXT SPF sur
  `send.<domaine>` (le Return-Path), TXT DKIM `resend._domainkey`, CNAME
  du sous-domaine de suivi. `POST /domains/{id}/verify` (asynchrone) ;
  `GET /domains/{id}` rend le statut **par enregistrement** (`not_started`,
  `pending`, `verified`, `failed`, `temporary_failure`) — c'est ce qui
  permet de dire précisément ce qui manque, jamais un échec muet ;
  `domain.updated` en webhook. Resend recommande un SOUS-domaine d'envoi
  (réputation isolée). **DMARC** : recommandé par Resend, mais pas renvoyé
  comme enregistrement — le parcours guidé le proposera lui-même
  (`_dmarc.<domaine>` TXT) et le vérifiera lui-même par une requête DNS
  depuis la fonction (`node:dns`). Le produit affichera toujours ce que
  l'API renvoie, jamais une liste d'enregistrements écrite dans le code.
- **Envoi** : `POST /emails` et `POST /emails/batch` (100 emails par
  requête ; `from`, `to`, `reply_to`, `headers`, `tags`, `html`, `text` ;
  pas de pièces jointes en lot) ; en-tête `Idempotency-Key` (24 h, 256
  caractères) → une reprise d'envoi ne duplique jamais ; 10 requêtes par
  seconde et par équipe, 429 avec `retry-after` ; quotas journaliers et
  mensuels selon le plan (`daily_quota_exceeded`, `monthly_quota_exceeded`).
- **Webhooks** : `email.sent`, `delivered`, `delivery_delayed`, `bounced`,
  `complained`, `opened`, `clicked`, `failed`, `suppressed` ; `domain.*` ;
  signés Svix (`svix-id`, `svix-timestamp`, `svix-signature`, HMAC-SHA256
  de `id.timestamp.corps`) — vérifiables par le SDK `resend`, par `svix`,
  ou à la main avec `node:crypto`.
- **Suivi** : ouverture et clic s'activent PAR DOMAINE (pixel et
  réécriture des liens par Resend ; sous-domaine de suivi facultatif,
  sinon un domaine de Resend dans les liens).
- **Réception** (pour information, Partie 2) : un domaine peut recevoir
  (MX), `email.received` en webhook, contenu complet par
  `GET /emails/receiving/{id}`.

---

## 1. Le cahier tel qu'il est arrivé — tronqué

Reçu : le contexte (premier client pilote payant, ses apporteurs
d'affaires), le protocole d'ambiguïté, la définition de STOP, le modèle
d'envoi (un seul compte Resend mutualisé, chaque organisation sous sa
propre identité), la Partie 1 point 1 (envoi réel : domaine vérifié DKIM /
SPF / DMARC, expéditeur par organisation, désinscription fonctionnelle,
pied de page conforme composé depuis la configuration du marché — rien ne
part sans) et le point 2 (parcours guidé du domaine : enregistrements DNS
avec bouton copier, instructions par hébergeur, vérification automatique
qui dit ce qui manque ; repli immédiat sur un sous-domaine mutualisé avec
le nom d'expéditeur du client, bascule sans rien casser ; Reply-To
toujours vers l'adresse réelle de l'utilisateur) — **jusqu'au tiret qui
suit ce dernier point, puis plus rien**.

Manquent : la fin du point 2, le point 3 et les suivants (le suivi
d'engagement : ouverture, clic, ce qu'on en montre et où), la **Partie 2**
(ingestion d'emails — c'est là que se décide le périmètre OAuth), la
**Partie 3** (règles de relance), le plan d'étapes et les STOP. Rien
n'est conçu pour ces parties : à recevoir d'abord.

---

## 2. Les décisions à trancher sur la partie reçue (Partie 1, points 1 et 2)

Les irréversibles d'abord (schéma, dépendance externe, format de
stockage) ; les réversibles sont notées avec la décision que je prendrai
sauf avis contraire.

### 2.1 Le sous-domaine mutualisé de la plateforme — dépendance externe, DNS à poser par toi

- **Quel domaine ?** Le produit n'en connaît aucun (pas d'`APP_URL` ; les
  commentaires citent `app.clozado.fr` et `clozado.app` en exemples).
  Recommandation : un sous-domaine réservé au repli, du type
  `mail.<domaine du produit>`, région **`eu-west-1`** (données et
  Return-Path en Europe), enregistrements DNS posés par toi ; créé chez
  Resend par l'API avec la clé existante (je te rends les enregistrements
  à poser) ou par le tableau de bord. Son nom en variable d'environnement
  (`EMAIL_SHARED_DOMAIN`), jamais dans le code.
- **Le compte Resend** : quel plan (les quotas journalier et mensuel
  bornent ce qu'un client pilote peut envoyer) ; le domaine du lien de
  connexion est-il déjà vérifié (`EMAIL_FROM` réel, ou encore
  `onboarding@resend.dev`) ; le suivi ouverture/clic à activer sur ce
  sous-domaine (à confirmer avec le point 3 du cahier).
- L'adresse d'expédition sur le sous-domaine (réversible) :
  `<slug de l'organisation>@mail.…` — une adresse par organisation,
  stable et unique (le slug l'est déjà), le nom d'expéditeur du client
  devant. Je pars là-dessus.

### 2.2 Le Reply-To — laquelle est « l'adresse réelle de l'utilisateur » ?

Deux lectures : `sender_email` de l'ORGANISATION (déjà libellée « Adresse
de réponse » à l'écran, une boîte partagée du type `contact@cabinet.fr`),
ou l'adresse de la PERSONNE qui envoie (`users.email`, « sa messagerie
habituelle »). Recommandation : **la personne qui clique « Envoyer »** ;
`sender_email` devient alors l'adresse d'EXPÉDITION (le From une fois le
domaine vérifié) et l'écran des réglages change de libellé. Si un cabinet
veut ses réponses dans une boîte partagée, un réglage par organisation
s'ajoutera le jour où un client le demande. Réversible, mais je te le
demande parce que l'écran actuel dit autre chose.

### 2.3 Le schéma — irréversible, projet de migration `0016` (à ton accord)

Rien n'est renommé ni supprimé.

- `organizations` : `email_domain_provider_id text` (l'id chez Resend),
  `email_domain_status text` (le statut global rendu par l'API),
  `email_domain_records jsonb` (les enregistrements TELS QUE RENVOYÉS, avec
  leur statut, rafraîchis à chaque vérification — jamais recomposés par le
  code), `email_domain_checked_at timestamptz` (la dernière vérification).
  `email_domain_verified_at` reste LE fait qui compte pour l'expéditeur.
  Plus les colonnes du pied de page (§2.4).
- `newsletter_sends` (nouvelle) — l'ENVOI comme travail de fond : une
  ligne par lancement (`newsletter_id`, `organization_id`, `started_at`,
  `finished_at`, `error`, `queued`, `sent`, `failed` en compteurs,
  `started_by`), index partiel unique « une seule ligne ouverte par
  newsletter » (le verrou de `watch_runs`). `newsletters.sent_at` reste
  le moment où l'audience est figée ; s'y ajoute `send_mode text`
  (`declared` — le geste actuel, gardé pour un envoi fait ailleurs — ou
  `sent`).
- `email_messages` (nouvelle) — UNE ligne par destinataire et par envoi :
  `id` (sert d'`Idempotency-Key`), `organization_id`, `newsletter_id`
  (NULL-able : les emails de relance de la Partie 3 en auront besoin sans
  newsletter), `contact_id`, `to_email` (l'adresse au moment de l'envoi —
  une fiche change, un envoi non), `provider_message_id` (l'id Resend,
  unique), `status` (`queued`, `sent`, `delivered`, `delayed`, `bounced`,
  `complained`, `failed`), `sent_at`, `delivered_at`, `first_opened_at`,
  `open_count`, `first_clicked_at`, `click_count`, `bounced_at`,
  `failure_reason`. FK composites vers newsletter et contact (isolation par
  construction, comme partout).
- `email_events` (nouvelle) — le journal brut des webhooks : `message_id`,
  `type`, `occurred_at`, `url` (pour un clic), `provider_event_id` (le
  `svix-id`, unique : un webhook rejoué est ignoré), `payload jsonb`.
  **Minimisation** : ni adresse IP ni navigateur (docs/module-relationnel.md
  §C — rien sur une personne qui ne serve un usage décidé) ; recommandation
  à valider, parce que Resend les fournit et que les retirer est un choix.
- `email_suppressions` (nouvelle) — les adresses auxquelles on n'écrit plus,
  PAR ORGANISATION : `(organization_id, email)` clé primaire, `reason`
  (`unsubscribed`, `bounced`, `complained`), `source` (`link`, `webhook`,
  `manual`), `message_id` (l'email d'où vient le geste, NULL-able),
  `created_at`. Une adresse désinscrite du cabinet A reçoit toujours le
  cabinet B : chaque organisation est un expéditeur distinct. La sélection
  des destinataires exclut la table ; la fiche contact dit « désinscrit le… ».
- Le jeton de désinscription (format de stockage) : recommandation
  **l'`id` du message** (`/desinscription/<id>` — un uuid non devinable,
  aucun secret, aucune table, et « désinscrit depuis quel email » gratuit),
  plutôt qu'un jeton signé HMAC stateless (qui survivrait à la suppression
  du message — inutile : un message ne se supprime pas).

### 2.4 « Pied de page conforme composé depuis la configuration du marché » — elle n'existe pas

Aucune donnée en base ne permet de composer un pied de page conforme
aujourd'hui (§0.3). Qu'appelles-tu « configuration du marché » ? Deux
hypothèses :

- **(a) le marché = le pays** de l'organisation, rattaché aux réglages
  régionaux : `organizations.country` (ISO 3166-1, non demandé jusqu'ici),
  `postal_address text`, `legal_mention text` (SIREN, ORIAS, RCS — texte
  libre : on ne connaît pas toutes les professions) ; le pied de page est
  composé dans le code depuis un PROFIL PAR PAYS (des données, comme les
  packs métier : France / UE — identification de l'expéditeur, lien de
  désinscription, adresse postale ; Suisse — identification et
  désinscription ; Canada — adresse postale et désinscription honorée sous
  dix jours ; défaut — le profil européen), avec la phrase « Vous recevez
  cet email parce que vous êtes en contact avec {organisation} » dans la
  langue de l'organisation. Les profils sont à valider par toi : je ne
  fais pas de droit, je les écris pour qu'on les relise.
- **(b) autre chose que tu as en tête** (un objet « marché » plus large :
  profession, autorité de tutelle, textes obligatoires…) — dis-le-moi
  avant que je pose des colonnes.

Dans les deux cas : `List-Unsubscribe` + `List-Unsubscribe-Post`
(désinscription en un clic, exigée par Gmail et Yahoo pour les expéditeurs
en volume) en en-tête, le lien dans le pied de page, une page publique
`/desinscription/[id]` (hors du groupe `(app)`, comme `/partage/[token]`)
qui confirme en un geste — dans la langue de l'organisation.

### 2.5 Les dépendances npm — dépendance externe au sens du protocole

`resend` (le SDK, qui inclut la vérification Svix des webhooks) ou **zéro
dépendance** (`fetch` sur cinq points d'API, HMAC-SHA256 avec
`node:crypto`). Recommandation : zéro dépendance — la surface utilisée est
petite, le projet a toujours préféré ça (pas de `sharp`, pas de stockage
externe), et le lien de connexion garde son transport SMTP existant. Le
secret de signature des webhooks (`RESEND_WEBHOOK_SECRET`) est à créer par
toi dans le tableau de bord Resend, vers `/api/webhooks/resend` — à
confirmer avec le point 3 du cahier.

### 2.6 `APP_URL` — réversible, je le ferai sauf avis contraire

Une variable d'environnement pour les adresses absolues composées hors
requête (envoi repris par le cron, webhook, lien de désinscription, logo) ;
`requestOrigin()` reste la source quand il y a une requête. Sans elle, un
envoi repris par le cron composerait des liens vers `localhost`.

### 2.7 Le mécanisme d'envoi — réversible, mais il dicte le schéma ci-dessus

« Envoyer » (action serveur) : (1) fige l'audience — l'existant, inchangé ;
(2) crée les `email_messages` en `queued` pour les destinataires qui ont
une adresse et ne sont pas supprimés (les autres restent dans
`newsletter_recipients`, le compte reste juste, l'écran dit « n sans
adresse, m désinscrits ») ; (3) `after()` envoie par lots de 100 avec
`Idempotency-Key = id du message`, pose `sent` et l'id Resend ; (4) un
envoi coupé (fonction arrêtée, 429, panne) est repris par
`/api/cron/envois` — un cron fréquent est possible sur le plan Pro — ou
par un bouton « Reprendre ». Ordre de grandeur : 5 000 contacts = 50
requêtes, quelques secondes, dans les 300 s de la route. Un envoi de test
(« m'envoyer cette newsletter ») paraît indispensable au pilote : est-il
dans la partie manquante du cahier ?

---

## 3. Le plan — à écrire quand le cahier sera complet

Provisoire, pour la seule partie reçue : **étape 1** = tes réponses au
§2 et le reste du cahier → la conception écrite ici (les parties 2 et 3,
le suivi d'engagement) et la migration `0016` montrée avant application.
STOP. Les étapes suivantes (envoi réel + sous-domaine mutualisé, parcours
guidé du domaine, suivi d'engagement, ingestion, règles) découleront du
plan du cahier.

## Avancement

- **Étape 0 — état des lieux** (2026-08-27) : ce document, §§0-2. Cahier
  reçu tronqué ; décisions demandées ; rien de construit, aucune migration.
  STOP.
