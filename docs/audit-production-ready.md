# Audit du SaaS et chantier « production-ready »

Commandé le 2026-09-07 : « audit du SaaS + mode translation + faire
progresser de manière professionnelle, scalable, commercialisable ».
Audit réalisé le 2026-09-09 sur `main` = `9dbc9ad` (démo terminée,
18 migrations appliquées, déploiement de production sain).

Ce document est la **sous-étape 1** du chantier : l'audit lui-même, puis
le plan des sous-étapes suivantes et les décisions à prendre (§7). Rien
n'a été modifié dans le produit : ce commit n'ajoute que ce document.

---

## 0. La méthode

Tout ce qui suit est **vu dans le code ou mesuré**, jamais supposé. Quand
un point n'a pas pu être vérifié (pas d'accès au compte Vercel ni au
compte Neon, par consigne), c'est écrit.

Ce qui a été fait, dans l'ordre :

1. **Contrôles mécaniques** depuis le Codespace : `eslint` sur tout le
   dépôt, `npm run build` complet (typecheck inclus), `npm audit`,
   `npm outdated`, recherche de secrets et de fichiers `.env` dans tout
   l'historique git, poids des objets git.
2. **Sondes HTTP en lecture seule sur la production**
   (`clozado.vercel.app`) : en-têtes de sécurité, `robots.txt`,
   `sitemap.xml`, comportement sans session, crons et webhooks sans
   secret, préchargement de `/demo`, `/.env`.
3. **Réglages GitHub** lisibles sans droit d'administration
   (`gh api`) : visibilité du dépôt, protection de branche, Dependabot,
   état des déploiements.
4. **Quatre relectures ciblées du code**, chacune avec preuves
   `chemin:ligne` : (a) sécurité et isolation entre organisations,
   (b) modèle de données, performance, scalabilité, (c) qualité du code,
   outillage, cycle de livraison, (d) maturité produit et aptitude à la
   commercialisation. Les relectures ont couvert les 25 fichiers de
   `src/db/queries`, les 17 modules d'actions, les 17 route handlers, les
   38 fichiers de schéma, les 18 migrations SQL, `src/lib/**`, les pages,
   les messages FR/EN et les 11 documents de `docs/`.
5. **Recoupement** : chaque constat de gravité Critique ou Élevée cité
   ci-dessous a été relu une seconde fois dans le fichier concerné avant
   d'être retenu.

Échelle de gravité : **Critique** (met en danger les données ou le
service dès aujourd'hui), **Élevée** (exploitable ou bloquant pour
vendre), **Moyenne** (à corriger avant la montée en charge), **Faible**
(hygiène).

---

## 1. Synthèse

### 1.1 Le verdict par axe

| Axe | Verdict | En une phrase |
|---|---|---|
| Isolation entre organisations | **Solide** | Garde-fou unique en code (`orgScope`), doublé par 60 clés étrangères composites en base ; une seule écriture inter-organisations trouvée (S1), par affectation de masse. |
| Sécurité applicative | **Correcte, deux trous** | Webhooks, jetons, crons, collecte publique et prompts IA sont bien défendus ; mais une XSS stockée (S2) et des liens `javascript:` (S3) passent, et aucun en-tête de sécurité n'est posé (S4). |
| Modèle de données | **Solide** | 58 tables, 0 dérive schéma/migrations, montants en `numeric`, 100 % des dates avec fuseau, verrous et reprises conçus en base. |
| Tenue en charge | **Insuffisante au-delà de quelques dizaines d'organisations** | 11-12 requêtes SQL dans le layout de chaque page, un tableau non borné calculé à chaque page, 17 requêtes qui n'utilisent pas leurs index, cron unique quotidien sans rotation. |
| Cycle de livraison | **Artisanal** | 0 test, 0 CI, base unique dev + prod migrée depuis un poste sans transaction, Next.js 16.3.1 avec une RCE critique publiée, dépôt GitHub **public**. |
| Exploitation | **Aveugle** | Un seul `console.error` dans tout `src`, aucun suivi d'erreurs, aucune rétention, variables d'environnement lues à l'appel. |
| Produit | **Riche et cohérent** | 8 modules, FR/EN à parité (3 093 clés), états vides partout, didacticiel, démo publique, conformité email au-dessus de la moyenne. |
| Commercialisation | **Impossible en l'état** | Ni pages légales, ni acceptation des CGU, ni facturation, ni quotas par client, ni invitation de membres (un espace = une personne). |

### 1.2 Les douze constats qui comptent

Par ordre de traitement recommandé, pas seulement de gravité.

| # | Gravité | Constat | Effort |
|---|---|---|---|
| 1 | Critique | **Dépôt GitHub public** (`visibility: public`) : tout le code, les journaux de chantier avec le nom d'un client, six adresses Gmail personnelles dans les scripts et les docs. Action de l'utilisateur, pas de code. | 5 min |
| 2 | Critique | **Next.js 16.3.1** : deux RCE non authentifiées publiées (GHSA-2xp9-vwfh-vxw4, GHSA-p293-qw3h-jr36), correctif 16.3.4 ; 10 vulnérabilités en production dont 7 élevées. | 1 h |
| 3 | Élevée | **Affectation de masse** sur `createPartner`/`updatePartner` : un membre peut écrire un partenaire dans une autre organisation (S1). | 2 h |
| 4 | Élevée | **XSS stockée** par la police de l'organisation, exécutée chez tous les membres et chez le super admin en substitution (S2) ; liens `javascript:` dans les blocs (S3) ; aucun en-tête de sécurité (S4). | 1 j |
| 5 | Critique | **Une seule base pour le développement et la production**, migrations manuelles non transactionnelles, non réversibles, aucune procédure de restauration écrite (D1). | 1-2 j + réglages Neon/Vercel |
| 6 | Critique | **0 test, 0 CI** ; le build Vercel est le seul contrôle (Q1). | 2-3 j |
| 7 | Élevée | `global-error.tsx` **ne peut pas se rendre** (Q5) ; trois routes API contournent `requireUser` et une renvoie les messages internes du fournisseur IA (Q6) ; une condition de règle illisible vaut « tous les contacts » (Q7). | 1 j |
| 8 | Élevée | **Aucune observabilité** : 1 `console.error`, 57 `catch` muets, 0 suivi d'erreurs (Q4/D11). | 1 j |
| 9 | Élevée | **Layout à 11-12 requêtes**, tableau de suivi non borné à chaque page, 17 requêtes hors index, N+1 dans les vagues de relance, cron sans rotation (D3-D6, D8). | 3-4 j |
| 10 | Bloquant | **Pages légales, acceptation, DPA, consentement** absents (P2, P5, P6). | 2-3 j |
| 11 | Bloquant | **Membres et invitations** : un espace = un utilisateur (P3) ; suppression de compte et d'organisation inexistantes (P4). | 3-4 j |
| 12 | Bloquant | **Monétisation** : ni plan, ni quota par client, ni facturation ; le compteur « envoyés aujourd'hui » est le quota Resend global partagé entre tous les clients (P1). | 4-6 j (hors Stripe) |

Un « mode translation » a été demandé sans précision : trois lectures
possibles sont détaillées en §6, avec une recommandation.

---

## 2. Ce qui est solide (à garder tel quel)

1. **Isolation en code ET en base.** `orgScope`/`assertOrgAccess`
   (`src/db/scope.ts:23-51`) sur chaque lecture par identifiant
   (`contacts.ts:80-85`, `deals.ts:38-43`, `mail-targets.ts:187-192`,
   `rules.ts:103-108`, `inbound.ts:235-240`, `watch.ts:416-421`) ;
   60 clés étrangères composites `(id, organization_id)`
   (`schema/deals.ts:112-116`, `schema/deal-shares.ts:90-105`,
   `schema/contacts.ts:104-113`, `schema/email-messages.ts:113-135`) ;
   contrainte `users_role_organization_consistency`
   (`schema/users.ts:38-42`) ; `scripts/test-isolation.ts` (31 contrôles,
   y compris le refus par la base, l. 213-260) à jour.
2. **Schéma sans dérive.** 58 tables dans `schema/*` = 58 `CREATE TABLE`
   dans les migrations ; `drizzle-kit generate` sur une copie répond « No
   schema changes ». Montants en `numeric(12,2)`, 0 `timestamp` sans
   fuseau, 32 `CHECK`, 88 index explicites, 2 déclencheurs de sûreté
   (`organizations_delete_guard`, `email_suppressions_keep_unsubscribed`).
   Migrations idempotentes depuis 0013.
