# Audit de la newsletter — chantier D, partie 1

Document seul (aucun code modifié), écrit le 2026-09-17 sur `main` =
`d9585fa`. Il répond au brief du 2026-09-16, chantier D partie 1 : **A.**
l'existant, **B.** délivrabilité et réputation (la section la plus
importante), **C.** base légale par contact, **D.** conformité métier des
contenus, **E.** benchmark, **F.** boucle commerciale, **G.** indicateurs,
**H.** assistance à la création, **I.** cadence et pression, **J.** le plan
noté à la grille. Les parties 2 à 5 (garde-fous, prévisualisation,
horaire, fonctionnalités retenues) attendent la validation de ce
document.

Ce qui est chiffré ici a été **lu dans le code** (deux lecteurs à
périmètres disjoints, chaque ligne pointant `fichier:ligne`, revérifiée
avant rédaction), **relevé en production** (compte Resend par son API en
lecture seule, DNS public, base de production, écrans en session forgée,
une génération IA chronométrée puis supprimée) ou **lu dans une source
citée** (trois recherches web, chaque affirmation avec son URL, les pages
d'éditeurs marquées « [éditeur] »). Ce qui ne l'a pas été est écrit « non
publié » ou « non mesuré ».

L'objectif du chantier, tel que le brief le pose : envoyer une newsletter
conforme, relue, bien délivrée, au bon moment et à la bonne cadence, sans
mettre la plateforme en danger, et voir quels clics deviennent des
rendez-vous. Quatre risques : la réputation mutualisée, la base légale, la
conformité métier, la production du contenu.

## 0. Ce qui compte

| # | Constat | Où |
|---|---|---|
| 1 | **La connexion au produit et les newsletters de toutes les organisations partagent un compte Resend, un domaine (`mail.clozado.fr`) et la liste de suppression du fournisseur.** Une seule liste achetée importée par un seul cabinet peut, « without warning » selon les conditions du fournisseur (plaintes > 0,08 %, rebonds > 4 %), éteindre l'envoi de tous les autres **et les liens de connexion**. Séparer le flux transactionnel est le premier geste, avant tout pilote qui envoie. | §B.1, §B.6, §B.8 |
| 2 | **Aucun contact ne porte de base légale** : ni statut, ni provenance datée, ni preuve ; un import de la veille part dans la vague comme un client de dix ans. Les sanctions CNIL 2024-2025 (900 000 € Solocal, 525 000 € Hubside) visent précisément « l'incapacité à démontrer, contact par contact » l'autorisation. | §C |
| 3 | **Le produit ne voit pas sa propre santé** : aucun taux de rebond ou de plainte, aucun seuil, aucune pause, aucune alerte, les plaintes reçues ne sont même pas affichées ; le premier signal viendra du fournisseur. | §B.5 |
| 4 | **La désinscription en un clic est conforme à la RFC 8058** (HTTPS, POST, immédiate — plus strict que les 48 h de Google), SPF, DKIM et DMARC `p=none` sont en place, l'alignement est bon ; il manque `mailto:`, une adresse `rua`, et la preuve que DKIM couvre les en-têtes. | §B.2, §B.3 |
| 5 | **Aucune mention métier** : ni pied de page ORIAS / carte professionnelle / CIF, ni « Un crédit vous engage… », ni « risque de perte en capital » ; la newsletter de démo d'un courtier déclencherait trois signalements sur un texte que la revue actuelle juge propre. Les règles et mentions, sourcées ligne par ligne, tiennent dans deux tables. | §D |
| 6 | **Le parcours veille → vague fait 3 écrans et 6 clics, avec un rechargement non annoncé** (la carte d'envoi n'apparaît qu'en revenant sur la page) ; le composer met **14,4 s** à rendre un brouillon, dont 12,8 s sans rien à l'écran. Tout membre peut envoyer ; la confirmation n'est vérifiée que par le navigateur. | §A.2, §H |
| 7 | **Le clic ne mène nulle part** : il rend la règle « sans interaction » silencieuse au lieu de déclencher une relance ; aucune mesure « cliqué puis rendez-vous », aucun UTM, aucune origine « newsletter ». La boucle tient dans un déclencheur, une action et un réglage du moteur de règles existant. | §F |
| 8 | **Les indicateurs sont sains** (des comptes, l'ouverture dite approximative) mais sans plaintes, sans taux, sans comparaison ; une définition unique en français est posée pour tout écran, règle et critère, avec un seuil de 100 délivrés avant tout taux. | §G |
| 9 | **Le marché ne prouve rien** de ce qu'il vend : aucun gain de temps d'IA mesuré avec méthode, une heure d'envoi optimisée bâtie sur des ouvertures qu'Apple préfabrique à 62 %, et un « clé en main » mûr côté CGP (Fidnet, Les Echos Publishing) qui ne relie rien à une vente. L'heure recommandée par contact n'est pas retenue maintenant ; la boucle commerciale et la séparation des flux le sont. | §E, §J.3 |
| 10 | **Huit fonctionnalités retenues** après les garde-fous : boucle commerciale, indicateurs et écran par newsletter, mentions métier, suggestions de sujets à trois provenances, pression et cadence, composer sans friction, domaine propre attendu, hygiène de base. | §J |

---

## A. L'existant

### A.1 Inventaire — ce qui est construit aujourd'hui

**Le compte d'envoi.** Un seul compte Resend, une seule clé
(`src/lib/email/resend.ts:14`, `:48-59` ; `config.ts:44-46`), trois
domaines chez le fournisseur (relevés par l'API le 2026-09-17) :

| Domaine | Rôle | État Resend | Enregistrements DNS publics (résolus le 2026-09-17) |
|---|---|---|---|
| `mail.clozado.fr` (`EMAIL_SHARED_DOMAIN`) | repli de toute organisation sans domaine vérifié (`<slug>@mail.clozado.fr`) **et** expéditeur des emails du produit (`EMAIL_FROM` = `Clozado <connexion@mail.clozado.fr>` : liens de connexion, invitations, notifications) | `verified`, région `eu-west-1`, créé le 2026-08-27 | DKIM `resend._domainkey.mail` ✓ · MX et SPF (`v=spf1 include:amazonses.com ~all`) sur `send.mail` ✓ · CNAME de suivi `links.mail` ✓ · DMARC `_dmarc.mail` = `v=DMARC1; p=none;` (sans `rua`) |
| `in.clozado.fr` (`EMAIL_INBOUND_DOMAIN`) | réception (adresse d'ingestion `<jeton>@in.clozado.fr`) | `verified` | MX `inbound-smtp.eu-west-1.amazonaws.com` ✓, DKIM ✓ |
| `societe2courtage.com` | domaine du pilote, déclaré le 2026-07-15 | **`not_started`** : aucun enregistrement posé chez lui | DMARC `p=none; rua=mailto:rua@dmarc.brevo.com` (le pilote envoie déjà par Brevo), MX Google |

La racine `clozado.fr` n'a ni MX, ni SPF, ni DMARC : rien n'y est envoyé,
rien n'y est reçu — conforme à la décision du 2026-08-27. Un webhook
unique est branché sur `https://clozado.vercel.app/api/webhooks/resend`,
activé, abonné à dix-neuf types d'événements (email.*, domain.*, contact.*,
suppression.*) dont le produit n'en traite que dix (§B.4).

**La chaîne.** Cibles (segments vivants ou listes, six facettes d'identité
éditoriale), veille (sujets, sources à flux, recherches web, panier
partagé), chiffres vérifiés et indicateurs de marché, concurrents et écart
de contenu, composer IA (Sonnet 5, sortie structurée, revue déterministe
continue), envoi réel par lots avec pied de page conforme, désinscription
en un clic, suivi par webhooks signés, indicateurs par contact, règles de
relance à vague validée par un humain, ingestion d'emails, rendez-vous
(saisis ou Calendly). Le détail vérifié ligne à ligne est dans les deux
inventaires du scratchpad ; ce document n'en garde que ce qui décide.

**Ce que dit la base de production** (le 2026-09-17) : une seule
organisation a des messages — la démo « Vasseur Courtage » (65 remis,
2 rejetés, 64 ouvertures, 7 clics, 2 désinscriptions, 2 suppressions par
rebond et 2 par lien, tous **simulés** par la graine de démo) ; les deux
autres organisations n'ont jamais envoyé. Le pilote n'a jamais vérifié son
domaine. **Aucune newsletter réelle n'est partie d'une organisation
cliente par le produit** : tout ce qui suit sur les taux, la cadence et
l'heure d'envoi part d'un historique vide.

### A.2 Le parcours « un article de veille m'intéresse » → « la vague est partie »

Compté dans le code (`veille/page.tsx`, `newsletters/new/page.tsx`,
`newsletter-editor.tsx`, `newsletters/[id]/page.tsx`,
`send-status-card.tsx`) et rejoué en production le 2026-09-17 (captures
`veille.png`, `composer.png`, `composer-apres-ia.png`, `nl-brouillon.png`).

| # | Écran | Geste | Ce qui se passe |
|---|---|---|---|
| 1 | `/veille` | clic « Mettre de côté » sur un article | panier **partagé par l'organisation** (`watch_basket_items`) ; un article de concurrent est refusé |
| — | `/veille`, encadré Panier | (choix de la cible : `<select>` prérempli sur la première cible active) | **impasse** : sans cible, le bouton n'existe pas et un texte renvoie vers `/cibles` |
| 2 | `/veille` | clic « Écrire une newsletter à partir de ça » | → `/newsletters/new?cible=<id>&panier=1`, brief construit depuis le panier, matière rattachée |
| 3 | `/newsletters/new` | clic « Rédiger l'email » (le brief est prérempli, modifiable) | `POST /api/newsletters/ai/design` en flux ; blocs, objet, pré-en-tête, sujets, revue ; **enregistrement automatique** 800 ms après, l'URL devient `/newsletters/<id>` **sans rechargement** |
| — | même page | — | **impasse de plomberie** : la carte d'envoi n'est rendue que par la page `/newsletters/[id]` ; après le premier enregistrement, la personne est « sur » cette URL mais **sans bouton « Envoyer »** tant qu'elle ne recharge pas ou ne repasse pas par la liste. Rien ne le dit à l'écran |
| 4 | `/newsletters/[id]` (rechargée) | clic « Envoyer » (ancre vers la carte, ~1 400 px plus bas) | carte d'envoi : expéditeur annoncé, repli dit, test, « Envoyer à N contacts — N avec une adresse et non désinscrits, sur M » |
| 5 | carte d'envoi | (facultatif) « M'envoyer un test » | vers l'adresse de connexion seulement |
| 6 | carte d'envoi | cocher « Je confirme l'envoi réel — il ne s'annule pas » | case `required` **côté navigateur seulement** (`send-status-card.tsx:251-254`) ; l'action serveur ne la relit pas |
| 7 | carte d'envoi | clic « Envoyer maintenant » | un ordre SQL (audience figée, `send_mode = 'sent'`, un message `queued` par destinataire avec adresse et non supprimé), puis l'exécutant après la réponse, par lots de 100 |

**3 écrans, 6 clics minimum** (7 avec le test), un rechargement non
annoncé. Mesuré en production (démo, cible « Primo-accédants », brief de
deux phrases) : **14,4 s entre le clic « Rédiger l'email » et le brouillon
prêt**, dont 12,8 s sans rien à l'écran avant le premier texte (le flux
NDJSON existe, mais le premier bloc n'est apparu qu'à 12,8 s dans la
mesure) ; le brouillon généré a été supprimé de la base après la mesure.

**Ce qui est exigé pour envoyer** : une cible active (obligatoire dès la
création, `targetId: z.uuid()`), objet et pré-en-tête non vides, au moins
un bloc et tous les champs de copie remplis, lien d'encart en `http(s)` ou
`mailto`, **adresse postale de l'organisation** (refus sinon, pas pour le
test), une adresse de réponse, `RESEND_API_KEY` et `EMAIL_SHARED_DOMAIN`
posés, au moins un destinataire envoyable, newsletter pas déjà partie.
**Ce qui n'est pas exigé** : un domaine vérifié (le repli mutualisé prend
le relais sans autre condition), un test préalable, une revue sans
signalement (elle n'est **jamais** bloquante, §D.4), un signataire, un rôle
(tout `member` peut envoyer, reprendre, évaluer les règles — seuls les
réglages sont réservés à l'admin), une base légale (§C).

### A.3 Manques, bancal, non branché (vérifiés dans le code)

| Constat | Où | Gravité |
|---|---|---|
| **Le lien de connexion et les newsletters partagent le compte, le domaine (`mail.clozado.fr`) et la liste de suppression du fournisseur** ; aucune séparation transactionnel / marketing (seulement des `tags` Resend et l'absence d'en-tête de désinscription sur les emails du produit) | `sender.ts:45-47`, `auth.ts:66-71`, `deliver.ts:34-41` | **bloquant** avant tout volume (§B) |
| **Aucun statut d'autorisation, aucune preuve de consentement** sur un contact ; un contact importé la veille part dans la vague comme les autres ; le sélecteur de cible n'a aucun critère de consentement | `schema/contacts.ts:50-99`, `email-sends.ts:59-66`, `mail-targets.ts:67-160` | **bloquant** (§C) |
| **Liste de suppression par organisation** (`PK (organization_id, email)`) alors que celle de Resend vaut pour tout le compte ; `email.suppressed` reçu → message `failed` sans ligne de suppression chez nous ; aucune réactivation tracée (le déclencheur SQL n'interdit la suppression que pour `unsubscribed`) | `schema/email-messages.ts:206-253`, `email-events.ts:69-72`, `0016_engagement.sql:399-411` | fort (§B.4) |
| **Aucun écran de santé d'envoi**, aucun seuil de rebond ou de plainte, aucune pause automatique, aucune alerte ; les seules pauses sont celles du fournisseur (quota, 429, 5xx) ; les webhooks `domain.*` sont ignorés (un domaine qui perd son DKIM reste « vérifié » jusqu'au prochain clic) | `webhooks.ts:79-89`, `send-newsletter.ts:190-204` | fort (§B.5) |
| `List-Unsubscribe` sans alternative `mailto:` (le cahier la prévoyait) ; la désinscription **ne pose pas** `contacts.auto_send_stopped_at` (raison `unsubscribed` absente du CHECK) — couverte par `email_suppressions` | `deliver.ts:34-37`, `contacts.ts:136-139` | faible |
| **Suppression consultée à la mise en file seulement** : une adresse désinscrite pendant une pause (quota) reçoit quand même son message le lendemain | `email-sends.ts:87-88` vs `:138-145` | moyen |
| Le cron de reprise est **quotidien** (plan Vercel Hobby) ; la carte promet encore « il reprend tout seul dans les dix minutes » (texte périmé) ; pas de compteur mensuel, pas d'annonce de l'étalement (« 340 en 4 jours »), prévus au cahier | `vercel.json`, `newsletters.json` → `sendStatusCard.l_envoi_s_est_interrompu` | moyen |
| Aucune planification (pas de `scheduled_at`), aucune fenêtre ni heure pour les newsletters ; fenêtre et plafond de la carte « Envois automatiques » ne valent que pour les règles, et la fenêtre n'est qu'un avertissement | `organizations.ts:123-130`, `rules/window.ts` | (§I) |
| **Aucun compteur de pression par contact** toutes natures ; le seul plafond compte les `automatic` | `rules.ts:519-526` | (§I) |
| Aucune variable de personnalisation dans une newsletter (un seul HTML par envoi, seul le lien de désinscription est substitué) ; aucun paramètre UTM ajouté aux liens ; `{lien_rdv}` n'existe que dans les gabarits de règles | `deliver.ts:135-160`, `render-email.ts`, `rules/template.ts:10-18` | (§F, §H) |
| L'aperçu de l'éditeur **n'a pas de pied de page** (adresse, désinscription, mention de mesure ne se voient que dans l'email de test) ; pas de bascule ordinateur / mobile / sombre ; pas de « vu par » un contact | `render-email.ts:84-85`, `:423` | (partie 3) |
| Le compte de la cible **inclut** les sans-adresse et les désinscrits ; trois chiffres différents entre le sélecteur, l'encadré et la carte d'envoi ; le pourquoi des exclus n'est dit qu'après l'envoi | `mail-targets.ts:211-224`, `send-status-card.tsx:245-250` | moyen |
| **La démo montre « 26 envoyés · 26 en attente · 0 en échec »** sur chaque newsletter envoyée : la graine pose `queued = sent = members.length` alors que le produit recompte (`refreshSendCounters`) ; artefact de démo visible dans chaque démonstration | `demo/seed.ts:586`, `email-sends.ts:170-180` | S, à corriger |
| Construit mais jamais branché : `cta_presets` (jamais lus), `signatories` (aucun écran de création), `tone_of_voice` / `editorial_guidelines` / `tagline` (lus par le prompt, **aucun écran pour les saisir** : toute organisation réelle tourne avec le ton par défaut en dur), `POST /api/newsletters/render` (aucun appelant), `clampSubject` / `clampPreheader` (jamais appelés), `targetLength` (jamais renseigné), suppression `manual` (définie, jamais écrite), pas d'`error.tsx` sous `/newsletters` | inventaires §9 et §11 | à trancher |
| `docs/module-mails.md` décrit un module qui n'existe plus (composer S2C, exports HubSpot/Brevo, score qualité, traduction, brouillons) : à archiver ou réécrire | — | doc |

---

## A bis. Les garde-fous d'envoi — CONSTRUITS (2026-09-18)

La première partie du chantier « envoi et prospection ». Migration 0024
appliquée (local et production) : `consent_events`, `consent_texts`,
`platform_suppressions`, plus les colonnes de quota et d'autorisation.

- **L'autorisation d'écrire, contact par contact.** La sélection des
  destinataires n'accepte plus que `granted`, `client` et `professional` ;
  « non établie » et « opposé » sont exclus, et les fiches d'avant naissent
  « non établie » — on ne s'invente pas un consentement. Le journal
  (`consent_events`) est la vérité, la colonne sur la fiche un cache.
- **La liste repoussoir de la PLATEFORME.** Un rebond dur ou une plainte
  ferme l'adresse pour tout le service, pas seulement pour le cabinet
  concerné : la réputation est commune. Stockée en empreintes sha256 —
  vérifié : aucune adresse en clair, la casse et les espaces sont ignorés,
  une plainte prend le dessus sur un rebond, et un second événement compte
  sans créer de doublon.
- **Le quota du jour et la montée progressive.** Palier par jour
  d'échauffement (50, 100, 250, 500, 1 000, 2 000, 4 000), plafonné par le
  quota de l'organisation. Relu AVANT CHAQUE LOT, pas une fois au départ :
  la vague s'arrête d'elle-même et reprend le lendemain par le cron.
- **La pause automatique sur seuils.** Au-dessus de 0,3 % de plaintes (le
  seuil que Google et Yahoo exigent publiquement) ou 5 % de rebonds sur sept
  jours, à partir de cinquante messages, l'envoi MARKETING s'arrête et le
  dit. Il ne repart jamais seul : une pause veut dire qu'il y a une liste à
  nettoyer. Les emails relationnels ne sont jamais suspendus.
- **L'écran « Santé d'envoi »** (`/sante-envoi`, super admin réel
  seulement) : volume, remis, rebonds, plaintes et taux par organisation sur
  la fenêtre, les deux seuils affichés, le quota du jour et l'échauffement,
  la liste repoussoir en nombres, et deux gestes — suspendre, reprendre.

**Preuve** : `scripts/_tmp-sante-envoi.ts`, 20 contrôles au vert (paliers
d'échauffement, quota du jour, empreintes, pause automatique muette sous le
volume significatif, écran refusé à un admin d'organisation, aucune adresse
à l'écran).

**Où c'est parti** : le code est dans le commit `b173931` — il a été
emporté par le commit de la barre latérale (un `git add src` trop large),
ce qui est dit ici pour que l'historique reste lisible.

## B. Délivrabilité et réputation

### B.1 L'architecture d'aujourd'hui, et ce qu'elle mutualise

Tout part d'un **compte** Resend (« team » au sens du fournisseur), sur
des **IP partagées** avec tous les clients de Resend, depuis **un domaine
mutualisé** `mail.clozado.fr` pour quiconque n'a pas vérifié le sien —
c'est-à-dire, aujourd'hui, tout le monde — et ce même domaine porte
`connexion@mail.clozado.fr`, l'expéditeur des liens de connexion. Trois
choses sont donc partagées entre toutes les organisations et avec
l'authentification du produit :

1. **La réputation du domaine `mail.clozado.fr`** (DKIM `d=mail.clozado.fr`
   sur chaque message, quelle que soit l'organisation). M3AAWG, dans ses
   « Sender Best Common Practices » (v4.0, août 2026) : « ESPs may also
   define a shared subdomain used by all customers … While feasible, this
   is not recommended because it makes troubleshooting harder » et
   « all customers sharing the subdomain are also sharing the domain's
   reputation » ; « This solution is not a recommended best practice but
   can function as a catch-all » ([PDF M3AAWG](https://www.m3aawg.org/sites/default/files/doc_files/m3aawg-sender-best-common-practices-aug-27-2026.pdf)).
2. **Les seuils du compte chez Resend**, formulés au niveau du compte :
   « Your complaint rate must be lower than 0.08% », « Your bounce rate
   must be lower than 4% », « If complaint or bounce rates go above these
   thresholds, your account may be shut down without warning »
   ([Acceptable Use Policy](https://resend.com/legal/acceptable-use)). Un
   seul client peut éteindre l'envoi de tous les autres et les liens de
   connexion.
3. **La liste de suppression du fournisseur**, au niveau du compte :
   « Suppressions apply to your entire team. A bounce or complaint on any
   domain suppresses that address across every one of your domains and
   subdomains » ([changelog Resend](https://resend.com/changelog/suppression-list-support)).
   Concrètement : si M. Martin se plaint d'un email du cabinet A, le
   cabinet B ne peut plus lui écrire, **et le produit ne peut plus lui
   envoyer de lien de connexion**. Notre propre liste (`email_suppressions`,
   par organisation) ne le sait pas : l'envoi part, revient en
   `email.suppressed`, et le produit le range en `failed` sans ligne de
   suppression ni explication (§A.3).

Le plan du compte n'est pas lisible par l'API ; d'après
`docs/module-engagement.md` §2, il s'agissait le 2026-08-27 du plan gratuit
(100 emails par jour, 3 000 par mois, 3 domaines — les trois sont déjà
pris). Sur ce plan, **aucun autre domaine client ne peut être vérifié**
(`domain.ts` le dit à l'écran : « indisponible sur ce plan ») et le repli
mutualisé est la seule voie. À confirmer par l'utilisateur.

**Alignement, tel qu'il est** (RFC 7489, relaxed) : From
`<slug>@mail.clozado.fr`, DKIM `d=mail.clozado.fr`, Return-Path
`send.mail.clozado.fr` → aligné, réputation construite sur `clozado.fr`
pour tous. Pour un domaine client vérifié : From `contact@cabinet.fr`, DKIM
`d=cabinet.fr` (clé propre créée par Resend), Return-Path `send.cabinet.fr`
→ aligné, et c'est la politique DMARC **du client** qui s'applique. Le cas
interdit — From du client avec DKIM/SPF de clozado — n'est pas possible
dans le code : `resolveSender` retombe sur le repli si `sender_email`
n'est pas sur le domaine vérifié (`sender.ts:38-58`).

### B.2 Les exigences des grands récepteurs, et où en est le produit

Sources officielles : Google « Email sender guidelines »
([support.google.com/mail/answer/81126](https://support.google.com/mail/answer/81126?hl=en))
et sa FAQ ([answer/14229414](https://support.google.com/a/answer/14229414?hl=en)),
Yahoo « Sender Best Practices » ([senders.yahooinc.com/best-practices](https://senders.yahooinc.com/best-practices/))
et FAQ ([senders.yahooinc.com/faqs](https://senders.yahooinc.com/faqs/)),
Microsoft « Strengthening Email Ecosystem: Outlook's New Requirements for
High-Volume Senders » ([techcommunity, 2 avril 2025, en vigueur le 5 mai 2025](https://techcommunity.microsoft.com/blog/microsoftdefenderforoffice365blog/strengthening-email-ecosystem-outlook%E2%80%99s-new-requirements-for-high%E2%80%90volume-senders/4399730)).

| Exigence | Google | Yahoo | Microsoft | clozado aujourd'hui |
|---|---|---|---|---|
| Seuil « expéditeur en volume » | > 5 000 messages/jour vers Gmail, **comptés par domaine principal, sous-domaines agrégés**, statut permanent (« we count all messages sent from the same primary domain ») | « We will not specify a volume threshold. » | > 5 000/jour vers outlook.com, hotmail.com, live.com | Toutes les organisations en repli s'additionnent sous `clozado.fr` ; un découpage en sous-domaines par client **n'y change rien** : « The Compliance status dashboard data applies to primary domains only, not to subdomains » ([Postmaster](https://support.google.com/mail/answer/14668346?hl=en)) |
| SPF et DKIM | requis (les deux au-delà de 5 000) | les deux ; DKIM ≥ 1 024 bits | « Must Pass » | ✓ sur `mail.clozado.fr` (clé DKIM Resend), ✓ sur tout domaine client vérifié |
| DMARC | obligatoire, `p=none` suffit, From aligné avec SPF **ou** DKIM | « at least p=none - DMARC must pass » | « At least p=none and align » ; échec = `550 5.7.515` | ✓ `p=none` sur `mail.clozado.fr` ; exigé par le produit pour « vérifié » ; **aucune adresse `rua`** : personne ne reçoit les rapports agrégés |
| Désinscription en un clic (RFC 8058) | obligatoire pour les messages marketing/abonnement ; transactionnels exclus | obligatoire, RFC 8058 explicitement | recommandée (« Functional Unsubscribe Links ») | ✓ `List-Unsubscribe: <https://…/api/unsubscribe/{id}>` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, route `POST` sans session, corps vérifié, HTTPS (`deliver.ts:34-37`, `api/unsubscribe/[id]/route.ts`) ; **sans `mailto:`** (facultatif dans la RFC, prévu au cahier) ; la RFC exige que DKIM couvre ces deux en-têtes — Resend signe l'ensemble des en-têtes qu'il émet, non vérifiable depuis le code : à contrôler sur les en-têtes d'un envoi réel |
| Délai de traitement | **48 heures** | **2 jours** | non chiffré | immédiat (écriture synchrone) — plus strict que les 7 jours que Resend fait signer à ses clients |
| Taux de plaintes | < 0,10 %, jamais 0,30 % | < 0,3 % | « may defer … high complaint rate » | **non mesuré par le produit** (§B.5) ; Resend coupe à 0,08 % au niveau du compte |
| PTR / rDNS, TLS | requis | PTR requis, non générique | — | propriétés de l'infrastructure Resend, non publiées |
| Format RFC 5322, un même From par catégorie | « Messages of the same category should have the same From: email address » ; « Don't mix different types of content » | — | — | ✓ From stable par organisation ; **mais** connexion et newsletter sur le même domaine (§B.7) |

### B.3 La désinscription en un clic — conformité vérifiée

RFC 8058 ([rfc-editor.org/rfc/rfc8058](https://www.rfc-editor.org/rfc/rfc8058.html)) :
« The List-Unsubscribe header field MUST contain one HTTPS URI » ; le
récepteur envoie un `POST` dont le corps est `List-Unsubscribe=One-Click`
et « the unsubscription process can complete automatically » ; « The
List-Unsubscribe and List-Unsubscribe-Post headers MUST be covered by the
[DKIM] signature ». Le produit : URL HTTPS, `POST` accepté sans session,
corps exigé sinon 400, `GET` redirigé vers la page (jamais une
désinscription par préchargement), écriture immédiate dans
`email_suppressions` avec la source `one_click`, page publique
`/desinscription/[id]` pour le clic dans le corps, réponse identique pour
un id inconnu. Le jeton est l'id v4 du message (122 bits aléatoires), non
signé — acceptable : non énumérable, limité en débit, et la page ne
révèle rien. Reste à prouver sur un envoi réel que la signature DKIM
posée par Resend couvre bien les deux en-têtes (partie 2, preuve par les
en-têtes bruts d'un message reçu).

### B.4 Rebonds, plaintes, désinscriptions — traitement et portée

| Événement | Ce que fait le produit | Portée | Ce que disent les références |
|---|---|---|---|
| Rebond **dur** (`email.bounced`, `bounce.type` contenant « permanent ») | message `bounced` + `email_suppressions (bounced, webhook)` | **l'organisation** | SES : « remove bounced addresses … stop sending mail to them immediately » ([FAQ SES](https://docs.aws.amazon.com/ses/latest/dg/faqs-enforcement.html)) ; CSA §1.4.5 : « prevent further delivery to email addresses where it is determined after delivery that the mailbox does not exist » ([critères CSA](https://certified-senders.org/wp-content/uploads/2017/07/CSA_Admission_Criteria.pdf)) |
| Rebond **temporaire** (`delivery_delayed`, bounce non permanent) | message `delayed` / `bounced` ; **aucun cumul, aucune suppression après N rebonds** | — | M3AAWG : retirer « if it bounces consecutively at least two times over two weeks or more » |
| Plainte (`email.complained`) | `email_suppressions (complained, webhook)` | l'organisation | SES : « Do not even send an email that says you've received the request to unsubscribe. » ; « For every person who complains, there are potentially dozens who didn't » |
| Désinscription (page ou un clic) | `email_suppressions (unsubscribed, link/one_click)` + événement ; un désinscrit n'est plus jamais suivi (ouvertures et clics ignorés) | l'organisation ; **irréversible** (déclencheur SQL) | Google 48 h, Yahoo 2 jours (§B.2) |
| `email.suppressed` (Resend a refusé d'envoyer : adresse sur SA liste) | message `failed`, **rien d'autre** | — | Resend : liste **par compte, tous domaines** ; réactivation manuelle et sans garantie (« the email address will return to the Suppression List ») |
| Signalement Signal Spam (France) | non branché | — | « les signalements sont traités comme une demande de désinscription » pour les membres de Signal Spam ([signal-spam.fr/feedback-loop](https://www.signal-spam.fr/feedback-loop/)) — l'adhésion est une décision de plateforme, pas de produit |

**Réactivation** : aucun chemin produit ; en base, seul `unsubscribed` est
protégé, une ligne `bounced` ou `complained` reste supprimable par SQL
direct, sans trace. La partie 2 devra poser : suppression définitive pour
rebond dur et plainte **au niveau de la plateforme** (une adresse morte
l'est pour tout le monde — c'est d'ailleurs ce que Resend fait déjà de
son côté), désinscription **par organisation** (M. Martin se désinscrit du
cabinet A, pas du cabinet B), réactivation par un admin, tracée, avec motif,
et **seulement** pour la désinscription et le rebond dur (jamais la
plainte).

### B.5 Ce que le produit ne voit pas — santé d'envoi

Aucun écran n'agrège rebonds, plaintes, désinscriptions par organisation ;
aucun seuil, aucune pause automatique, aucune alerte (inventaire §9). Les
seuls agrégats existent par campagne (envoyés, remis, ouverts approx.,
cliqués, rejetés, désinscrits, échecs, non envoyés — sans les plaintes,
pourtant reçues). Résultat : le premier signal qu'une organisation salit
le compte viendra **de Resend**, sous la forme « your account may be shut
down without warning ». Les seuils de référence, tous sourcés :

| Acteur | Rebonds | Plaintes | Fenêtre | Source |
|---|---|---|---|---|
| **Resend (le nôtre)** | < 4 % | **< 0,08 %** | non précisée, niveau compte | [AUP](https://resend.com/legal/acceptable-use) |
| Gmail | — | < 0,10 %, jamais ≥ 0,30 % | Postmaster, domaine principal | [guidelines](https://support.google.com/mail/answer/81126?hl=en) |
| Yahoo | — | < 0,3 % | Sender Hub | [best practices](https://senders.yahooinc.com/best-practices/) |
| Amazon SES | < 2 % conseillé ; 5 % = revue ; 10 % = pause | < 0,1 % ; 0,1 % = revue ; 0,5 % = pause | volume représentatif | [FAQ SES](https://docs.aws.amazon.com/ses/latest/dg/faqs-enforcement.html) |
| Postmark | < 10 % | < 0,1 % | — | [Postmark](https://postmarkapp.com/support/article/does-postmark-have-a-daily-send-limit) [éditeur] |
| CSA (certification) | ≤ 1,0 % | ≤ 0,3 % | 7 jours | [critères CSA](https://certified-senders.org/wp-content/uploads/2017/07/CSA_Admission_Criteria.pdf) |

Le seuil qui mord en premier est celui de Resend, **0,08 % de plaintes,
sur le compte entier** : plus strict que Gmail, Yahoo, SES et la CSA. Les
seuils internes de la partie 2 (par vague et par organisation, en base,
modifiables par le super_admin) devront être en dessous : proposition,
pause automatique de l'organisation à **0,05 %** de plaintes ou **2 %** de
rebonds durs sur une vague d'au moins 200 remis, alerte super_admin à
0,03 % / 1 %. Ces valeurs sont des propositions dérivées des seuils
publiés, pas des mesures.

### B.6 Scénario de crise, pas à pas — une liste achetée, une vague

Écrit pour l'architecture d'aujourd'hui, avec ce que le code fait et ce
que les fournisseurs publient.

1. **Jour J, 9 h.** Un cabinet importe un CSV de 5 000 adresses achetées
   (l'import accepte jusqu'à 5 000 lignes, `contacts/actions.ts:194-213`)
   : aucune question sur la provenance, `source = 'import'`, aucune
   marque d'autorisation (§C). Il crée une cible « tous les contacts avec
   une adresse », écrit une newsletter, coche la case, clique « Envoyer
   maintenant ». N'importe quel `member` peut le faire.
2. **9 h 00 min 05.** Un ordre SQL met 5 000 messages en file ; l'exécutant
   part après la réponse, **50 lots de 100 sans délai entre lots**
   (`send-newsletter.ts:42`, `:163-206`). Sur le plan gratuit, Resend
   coupe à 100 par jour (`daily_quota_exceeded` → pause jusqu'au
   lendemain) : le plan gratuit est aujourd'hui **le seul frein** ; sur
   un plan payant, les 5 000 partent en quelques secondes.
3. **9 h à midi.** « Inevitably, purchased lists contain spamtraps or
   generate abuse complaints and bounces, and then the buyers find
   themselves blocklisted for spamming » ([Spamhaus](https://www.spamhaus.org/resource-hub/deliverability/address-acquisition-for-mailing-lists-the-basics/)).
   Les rebonds durs et les plaintes arrivent par webhook ; le produit
   supprime ces adresses **pour ce cabinet** et n'alerte personne ; Resend
   les supprime **pour tout le compte**. Aucun écran ne montre le taux.
4. **Dans la journée.** Les seuils Resend (4 % / 0,08 %) sont dépassés par
   ce seul envoi. « If complaint or bounce rates go above these thresholds,
   your account may be shut down without warning » ; « We may terminate or
   suspend your account … immediately, without prior notice »
   ([CGU](https://resend.com/legal/terms-of-service)). **Aucun délai, aucune
   procédure de recours publiés** — à la différence de SES (« it may take
   three weeks or more before we are able to determine if the changes you
   made solved the issue ») ou de SendGrid (courrier retenu 72 h puis
   expiré).
5. **Conséquence immédiate pour tous.** Plus aucune newsletter d'aucune
   organisation ; plus aucune vague de règle ; **plus aucun lien de
   connexion** (`auth.ts` → « impossible d'envoyer ») : personne ne peut
   plus entrer dans le produit, y compris le super_admin. Les invitations
   d'espace ne partent plus. L'ingestion (`in.clozado.fr`) dépend du même
   compte.
6. **En parallèle, hors fournisseur.** Une IP partagée listée par Spamhaus
   CSS : « CSS listings expire quickly: normally, three days after last
   spam detection » ; la réputation de `mail.clozado.fr`, elle, ne se
   rachète pas en trois jours (« reputation is much harder to rebuild than
   to destroy! », Spamhaus). Les 26 messages de la démo et les envois du
   cabinet honnête d'à côté vont en spam.
7. **Retour.** Nouveau compte ou nouveau domaine, à la main ; les liens de
   connexion à rétablir en premier ; le cabinet fautif à débrancher ;
   aucune trace côté produit de ce qui s'est passé au-delà des `email_events`.

Ce que la partie 2 doit rendre impossible : l'étape 1 (statut
d'autorisation : un import n'est pas autorisé par défaut), l'étape 2
(quotas par organisation et montée progressive : jamais 5 000 le premier
jour), l'étape 3 (santé d'envoi : taux par vague, pause automatique de
l'organisation, alerte super_admin), l'étape 5 (séparation du
transactionnel : un incident newsletter ne coupe jamais la connexion).

### B.7 Politique d'usage du fournisseur — ce qui engage clozado

L'AUP de Resend impose : « All mail must be sent to recipients who have
explicitly opted in to receive communications from you » ; « You are
prohibited from sending unsolicited messages of any kind, including cold
outreach, purchased lists, or scraped contact data » ; « honor their wish
within 7 days » ; secteurs interdits dont « List brokers or list rental
services », « Credit repair and get out of debt opportunities »,
« Short-term / payday loan services » ([AUP](https://resend.com/legal/acceptable-use)).
Deux points à lever avec le fournisseur avant le premier pilote courtier :
(1) un courtier en crédit immobilier n'est ni un « credit repair » ni un
« payday loan », mais le regroupement de crédits (« Rachat de crédit
consommation + immo » est une affaire de la démo) frôle la catégorie « get
out of debt » — à faire confirmer par écrit ; (2) l'opt-in explicite exigé
par l'AUP est plus strict que le droit français B2B (§C) : c'est la
politique du fournisseur qui s'appliquera, pas seulement la CNIL. Autres
faits contractuels : aucune garantie de délivrabilité (« DISCLAIMS ALL
WARRANTIES ») ; rétention des journaux 30 jours ; **toutes les données de
compte sont stockées aux États-Unis quelle que soit la région d'envoi**
(« All account data, including email metadata, logs, and API records, is
stored in the United States regardless of the sending region you select »,
[régions](https://resend.com/docs/dashboard/domains/regions)) — à
mentionner dans le registre RGPD et la politique de confidentialité
(chantier E le reprend pour l'IA).

### B.8 Isolation de réputation — les options, avantages et coûts

| Option | Ce qu'elle isole vraiment | Ce qu'elle n'isole pas | Coût publié | Effort | Verdict |
|---|---|---|---|---|---|
| **0. Situation actuelle** : un domaine mutualisé pour tous, connexion comprise | rien | tout | 0 | — | à quitter avant le premier pilote payant |
| **1. Séparer le transactionnel** : les emails du produit (connexion, invitations, notifications) partent d'un autre sous-domaine (`app.clozado.fr` ou `connexion.clozado.fr`) **et d'un autre compte** (« team » Resend séparée, ou un second fournisseur transactionnel) | la connexion survit à tout incident newsletter : réputation de domaine, seuils du compte, liste de suppression, suspension | rien de la newsletter elle-même | Resend : une seconde team = « its own API keys, billing, and usage » ([multiple teams](https://resend.com/blog/multiple-teams) [éditeur]) — un second plan gratuit suffit au volume des liens de connexion ; Postmark, à titre de comparaison, sépare nativement « transactional and broadcast traffic never intersect … including IP ranges » ([message streams](https://postmarkapp.com/message-streams) [éditeur], prix non lu) | **S** (une seconde clé `RESEND_TRANSACTIONAL_API_KEY`, un `EMAIL_FROM` sur le nouveau sous-domaine, deux enregistrements DNS) ; dépendance nouvelle = un second compte → STOP | **Retenu, à faire en premier** (partie 2, candidate obligatoire « séparation des flux ») |
| **2. Domaine propre de chaque organisation** (existe déjà, parcours guidé) | la réputation **et** la politique DMARC du client ; les plaintes retombent sur lui ; « It is strongly recommended that whenever possible, an ESP have their customer use their own domain or subdomain in the visible From: header line » (M3AAWG) | les seuils du compte Resend et sa liste de suppression | 0 chez Resend jusqu'au quota de domaines (Free 3, Pro 10, Scale 1 000 ; **+100 domaines pour 20 $/mois** sur Pro/Scale — [pricing](https://resend.com/pricing) [éditeur]) ; friction DNS chez le client | M (le parcours existe ; à rendre **attendu** : rappel au premier envoi, blocage des vagues au-delà d'un volume sans domaine propre) | **Retenu** comme voie normale ; le plan gratuit l'interdit (3 domaines pris) |
| **3. Un sous-domaine par organisation sous clozado.fr** (`dupont.mail.clozado.fr`), DKIM par sous-domaine | la réputation DKIM/domaine vue par les filtres ; recommandé par M3AAWG « for each brand or customer who is unable to do this themselves » | le statut de conformité Google (agrégé sur `clozado.fr`), le seuil 5 000/jour, la liste de suppression et les seuils du compte | compris dans le quota de domaines (un domaine Resend par organisation) : add-on 20 $/mois par tranche de 100 | M (création automatique à l'inscription, DNS chez clozado seulement) | **Retenu en repli** pour les organisations sans domaine propre, à la place du mutualisé unique ; à limiter (volume plafonné tant que le domaine propre n'est pas vérifié) |
| **4. IP dédiée** | la réputation IP seulement | la réputation de domaine, la liste de suppression, les seuils du compte | Resend **30 $/mois**, plan Scale, **> 3 000 emails/jour**, plancher « Sending less than 90,000 emails a month may not be enough to keep the IPs warm » ([dedicated IPs](https://resend.com/docs/knowledge-base/how-do-dedicated-ips-work)) ; SES 24,95 $/IP/mois ([SES pricing](https://aws.amazon.com/ses/pricing/) [éditeur]) ; Mailgun : « if you are sending less than 5,000 emails per day, a shared IP may be the right solution » ([Mailgun](https://documentation.mailgun.com/docs/mailgun/email-best-practices/ip_address) [éditeur]) | S | **Non retenu** à ce volume : 15 pilotes à quelques centaines d'envois par mois ne chauffent pas une IP ; M3AAWG rappelle que l'IP partagée « dilute the overall reputational impact » des erreurs d'un seul |
| **5. Un compte (« team ») par organisation** | tout | rien | une facturation par team : ingérable à 15 pilotes | L | non retenu |
| **6. Changer de fournisseur** (Postmark, SES, SendGrid, Mailgun, Brevo) pour des « streams » ou des sous-comptes natifs | selon l'outil : Postmark sépare les flux, SendGrid a des subusers (« up to 15 subusers » sur Pro), SES des pools | — | non chiffré ici (Brevo : pages non lisibles, aucun chiffre avancé) | L, dépendance = STOP | non retenu maintenant : les options 1 à 3 donnent la même isolation utile sans migration ; à reconsidérer au-delà de 5 000 envois/jour |

**Ordre proposé** : 1 (séparer la connexion) → garde-fous de la partie 2
(statut d'autorisation, quotas, santé) → 2 rendu attendu → 3 en repli.
Tant que 1 n'est pas fait, **aucun pilote ne devrait envoyer de newsletter
réelle** : le risque n'est pas la newsletter, c'est la connexion.

---

## C. La base légale, contact par contact

### C.1 Le droit, en quatre lignes sourcées

- **Le socle** : « Est interdite la prospection directe au moyen de … courriers
  électroniques … [à une personne] qui n'a pas exprimé préalablement son
  consentement » — art. L34-5 du code des postes et des communications
  électroniques ([Legifrance](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000042155961/)).
  Exception : coordonnées recueillies « à l'occasion d'une vente ou d'une
  prestation de services », prospection portant sur des produits ou services
  **analogues** du même fournisseur, refus gratuit et simple offert au
  moment de la collecte **et à chaque envoi**.
- **Le particulier (B2C)** : consentement « libre, spécifique, éclairé et
  univoque », par « une action positive et spécifique », case pré-cochée
  interdite ([CNIL, prospection par courrier électronique](https://www.cnil.fr/fr/la-prospection-commerciale-par-courrier-electronique-sms-mms-et-automate-dappel)).
  « la simple création d'un compte ne signifie pas qu'il y aura une
  commande éventuelle » : un compte sans achat n'est pas un client
  ([CNIL](https://www.cnil.fr/fr/la-prospection-commerciale-par-courrier-electronique)).
- **Le professionnel, adresse nominative** : intérêt légitime, à trois
  conditions — objet « en rapport avec la profession de la personne
  démarchée », information sur l'origine et la finalité, opposition simple
  ([CNIL, quelles règles](https://www.cnil.fr/fr/communication-electronique-quelles-regles) ;
  [CNIL, la prospection commerciale](https://www.cnil.fr/fr/la-prospection-commerciale)).
  Les adresses génériques (`contact@`, `info@`) « ne sont pas soumises aux
  principes rappelés ci-dessus ».
- **La preuve** : « le responsable du traitement est en mesure de
  démontrer que la personne concernée a donné son consentement » (RGPD
  art. 7.1) ; le CEPD précise ce qu'un registre doit montrer : « **how**
  consent was obtained, **when** consent was obtained and **the information
  provided** to the data subject » ; « It would not be sufficient to merely
  refer to a correct configuration of the respective website »
  ([CEPD, lignes directrices 05/2020](https://www.edpb.europa.eu/system/files/documents/files/file1/edpb_guidelines_202005_consent_en.pdf)).
  L'opposition est absolue (RGPD art. 21.2-21.3) et doit être présentée
  « explicitement » et « clairement séparée de toute autre information ».

**Ce qui est sanctionné, concrètement.** Solocal Marketing Services,
900 000 € le 15 mai 2025 : L34-5, RGPD art. 6 et **art. 7.1 (incapacité à
démontrer le consentement)** ([CNIL](https://www.cnil.fr/fr/sanction-de-900-000-euros-societe-solocal-marketing-services)) ;
Caloga, 80 000 € le même jour (consentement non valable, retrait impossible
en une action, conservation excessive prolongée « à chaque ouverture
d'email » — [CNIL](https://www.cnil.fr/fr/sanction-de-80-000-euros-societe-caloga)) ;
Hubside.Store 525 000 € et Foriou 310 000 € en 2024 (données de courtiers
sans consentement vérifié) ; « 10 décisions » sur la prospection en 2025
([bilan CNIL 2025](https://www.cnil.fr/fr/bilan-sanctions-2025)).
Plafond administratif du CPCE : 375 000 € pour une personne morale. Le
motif dominant n'est pas l'envoi : c'est **l'incapacité à démontrer,
contact par contact, l'origine et la validité de l'autorisation**.

**Durées** (référentiel CNIL « gestion des activités commerciales »,
[PDF](https://www.cnil.fr/sites/cnil/files/atoms/files/referentiel_traitements-donnees-caractere-personnel_gestion-activites-commerciales.pdf)) :
prospect non client, « trois ans à compter de leur collecte … ou du
dernier contact émanant du prospect » — et « la simple ouverture d'un
courriel ne devrait pas être considérée comme un contact émanant du
prospect » (un clic, oui) ; client, durée de la relation + 3 ans ; liste
repoussoir « conservée au minimum 3 ans », sous forme d'**empreintes** de
l'adresse. C'est la fonctionnalité F5 « purge RGPD » de l'audit UX (§C de
`docs/audit-ux-et-metier.md`).

**États-Unis** (contacts en `country = US`) : CAN-SPAM n'impose pas
d'opt-in préalable mais exige en-têtes exacts, objet non trompeur,
identification comme publicité, **adresse postale physique**, désinscription
honorée sous **10 jours ouvrés** ; pénalité civile jusqu'à 53 088 $ par
email ([FTC](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)).
Le profil de pied de page `us` du produit porte déjà l'adresse postale et
le délai ; l'identification « publicité » n'y est pas. Un même moteur ne
peut donc pas appliquer une règle unique : **le régime dépend du pays du
destinataire** — le résolveur `footerProfileOf(org)` doit devenir
`profileOf(org, contact)`.

**Hors email mais structurant** : depuis le 11 août 2026, la prospection
**téléphonique** d'un consommateur suppose un consentement préalable (art.
L223-1 code de la consommation, loi du 30 juin 2025, décret n° 2026-662
du 23 juillet 2026 ; preuve conservée trois ans, consentement valable un
an au plus — [CNIL](https://www.cnil.fr/fr/prospection-commerciale-par-telephone-hors-automate-dappel-quelles-sont-les-regles)).
Le produit journalise des appels (interactions `call`) et proposera un
lien `tel:` sur la fiche (chantier B) : le statut d'autorisation devra
porter le canal (email, téléphone), pas seulement l'email.

### C.2 Ce que posent les quatre provenances du produit

| Provenance (`contacts.source`) | Ce que fait le produit | Ce que dit le droit | Statut à poser par défaut |
|---|---|---|---|
| **`import`** (CSV d'un ancien outil, d'un fichier acheté ou loué) | crée les fiches sans aucune question sur la provenance ; elles entrent dans les cibles et partent dans la vague comme les autres | il faut s'assurer que « les adresses électroniques utilisées ont été collectées de manière régulière » ([CNIL, règles d'or](https://www.cnil.fr/fr/les-regles-dor-de-la-prospection-par-courrier-electronique-0)) ; si le cédant n'avait pas le consentement, l'acquéreur « doit … recueillir lui-même, préalablement, le consentement » ; information des personnes « au plus tard dans un délai d'un mois » avec « la source des données » ([CNIL, vente de fichiers](https://www.cnil.fr/fr/vente-de-fichiers-clients-la-cnil-rappelle-les-regles)) | **non établi** (exclu des newsletters), avec provenance déclarée (nom de la source, date) ; l'assistant d'import pose la question et refuse un fichier « acheté ou loué » pour les particuliers |
| **`manual`** (saisie après un rendez-vous, carte de visite, email reçu confirmé) | fiche créée sans champ de consentement | si le rendez-vous a produit une vente ou une prestation : exception « client » de L34-5, à condition d'avoir proposé le refus **à la collecte** ; sinon prospect B2C = consentement ; carte de visite d'un professionnel = régime B2B | **non établi**, sauf : « client » quand une affaire gagnée existe (statut `client`, produits analogues), ou coche explicite « consentement recueilli le … de telle manière » |
| **`lead`** (formulaire du site, `POST /api/leads`) | aucune case ni texte de consentement transmis ; le lead crée la fiche | c'est le seul endroit où un consentement « par une action positive et spécifique » peut naître ; il faut la copie du texte présenté et l'horodatage (CEPD) | **autorisé** si et seulement si le formulaire a envoyé `consent = true` avec la version du texte ; sinon non établi |
| **`external`** (Calendly) | fiche créée à la prise de rendez-vous | la prise de rendez-vous fonde un message **relationnel** (confirmation, rappel), pas une newsletter ([CNIL, finalité du message](https://www.cnil.fr/fr/communication-electronique-quelles-regles)) | **non établi** pour la newsletter ; les emails du rendez-vous restent permis |
| Adresse issue d'un email reçu (**ingestion**, confirmée → `manual`) | fiche créée ou rattachée | aucune page CNIL nommée ; un email reçu n'est pas un espace public, mais recevoir un message ne vaut pas consentement d'un particulier ; professionnel = régime B2B | **non établi** ; « professionnel » possible si l'adresse est nominative sur un domaine d'entreprise et le sujet en rapport avec la profession |

### C.3 Le statut d'autorisation par contact — ce qu'il faut stocker

Un booléen `opt_in` ne satisfait ni le CEPD ni l'état de l'art : Brevo
journalise « Each step of the DOI process … as an event » et garde
« the exact moment of subscription and the ID of the form used »
([Brevo](https://help.brevo.com/hc/en-us/articles/208733449-Double-opt-in-DOI-What-it-is-and-how-to-track-user-sign-ups) [éditeur]) ;
Mailchimp enregistre « a plain-text version of your form » et une source
d'inscription immuable ([Mailchimp](https://mailchimp.com/help/collect-consent-with-gdpr-forms/) [éditeur]).

**Tables proposées** (migration → STOP) :

| Table / colonne | Contenu | Pourquoi |
|---|---|---|
| `consent_events` (journal, jamais modifié) | `contact_id`, `organization_id`, `channel` (email, phone), `status` (`granted`, `client`, `professional`, `not_established`, `objected`), `basis` (consentement, client analogue, intérêt légitime B2B), `source` (`site_form`, `double_opt_in`, `import`, `manual`, `ingestion`, `calendly`, `deal_won`, `unsubscribe`, `complaint`), `occurred_at`, `recorded_by` (personne ou système), `text_version_id` (la version figée du texte présenté), `evidence` (identifiant du formulaire, nom du fichier importé et du cédant, référence de l'affaire — jamais une IP), `note` | « how, when, the information provided » (CEPD) ; la preuve survit à la fusion et à la pierre tombale |
| `consent_texts` | versions figées des textes de consentement présentés (formulaire du site, page de réservation), par organisation, avec date | « a copy of the information that was presented » |
| `contacts.email_consent_status`, `email_consent_at` (dérivés du dernier événement, en cache) | le statut courant, lu par la vague, les cibles, la fiche | une requête simple ; la vérité reste dans le journal |
| `contacts.phone_consent_status`, `phone_consent_at` | idem téléphone (loi du 30 juin 2025) | la fiche affiche « appelable » ou non |
| Liste repoussoir = `email_suppressions (unsubscribed, complained)` **par organisation**, plus une **empreinte** (`sha256` de l'adresse en minuscules) conservée ≥ 3 ans après suppression de la fiche | l'adresse en clair disparaît avec la fiche (pierre tombale), l'empreinte reste et bloque une ré-importation | CNIL : liste repoussoir en empreintes, ≥ 3 ans |

**Ce que la vague fait avec** : elle n'envoie qu'aux statuts `granted`,
`client` (si le sujet est analogue — l'organisation le coche par
newsletter : « sujet analogue aux services déjà fournis ») et
`professional` ; elle exclut `not_established` et `objected`, **compte et
explique** (« 41 exclus : 38 sans autorisation établie, 3 opposés ») ; les
exclus restent visibles sur la fiche avec un bouton « Enregistrer une
autorisation » (qui, quand, comment, texte) et un lien « Demander le
consentement » (un email relationnel unique de re-consentement, texte
figé, un clic = `double_opt_in`). Les cibles gagnent un critère
« autorisation email » et affichent le compte envoyable. L'import déclare
sa provenance et n'autorise jamais seul. Le formulaire du site et la page
de réservation (chantier F) transmettent le consentement avec sa version
de texte. Les emails **relationnels** (confirmation de rendez-vous,
rappel, lien de connexion, invitation) ne dépendent pas du statut.

### C.4 Ce que le produit fait déjà bien, et ce qui manque dans chaque email

Déjà là : identité de l'émetteur (From au nom de l'organisation, pied de
page « Vous recevez cet email parce que vous êtes en contact avec … »),
désinscription dans chaque message et en un clic, adresse postale exigée,
politique de confidentialité liée, mesure annoncée. Manquent, au regard
de L34-5 et de la CNIL : **la source des données** (« informé … de la
source d'où proviennent les données utilisées » — obligatoire pour un
contact importé, dans le mois) et, pour le crédit, le rappel « clair,
précis et visible » du droit d'opposition **et de ses modalités** exigé par
l'art. L312-9 du code de la consommation dans tout document envoyé par
courrier électronique (§D). Le pied de page devra dire d'où vient
l'adresse (« adresse recueillie lors de notre rendez-vous du … » /
« transmise par … ») quand la provenance est un import ou un tiers.

---

## D. Conformité métier des contenus

### D.1 Le principe

Le contrôle est **déterministe et lexical** : si un motif est présent dans
le texte rendu et que la mention exigée est absente, il signale. Il **ne
garantit rien** : ni la taille des caractères (au cœur de L312-8, R313-2,
RG AMF 325-12, ACPR 2019-R-01 § 4.1.3), ni l'« équilibre » avantages /
risques (une appréciation), ni la qualification du message (elle dépend
« de la finalité du message », pas du contenu), ni la véracité d'un
chiffre. Il s'applique **au texte généré comme au texte manuel** (doctrine
IA du brief), sur le corps et séparément sur le pied de page ; il est
insensible à la casse et aux accents, sur limites de mots ; chaque règle
est désactivable par l'organisation **avec trace** (les faux positifs sont
structurels : « taux » dans « taux d'ouverture », « prêt » dans « prêt à
vendre »). Rien de tout cela ne remplace un avis juridique — à écrire dans
le produit, sinon la fonction devient elle-même trompeuse.

### D.2 Les règles, en tables modifiables par le super_admin

Deux tables (migration → STOP) : `compliance_mentions` (code, pack métier,
texte exact fr/en, source, URL, position exigée : corps / en-tête / pied
de page) et `compliance_rules` (code, pack, motifs — une liste
d'expressions —, mention exigée ou interdiction, gravité, source, URL,
active). Semées par pack avec les lignes ci-dessous, **chaque ligne
sourcée** ; une ligne sans source n'est pas semée. Extraits de la table
complète (46 règles dans le rapport de recherche, scratchpad
`recherche-legal-conformite.md` §11) :

**Courtier en crédit (IOBSP)** — code de la consommation et CMF.

| Code | Motif | Mention exigée / interdiction | Source |
|---|---|---|---|
| C1 | `crédit`, `prêt`, `emprunt`, `financement immobilier`, `mensualité` | **« Un crédit vous engage et doit être remboursé. Vérifiez vos capacités de remboursement avant de vous engager. »** (au caractère près, toute publicité sauf radio) | [L312-5](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032226198) |
| C2-C3 | `TAEG`, `taux`, `%`, `coût du crédit` | si un taux ou un coût apparaît : taux débiteur et sa nature, montant total, TAEG, durée, montant dû, échéances, par **exemple représentatif** ; par courrier électronique, ces informations « sous forme d'encadré, en en-tête » | [L312-6](https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006069565/LEGISCTA000032221981/), [L312-9](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032226190) |
| C4 | tout message de prospection crédit par courriel | rappel « clair, précis et visible » du droit de s'opposer sans frais **et de ses modalités** | [L312-9](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032226190) |
| C6 | `rachat de crédit`, `regroupement de crédits`, `une seule mensualité` | si des échéances sont comparées : somme des coûts totaux des crédits antérieurs **et** coût total après regroupement, « de manière claire et apparente » | [L312-10 al. 2](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032226188) |
| C7 | `sans justificatif`, `réponse immédiate`, `améliore votre budget`, `réserve d'argent` | **interdit** : laisser entendre que le prêt améliore la situation financière ou qu'il est accordé sans appréciation | [L312-10 al. 1](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032226188) |
| C9 | `frais de dossier`, `versement`, `acompte`, ou positionnement d'intermédiaire | **« Aucun versement, de quelque nature que ce soit, ne peut être exigé d'un particulier, avant l'obtention d'un ou plusieurs prêts d'argent. »** + nom et adresse des établissements pour le compte desquels l'intermédiaire exerce | [L322-2](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032225704) |
| C10 | `assurance emprunteur`, `délégation d'assurance`, `loi Lemoine`, `changer d'assurance de prêt` | coût en TAEA **et** en euros sur 8 ans et sur la durée du prêt ; droit de résilier à tout moment ; « souscrire auprès de l'assureur de son choix » | [L313-8, L313-10](https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006069565/LEGISCTA000032222229/), [loi 2022-270](https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000045268729) |
| C11 | `crédit immobilier`, `prêt immobilier` | délai de réflexion de dix jours, vente subordonnée au prêt, remboursement si le prêt n'est pas obtenu | [L313-3](https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006069565/LEGISCTA000032222211/2022-05-06/) |
| C13 | **pied de page** sans `ORIAS` ni numéro d'immatriculation | nom, adresse, **catégorie d'intermédiaire**, numéro d'immatriculation et moyen de le vérifier, réclamations, coordonnées de l'ACPR — « Les publicités et les correspondances émanant de l'intermédiaire doivent également comporter ces informations » | [R519-20 CMF](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000039324573), [FAQ IOBSP ACPR, q. 19](https://acpr.banque-france.fr/system/files/2025-01/201703_faq_iobsp.pdf) |

La newsletter de démo « Assurance de prêt : changer, même après 4 ans »
(capture `nl-brouillon.png`) déclencherait C1 (« prêt », « mensualité »),
C10 (« assurance emprunteur »), C13 (pied de page sans ORIAS) : trois
signalements sur un texte que la revue actuelle juge propre.

**CGP / CIF** — RG AMF, guide AMF 2021, DOC-2011-24, ACPR 2019-R-01.

| Code | Motif | Mention exigée / avertissement | Source |
|---|---|---|---|
| F1-F2 | `performance`, `rendement`, `% par an`, `TDVM`, `a rapporté`, `sur 5 ans` | **« Les performances passées ne préjugent pas des performances futures »**, ni en note de bas de page ni en petite taille ; période de référence et source ; jamais « l'élément principal » | [AMF DOC-2011-24](https://www.amf-france.org/sites/institutionnel/files/private/2023-02/DOC-2011-24_VF15_PRIIPs.pdf), [guide AMF 2021](https://www.amf-france.org/sites/institutionnel/files/private/2021-04/guide-communications-a-caractere-promotionnel-20210426.pdf) |
| F5 | `SCPI`, `assurance-vie`, `PER`, `unités de compte`, `private equity`, `FCPR`, `OPCVM`, `ETF`, `actions`, `crypto`, `produit structuré` | mention explicite **« présente un risque de perte en capital »** (« non garanti en capital » ne suffit pas), dès le début du message | AMF DOC-2011-24, guide AMF 2021 |
| F6-F7 | `SCPI` + `crédit` ; `SCPI fiscale`, `Malraux`, `déficit foncier`, `Pinel` | risque de l'associé si vente des parts et dividendes ne remboursent pas ; investissement « ne doit pas être considéré comme liquide » avant le terme | AMF DOC-2011-24 |
| F8 | (`performance`, `rendement`) **et** (`sécurité`, `sans risque`, `garanti`, `sérénité`) | **alerte forte** : « il n'apparaît pas envisageable de présenter une accroche commerciale associant les notions de "performance" et de "sécurité" » | guide AMF 2021 |
| F9 | un avantage sans risque dans le même message | « tout risque pertinent … d'une manière bien en évidence », police au moins égale à la police dominante | [RG AMF 325-12](https://www.legifrance.gouv.fr/codes/section_lc/JORFTEXT000000606599/LEGISCTA000025399871/2024-04-01) |
| F10-F12 | `assurance-vie`, `fonds euros`, `arbitrage`, `rachat` ; `capital garanti` | risques « dans le corps principal du texte publicitaire » ; garantie invoquée seulement si **inconditionnelle** ; un taux annoncé identifié comme **passé**, avec sa période | [ACPR 2019-R-01](https://acpr.banque-france.fr/system/files/import/acpr/media/2020/08/05/14._recommandation_2019-r-01.pdf) §§ 4.1.2-4.4.9 |
| F13 | **pied de page** sans `CIF` / numéro d'immatriculation / association professionnelle | « Toutes les informations y compris les communications à caractère promotionnel, quel qu'en soit le support … comportent » nom, adresse, statut de CIF, numéro d'immatriculation, association | [RG AMF 325-9 et 325-5](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000046130022) |

**Agent immobilier** — arrêté du 10 janvier 2017, CCH, décret 72-678.

| Code | Motif | Mention exigée / interdiction | Source |
|---|---|---|---|
| I1-I2 | `à vendre`, `prix`, `€` + `appartement`, `maison`, `T2`…, `m²` ; `honoraires`, `frais d'agence` | prix **honoraires inclus et hors honoraires**, TTC en caractères plus grands, qui paie ; « Honoraires : » suivi du pourcentage TTC quand ils sont à la charge de l'acquéreur | [arrêté du 10/01/2017, art. 3](https://www.legifrance.gouv.fr/loda/id/JORFTEXT000033888549/) |
| I3 | `à louer`, `loyer` | loyer (+ charges), honoraires TTC du locataire, dépôt de garantie, meublé ou non, commune, surface | arrêté, art. 4 |
| I4-I6 | I1 ou I3 | **« classe énergie »** et **« classe climat »**, lisibles et en couleur (diffusion « par un réseau de communication électronique ») ; dépenses théoriques annuelles ; **« Logement à consommation énergétique excessive »** pour F et G | [R126-21 à R126-24 CCH](https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006074096/LEGISCTA000043818607/) |
| I7 | **pied de page** sans numéro de carte professionnelle ni garant | sur « tous documents, contrats et correspondance à usage professionnel » : numéro **et lieu de délivrance** de la carte, dénomination, adresse, activité, **nom et adresse du garant** | [décret 72-678, art. 92](https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000006920568/1972-07-22) |
| I8 | `assermenté`, `agréé`, `habilité`, `certifié par l'État` | **interdit** : aucune mention faisant croire à un agrément ou une habilitation | décret 72-678, art. 92 |
| I9 | `changez d'agence`, `votre mandat arrive à expiration`, `résiliez votre mandat` | **alerte déontologie** : interdiction d'« inciter les prospects ou les clients d'un confrère à rompre leurs relations commerciales » — une règle de relance visant les vendeurs sous mandat ailleurs tombe littéralement dedans | [décret 2015-1090, art. 10](https://www.legifrance.gouv.fr/loda/id/JORFTEXT000031113441/) |

**Transverses** : désinscription et identité dans chaque message (T1-T2,
L34-5 et CNIL) ; objet en rapport avec le contenu (T3, L34-5) ; adresse
postale, identification « publicité » et 10 jours ouvrés pour un
destinataire aux États-Unis (T4, FTC) ; source des données pour un contact
importé, dans le mois (T5, CNIL) ; blocage dur de la liste repoussoir
(T6) ; re-consentement au-delà de trois ans sans contact (T7).

### D.3 Ce qui change dans le produit

1. **Le pied de page devient un objet réglementé** : les faits de
   l'organisation gagnent, par pack, `orias_number`,
   `intermediary_category`, `professional_card_number` et
   `professional_card_issuer`, `guarantor_name` et `guarantor_address`,
   `cif_association`, en plus de `legal_mention` libre (migration → STOP) ;
   `buildFooter` les rend selon le pack ; la carte « Pied de page » dit ce
   qui manque et pourquoi (C13, F13, I7).
2. **La revue continue gagne une famille `missing_mention`** : même
   bandeau « À vérifier avant d'envoyer », un clic pose la mention au bon
   endroit (bloc « Mentions » en fin de corps, ou encadré en en-tête pour
   C3) avec le texte exact de `compliance_mentions` ; gravité
   « avertissement » par défaut, **bloquante si l'organisation le choisit**
   (réglage par règle, tracé). La revue est rejouée à l'envoi (aujourd'hui
   elle ne l'est jamais).
3. **Les mentions sont pré-insérées avant la génération** (§H.3) : un sujet
   « crédit » ou une cible d'un pack IOBSP pose le bloc C1 ; le prompt
   reçoit la liste des mentions déjà posées et l'interdiction de les
   reformuler.
4. **La démo et les packs** : chaque pack métier porte ses règles et ses
   mentions ; l'organisation de démo (courtier) doit avoir un pied de page
   ORIAS complet pour que chaque démonstration montre la conformité, pas
   son absence.
5. **Zone juridique à faire trancher, pas à automatiser** : le démarchage
   bancaire et financier (L341-1 CMF : « toute prise de contact non
   sollicitée … avec une personne déterminée ») — une relance
   individualisée à un prospect qui n'a rien demandé entre littéralement
   dans la définition, une newsletter à une liste consentie non ; le
   produit ne peut que rappeler la règle sur l'écran des règles de relance.

---

## E. Benchmark — réduire le temps d'écrire, relier au rendez-vous

Recherche du 2026-09-17 : 36 requêtes, plus de 60 pages officielles
ouvertes (tarifs, centres d'aide, catalogues). Les prix affichés par les
éditeurs correspondent le plus souvent au paiement annuel ; ce qui n'est
lisible qu'après interaction dans le navigateur est marqué « non publié ».
Le rapport complet, avec ses 68 sources numérotées, est dans le scratchpad.

### E.1 Les outils généralistes, sur les critères qui comptent pour clozado

| | Brevo | Mailchimp | MailerLite | HubSpot Marketing Hub | ActiveCampaign | beehiiv | Substack |
|---|---|---|---|---|---|---|---|
| Facturé sur | emails envoyés, contacts illimités ; Starter **7 €/mois** dès 5 000 emails ([tarifs](https://www.brevo.com/fr/tarifs/)) | contacts, **désinscrits compris** (« subscribed, non-subscribed, and unsubscribed contacts all count » — [paliers](https://mailchimp.com/help/mailchimp-pricing-tiers/)) ; Essentials dès 13 $ | abonnés + volume ; Comfort 11 €, palier 2 500 abonnés **29 €/mois** ([tarifs](https://www.mailerlite.com/pricing)) | contacts marketing + sièges ; Starter 20 $/siège, **+50 $ par 1 000 contacts** au-delà de 1 000 ([catalogue](https://legal.hubspot.com/hubspot-product-and-services-catalog)) | contacts ; prix « Demander un tarif » ([tarifs](https://www.activecampaign.com/pricing)) | abonnés ; Launch **0 $ jusqu'à 2 500 abonnés, envois illimités** ([tarifs](https://www.beehiiv.com/pricing)) | 0 $, 10 % des abonnements payants ([Substack](https://support.substack.com/hc/en-us/articles/360037607131-How-much-does-Substack-cost)) |
| Heure d'envoi optimisée | « Send at best time », **par contact**, plan Standard ; sans historique, moyenne Brevo tous comptes ; « All recipients will get the email within 24 hours » ([aide](https://help.brevo.com/hc/en-us/articles/4887607089810-Send-at-best-time-Optimize-your-email-sending-time)) | par contact, plan Standard, « si nous disposons de suffisamment de données », programmation 48 h à l'avance, **pas sur les emails automatiques** ([aide](https://mailchimp.com/help/use-send-time-optimization/)) | « Smart sending », par contact, **clics avant ouvertures**, 9 h par défaut sans historique ([aide](https://www.mailerlite.com/help/smart-sending-how-to-send-perfectly-timed-emails)) | global (Pro) et par contact (**Enterprise**), 90 jours d'historique, plage jusqu'à **7 jours** ([aide](https://knowledge.hubspot.com/marketing-email/optimize-marketing-email-send-time-for-individual-contacts)) | « Predictive Sending », Pro ; « +17 % » de clics [éditeur, **méthode non publiée**] ([page](https://www.activecampaign.com/platform/predictive-sending)) | non trouvé | non trouvé |
| IA de rédaction | Aura : email complet depuis un objectif et le profil de marque du site ([aide](https://help.brevo.com/hc/en-us/articles/11994642550674-Generate-marketing-content-with-Aura-Brevo-s-AI-powered-assistant)) | « Write with AI », beta, Standard+, AU/CA/UK/US, et **interdiction contractuelle** de contenu « related to … financial advice » ([aide](https://mailchimp.com/help/use-inline-content-generation/)) | HeyLite (GPT), Comfort+ | Breeze, Pro/Enterprise, à crédits | Active Intelligence, Plus+ | beehiiv AI dans l'éditeur, Scale+ | aucun |
| Clic → CRM | pipelines et affaires inclus ; automatisation « lien cliqué » ; étape **« Create a deal »** ([aide](https://help.brevo.com/hc/en-us/articles/10443056273554-Create-an-automation-to-automatically-create-deals)) | parcours sur activité, pas de pipeline publié | automatisations sur clic, pas de pipeline | natif ; attribution multi-touch **Enterprise** (3 600 $/mois + 7 000 $ d'onboarding) | pipelines et lead scoring en **add-on** | « Click-Triggered Automations » **Max et Enterprise** | rien |
| Pression marketing | **« Frequency cap »** natif, par contact et par période ([aide](https://help.brevo.com/hc/en-us/articles/7428460876690-Limit-your-marketing-pressure-with-sending-cadence-Frequency-cap-and-Email-overload-prevention)) | aucun (conseil éditorial) | aucun | « Email send frequency cap », **Enterprise** | aucun | aucun | aucun |
| Prévisualisation | « Preview as a customer » (contact réel, variables remplies) + « View in inbox » (Starter+), guide mode sombre ([aide](https://help.brevo.com/hc/en-us/articles/4741964626066-Preview-and-test-your-email)) | Desktop / Mobile, Inbox (payant), balises de fusion en direct (aide Mailchimp) | aperçu + test + envoi par fuseau | aperçu ; « Email approvals » Enterprise | aperçu + spam check | « Simulated Subscriber » ; tests 10 destinataires ; **liens en 404 avant publication** ([aide](https://www.beehiiv.com/support/article/4413249011607-previewing-and-sending-test-emails-of-your-post)) | — |
| Contrôle avant envoi | checklist Preview & Test | **Link Checker** (liens invalides, aide Mailchimp) | — | approbation (Enterprise) | spam check | — | — |
| Délivrabilité | double opt-in, List-Unsubscribe, liste de blocage ; IP dédiée en Professional/Enterprise, prix non publié, « at least three email campaigns per week to 3,000 or more contacts » ([aide](https://help.brevo.com/hc/en-us/articles/208835449-Introduction-to-dedicated-IPs)) | double opt-in | vérificateur d'emails ; désinscrits et rebonds non facturés | IP dédiée **300 $/mois** | BotSense, spam check | double opt-in avec statut *Pending* ; un clic **automatique** | — |

**Aucun des sept ne publie un contrôle d'attributs `alt` avant envoi.**
Aucun ne mesure la conversion en rendez-vous humain.

### E.2 Le « clé en main » pour les trois métiers

| Fournisseur | Métier | Ce qui existe | Prix | Source |
|---|---|---|---|---|
| Harvest **Fidnet** (ex-Fidroit) | CGP | newsletter mensuelle « personnalisée à vos couleurs » envoyée aux clients abonnés, trimestrielle PDF, articles à rediffuser | non publié | [fidnet-help.harvest.fr](https://fidnet-help.harvest.fr/communication/) |
| Les Echos Publishing | CGP, experts-comptables, notaires | newsletters thématiques dont « Patrimoine », « envoyées automatiquement à vos contacts en votre nom », hebdo à mensuelle | non publié | [lesechos-publishing.fr](https://www.lesechos-publishing.fr/solutions/newsletters) |
| COMM CGP (Revue Fiduciaire) | CGP | fil d'actualité + « Vos newsletters d'actualité mensuelles » | « À la demande » | [grouperf.com](https://boutique.grouperf.com/produit/Comm-CGP) |
| Simplébo | professions libérales | l'IA « Jacques » rédige la newsletter mensuelle depuis vos actualités ; « Vous validez, ou vous laissez envoyer en autonomie » ; jusqu'à 5 000 envois/mois | non publié (devis) | [simplebo.fr](https://www.simplebo.fr/newsletter-professionnelle) |
| Actusite | CGP, courtiers d'assurance, avocats | contenus « personnalisés à vos couleurs … dans des newsletters » | non publié | [actusite.fr](https://actusite.fr/page/28679/cgp) |
| Agents immobiliers, courtiers en crédit | — | **aucune offre française de contenu rédigé en marque blanche documentée** sur une page officielle ; le besoin est couvert par le logiciel métier ou une agence web | — | recherche négative |

Weelim, Patrimoine24, Netinvestissement et Immodvisor, cités dans la
consigne, **ne sont pas** des fournisseurs de newsletter clé en main
(cabinets, portail B2B, avis clients).

### E.3 Les logiciels métier

| Logiciel | Métier | Newsletter | Relances automatiques | Source |
|---|---|---|---|---|
| Hektor (La Boîte Immo) | immobilier | oui, « concevoir et envoyer des newsletters … directement depuis Hektor » | « envoi de mails 100 % automatiques » | [la-boite-immo.com](https://www.la-boite-immo.com/logiciel-immobilier/relation-client-crm) |
| Whise | immobilier | mass-mailing intégré, programmation | Marketing Automation en **option payante**, lead scoring ; « Gagne jusqu'à 10h de temps par prospect » [éditeur, méthode non publiée] | [whise.eu](https://www.whise.eu/produits/marketing-automation-immobilier/) |
| Netty / Modelo, Apimo, Immo-facile | immobilier | campagnes (Modelo InTouch), newsletters ciblées | alertes mails, Automator 2, « relances des acquéreurs inactifs automatisées » | [netty.fr](https://netty.fr/logiciel-immobilier/fonctionnalites), [apimo.net](https://apimo.net/fr/logiciel/), [immo-facile.com](https://www.immo-facile.com/) |
| Harvest O2S, Big | CGP | **non** : l'email y est utilitaire (mise à jour KYC par campagne) | relances réglementaires | [harvest.fr](https://www.harvest.fr/creation-et-mise-a-jour-des-informations-clients-dans-o2s/) |
| Upsideo | CGP | non publié | « relances automatiques dans le cadre d'une remédiation de la conformité » | [upsideo.fr](https://www.upsideo.fr/) |
| Eloa / eCrédits, Kiilt, Meilleurtaux Pro | courtage | rien de publié ; l'IA est sur le **montage du dossier** | non publié | [eloa.io](https://www.eloa.io/ecredits-immobilier), [kiilt.com](https://kiilt.com/) |

Lecture : côté immobilier la newsletter est **déjà dans le logiciel
métier**, comme un mass-mailing à composer soi-même ; côté CGP et
courtage, l'email du logiciel métier est **réglementaire**, pas commercial.
La case « écrire et envoyer une newsletter qui mène à un rendez-vous » est
vide chez tous.

### E.4 Les assistants IA — aucun gain de temps prouvé

Un seul éditeur publie un chiffre : ActiveCampaign, « 10 hours saved each
week », « 8x faster to build your first campaign » ([éditeur](https://www.activecampaign.com/platform/active-intelligence)),
**sans méthode, sans échantillon, sans période**. Jasper ne publie que des
témoignages clients (« 3 à 5 h par semaine ») ; Brevo dit d'Aura qu'elle
est « an inspiration tool » ; Mailchimp, MailerLite, HubSpot, beehiiv,
Copy.ai, Notion : non chiffré. Il n'existe **aucune mesure publiée
méthodologiquement défendable** du temps gagné par une IA de rédaction de
newsletter. Mesurer réellement « je veux envoyer » → « brouillon prêt »
dans clozado (§H, 14,4 s aujourd'hui) est une preuve que personne ne
détient.

### E.5 L'heure d'envoi — ce que les études valent

| Étude | Méthode | Résultat |
|---|---|---|
| MailerLite, « The Best Time to Send Email in 2026 » ([blog](https://www.mailerlite.com/blog/best-time-to-send-email)) | 2 138 817 campagnes, US/UK/AU/CA, décembre 2024 à novembre 2025 | ouvertures le matin (8-11 h), **clics le soir (18-21 h)** ; vendredi meilleur taux de clic moyen (8,09 %), mardi 7,84 % ; « Focusing campaigns on the time your audience is ready to click (evening) is generally more effective than simply aiming for the highest open rate » |
| GetResponse, Benchmarks 2024 ([rapport](https://www.getresponse.com/resources/reports/email-marketing-benchmarks)) | 4,4 milliards de messages, 2023 | créneaux 4-6 h et 17-19 h ; « little difference … between individual weekdays » ; **la première heure capte 44,14 % des clics**, ~85 % dans les 24 h |
| Mailchimp ([page](https://mailchimp.com/resources/insights-from-mailchimps-send-time-optimization-system/)) | « milliards d'individus », sans échantillon ni période | « 10 h, dans le fuseau horaire des destinataires » ; « aucun jour ne se démarque clairement » |

**La critique qui pèse le plus** : Apple Mail Privacy Protection
« downloads remote content in the background by default — regardless of
whether you engage with the email » ([Apple](https://www.apple.com/legal/privacy/data/en/mail-privacy-protection/)) ;
Apple pèse **62,26 %** des ouvertures observées en juillet 2026, Gmail
27,03 % ([Litmus](https://www.litmus.com/email-client-market-share)), et
Litmus juge ces ouvertures « not considered reliable opens ». GetResponse
le reconnaît sur son propre rapport (les auto-ouvertures « distort the
data »). Un moteur d'heure par contact qui pondère l'ouverture apprend en
partie le comportement des serveurs d'Apple. **Par contact contre
global** : tous les moteurs par contact exigent un historique (Brevo
« after sending at least a few email campaigns », Mailchimp « suffisamment
de données », HubSpot 90 jours) et **retardent l'envoi jusqu'à 24 h**
(Brevo, GetResponse « up to 23 hours »), 7 jours chez HubSpot ; Brevo
conseille « Send now » pour tout contenu daté. MailerLite est le seul à
documenter « clics avant ouvertures ».

### E.6 Repères de taux par secteur — contexte, jamais objectif

Avec l'avertissement Apple : les ouvertures publiées après 2021 sont
surestimées dans une proportion inconnue.

| Source (données) | Finance | Immobilier | Toutes activités |
|---|---|---|---|
| GetResponse 2024 (2023, 4,4 Md de messages — [rapport](https://www.getresponse.com/resources/reports/email-marketing-benchmarks)) | clic 5,34 %, désinscription **0,08 %**, spam 0,01 %, rebond 1,79 % | clic 3,51 %, désinscription 0,17 %, **rebond 4,86 %** | clic 5,14 %, désinscription 0,14 %, rebond 2,79 % |
| Campaign Monitor 2022 (2021, 100 Md — [guide](https://www.campaignmonitor.com/resources/guides/email-marketing-benchmarks/)) | clic 2,4 %, désinscription 0,2 % | clic 3,6 % (« Real Estate, Design, Construction ») | — |
| Mailchimp (déc. 2023, campagnes ≥ 1 000 abonnés — [page](https://mailchimp.com/resources/email-marketing-benchmarks/)) | « Affaires et finance » : clic 2,78 %, désinscription 0,15 % | non publié | clic 2,62 %, désinscription 0,22 % |

Ce qu'on lit malgré le bruit : le clic tient un discours cohérent
(2,4 à 5,3 % en finance) là où l'ouverture divague ; **l'immobilier
rebondit deux fois et demie plus que la finance** (adresses qui se
périment) — l'hygiène de base est un argument produit ; la finance se
désinscrit deux fois moins que la moyenne si le contenu est utile. Ces
chiffres servent de **contexte** dans les recommandations (§I) ; ils ne
sont jamais un objectif pour une organisation, et jamais affichés sans
leur source.

### E.7 Clic → vente : ce qui existe, et ce que personne ne fait

La chaîne clic → score → affaire → attribution n'est réunie que dans
HubSpot Enterprise ou par assemblage manuel dans Brevo (« Create a deal »
sur score, formulaire, échéance de contrat ou rendez-vous pris — plus de
50 affaires ouvertes exige un package Sales). Le déclencheur de clic est
un produit d'appel monétisé (beehiiv Max, ActiveCampaign add-on, HubSpot
Enterprise). L'IA de Mailchimp refuse le « financial advice ». Et personne
ne pilote la newsletter **sur le rendez-vous obtenu** : l'attribution est
calibrée sur une commande en ligne, pas sur « un rendez-vous humain puis
une souscription six mois plus tard ».

**Ce qu'on retient pour un conseiller seul** : piloter sur le clic et le
dire ; si une heure d'envoi optimisée existe un jour, clics avant
ouvertures et délai affiché ; le gain de temps de l'IA se mesure, il ne se
cite pas ; le concurrent du CGP n'est pas Mailchimp, c'est Fidnet — qui ne
vend rien ; côté immobilier et courtage, il n'y a pas de clé en main à
concurrencer mais un logiciel métier à compléter, et une base qui se
périme vite.

---

## F. La boucle commerciale — du clic au rendez-vous

### F.1 Ce qui existe

- **Clic → fiche** : oui. Chaque clic arrive par webhook (`email.clicked`,
  avec l'URL), s'écrit dans `email_events` et sur le message
  (`first/last_clicked_at`, `click_count`), et apparaît dans le journal
  unifié de la fiche (« Email cliqué → lien », `activities.ts:461-476`) ;
  la tuile « Dernier clic » est l'un des quatre indicateurs de la fiche.
- **Clic → règle** : **non, et même l'inverse.** Le clic compte comme
  « dernière interaction » (`engagement.ts:44`) : il rend la règle « sans
  interaction depuis X jours » **silencieuse**. Les seuls déclencheurs
  liés à l'email sont négatifs (`email_not_opened`, `email_not_clicked`,
  sur le dernier email remis). Aucun déclencheur « a cliqué ».
- **Clic → affaire, clic → rendez-vous** : **aucune mesure.** Aucune
  jointure entre `email_events` et `appointments` ou `deals` ; aucune
  origine « newsletter » dans le funnel ; le composer n'ajoute **aucun
  paramètre UTM** aux liens, si bien qu'un lead créé sur le site après un
  clic n'est attribué à la vague que si le site le fait lui-même.
- **Le lien de rendez-vous** : `{lien_rdv}` n'existe que dans les gabarits
  de règles (valeur = `users.booking_url` du profil) ; dans une
  newsletter, c'est une URL tapée dans l'encart (la démo tape
  `https://rendez-vous.example/claire-vasseur`). Un rendez-vous pris par
  Calendly arrive par webhook signé, crée ou retrouve le contact, et
  arrête ses envois automatiques — pas les newsletters.
- Un rendez-vous ou une affaire créés à la main ne « savent » pas d'où
  ils viennent : `deals.lead_id` ne relie qu'un lead du site, `origins`
  ne connaît que l'acquisition web.

### F.2 La boucle proposée, par le moteur de règles existant

Tout passe par ce qui existe : un déclencheur de plus, une action de
plus, un réglage par organisation, des liens qui disent d'où ils
viennent. Aucune décision par l'IA.

1. **Chaque lien d'une newsletter porte sa nature.** Les blocs `cta` et
   `bouton` sont commerciaux par construction ; les liens du bloc
   `sources` sont éditoriaux ; le lien de désinscription est technique.
   À l'envoi, chaque URL de l'encart est réécrite avec `utm_source=<slug>`,
   `utm_medium=email`, `utm_campaign=<id de la newsletter>`,
   `utm_content=<id du bloc>` (le suivi de clic Resend enveloppe l'URL,
   les paramètres restent dans l'URL finale) — ce qui donne
   l'**attribution d'un lead du site à une vague** par `/api/leads`, qui
   lit déjà `utm_*` (`leads.ts:133-135`). Migration : non (les blocs sont
   des données, l'URL est calculée au rendu).
2. **Un déclencheur `clicked_commercial_link`** : un clic sur un lien
   commercial d'une newsletter il y a plus de N jours, **et aucun
   rendez-vous ni aucune affaire créée pour ce contact depuis ce clic**
   (rendez-vous : `appointments.created_at` ; affaire :
   `deals.created_at`). N = `organizations.click_follow_up_days`, réglé par
   l'organisation, **5 jours ouvrés par défaut** — un défaut de produit,
   pas un repère de marché (aucune source ne donne un délai). SQL sur
   `email_events (type = 'clicked')` joint à `newsletter_blocks` par l'URL
   réécrite (`utm_content`). Anti-répétition : un contact traité par cette
   règle pour cette newsletter ne l'est pas deux fois.
3. **Une action `propose_deal`** : crée une tâche « Proposer un
   rendez-vous à {contact} (a cliqué « {titre de l'encart} » le {date}) »
   pour le conseiller **et**, si l'organisation l'a choisi, une affaire à
   la première étape, type par défaut, `origin = newsletter` (nouvelle
   ligne dans `origins`, semée par pack), libellé « {sujet} — {contact} »,
   reliée à la fiche. L'affaire proposée est marquée comme telle (journal
   `deal_events` : « proposée par la règle … après un clic ») ; le
   conseiller la garde ou la perd avec le motif « Sans suite » — jamais
   un envoi, jamais une qualification par l'IA.
4. **Le lien de rendez-vous dans le composer** : `{lien_rdv}` devient une
   variable de la newsletter, résolue au rendu par le `booking_url` du
   signataire (ou de l'expéditeur), avec un encart prêt « Prendre
   rendez-vous » ; le chantier F (page de réservation) remplacera la
   valeur, pas la variable.
5. **La mesure** (§G) : par newsletter, « cliqué puis rendez-vous sous
   N jours » et « cliqué puis affaire sous N jours » = contacts ayant
   cliqué un lien commercial et dont un rendez-vous (`appointments.starts_at`
   ou `created_at`) ou une affaire (`deals.created_at`) existe dans les
   N jours qui suivent le premier clic. Un rendez-vous pris par la page
   de réservation avec `utm_campaign` (chantier F) sera attribué à la
   vague directement.

Migration : oui (`origins` semée « newsletter », `organizations.click_follow_up_days`,
et le déclencheur / l'action dans les CHECK de `rules`) → STOP avant
application. Effort M. Preuve : deux contacts de test sur les alias de
l'utilisateur, un clic simulé par webhook signé, un rendez-vous saisi pour
l'un ; après N jours simulés (horloge de test), une tâche et une affaire
proposées pour l'autre seulement.

---

## G. Les indicateurs — une définition unique, en français

Le produit a déjà une règle saine : des comptes, jamais des taux inventés
(« des comptes, jamais des taux inventés », `send-status-card.tsx:240`),
et « ouvert » dit « approximatif » partout. Voici la définition unique
que tout écran, toute règle et tout critère de cible devront lire — la
vérité est en base (`email_messages`, `email_events`), un fragment SQL par
indicateur dans `src/db/queries/engagement.ts` et `email-sends.ts`.

| Indicateur | Définition (une phrase) | Calcul | Aujourd'hui |
|---|---|---|---|
| **Envoyés** | messages remis au fournisseur pour cet envoi | `status NOT IN (queued, draft, failed, canceled)` | ✓ |
| **Délivrés** (« remis ») | messages acceptés par le serveur du destinataire | `delivered_at IS NOT NULL` | ✓ (« Remis ») |
| **Rebonds durs** | adresses refusées définitivement (boîte inexistante, domaine mort) — supprimées aussitôt | événement `bounced` avec `bounce.type` permanent ; = lignes de suppression `bounced` créées par cet envoi | ✓ partiel (« Rejetés » = `status = bounced`, durs et temporaires confondus) |
| **Rebonds temporaires** | messages retardés ou refusés provisoirement (boîte pleine, serveur absent) — réessayés par le fournisseur | événements `delivery_delayed` + `bounced` non permanent, par message | ✗ non distingués |
| **Plaintes** | destinataires qui ont cliqué « spam » chez leur messagerie — supprimés aussitôt, jamais recontactés | événements `complained` ; = suppressions `complained` | ✗ reçues, **jamais affichées** |
| **Désinscriptions** | destinataires qui ont demandé à ne plus recevoir (page ou un clic) | événements `unsubscribed` rattachés aux messages de l'envoi | ✓ |
| **Clics uniques** | destinataires ayant cliqué au moins un lien (hors désinscription) | `first_clicked_at IS NOT NULL` — par personne, pas par clic | ✓ (« Cliqués ») |
| **Taux de clic** | clics uniques rapportés aux **délivrés** (jamais aux envoyés) | clics uniques ÷ délivrés, affiché seulement si délivrés ≥ 100 (seuil de produit) | ✗ aucun taux |
| **Ouverture (approximative)** | destinataires dont la messagerie a chargé le pixel — un préchargement automatique (Apple Mail) compte comme une ouverture | `first_opened_at IS NOT NULL`, toujours libellé « approx. », jamais un taux, jamais un déclencheur positif | ✓ |
| **Cliqué puis rendez-vous sous N jours** | destinataires ayant cliqué un lien commercial puis eu un rendez-vous (pris ou tenu) dans les N jours | clic commercial × `appointments` du contact dans `[clic, clic + N j]` | ✗ (§F) |
| **Cliqué puis affaire sous N jours** | idem avec une affaire créée pour ce contact | clic commercial × `deals.created_at` | ✗ (§F) |
| **Pression** (§I) | emails reçus par un contact sur 30 jours, toutes natures (newsletter, règle, 1:1) | `count(email_messages) WHERE sent_at > now − 30 j` par contact | ✗ (seuls les `automatic` sont comptés) |

Règles d'affichage (proposées) : un taux n'apparaît qu'au-dessus de
100 délivrés, sinon « trop peu de délivrés pour un taux » ; les plaintes
sont toujours affichées, même à zéro ; l'ouverture n'entre dans aucun
taux, aucune règle positive, aucune recommandation ; aucune comparaison
« au marché » sans source citée (§E).

---

## H. L'assistance à la création — existant et proposition

### H.1 Ce qui existe (vérifié)

| Élément | État |
|---|---|
| Fournisseur, modèle | Anthropic, un seul modèle pour tout : `ANTHROPIC_MODEL` ‖ `claude-sonnet-5` (`anthropic.ts:299`, `:507-509`) — le « modèle économique » Haiku décrit dans `docs/module-mails.md` n'existe plus |
| Génération | `designNewsletter` : sortie structurée par outil (`emit_newsletter`), `max_tokens` 8 192, bloc système en cache par cible (identité en six facettes, ton, règles, sujets déjà envoyés), matière citée, **règle absolue des chiffres** (chiffres vérifiés cités avec source et date, chiffre lu dans la matière cité, sinon `[placeholder]`), un seul encart, jamais de signature, objet ≤ 42, pré-en-tête ≤ 85 ; validation zod puis revue déterministe avant `done` |
| Revue continue | `review.ts` : chiffre non autorisé, chiffre venu d'une source, passage recopié (8 mots), lien étranger, source non citée, source inconnue, bloc Sources vide, plusieurs encarts, objet / pré-en-tête trop longs — **avertissements seulement**, jamais rejoués à l'envoi |
| Veille | résumés originaux (contrôle 12 mots), recherches datées, classification des titres de concurrents, écart de contenu ; brouillon depuis le panier ou un écart |
| Signature | signataire par défaut de la cible (nom + fonction) ; **aucun écran** pour en créer un (graine de démo seulement) |
| Modèle / gabarit | aucun modèle de newsletter ; les huit blocs ; `cta_presets` jamais lus |
| Coût par appel | **aucun suivi** en base ni en journal (`message.usage` n'est lu que pour compter les recherches web) ; le journal du chantier contenu a mesuré ≈ 15 s et ≈ 0,03-0,05 $ par génération, ≈ 5-8 $ par mois pour la veille d'une organisation active ; avec les tarifs Anthropic (Sonnet 5 : 2 $ le million de jetons lus, 10 $ écrits, table du 2026-06-24), une génération de 4 000 jetons lus (dont le système en cache) et 3 000 écrits vaut ≈ 0,04 $ — cohérent |
| Mesuré le 2026-09-17 | **14,4 s** du clic « Rédiger l'email » au brouillon prêt (objet, pré-en-tête, blocs, sujets, deux signalements de revue) ; 12,8 s avant le premier texte visible |
| Interrupteur IA | aucun par organisation ; sans clé, la génération répond 503 et la veille continue sans résumés |
| Prompts en dur | ton par défaut « professionnel, direct, jamais condescendant », « cabinet de conseil (crédit, patrimoine, assurance) », résumés « en français quelle que soit la langue » (`anthropic.ts:393`, `:535`, `:539`, `:588`) — le pack métier et la langue de l'organisation devraient les porter |

### H.2 Les suggestions de sujets — trois sources, chacune avec sa provenance

| Source | Existe ? | Proposition |
|---|---|---|
| **1. La veille** | oui : panier, articles par sujet, écart de contenu (sujets traités par un concurrent et par aucune de nos newsletters) | garder ; afficher la provenance « veille · {source} · {date} » sur chaque suggestion |
| **2. Le calendrier éditorial métier** | **non** | une table `editorial_calendar` par pack métier (courtier, CGP, immobilier), **chaque ligne sourcée** (texte ou page officielle, URL), modifiable par le super_admin : par exemple, pour un courtier, « renouvellement ORIAS avant le 31 janvier » (source secondaire à confirmer, §B.4 de l'audit UX), « PTZ : conditions de l'année », « taux d'usure trimestriel (Banque de France) », « loi Lemoine : changer d'assurance à tout moment » ; pour un CGP, « déclaration de revenus (avril-juin) », « PER avant le 31 décembre », « IFI » ; pour l'immobilier, « DPE : calendrier des interdictions de louer », « taxe foncière (octobre) ». Chaque suggestion affiche « calendrier métier · {source} » ; aucune date n'est inventée : une ligne sans source n'est pas semée |
| **3. Les sujets qui ont fait cliquer** | **non** (la donnée existe : `newsletters.topics` + clics par message) | par organisation, les sujets des newsletters envoyées classés par clics uniques ÷ délivrés, **seulement si délivrés ≥ 100** ; sinon « il manque d'historique » ; provenance « tes envois · {n} newsletters » |

Ces trois listes s'affichent sur `/newsletters` (« Écrire sur… »), chacune
avec sa provenance ; un clic ouvre le composer avec le brief, la matière
et, pour la source 2, les mentions métier attendues (§D) déjà posées.

### H.3 Du sujet au brouillon

Le composer fait déjà plan, objet, pré-en-tête et blocs dans la voix de
la cible en un appel. Manquent : (1) les **mentions pré-insérées** selon
le métier et le sujet (§D : un sujet « crédit » pose le bloc de mentions
crédit avant même la génération, la revue contrôle qu'il est là) ; (2) la
**signature** (écran de création des signataires, ou repli sur
l'expéditeur) ; (3) le **ton et les règles de l'organisation** saisis par
un écran (réglages, carte Marque) au lieu du défaut en dur ; (4) un flux
**vraiment progressif** : afficher chaque bloc dès qu'il arrive (le flux
NDJSON existe, mais l'écran reste vide 12,8 s sur 14,4) ; (5) l'objet trop
long **proposé raccourci** (deux variantes) plutôt que seulement signalé.

**Mesure « je veux envoyer » → « brouillon prêt »** : aujourd'hui, depuis
`/veille`, 3 clics + 14,4 s (+ le brief si on le complète). Objectif après
construction : 2 clics depuis une suggestion (« Écrire sur… » → « Rédiger »),
premier bloc visible < 3 s, brouillon complet ≤ 15 s, mentions métier déjà
là. À rejouer avec le même script (`_tmp-d1-compose.ts`, scratchpad).

---

## I. Cadence et pression

### I.1 Ce qui existe

Rien pour les newsletters : ni cadence cible, ni compteur par contact
toutes natures, ni fenêtre, ni heure programmée, ni fuseau par contact
(une seule colonne, `organizations.timezone`). La carte « Envois
automatiques » (interrupteur, période, heures de bureau) ne concerne que
les emails de règle : au plus un email `automatic` par contact par
période (14 jours par défaut), toutes règles confondues ; la fenêtre n'est
qu'un avertissement depuis le 2026-09-02. Les tests, les brouillons de
règle envoyés à la main (`manual`) et les newsletters ne sont ni comptés
ni plafonnés. L'anti-répétition par cible (« Déjà reçu par ces contacts :
3 newsletters ») est informative.

### I.2 Proposition

| Élément | Règle | Où |
|---|---|---|
| **Pression par contact** | nombre d'emails reçus sur les 30 derniers jours, **toutes natures** (`newsletter`, `automatic`, `manual`) ; un fragment SQL unique (`engagement.ts`), index existant `email_messages_org_kind_sent_idx` | fiche contact (tuile « Emails reçus sur 30 jours »), vague, règles |
| **Plafond** | `organizations.max_emails_per_contact_30d` (défaut de produit **4**, à valider — aucun repère sourcé) : un contact au plafond est **exclu de la vague**, compté et expliqué (« 12 exclus : plafond de 4 emails sur 30 jours »), et `skipped: pressure` dans les règles | carte d'envoi, journal des règles, réglage sur la carte existante « Envois automatiques » renommée « Envois » (pas de nouvelle carte) |
| **Cadence cible** | `cadence_targets(organization_id, funnel_stage, per_month)` : par organisation et par étape du funnel (prospect, projet en cours, client) ; défauts par pack **non chiffrés** tant qu'aucune source ne les donne (§E dira si un repère existe) | réglage, et un indicateur par cible : « cette cible reçoit en moyenne 1,2 newsletter par mois ; cadence cible : 2 » |
| **Recommandation déterministe** | trois phrases possibles, expliquées : « au-dessus de la cadence cible » / « en dessous » / « il manque d'historique » (moins de 3 envois ou moins de 100 délivrés sur la cible) | `/newsletters`, carte d'envoi |
| **Volume minimum** | aucune statistique par contact ou par cible sous 100 délivrés ; aucune « heure recommandée » sans historique (§J) | partout |

Migration : oui (deux colonnes, une table) → STOP. Effort S pour la
pression et le plafond, M pour la cadence.

**Repères de marché, sourcés, pour la recommandation** (jamais des
cibles) : désinscription 0,08 % en finance et 0,17 % en immobilier,
rebond 4,86 % en immobilier (GetResponse 2024, §E.6) ; « la première heure
capte 44,14 % des clics » (GetResponse) ; « aucun jour ne se démarque
clairement » (Mailchimp). Une recommandation de cadence ne cite un repère
qu'avec sa source, et dit « il manque d'historique » tant que
l'organisation n'a pas trois envois et cent délivrés.


---

## J. Le plan

Grille : impact usage (fort / moyen / faible), impact conversion (fort /
moyen / faible — ce qui fait signer un prospect en démo et rester un
pilote), complexité pour l'utilisateur (retire / neutre / ajoute), effort
(S / M / L), migration (oui / non). Règles du brief appliquées : une
statistique n'est retenue que si le volume la rend significative, et le
seuil est dit ; rien ne repose sur les ouvertures seules ; aucune
dépendance payante sans validation ; huit fonctionnalités au plus hors
garde-fous, prévisualisation et horaire.

### J.1 Les garde-fous d'envoi (partie 2, première étape construite) — hors décompte

| Garde-fou (brief) | Ce qui existe | Ce qui manque | Preuve prévue |
|---|---|---|---|
| Statut d'autorisation par contact ; la vague exclut et dit combien / pourquoi ; prospects importés non autorisés par défaut | rien (§C) | `consent_events`, `consent_texts`, statuts en cache, critère de cible, import déclaré, formulaire du site avec texte figé | un import de 3 contacts sur les alias de l'utilisateur : exclus et comptés ; un consentement enregistré : envoyé |
| Suppression définitive des rebonds durs, plaintes, désinscriptions ; **plateforme** pour rebonds durs et plaintes ; réactivation admin tracée avec motif | suppression par organisation, webhook, irréversible pour `unsubscribed` seulement ; `email.suppressed` ignoré | table `platform_suppressions` (rebonds durs, plaintes), lecture à la mise en file **et** à la remise, `email.suppressed` → suppression, réactivation (admin, motif, journal), empreintes ≥ 3 ans | adresses de simulation du fournisseur (rebond, plainte) : plus jamais ciblées nulle part, dans aucune organisation |
| Désinscription en un clic (en-têtes) | ✓ RFC 8058 (§B.3) | `mailto:` ; preuve que DKIM couvre les en-têtes | en-têtes bruts d'un message reçu |
| Quotas par organisation, montée progressive | aucun (le plan gratuit freine par hasard) | `organizations.daily_send_cap` posé en base par le super_admin, défaut de produit **200 le premier jour**, doublé après chaque vague sans dépassement de seuil, jamais au-dessus du quota du compte ; la vague annonce l'étalement | une vague de 500 avec un plafond de 200 : 200 partent, 300 attendent, l'écran le dit |
| Seuils de rebonds et de plaintes par vague et par organisation, en base, modifiables par le super_admin → pause automatique, explication à l'admin, alerte super_admin | aucun | `send_health_thresholds` (défauts proposés §B.5 : pause à 2 % de rebonds durs ou 0,05 % de plaintes sur ≥ 200 remis ; alerte à 1 % / 0,03 %), calcul à chaque webhook, `organizations.sending_paused_at` + motif, email d'alerte au super_admin | une vague à rebonds > seuil met l'organisation en pause, les autres continuent ; les liens de connexion ne sont pas affectés (flux séparé) |
| Écran super_admin « Santé d'envoi » | aucun | par organisation : envoyés, remis, rebonds durs, plaintes, désinscriptions, taux, état du domaine, pause et motif, dernières 10 vagues ; plateforme : totaux et compte fournisseur | captures |
| **Séparation des flux** (candidate obligatoire) | aucune | second compte / seconde clé et sous-domaine pour connexion, invitations, notifications (§B.8 option 1) — dépendance nouvelle = STOP | un lien de connexion part pendant qu'une organisation est en pause |

### J.2 Les fonctionnalités retenues (huit au plus)

| # | Fonctionnalité, en une phrase | Usage | Conversion | Complexité | Effort | Migration | Section |
|---|---|---|---|---|---|---|---|
| **N1** | **Boucle commerciale** : un clic sur un lien commercial sans rendez-vous ni affaire sous N jours (réglé par l'organisation) propose une tâche et, au choix, une affaire à l'origine « newsletter », par le moteur de règles ; les liens portent leurs UTM ; `{lien_rdv}` entre dans le composer | fort | **fort** (c'est ce qui prouve qu'une newsletter rapporte) | neutre | M | oui | §F |
| **N2** | **Indicateurs uniques et écran par newsletter** : une définition par indicateur (§G), les plaintes affichées, un taux seulement au-dessus de 100 délivrés, « cliqué puis rendez-vous sous N jours », comparaison entre newsletters | fort | fort | retire (plus de doute sur ce qu'un chiffre veut dire) | M | non | §G |
| **N3** | **Mentions métier** : pied de page réglementé par pack (ORIAS, catégorie, carte professionnelle, garant, CIF, association), règles et mentions en tables du super_admin, revue qui signale la mention manquante et la pose en un clic, mentions pré-insérées avant génération | moyen | fort (une démo à un courtier sans « Un crédit vous engage » se remarque) | neutre | M | oui | §D |
| **N4** | **Suggestions de sujets à trois provenances** : veille, calendrier éditorial métier en table sourcée, sujets qui ont fait cliquer (≥ 100 délivrés) — chacune affichée avec sa provenance, un clic ouvre le composer | fort (le frein = écrire) | moyen | retire | M | oui | §H.2 |
| **N5** | **Pression et cadence** : emails reçus par contact sur 30 jours toutes natures, plafond par organisation qui exclut de la vague et le dit, cadence cible par étape du funnel, trois phrases de recommandation dont « il manque d'historique » | moyen | moyen (réputation) | neutre | S + M | oui | §I |
| **N6** | **Composer sans friction** : flux réellement progressif (premier bloc < 3 s), carte d'envoi présente dès le premier enregistrement, objet trop long proposé raccourci, ton et règles de l'organisation et signataires saisissables (plus de défaut en dur), langue du prompt = langue de l'organisation | fort | fort (visible en démo) | retire | S à M | non | §H.3, §A.3 |
| **N7** | **Domaine propre attendu, sous-domaine par organisation en repli** : rappel au premier envoi, volume plafonné tant que le domaine n'est pas vérifié, `<slug>.mail.clozado.fr` à la place du mutualisé unique (plan Resend Pro requis : 10 domaines, puis +100 pour 20 $/mois — dépense = validation) | faible (invisible) | moyen | neutre | M | oui | §B.8 |
| **N8** | **Hygiène de base** : rebonds temporaires cumulés (retrait après deux rebonds sur deux semaines, M3AAWG), purge RGPD des prospects sans contact depuis trois ans (F5 de l'audit UX), source des données dans le pied de page pour un contact importé | moyen | moyen | retire | S | non | §B.4, §C |

**Ordre proposé** : partie 2 (garde-fous, dont la séparation des flux en
premier) → N6 → N3 → N2 → N1 → N4 → N5 → N8 → N7 (N7 dépend du plan du
compte). Partie 3 (prévisualisation et contrôle avant envoi) et partie 4
(horaire selon le destinataire) suivent le brief ; la partie 4 se limite
aux modes immédiat, date fixe (fuseau de l'organisation) et heure locale
du destinataire (fuseau du contact, à créer) — l'heure recommandée par
contact n'est pas retenue (§J.3).

### J.3 Non retenu, et pourquoi

| Idée | Raison |
|---|---|
| **Heure recommandée par contact** (candidate obligatoire du brief) | **Pas maintenant** : (1) aucune organisation n'a d'historique (0 envoi réel, 7 clics dans la démo) ; (2) les moteurs du marché exigent plusieurs campagnes d'historique et **retardent l'envoi jusqu'à 24 h** (Brevo, GetResponse), 7 jours (HubSpot) — incompatible avec un contenu daté (taux du mois, échéance) ; (3) le signal d'ouverture est corrompu (Apple 62 % des ouvertures) et seuls les clics valent, trop rares par contact pour une base de quelques centaines de personnes. **Règle de reprise** (seuils de produit, déclarés comme tels) : reconsidérer quand une organisation a au moins 3 vagues, 200 délivrés et 5 clics horodatés pour au moins 20 % de ses contacts ; d'ici là, la partie 4 offre l'heure **locale** du destinataire, sans apprentissage |
| Heure globale « apprise » par organisation | même absence d'historique ; les repères publiés (« aucun jour ne se démarque », clics le soir) se contredisent d'une étude à l'autre |
| IP dédiée | 30 $/mois, plan Scale, > 3 000 envois/jour, plancher 90 000/mois pour rester chaude : hors d'échelle |
| Une « team » Resend par organisation, changement de fournisseur | facturation ingérable ; migration = dépendance nouvelle sans gain sur les options 1-3 |
| Double opt-in **obligatoire** pour tout contact | le droit ne l'impose pas (Mailchimp le dit) ; il est **offert** comme source de preuve (`double_opt_in`) et recommandé pour le formulaire du site |
| Taux d'ouverture comme indicateur, règle ou recommandation | signal corrompu (§E.5) ; reste affiché « approx. », jamais utilisé |
| Tests A/B d'objet | volume insuffisant pour une différence significative sur des vagues de quelques centaines ; à reconsidérer au-dessus de 2 000 délivrés par vague |
| Lead scoring opaque | doctrine : déterministe et expliqué ; N1 est un déclencheur explicite, pas un score |
| Repères de marché comme objectifs affichés | contexte sourcé seulement (§E.6) |
| Contenu rédigé acheté (Fidnet, Les Echos Publishing) | c'est le composer de clozado qui rédige ; ces fournisseurs ne relient rien au pipeline |
| Adhésion Signal Spam, certification CSA | décisions de plateforme (adresse abuse@, procédures) : à instruire au production-ready, pas ici |
| Vérification des attributs `alt`, poids des images | pas de bloc image dans le composer ; sans objet tant qu'il n'existe pas |
| Centre de préférences (fréquence choisie par le contact, thèmes) | utile après N5 ; une page publique de plus à protéger — après |

---

## K. Ce que cet audit ne prouve pas

- **Aucun envoi réel d'une organisation cliente n'existe** : tout ce qui
  concerne les taux, la cadence et l'heure part d'un historique vide ; la
  démo est simulée.
- **Le plan du compte Resend** n'est pas lisible par l'API ; « gratuit »
  vient du journal du 2026-08-27, à confirmer.
- **La couverture DKIM des en-têtes `List-Unsubscribe`** par Resend n'a
  pas été vérifiée sur un message reçu (partie 2 le fera par les en-têtes
  bruts).
- **La catégorie AUP de Resend** pour un courtier en regroupement de
  crédits est une lecture, pas une réponse du fournisseur.
- **Les pages de Brevo** (aide et tarifs) étaient inaccessibles à la
  recherche délivrabilité (403) ; Brevo est absent des options
  d'isolation, pas des tableaux du benchmark (pages tarifs lues en HTML).
- **La mesure du composer** est une génération unique (14,4 s), pas une
  moyenne ; le coût par appel vient du journal du chantier contenu et des
  tarifs publiés, pas d'un suivi en base (il n'existe pas).
- **Le démarchage bancaire et financier** (L341-1 CMF) appliqué aux
  relances individualisées est une question de juriste, non tranchée ici.
- Les recherches web n'ont trouvé aucun avis d'utilisateur de Fidnet,
  Les Echos Publishing ou COMM CGP : on connaît leur offre, pas leur usage.

## L. Méthode et preuve

- **Code** : deux lecteurs à périmètres disjoints (chaîne d'envoi ;
  contenu, IA, cibles, analytique), rapports `inventaire-envoi.md`
  (11 sections) et `inventaire-contenu.md` (9 sections) dans le
  scratchpad, chaque ligne `fichier:ligne` sur `main` = `d9585fa` ; les
  affirmations reprises ici ont été revérifiées avant rédaction.
- **Production, en lecture** : API Resend (`GET /domains`,
  `GET /domains/{id}`, `GET /webhooks`) avec la clé de `.env.local` ; DNS
  public par DNS-over-HTTPS (Google) ; base de production (colonnes,
  newsletters, messages, événements, suppressions, provenances, tables) par
  `scripts/_tmp-d1-data.ts` ; écrans en session forgée
  (`_tmp-d1-shots.ts`, `_tmp-d1-shots2.ts` : veille, newsletters, composer,
  cibles, règles, emails reçus, réglages, newsletter envoyée et brouillon —
  12 captures, 6 relues).
- **Production, une écriture** : une génération IA dans la démo
  (`_tmp-d1-compose.ts`, brief de deux phrases, cible « Primo-accédants »),
  chronométrée, puis la newsletter créée supprimée de la base
  (`864f2936…`) ; rien n'a été envoyé.
- **Web** : trois recherches (délivrabilité : 32 requêtes, 41 pages ;
  base légale et conformité : 31 requêtes, ~45 pages dont 6 PDF officiels
  extraits ; benchmark : 36 requêtes, > 60 pages), rapports
  `recherche-delivrabilite.md`, `recherche-legal-conformite.md`,
  `recherche-benchmark-newsletter.md` dans le scratchpad, chaque
  affirmation avec son URL ; les chiffres repris ici portent tous leur
  source.
- Les scripts `_tmp-d1-*` restent hors dépôt (gitignorés) et sont copiés
  dans le scratchpad de la session avec les rapports.