3. **Verrous et reprises conçus en base.** Index uniques partiels « une
   seule exécution ouverte » (`watch_runs`, `rule_runs`,
   `newsletter_sends`, `tasks`), bail d'envoi pris par
   `UPDATE … RETURNING` (`email-sends.ts:117-131`), `db.batch` ×22 là où
   l'atomicité compte (`signup.ts:100-106`, `deals.ts:109-138`,
   `contacts.ts:417-458`), envoi figé en une seule CTE
   (`email-sends.ts:55-91`), `Idempotency-Key` sur chaque appel Resend.
4. **Entrées publiques cadrées.** Jeton de partage à 256 bits haché
   (`lib/deal-shares/token.ts:17-24`) ; webhooks Svix HMAC en temps
   constant avec rejeu neutralisé (`lib/email/webhooks.ts:16-32`,
   `email-events.ts:33-38`) ; Calendly signé, clé chiffrée AES-256-GCM
   (`lib/crypto.ts:14-39`) ; ingestion d'emails avec DKIM/SPF calculés
   depuis le brut (`inbound/authenticate.ts`) ; crons fermés sans secret
   (503) ; `/api/events` et `/api/leads` en zod strict, corps bornés,
   origine vérifiée ; sorties du modèle IA revalidées par zod, sources en
   liste blanche.
5. **Authentification sobre.** Inscription atomique (organisation +
   admin + pipeline + clé de site), 37 slugs réservés, messages neutres
   contre l'énumération, rôle et organisation relus en base à chaque
   requête (`auth.ts:66-79`), cookie de substitution lu seulement pour un
   super admin (`lib/session.ts:76-86`).
6. **Conformité email au-dessus de la moyenne.** Profils de pied de page
   par pays (EU, CH, GB, CA, US), adresse postale obligatoire,
   `List-Unsubscribe` + One-Click (`deliver.ts:34-37`), route RFC 8058 qui
   ne désinscrit jamais sur GET, désinscription irréversible par
   déclencheur, ni IP ni navigateur stockés sur les événements.
7. **RGPD sur la fiche contact.** Journal des accès, export JSON
   journalisé, suppression par pierre tombale avec destruction des
   notes/activités/tâches et purge des `payload`/`visitor_id`, notes et
   date de naissance jamais transmises au modèle.
8. **i18n complète et typée.** 29 namespaces, 3 093 clés FR = 3 093 EN,
   0 manquante ; clés vérifiées à la compilation ; langue par personne
   puis par organisation ; devise et fuseau par organisation ; deux règles
   ESLint maison qui interdisent toute chaîne visible en dur et tout
   namespace non sérialisé côté client.
9. **Qualité de code mesurée.** `tsc --noEmit` 0 erreur, eslint 0, 0
   `any`, 0 `@ts-ignore`, 30 `eslint-disable` tous motivés, `AppError`
   traduit partout, 15 `error.tsx` / 21 `loading.tsx` / 6 `not-found.tsx`,
   échecs métier tracés en base (`rule_runs.error`, `watch_runs.error`,
   `newsletter_sends.error`…), formatage centralisé (`createFormats` sur
   122 sites), aucune dépendance inutilisée, aucun import lourd côté
   client.
10. **Produit.** 8 modules, 8/8 écrans échantillonnés avec état vide,
    didacticiel en 8 étapes, démo publique en lecture seule imposée par le
    proxy, marque blanche de l'espace de travail (couleurs dérivées avec
    contraste WCAG vérifié, logos, favicon, domaine d'expédition),
    analytique calculée en SQL, crons avec budget de temps et lots.
11. **Historique git propre.** Aucun `.env*` committé sauf
    `.env.example`, aucun motif de secret dans `git log -p --all`, aucun
    gros fichier hors `package-lock.json`.

---

## 3. Constats de sécurité (S)

### S1 — Élevée — Affectation de masse sur les partenaires

`src/db/queries/partners.ts:37` :
`.values({ organizationId: user.organizationId, ...input })` et `:53`
`.set({ ...input, updatedAt })`. `input` est l'argument brut des actions
serveur `createPartnerAction(input)` / `updatePartnerAction(id, input)`
(`src/lib/deals/actions.ts:42-53`). Le type TypeScript n'existe pas à
l'exécution : une clé `organizationId` ou `id` envoyée par le client
entre dans l'écriture, et le spread vient **après** `organizationId`,
donc l'écrase. L'UUID d'une autre organisation n'est pas secret : il
figure dans chaque email envoyé (`/brand/<uuid>/logo_light`,
`queries/newsletters.ts:183-187`).

Scénario : un membre de A appelle l'action avec
`{ name, email, organizationId: "<uuid de B>" }` ; le partenaire
apparaît chez B, qui partage une affaire avec lui.

Correction : construire explicitement l'objet écrit
(`{ name, company, profession, email, phone, notes }`) après un
`z.strictObject`. Faire de même par principe pour `createDeal`,
`updateDealDetails`, `createDealShare` (aujourd'hui recopiés champ par
champ, `deals.ts:110-122`, `deal-shares.ts:71-82`, ce qui les protège
sans que rien ne l'impose). Ajouter le cas à `scripts/test-isolation.ts`.

### S2 — Élevée — XSS stockée par la police de l'organisation

`src/app/(app)/settings/page.tsx:96` : `fontFamily: String(formData.get("fontFamily") ?? "").trim() || null`, sans validation.
`src/lib/newsletter/render-email.ts:263-265` compose `bodyFont` avec
cette valeur, puis `:150` l'interpole **sans échappement** dans un
attribut `style` (idem `:145, 171-173, 194-195, 203, 222, 227, 290`). Ce
HTML est posé par `innerHTML` dans un shadow root
(`components/newsletter/editor/shadow-html.tsx:28`) chez toute personne
qui ouvre l'éditeur, et part tel quel dans les emails.

Scénario : un admin d'organisation enregistre la police
`Arial;"><img src=x onerror="…">`. Le super admin qui travaille « dans »
cette organisation exécute le script avec **sa** session : il peut alors
appeler `setActiveOrganizationAction` vers n'importe quelle organisation,
`setDemoPublicAction`, `resetDemoAction`. C'est une escalade admin
d'organisation → super admin global. Sans CSP (S4), rien ne freine.

Correction : (a) valider `fontFamily` par une expression stricte
(`/^[A-Za-z0-9 ,'"\-]{1,80}$/`) ou une liste fermée ; (b) dans
`resolveBrand`, passer toutes les valeurs de marque par `escapeHtml` et
les couleurs par `normalizeHex` (`secondary_color`, `ink_color`,
`background_color`, `heading_font_family` sont interpolées de la même
façon, sans écran aujourd'hui) ; (c) aperçu dans un `<iframe sandbox>`
ou, à défaut, une CSP `script-src` sans `unsafe-inline` sur les pages
internes.

### S3 — Moyenne — Liens `javascript:` acceptés

`src/lib/newsletter/blocks.ts:111-122` : `url: z.string()` sans
contrainte de schéma ; `render-email.ts:203` `href="${escapeHtml(url)}"`
(l'échappement ne neutralise pas le schéma) ; l'éditeur ne bloque pas le
clic (`newsletter-editor.tsx:234-236`). Même chose pour `sourceUrl` des
chiffres (`queries/market.ts:248-262`, rendu `chiffres/page.tsx:245-247`).

Correction : un raffinement zod `safeHttpUrl` (`http:`, `https:`,
`mailto:` via `new URL`) sur `cta.url`, `bouton.url`, `sourceItem.url`,
`sourceUrl` ; `preventDefault` sur les clics dans `ShadowHtml`.

### S4 — Moyenne — Aucun en-tête de sécurité HTTP

`next.config.ts` sans `headers()`, `src/proxy.ts` n'agit que sur la
démo, `vercel.json` ne porte que les crons. Sonde sur la production :
seul `strict-transport-security` est présent (posé par Vercel). Ni
`Content-Security-Policy`, ni `X-Frame-Options`/`frame-ancestors`, ni
`X-Content-Type-Options`, ni `Referrer-Policy`, ni `Permissions-Policy`
(exceptions locales : `nosniff` sur `/brand`, `Referrer-Policy` sur
`/api/partage`).

Scénario : clickjacking de `/partage/<jeton>` (un partenaire « accepte »
une commission derrière une iframe invisible).

Correction : `headers()` global dans `next.config.ts`
(`frame-ancestors 'none'`, `nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`,
HSTS explicite) ; une CSP complète avec nonce est un chantier à part
(next-intl, styles inline de la marque).

### S5 — Moyenne — Débit non partagé, endpoints coûteux sans limite

`src/lib/rate-limit.ts:7-20` : `Map` par instance serverless (documenté
honnêtement). Aucune limite sur `POST /api/newsletters/ai/design`
(`route.ts:41-177`, un appel Anthropic streamé de 8 192 jetons par
requête) ni `/api/newsletters/render`. L'inscription crée organisation,
admin, pipeline et clé de site **avant** toute preuve de possession de
l'email (`signup.ts:100-106`) ; aucun nettoyage des organisations jamais
activées.

Correction : compteur en base (`rate_limits(key, window_start, count)`,
`INSERT … ON CONFLICT DO UPDATE … RETURNING`) ; quota IA par
utilisateur et par jour ; purge des organisations sans `email_verified`
après 7 jours ; Turnstile sur `/inscription`.

### S6 — Moyenne — SSRF depuis la veille

`src/lib/watch/actions.ts:122-131, 359-368` → `discoverFeed`
(`feeds.ts:202-230`) → `fetchWithTimeout` (`http.ts:43-55`) avec
`redirect: "follow"` et sans contrôle d'adresse ; `canonicalUrl` ne borne
que le schéma (`url.ts:24`). Les flux sont relus par le cron et à la
visite. Un membre peut faire sonder `10.0.0.5:8080` ou
`169.254.169.254` par la fonction Vercel et lire des fragments de
réponse comme « titres de flux ».

Correction : résoudre l'hôte avant chaque `fetch` et refuser loopback,
lien-local, RFC 1918, ULA ; ports 80/443 ; `redirect: "manual"`, 3 sauts
maximum.

### S7 — Faible — Injection de formule CSV

`src/lib/csv.ts:31-37` n'échappe que guillemets et séparateurs ; les
exports portent des libellés saisis (`lib/metrics/export.ts:113-120,
210`) et `origin_raw` reçu de `/api/leads`. Préfixer par `'` toute
cellule commençant par `=`, `+`, `-`, `@`, tabulation.

### S8 — Faible — Clé de débit = premier `x-forwarded-for`

`auth/actions.ts:22-27`, `api/events:48-50`, `api/leads:58-60`,
`api/partage:26-34`, `api/unsubscribe:7-9`. Sur Vercel l'en-tête est
posé par la plateforme ; derrière un autre proxy il devient forgeable.
Lire `x-real-ip` d'abord, puis le **dernier** élément.

### S9 — Faible — Validation d'entrée hétérogène

4 actions serveur sur 153 passent par zod ; ~149 lisent
`String(formData.get())` sans longueur ni forme : email d'un contact non
vérifié à la création (`contacts.ts:190-259`, seul l'import vérifie),
`deals.estimatedAmount` brut (un montant « abc » fait échouer l'ordre SQL
et tombe sur `error.tsx`, `affaires/page.tsx:146-158`), `birthDate`
brut, notes non bornées. Un schéma zod par action avec `.max()` et
`z.coerce.number()`, un `readForm(formData, schema)` partagé.

### S10 — Faible — Sessions longues, super admin sans second facteur

`auth.ts:19` : `strategy: "jwt"` sans `maxAge` (30 jours), aucune
révocation ; cookie de substitution valable un an
(`lib/admin/actions.ts:28-35`) ; un seul facteur pour un compte qui voit
toutes les organisations. `maxAge` 7 jours, `updateAge` 1 heure,
`sessionVersion` en base pour le super admin, passkey à terme.

### S11 — Faible — Désinscription en un clic sans lecture du corps RFC 8058

`api/unsubscribe/[id]/route.ts:19-28` accepte tout `POST` portant un
UUID ; exiger `List-Unsubscribe=One-Click` pour la source `one_click`.

### S12 — Info — Vérifié sans anomalie

Quatre requêtes prennent un identifiant sans garde propre
(`getLatestSend`, `listTestMessages`, `getCampaignStats`,
`countSentNewslettersForTarget`) mais tous leurs appelants ont vérifié
l'organisation avant : à commenter comme `getMessageById` l'est
(`email-sends.ts:342`). Un `member` peut envoyer une newsletter à tous
les contacts (`sendNewsletterAction` sans garde `admin`) : choix produit
à confirmer, pas un bug.

---

## 4. Constats de données, performance, scalabilité (D)

### D1 — Critique — Une seule base pour le développement et la production

`src/db/index.ts:9-12` (« la base partagée par le dev et la
production »), `scripts/db-migrate.ts:10-12` (« pas de transaction
autour d'une migration sur neon-http — un échec au milieu laisse un
état partiel »). `drizzle.config.ts:13`, `scripts/perf-dataset.ts:15-16`,
`db:studio`, `db:seed-*` lisent la même `DATABASE_URL` : un
`perf-dataset create` (5 000 contacts) ou un seed tourne sur la base des
clients. 18 migrations, 7 avec `DROP` (0001, 0003, 0005, 0007, 0009, 0011,
0013), 0 migration inverse. Aucune mention de sauvegarde, PITR ou
restauration dans le code ni dans `docs/`. Le harnais Docker local
(`docs/module-demo.md §1.5`, `DATABASE_HTTP_ENDPOINT`) existe déjà :
c'est la brique manquante d'une préproduction.

Correction : une branche Neon `preprod` (ou une seconde base) avec sa
propre `DATABASE_URL` posée dans Vercel pour l'environnement Preview ;
migrations de production appliquées par une étape dédiée (jamais depuis
un `.env.local` par défaut : `db-migrate.ts` refuse sans
`--target=production` explicite) ; migrations en « expand/contract »
(jamais de `DROP` dans le même déploiement que le code qui cesse
d'utiliser la colonne) ; rétention PITR vérifiée sur le compte Neon et
procédure de restauration écrite dans un runbook.

### D2 — Élevée — L'envoi d'une newsletter vit dans `after()` sans `maxDuration`

`src/lib/email/send-newsletter.ts:117-119` (`after(() => runSend())`),
déclenché par `newsletter/actions.ts:257` ; aucune page `newsletters/*`
n'exporte `maxDuration` (seuls `/veille` 180, `/concurrents` 240,
`/chiffres` 60, les crons 300). `runSend` s'auto-limite à 240 s puis
relâche le bail ; la reprise vient du cron quotidien de 06:00 UTC ou d'un
clic. Avec Fluid Compute (300 s par défaut) : ≈ 40 000 messages par
passage ; sans Fluid (10 s) : ≈ 1 500 messages puis « stalled » jusqu'au
lendemain. Le réglage Fluid du projet n'est pas vérifiable d'ici.

Correction : `export const maxDuration = 300` sur la page hôte (ou une
route dédiée) ; auto-réenchaînement par une requête HTTP interne en fin
de passage tant qu'il reste des messages.

### D3 — Élevée — 17 requêtes filtrent par l'identifiant enfant seul : index inutilisables

Les index sont préfixés par `organization_id` (bien), mais ces requêtes
ne le portent pas dans le `WHERE`, et Postgres n'a pas de skip-scan :
`contacts.ts:113` (`activities.contact_id`), `:362`, `:378`
(`contact_access_log`), `:383` (`tasks.contact_id`), `:385`
(`leads.contact_id`), `:123/:457/:505` (`contacts.company_id`, **aucun
index**), `deals.ts:268`, `:398` (`deal_stage_changes.deal_id`),
`deal-shares.ts:128` (`deal_shares.deal_id`, **aucun index**), `:166`,
`deal-follow-up.ts:121-129`, `deal-shares-public.ts:139-143`,
`email-sends.ts:103`, `:245-264`, `:323-339`
(`email_messages.newsletter_id`), `send-newsletter.ts:57` et
`newsletter/actions.ts:154, 132-136` (`newsletter_blocks.newsletter_id`,
**aucun index**, PK seule), `pipelines.ts:86, 138`.

Conséquence : chaque fiche contact parcourt `activities`, `tasks`,
`leads`, `contact_access_log` séquentiellement ; chaque ouverture ou
sauvegarde de newsletter parcourt `email_messages` et
`newsletter_blocks`. Invisible à 5 000 contacts, mesurable dès quelques
centaines de milliers de lignes toutes organisations confondues.

Correction : ajouter `eq(X.organizationId, …)` (déjà connu par
l'appelant, coût nul) ; 5 index : `newsletter_blocks(newsletter_id,
position)`, `deal_shares(deal_id)`, `contacts(company_id)`,
`commissions(deal_id)`, `users(organization_id)` ;
`email_messages(newsletter_id, kind, status)`.

### D4 — Élevée — 11-12 requêtes SQL dans le layout de chaque page, sans mémoïsation

`src/app/(app)/layout.tsx:52-81` : `requireSessionUser`, `requireUser`,
`getWorkspace`, `getUserLocaleChoice`, `getFollowUpBoard` (3-4 requêtes),
`countTasksDueNow` (2) ; `getTranslations` → `resolveRequestSettings`
(`i18n/locale.ts:23-39`) ajoute `localeOfUser` + `settingsOfOrganization`.
`dashboard/page.tsx:176` **recalcule `getFollowUpBoard`** déjà calculé par
le layout (`:80`) ; `generateAutoTasks` relit organisation, réglages et
fuseau (`tasks.ts:485-492`) ; `settingsOfOrganization`,
`timeZoneOfOrganization`, `getOwnOrganization` ne sont jamais `cache()`és
(5 `cache()` dans tout `src`) ; `auth()` est appelé 4-5 fois par rendu
et son callback `jwt` fait un `users.findFirst` (`auth.ts:66-79`).
Comptage à la lecture (non mesuré) : `/dashboard` ≈ 46-50 requêtes,
`/newsletters/[id]` ≈ 30-35, `/analytique/funnel` ≈ 24-25, `/affaires`
≈ 18-20, `/contacts` ≈ 14-15. Chaque requête neon-http est un
aller-retour HTTPS sans pool (`src/db/index.ts:18`). Sonde : `/` répond
en 2,45 s (sans cache, `private, no-store`).

Correction : `cache()` de React sur `requireSessionUser`,
`getOwnOrganization`, `settingsOfOrganization`, `getFollowUpBoard` ; ne
pas relancer dans la page ce que le layout a calculé ; listes de
référence (pipelines, étapes, types, motifs, conseillers, origines)
derrière `unstable_cache`/`use cache` avec un tag invalidé par les
actions de réglage.

### D5 — Élevée — Cron des envois : un passage quotidien de 250 s sans rotation

`api/cron/envois/route.ts:43-62` : envois à reprendre, puis
`listOrganizationsWithActiveRules()` (`rules.ts:302-309`, `distinct`
sans `ORDER BY` ni `LIMIT`) ; `RULE_MATCH_LIMIT = 200` contacts par règle
traités séquentiellement avec 2-4 requêtes et éventuellement un appel
Resend chacun (`evaluate.ts:224-258`). À 500 organisations, les mêmes
passent chaque jour et les autres jamais ; un envoi à reprendre de
plusieurs milliers de messages consomme le budget des règles.

Correction : `ORDER BY dernière évaluation NULLS FIRST LIMIT n` (comme
`listStaleOrganizations` le fait déjà pour la veille,
`watch.ts:820-839`) ; budget par organisation ; scinder envois et
règles ; auto-réenchaînement (D2).

### D6 — Élevée — Lectures non bornées, dont une dans le layout

`getFollowUpBoard` charge **tous** les partages de l'organisation
(`deal-follow-up.ts:98-113`), tous les événements des partages acceptés
(`:121-129`), toutes les commissions confirmées (`:180-199`), trie en
JavaScript, et tourne dans le layout de **chaque** page. `listDealsBoard`
(kanban, vue par défaut) sans limite (`deals.ts:286-307`) ;
`importContacts` charge tous les contacts vivants, colonnes complètes
(`contacts.ts:650-653`) ; `listNewsletters`, `listDealShares`,
`getVisibleOrganizations` sans limite. 76 des 150 `select` n'ont ni
`limit` ni agrégat (≈ 55 sur des tables de référence, ≈ 15 sur des tables
de volume).

Correction : follow-up en SQL (statuts filtrés, `max(created_at)` par
`LATERAL`, seuils calculés en base) et un simple `count` pour le badge ;
kanban borné par colonne ; import par tranches de 500 emails
(`WHERE lower(email) = ANY($1)`).

### D7 — Moyenne — Recherche de contacts en `ILIKE '%…%'` avec `OFFSET`

`contacts.ts:40-50, 70-73` ; 0 `pg_trgm`/`tsvector`/GIN dans les
migrations. `pg_trgm` + index GIN sur `name`, `email`, `company_name`,
colonne générée `phone_digits`, pagination par curseur `(name, id)`.

### D8 — Moyenne — N+1 dans les boucles d'exécution

`rules/wave.ts:50-95` : 5 requêtes + 1 appel Resend par brouillon,
jusqu'à 200 ; `rules/evaluate.ts:97-128` ; `acquisition.ts:469-470` :
`matchOrigin` (un `SELECT`) **par événement** du traceur public (20 par
requête, 600 requêtes/min par site = 12 000 `SELECT`/min). Charger
suppressions, compteurs et origines en `IN (...)` avant la boucle ;
`sendBatch` par 100 (déjà écrit pour les newsletters).

### D9 — Moyenne — Séquences multi-écritures non atomiques

`createPipeline` (`pipelines.ts:46-59`) ; `completeTask`
(`tasks.ts:422-441`) ; `saveNewsletter` (`newsletter/actions.ts:64-138`) ;
reprise d'import dédoublonnée par email seul (`contacts.ts:679-691`) ;
0 `db.transaction` (impossible en HTTP, documenté). `db.batch` pour les
trois premiers ; `import_batch_id`/`line` pour l'import.

### D10 — Moyenne — Appels externes sans délai d'attente

`lib/email/resend.ts:40-49, 219` (`fetch` sans `signal`),
`lib/calendly/api.ts:20`, `lib/ai/anthropic.ts:45` (défauts du SDK :
10 min, 2 essais). Seule la veille utilise `AbortSignal.timeout`.
`AbortSignal.timeout(15_000)` dans les deux clients ;
`new Anthropic({ timeout: 90_000, maxRetries: 1 })` ; `TimeoutError`
traité comme `unavailable` (pause) plutôt qu'échec définitif.

### D11 — Moyenne — Aucune rétention

`acquisition_events`, `email_events`, `rule_actions`, `watch_runs`,
`rule_runs`, `inbound_rejections`, `demo_resets`, et `contact_access_log`
écrit à chaque **lecture** de fiche (`contacts.ts:325-346`). Rétention
(90 jours pour les événements bruts après agrégation, 13 mois pour le
journal d'accès) exécutée dans un cron existant (Hobby : 2 crons
maximum).

### D12 — Moyenne — Variables d'environnement lues à l'appel

14 variables, 1 seule validée au chargement (`DATABASE_URL`,
`src/db/index.ts:5-7`) ; les autres lèvent à l'usage
(`email/config.ts:12-16`, `demo/session.ts:31-36`, `ai/index.ts:17-20`)
ou répondent 503. `src/auth.ts:29` évalue `productSender().from` à
l'import : sans `EMAIL_FROM`, tout écran authentifié plante au
chargement du module. `.env.example:11-12` propose encore
`onboarding@resend.dev`, interdit par `config.ts:8` ;
`ANTHROPIC_WATCH_MODEL` (lue) y manque. Un `src/env.ts` (zod) importé par
`instrumentation.ts`.

### D13 — Faible — Logos en `bytea` servis par une route dynamique

`organization-assets.ts:11-26`, `brand/[organizationId]/[kind]/route.ts:16-27`
(`max-age=300` sans `?v`). Décision documentée « Blob au-delà de quelques
centaines d'organisations ». Servir avec `?v=<updated_at>` et un
`max-age` long.

### D14 — Faible — Rendu intégralement dynamique

Build : 55 routes, **toutes** dynamiques (ƒ), y compris `/`, `/login`,
`/inscription` ; 0 `use cache`/`unstable_cache`/`cacheLife` ; 72
`revalidatePath` sur des routes dynamiques (effet quasi nul) ; `Suspense`
sur le tableau de bord (bon). Cohérent pour un SaaS connecté ; voir D4
pour ce qui mérite d'être amorti.

### D15 — Faible — Petites incohérences de schéma

`deals.probability numeric(5,2)` vs `deal_statuses.probability integer` ;
`users.organization_id`, `accounts.user_id`, `contacts.email` sans index
(`findDuplicateCandidates` en `lower(email) =`, `contacts.ts:173-187`).

### D16 — Faible — Plan Hobby

2 crons = maximum du plan ; `maxDuration` 300/240/180/60 exigent Fluid
Compute (non vérifiable) ; heures de cron dérivant jusqu'à une heure
(constaté au chantier engagement). Bundle client 1 951 Ko de JS non
compressé toutes routes, plus gros chunk 469 Ko ; 0 `next/image`.

---

## 5. Constats de qualité, livraison, exploitation (Q)

### Q1 — Critique — Aucun test automatisé, aucune intégration continue

`package.json` : ni `test`, ni `typecheck` ; aucun `*.test.ts` ; pas de
`.github/` ; `scripts/test-isolation.ts` tourne contre la base de
`.env.local` (la base partagée) et n'est branché à rien. Le README
l'assume : « c'est le build Vercel qui valide ». Le build vérifie le
typage, pas le comportement. 101 commits du 19/08 au 07/09, 14 fichiers
par commit en moyenne (max 209), au moins 4 commits de réparation de
déploiement (`4bfe87c`, `ea24943`, `4a5d7c8`, `83cec40`).

Correction (détaillée en §7, étape 3) : Vitest sur la logique pure
(65 des 117 fichiers de `src/lib` n'importent ni Next, ni DB, ni React),
test d'isolation en CI sur base jetable Docker, smoke Playwright, workflow
`lint + tsc + test + build + audit` sur PR et `main`.

### Q2 — Critique — Dépôt GitHub public et dépendances vulnérables

`gh api repos/pichonniermax-create/clozado` : `"private": false,
"visibility": "public"`, `security_and_analysis: null`, pas de
`.github/dependabot.yml`. Dans les fichiers suivis : six adresses Gmail
personnelles (`scripts/seed-demo.ts:17, 22`, docs), le nom d'un client
réel dans `docs/module-mails.md` (21 occurrences), les sous-domaines
d'envoi et d'ingestion (`docs/dns-dkim.txt`, clés DKIM publiques
seulement), et tout le code d'un produit à vendre. L'historique ne
contient aucun secret (vérifié).

`npm audit --omit=dev` : 10 vulnérabilités (1 critique, 7 élevées,
2 modérées). `next 16.3.1` figé sans caret : deux RCE non authentifiées
(GHSA-2xp9-vwfh-vxw4 optimisation d'images AVIF, GHSA-p293-qw3h-jr36),
correctif `16.3.4` (le projet n'importe pas `next/image`, mais
`/_next/image` répond). `nodemailer 8.0.11` : 2 élevées + 3 modérées,
corrigées en ≥ 9.1.0, mais `@auth/core` et `next-auth` déclarent le pair
`^7.0.7 || ^8.0.5` (le transport SMTP ne sert qu'au lien magique ; le
produit passe par l'API HTTP de Resend). `next-auth 5.0.0-beta.32` : beta
en production, aucune v5 stable publiée. `fast-uri` (4 élevées, SSRF),
`js-yaml`, `sharp`, `qs`, `hono` : `npm audit fix` disponible.
`@types/node` ^20 alors que Node est en 24 ; pas d'`engines` ni `.nvmrc` ;
`shadcn` (CLI) en dépendance de production ; `playwright` installé en
`extraneous`.

### Q3 — Élevée — `global-error.tsx` ne peut pas se rendre

`src/app/global-error.tsx:4, 13` : `useTranslations("shell.globalError")`
dans un fichier qui **remplace** la mise en page racine, seule à poser
`NextIntlClientProvider` (`layout.tsx:51`). Sans contexte, `useTranslations`
lève : le dernier filet tombe lui-même et l'utilisateur voit la page
technique brute de Next. `lang="fr"` y est figé. Textes en dur bilingues
dans ce seul fichier avec un `eslint-disable` motivé.

### Q4 — Élevée — Aucune journalisation ni suivi d'erreurs

Un seul `console.error` dans `src` (`api/webhooks/resend/route.ts:49`) ;
0 Sentry/pino/OpenTelemetry/`instrumentation.ts` ; aucun `route.ts` n'a
de `try/catch` global ; 57 `catch` muets et 19 `.catch(() => null)` ; un
cron qui échoue avant d'ouvrir un run (`cron/envois/route.ts:42`,
`cron/veille/route.ts:32`) ne laisse aucune trace en base ; les
`error.tsx` n'envoient rien. Une 500 en production n'est visible que dans
les journaux Vercel, que personne ne lit depuis le Codespace (règle
consignée). Cinq `catch` masquent une cause : `contacts.ts:759-763`
(import interrompu, avec **deux phrases françaises en dur** dans une
affectation, invisibles pour la règle ESLint donc non traduites),
`inbound/signature.ts:70` (panne IA silencieuse), `targets/actions.ts:187`,
`watch/feeds.ts:207`, `veille/page.tsx:118`.

Correction : `src/lib/log.ts` (JSON structuré, corrélé par organisation
et requête), `withRoute()` qui enveloppe chaque handler (`statusOf`
existe déjà, `errors.ts:40-42`), `instrumentation.ts` + `onRequestError`
(Next 16), un suivi d'erreurs (décision D4 en §7), `reportError` dans les
`error.tsx`.

### Q5 — Élevée — Trois routes API contournent `requireUser`

`api/newsletters/ai/design/route.ts:43-60`,
`api/newsletters/render/route.ts:35-51`,
`api/contacts/[id]/export/route.ts:14-18` reconstruisent `OrgScopeUser`
depuis `auth()` sans lire le cookie de substitution : le super admin qui
travaille « dans » une organisation obtient un comportement différent
selon l'écran. `export/route.ts:30-32` : `catch → 404 fiche_introuvable`
masque une panne Postgres. `ai/design/route.ts:155-162` renvoie
`err.message` brut au navigateur pour toute erreur (SDK Anthropic
inclus). Un `requireApiUser()` (même logique, 401 au lieu de `redirect`),
`catch` par type, seules `AppError` et `AITruncatedError` exposent leur
message.

### Q6 — Élevée — Une condition illisible vaut « tous les contacts »

`src/lib/rules/criteria.ts:68-71` : `parseRuleConditions` renvoie `{}`
sur JSON invalide, et `{}` = « tous les contacts vivants » (`:57`) ; le
commentaire assume la tolérance « (affichage, évaluation) ». Même motif
`targets/criteria.ts:89-92`. Ces conditions pilotent l'envoi automatique
(`rules/evaluate.ts`, `wave.ts`) : une colonne corrompue élargit
silencieusement une règle d'envoi à toute la base. Deux lecteurs :
tolérant pour l'affichage, strict pour l'évaluation (règle sautée avec
`rule_runs.error`). Premier test unitaire à écrire.

### Q7 — Élevée — Deux styles d'actions serveur, aucun lecteur de formulaire

17 modules `src/lib/*/actions.ts` **et** 27 actions `"use server"` inline
(`settings/page.tsx` ×11, `dashboard/page.tsx` ×5 déclarées dans un `if`,
`affaires/[id]` ×3, `app-header.tsx` ×2, `newsletters/page.tsx:69` dans le
JSX…). 157 `formData.get(`, 140 coercions `String(… ?? "")` recopiées ;
zod jamais appliqué à un `FormData` ; 0 `useFormStatus` (pas d'état
d'attente sur les formulaires serveur). Règle ESLint locale
(`"use server"` seulement dans `src/lib/**/actions.ts`), `readForm(formData,
schema)`, `SubmitButton` avec `useFormStatus`.

### Q8 — Moyenne — Fichiers de 700 à 930 lignes

`db/queries/watch.ts` 929 (58 exports, logique pure mêlée), `rules.ts`
889, `contacts.ts` 839 (`mergeContacts` 158 l., `importContacts` 142 l.),
`newsletter-editor.tsx` 805 (un composant de 518 l.), `settings/page.tsx`
726 (8 cartes, 11 actions), `mail-targets.ts` 723, `veille/page.tsx` 679,
`ai/anthropic.ts` 628.

### Q9 — Moyenne — Couplage inversé

27 des 29 fichiers de `db/queries` importent `@/lib/*` ; `scope.ts:3`
importe un type de `@/lib/session` ; les quatre calculs analytiques
(`metrics/funnel.ts`, `partners.ts`, `losses.ts`, `durations.ts`) sont du
SQL couplé à `db` : commissions, funnel et délais ne sont testables
qu'avec une base. Extraire les décisions pures (`chainSteps`
`funnel.ts:59-67`, priorité des statuts `partners.ts:115-119`, bornes
d'âge `:164-167`).

### Q10 — Moyenne — Trois implémentations de l'origine absolue

`lib/request-origin.ts:12-17`, `lib/email/config.ts:55-69`,
`demo/quitter/route.ts:16` ; `request-origin.ts:5-6` affirme « le produit
n'a pas de variable d'URL publique » alors qu'`APP_URL` existe. Une seule
`publicOrigin()`.

### Q11 — Moyenne — Configuration et scripts

`next.config.ts` vide ; `tsconfig.json` inclut `scripts/` dans le build
Vercel (deux déploiements cassés pour cette raison) ; `db:seed-demo`,
`db:seed-newsletter-demo`, `db:seed-prm-demo` obsolètes (remplacés par
`src/lib/demo/seed.ts`), avec adresses réelles, toujours en `npm run`.
`tsconfig.scripts.json` séparé, retrait des trois seeds, `engines` +
`.nvmrc` + `@types/node@24`.

### Q12 — Moyenne — Nommage à trois registres, 500 clés opaques

Routes en français, modules en anglais, clés de messages en français
translittéré à suffixe hexadécimal (500 sur 3 093, ex.
`"acces_refuse_cette_donnee_n_appartient_pas_044a"`) sans script de
dérivation committé. Cohérent par convention orale, non écrit. Table
route ↔ module ↔ namespace dans une doc d'architecture ; nouvelles clés
en `module.intention`.

### Q13 — Moyenne — Documentation

README de 27 lignes ; `docs/` = 11 journaux de chantier (8 224 lignes)
organisés par étape, pas par sujet ; `module-mails.md` périmé (cite
`src/emails/`, inexistant) ; 0 procédure de sauvegarde, restauration,
rotation de secret (`AUTH_SECRET` invalide toutes les sessions **et** les
jetons chiffrés par `crypto.ts`), mise en production ; la procédure de
migration est dispersée dans quatre documents. Quatre documents courts :
`architecture.md`, `runbook.md`, `release.md`, `decisions/`.

### Q14 — Moyenne — Accessibilité

0 `aria-describedby`, 0 `aria-invalid` hors `ui/`, 0 `aria-sort`, 0
skip-link ; `Field` sans créneau d'erreur (erreurs en `<p role="alert">`
global) ; tableau des affaires avec `<th>` sans `scope` et tri sans
`aria-sort` ; kanban `draggable` sans alternative clavier
(`kanban-board.tsx:150-162`). Bons points : liens réels dans les lignes,
`aria-label` sur filtres et étapes, `role="status"`, contraste des jetons
≥ 5,1:1, `<html lang>` dynamique.

### Q15 — Faible — Poids client

57 fichiers `"use client"` (6 481 lignes) ; 0 `next/dynamic` (l'éditeur
de 805 lignes est importé statiquement) ; `import-wizard.tsx` et
`brand-logo-uploader.tsx` rendent des tableaux purs côté client.

### Q16 — Faible — Divers

`requireUser` accepte tout UUID de cookie actif pour un super admin sans
vérifier l'existence de l'organisation (`session.ts:78-83`) ; 62
`revalidatePath` avec chemins littéraux, 0 constante de route ; `shadcn`
en `dependencies` pour une feuille de style (`globals.css:3`).

---

## 6. Constats produit et commercialisation (P)

### P1 — Bloquant — Aucune monétisation, aucun quota par client

Aucune dépendance de facturation ; `organizations` sans `plan`,
`trial_ends_at`, identifiant client ; le compteur « envoyés aujourd'hui »
(`send-status-card.tsx:256`, `email-sends.ts:353`) est le quota du compte
Resend **commun** : `deliver.ts:49-50` et `send-newsletter.ts:134-136`
mettent l'envoi en pause pour tout le monde quand il est saturé (voisin
bruyant). Rien ne borne contacts, envois, générations IA ou membres par
organisation.

Minimum pour un premier client : `organizations.plan` + `trial_ends_at` +
limites en données ; gardes dans `createContact`, `deliver`,
`sendNewsletter`, `designNewsletter` ; carte « Abonnement » dans
`/settings` ; facturation manuelle pour le pilote, Stripe Checkout +
webhook ensuite (dépendance externe : décision D6).

### P2 — Bloquant — Aucune page légale ni acceptation contractuelle

Pas de `/cgu`, `/cgv`, `/confidentialite`, `/mentions-legales`, `/dpa` ;
`sign-up-form.tsx:23-72` ne demande aucune acceptation ; `users` sans
`terms_accepted_at`. Le produit est sous-traitant RGPD (contacts des
clients, ouvertures, clics) : sans DPA un cabinet ne peut pas
contractuellement l'utiliser ; sans mentions légales, non-conformité
LCEN. Quatre pages FR/EN, case d'acceptation + `terms_accepted_at`/
`terms_version`, liens en pied de `AuthShell` et du menu de compte, DPA
avec la liste des sous-traitants (Vercel, Neon, Resend, Anthropic).

### P3 — Bloquant — Un espace = un seul utilisateur

`insert(users)` n'existe que dans `signup.ts:102` ; `auth.ts:56-63` refuse
toute adresse absente de la base ; aucune carte « Membres » ; le rôle
`member` et les écrans « Réservé à l'admin » existent mais sont
inatteignables ; ni invitation, ni changement de rôle, ni retrait, ni
transfert. Table `invitations`, carte Membres, email d'invitation
(`productSender()` existe), acceptation par lien magique, garde « dernier
admin ».

### P4 — Élevée — Ni suppression de compte/organisation, ni export global

Le déclencheur `organizations_delete_guard` (0017) refuse toute
suppression non-démo ; aucune action ne supprime un `users` ; exports
seulement par contact et CSV analytiques. « Supprimer mon espace » (slug
retapé), `deleted_at` + délai de grâce 30 jours + purge, export ZIP.

### P5 — Élevée — Base légale de la prospection non modélisée

`contacts` ne porte que l'**arrêt** (`auto_send_stopped_at/reason`),
jamais l'**accord** ; l'opt-in de `rules` est celui de l'admin ; le pied de
page affirme « parce que vous êtes en contact avec … » (intérêt légitime
implicite). Pour des particuliers, la prospection électronique exige un
consentement préalable (L.34-5 CPCE). `contacts.marketing_consent`
(`unknown|opt_in|opt_out|legitimate_interest`) + source + date, colonne à
l'import, filtre des destinataires et de `rules/evaluate`, badge sur la
fiche.

### P6 — Élevée — `s.js` pose un identifiant d'un an sans consentement

`src/app/s.js/route.ts:24-26` : `localStorage` + cookie `clozado_vid`
d'un an, CORS `*`. Dans l'application elle-même : 4 cookies techniques
exemptés (pas de bandeau nécessaire). Un attribut `data-consent="required"`
qui n'écrit rien avant `window.clozado.consent(true)`, ou un mode sans
identifiant ; page d'aide intégrateur.

### P7 — Élevée — Accueil minimal, sans SEO, sans lien vers la démo

`src/app/page.tsx` : un titre, une phrase, trois arguments PRM, deux
boutons ; `layout.tsx:21-35` : `title` + `description` (« Suite d'outils
d'assistance marketing multi-clients. ») ; aucun `openGraph`, `robots.ts`,
`sitemap.ts`, `opengraph-image`, `manifest` (sondes : `/robots.txt` et
`/sitemap.xml` → 404) ; `/demo` n'est lié nulle part. Sections modules,
« Voir la démo » (en `<a>`, règle du chantier démo), tarifs, FAQ,
`openGraph`, `robots.ts` (disallow `/api`, `/partage`, `/desinscription`,
`/demo`, `/brand`), `sitemap.ts`.

### P8 — Élevée — Marque blanche incomplète pour un revendeur

« Clozado » reste sur l'inscription (`fr/auth.json:47`), l'erreur de
connexion, le lien magique (`magic-link.ts:10-12`), le repli
`<slug>@mail.clozado.fr` (`sender.ts:44-47`), l'email de test, le titre de
la désinscription ; `custom_domain` = schéma seulement
(`organizations.ts:90-92`) ; `PRODUCT_NAME` constante (`lib/brand.ts:11`).
Niveau 1 (un déploiement par revendeur) : nom, couleur, logo, favicon par
variables d'environnement ; niveau 2 : résolution de `custom_domain` dans
`proxy.ts`, pages publiques aux couleurs de l'organisation résolue.

### P9 — Élevée — Plan Vercel Hobby

Deux crons quotidiens = maximum ; reprise d'un envoi interrompu « le
lendemain » ; aucune purge ni réinitialisation nocturne possible. Plan
Pro avant le premier client payant (décision D3), coût à intégrer au prix.

### P10 — Moyenne — Espace super admin rudimentaire, substitution non journalisée

Liste des organisations + carte Démo (`dashboard/page.tsx:60-174`),
`getVisibleOrganizations` sans pagination ni compteurs ; aucune
statistique d'usage ni santé produit ; `setActiveOrganizationAction`
n'écrit dans aucune table d'audit (point de friction pour un DPA).
`/admin` (organisation, plan, membres, contacts, envois 30 j, dernier
accès), page santé, `admin_audit_log`.

### P11 — Moyenne — Emails transactionnels : deux seulement

Lien de connexion et notification « règle → propriétaire », plus l'email
de test. Ni bienvenue, ni invitation, ni alerte « domaine en échec » /
« envoi en pause » ; le partage PRM n'envoie rien (lien copié à la main).

### P12 — Moyenne — Ni aide, ni support, ni statut, ni changelog

`navigation.ts:50-89` : aucune entrée. Entrée « Aide & contact », page
`/nouveautes`, statut externe.

### P13 — Moyenne — Inscription toujours en français

Aucune lecture d'`Accept-Language` (`i18n/locale.ts:29`) ; le pipeline est
semé en `DEFAULT_LOCALE` (`signup.ts:94-95`) ; `defaultLocale` de
l'organisation vaut `fr`. Négociation de langue sur les écrans publics,
sélecteur sur `/inscription`, langue passée à
`createOrganizationWithAdmin`.

### P14 — Moyenne — Profil sans nom ni changement d'email

`users.name` jamais renseigné (`signup.ts:102`) : le menu affiche « Mon
compte » et l'initiale de l'email ; tâches et journal attribuent « à
qui » par ce nom.

### P15 — Moyenne — Registre : tutoiement systématique

223 occurrences de tutoiement contre 16 vouvoiements réservés aux
surfaces vues par des tiers (pied d'email, désinscription, vitrine) :
cohérent, mais un choix de positionnement face à des cabinets de gestion
de patrimoine (décision D8). En anglais, neutre.

### P16 — Faible — Reliquats consignés par les chantiers

`/newsletters/*` sans `loading`/`error` propres ; seuils PRM non
réglables ; composeur plafonné pour le visiteur de la démo (D5 du
chantier démo) ; domaine dédié à la démo ; réinitialisation nocturne ;
retouche composer `{lien_rdv}` / `cta_presets` ; Calendly fermé ;
`vercel.json` définitif ; import CSV = personnes physiques ; analytique
« à refaire sur données réelles » ; glossaire EN tenu à la main ; pas de
thème sombre.

### Les cinq atouts à mettre en avant

1. Le PRM : partage d'affaires par lien sans compte, commissions fixées à
   l'envoi, trois piles d'action.
2. La chaîne d'engagement : envoi réel avec domaine vérifié, suivi par
   webhooks, désinscription RFC 8058, règles de relance avec garde-fous.
3. Le composer IA branché sur l'identité éditoriale, la veille et les
   chiffres vérifiés, bloc Sources en liste blanche, revue continue.
4. L'analytique funnel reliée à l'acquisition (`s.js`, `/api/leads`,
   packs métier, exports CSV).
5. Marque blanche + FR/EN + démo publique en lecture seule.

---

## 7. « Mode translation » : trois lectures possibles

La commande dit « mode translation » sans plus. En partant de ce qui
existe (next-intl, langue par personne et par organisation,
`translateStrings` déjà écrit au chantier mails, profils de pied de page
CH et CA), trois interprétations tiennent :

**A. Une troisième langue d'interface** (DE, ES, NL, IT…). Chemin
balisé : un dossier `src/messages/<code>/` (29 fichiers, 3 093 clés), une
entrée dans `LOADERS` (`i18n/messages.ts:8-11`), `LOCALES` et
`INTL_LOCALES` (`locales.ts:16, 26`) ; devises et fuseaux suivent par
`Intl` ; à étendre : `COUNTRIES` de la carte légale, la langue du semis
(P13). Traduction par IA puis relecture native (l'analyseur ICU vérifie
la forme, pas le vocabulaire). Un à deux jours de code. Valeur :
ouverture d'un marché.

**B. La traduction des contenus produits** (newsletters, gabarits de
règles) d'une langue à l'autre par l'IA, pour les cabinets bilingues
(Suisse, Belgique, Luxembourg, Canada). Socle : `translateStrings`
(`docs/module-mails.md §4.8`), pied de page déjà par langue, une note du
chantier i18n dit qu'une langue « par cible » n'est « qu'une colonne à
ajouter ». Concrètement : `mail_targets.locale`, un bouton « Créer la
version EN » dans l'éditeur qui clone la newsletter
(`translated_from_id`), traduit les blocs, garde le bloc Sources et
repasse la revue continue ; même chose pour `rules.template`. Deux
colonnes, un prompt, un coût en jetons par variante, et la limite déjà
consignée (la voix n'est pas déterministe). Trois à quatre jours.

**C. Un mode de contribution aux traductions de l'interface** : une locale
virtuelle qui affiche les clés à l'écran, un écran super admin
« Traductions » (diff FR/EN, export/import JSON par namespace), et des
**surcharges par organisation** (`organization_messages`) pour qu'un
revendeur renomme « Affaires » en « Dossiers ». Une entrée `LOADERS`, une
fusion clé par clé dans `request.ts`, une table, un écran. Deux à trois
jours. Intéressant en marque blanche (P8).

**Recommandation** : B est la lecture la plus probable au vu du contexte
(marque blanche, profils CH/CA, cabinets), A la plus simple, C la plus
utile à un revendeur. **À trancher (décision D5)** ; les trois sont
compatibles et B + C se combinent bien.

---

## 8. Le plan de chantier

Même méthode que les chantiers précédents : sous-étapes à STOP, chaque
fin d'étape = commit + push + `git status` propre + `git log -5`, preuve
depuis la production quand c'est possible. Ordre choisi par **risque
puis dépendance** : on ferme d'abord ce qui peut faire mal aujourd'hui,
on outille ensuite pour que la suite soit sûre, puis on rend le produit
vendable, et le « mode translation » vient sur un socle testé.

### Étape 1 — L'audit (ce document) — FAITE

### Étape 2 — Les correctifs immédiats (≈ 2 jours)

Petits, chirurgicaux, déployables en un lot, prouvables depuis la
production.

- Next.js `16.3.4` + `eslint-config-next`, `npm audit fix` des
  transitives, `engines` + `.nvmrc` + `@types/node@24` (Q2).
- S1 (objets d'écriture explicites + `z.strictObject` sur partenaires,
  affaires, partages ; cas ajouté à `test-isolation`).
- S2 + S3 (validation de la police, `escapeHtml`/`normalizeHex` dans
  `resolveBrand`, `safeHttpUrl`, `preventDefault` dans `ShadowHtml`).
- S4 (`headers()` de sécurité dans `next.config.ts`).
- Q3 (`global-error.tsx` sans fournisseur), Q5 (`requireApiUser`, `catch`
  par type, messages IA filtrés), Q6 (lecteur strict des conditions à
  l'évaluation), Q4 partiel (les cinq `catch` masquants, dont les deux
  phrases françaises en dur de l'import → clés).
- D12 (`src/env.ts` validé au démarrage, `.env.example` corrigé).
- D10 (délais d'attente Resend, Calendly, Anthropic).
- S7, S8 (CSV, `x-real-ip`).
- Actions de l'utilisateur, hors code : **rendre le dépôt privé**,
  activer Dependabot et l'analyse des secrets sur GitHub, vérifier Fluid
  Compute et la rétention PITR Neon.

STOP : preuve (sondes HTTP des en-têtes, `test-isolation` étendu, `npm
audit` propre hors `nodemailer`).

### Étape 3 — Le cycle de livraison (≈ 3 jours)

- Base de **préproduction** : branche Neon (ou seconde base), sa
  `DATABASE_URL` posée par l'utilisateur dans Vercel pour Preview ;
  `db-migrate.ts` qui refuse la production sans `--target=production` ;
  `tsconfig.scripts.json` ; retrait des trois `db:seed-*` ; `perf-dataset`
  et `test-isolation` interdits sur la base de production (D1, Q11).
- **Tests** : Vitest, les dix premiers fichiers (DKIM, SPF, MIME, parseur
  d'emails, critères de règles et de cibles, rendu de newsletter,
  `stream-parse`, `metrics/types`, `crypto` + gabarits, fuseau/format/CSV),
  puis `test-isolation` sur la base Docker jetable (Q1).
- **CI GitHub Actions** sur PR et `main` : `npm ci` → lint → `tsc` → tests
  → Docker + migrations + isolation → `next build` avec variables
  factices → `npm audit --omit=dev --audit-level=high` ; Dependabot.
- **Observabilité** : `src/lib/log.ts`, `withRoute()`,
  `instrumentation.ts` + `onRequestError`, `reportError` dans les
  `error.tsx` ; suivi d'erreurs selon décision D4 (Q4).
- **Documentation** : `docs/architecture.md` (modules, couches, table
  route ↔ module ↔ namespace, conventions dont « une action =
  `src/lib/<module>/actions.ts` »), `docs/runbook.md` (variables par
  environnement, crons et leurs traces, où lire un échec, rotation des
  secrets, restauration Neon), `docs/release.md` (PR → CI →
  prévisualisation → migration → `main`) ; archivage de `module-mails.md`
  (Q13).
- Règle ESLint « `use server` seulement dans `src/lib/**/actions.ts` » et
  `readForm()` ; migration des 27 actions inline au fil de l'eau (Q7).

STOP : première PR verte de bout en bout, migration rejouée sur la
préproduction.

### Étape 4 — La tenue en charge (≈ 4 jours)

- D4 : `cache()` sur les lectures de session et d'organisation, layout
  allégé, listes de référence en cache taggé.
- D6 : follow-up en SQL + `count` pour le badge ; kanban borné ; import
  par tranches.
- D3 + D15 : les 17 requêtes complétées par `organization_id`, migration
  0018 avec les 6 index manquants (rédigée, montrée, appliquée en
  préproduction puis en production **avec accord**).
- D2 + D5 : `maxDuration` sur l'envoi, auto-réenchaînement, rotation des
  organisations dans le cron, budget par organisation.
- D8 : les trois N+1 (vagues, évaluation, origines).
- D9 : `db.batch` sur pipeline, tâche récurrente, sauvegarde de
  newsletter ; `import_batch_id`.
- D7 : `pg_trgm` + curseur sur la recherche de contacts.
- D11 + S5 : rétention dans un cron existant, `rate_limits` en base,
  quota IA par jour, purge des inscriptions jamais activées.
- Mesure : `scripts/perf-dataset.ts` sur la **préproduction** (5 000
  contacts, 500 organisations synthétiques), TTFB des cinq pages avant /
  après.

STOP : chiffres avant/après.

### Étape 5 — Vendre (≈ 8 jours, en deux lots)

Lot A, la confiance : P2 (pages légales, acceptation, DPA), P5
(consentement à la prospection), P6 (`s.js` avec consentement), P4
(suppression d'espace et export), P7 (accueil, SEO, lien démo), P13
(langue à l'inscription), P14 (nom dans le profil).

Lot B, le compte : P3 (membres, invitations, rôles), P1 (plans, quotas
par organisation, carte Abonnement ; facturation selon décision D6), P9
(plan Pro), P10 (`/admin`, journal d'audit de la substitution), P11
(bienvenue, invitation, alertes).

STOP après chaque lot.

### Étape 6 — Le « mode translation » (2 à 4 jours selon D5)

Sur un socle testé (étape 3) et un modèle de données stabilisé (étape 4).

### Étape 7 — Marque blanche revendeur et finitions (option)

P8 (niveau 1 par variables, niveau 2 par `custom_domain`), Q14
(accessibilité : `Field` avec erreur rattachée, `aria-sort`, kanban au
clavier, skip-link), Q8/Q9 (découpage des gros fichiers, extraction des
calculs purs), P12, P15/P16.

---

## 9. Les décisions à prendre (STOP)

| # | Décision | Recommandation |
|---|---|---|
| **D1** | Rendre le dépôt GitHub **privé** (action dans les réglages GitHub ; le jeton du Codespace n'a pas ce droit). | Oui, aujourd'hui. Aucune conséquence sur Vercel (l'intégration GitHub garde l'accès). |
| **D2** | Préproduction : **branche Neon** enfant de la base actuelle (gratuite, données réelles copiées à l'instant T, à rafraîchir) ou **seconde base** vide semée par la démo ? | Branche Neon `preprod` + `DATABASE_URL` Preview dans Vercel ; la démo Vasseur Courtage sert de jeu de données. |
| **D3** | Plan Vercel **Pro** (≈ 20 $/mois) : crons fréquents, `maxDuration` garanti, journaux plus longs. Quand ? | Avant le premier client payant (étape 5), pas avant. |
| **D4** | Suivi d'erreurs : **Sentry** (compte externe, plan gratuit, dépendance nouvelle) ou **journal structuré seul** (lu dans Vercel) ? | Sentry : sans lui, personne ne voit une 500. Compte à créer par l'utilisateur. |
| **D5** | « Mode translation » : **A** troisième langue, **B** traduction des contenus par l'IA, **C** surcharges et contribution, ou une combinaison ? | B, puis C si la marque blanche revendeur (étape 7) est retenue. |
| **D6** | Monétisation : **facturation manuelle** (plans et quotas en base, pas de paiement en ligne) pour les premiers clients, ou **Stripe** dès l'étape 5 (dépendance externe, webhooks) ? | Manuelle d'abord : plans, quotas et carte Abonnement ; Stripe quand un deuxième client paie. |
| **D7** | `nodemailer` : passer en **9.1+** malgré le pair déclaré par `next-auth` (`^7 \|\| ^8`, avertissement npm, transport SMTP du seul lien magique) ou **accepter le risque** documenté ? | Essayer 9.1 sur la préproduction ; si le lien magique passe, garder ; sinon documenter (les failles visent l'option `raw` et l'analyse d'adresses, non utilisées). |
| **D8** | Registre du produit : garder le **tutoiement** ou passer au **vouvoiement** (passe mécanique sur 3 093 valeurs, clés inchangées) ? | Choix de positionnement : à trancher avant la page d'accueil (étape 5). |
| **D9** | L'ordre des étapes ci-dessus, et le périmètre de l'étape 2 (tout d'un coup, ou en deux lots sécurité / dépendances). | Étape 2 en un lot, prouvé depuis la production. |

Actions de l'utilisateur, sans code : D1 ; activer Dependabot et
l'analyse des secrets (GitHub → Settings → Code security) ; confirmer
Fluid Compute et lire la rétention PITR (Neon → Settings) ; poser
`DATABASE_URL` pour Preview après D2 ; créer le compte Sentry après D4.

---

## 10. Chiffres consolidés

| Mesure | Valeur |
|---|---|
| Commit audité / date | `9dbc9ad` / 2026-09-09 |
| Fichiers suivis / `.ts`+`.tsx` dans `src` / lignes | 522 / 390 / 50 266 |
| Routes (build) / pages / route handlers / actions serveur | 55 (toutes dynamiques) / 37 / 17 fichiers (20 méthodes) / 153 (126 en modules + 27 inline) |
| Tables / index / CHECK / FK composites / déclencheurs / migrations | 58 / 88 / 32 / 60 / 2 / 18 (7 avec `DROP`, 0 inverse) |
| Dérive schéma ↔ migrations | 0 |
| Requêtes examinées / sans limite / hors index / N+1 / non atomiques | 292 lectures / 76 / 17 / 3 / 5 |
| `db.batch` / `db.transaction` | 22 / 0 |
| Requêtes SQL par page (layout + page) | `/dashboard` ≈ 46-50 · `/newsletters/[id]` ≈ 30-35 · `/analytique/funnel` ≈ 24-25 · `/affaires` ≈ 18-20 · `/contacts` ≈ 14-15 |
| `tsc --noEmit` / eslint / `any` / `@ts-ignore` / `eslint-disable` | 0 / 0 / 0 / 0 / 30 (tous motivés) |
| Tests / CI / typecheck en CI | 0 / 0 / 0 |
| `console.*` dans `src` / `catch` muets / suivi d'erreurs | 1 / 57 / aucun |
| `npm audit --omit=dev` | 10 (1 critique, 7 élevées, 2 modérées) ; 14 avec dev |
| Build local | exit 0, 2 min 13 s, aucun avertissement |
| En-têtes de sécurité en production | HSTS seulement |
| `/robots.txt`, `/sitemap.xml` | 404, 404 |
| Temps de réponse `/` (froid) / `/login` | 2,45 s / 0,45 s |
| Clés i18n FR / EN / manquantes / à suffixe hex | 3 093 / 3 093 / 0 / 500 |
| Écrans avec état vide (échantillon) / `error.tsx` / `loading.tsx` | 8/8 / 15 / 21 |
| Fichiers `"use client"` / `next/dynamic` / `useFormStatus` | 57 / 0 / 0 |
| Bundle client JS (non compressé) / plus gros chunk | 1 951 Ko / 469 Ko |
| Emails transactionnels | 2 (+ test de newsletter) |
| Rôles / atteignables par l'interface | 3 / 2 (`member` inatteignable) |
| Variables d'environnement lues / validées au démarrage / absentes de `.env.example` | 14 / 1 / 1 (`ANTHROPIC_WATCH_MODEL`) |
| Commits 19/08 → 07/09 / fichiers par commit / réparations de déploiement | 101 / 14,2 (max 209) / ≥ 4 |
| Dépôt GitHub | **public**, sans Dependabot, secrets dans l'historique : aucun |

Non vérifié (pas d'accès aux comptes) : réglage Fluid Compute et version
Node du projet Vercel, rétention des journaux Vercel, rétention PITR
Neon, protection de la branche `main` (403), latence réelle Neon depuis
la région Vercel, nombre exact d'appels du callback `jwt` par rendu.

---

## 11. Avancement

- **Étape 1 — l'audit** (2026-09-09) : ce document. Contrôles
  mécaniques, sondes de production, réglages GitHub, quatre relectures
  ciblées, recoupement des constats élevés. Aucun fichier de code
  modifié. **STOP** : décisions D1 à D9 (§9), puis étape 2.
