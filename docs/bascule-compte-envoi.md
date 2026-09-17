# Changer de compte d'envoi marketing — la procédure

Le produit envoie par DEUX comptes Resend (audit newsletter du
2026-09-17, §B.8 ; `src/lib/email/flows.ts`) :

- le **compte transactionnel** : liens de connexion et codes, invitations
  d'espace, notifications aux conseillers, réception des emails sur
  `in.clozado.fr`. Variables : `RESEND_API_KEY`, `EMAIL_FROM`,
  `EMAIL_SHARED_DOMAIN`, `EMAIL_INBOUND_DOMAIN`, `RESEND_WEBHOOK_SECRET`.
  **Il ne bouge jamais** : rien de ce qui connecte une personne ne dépend
  du compte marketing.
- le **compte marketing** : newsletters, envois de test, vagues des
  règles, domaines d'envoi des organisations, suivi des ouvertures, clics,
  rebonds et plaintes. Variables : `RESEND_MARKETING_API_KEY`,
  `EMAIL_MARKETING_DOMAIN`, `RESEND_MARKETING_WEBHOOK_SECRET`.

Aucune valeur liée à un compte n'est dans le code : la clé, le domaine
mutualisé et le secret du webhook sont des variables d'environnement ; les
identifiants de domaine des organisations chez le fournisseur sont en
base (`organizations.email_domain_provider_id`). Changer de compte, c'est
remplacer les trois variables — et refaire ce que le fournisseur ne
transporte pas d'un compte à l'autre.

## Ce qu'un compte Resend ne transporte pas

| Élément | Pourquoi il est propre au compte | Conséquence |
|---|---|---|
| Le domaine `news.clozado.fr` et sa **clé DKIM** | la clé publique DKIM est générée par compte : un nouveau compte donne un nouvel enregistrement `resend._domainkey.news` | à recréer, et l'enregistrement DNS à remplacer chez Hostinger |
| Les domaines des organisations (ex. un cabinet avec son propre domaine) | mêmes raisons ; leur identifiant fournisseur en base appartient à l'ancien compte | à redéclarer depuis la carte « Domaine d'envoi » des réglages de chaque organisation concernée, après avoir retiré l'ancien |
| Le webhook et son **secret de signature** | un webhook appartient au compte qui émet les événements | à recréer, nouveau secret |
| La liste de suppression et les statistiques | propres au compte | les désinscriptions du produit vivent en base (`unsubscribes`), elles ne dépendent pas du fournisseur ; l'historique fournisseur ne suit pas |
| Le plan (quota journalier et mensuel, nombre de domaines) | par compte | vérifier le plan du nouveau compte AVANT la bascule |

## La procédure, dans l'ordre

1. **Créer le nouveau compte** avec une adresse dédiée. Vérifier le plan :
   le plan gratuit plafonne à 100 emails par jour et 3 000 par mois — le
   produit met un envoi en pause et le dit (« le quota journalier du
   fournisseur est atteint »), il reprend seul le lendemain.
2. **Créer une clé « Full access »**, sans restriction de domaine :
   l'application crée, vérifie et retire les domaines des organisations
   par l'API. La poser dans `.env.local` sous `RESEND_MARKETING_API_KEY`.
   Vérifier qu'elle vient d'un compte distinct : `GET /domains` et
   `GET /webhooks` avec cette clé ne doivent rien montrer du compte
   transactionnel (domaines `mail.clozado.fr`, `in.clozado.fr`, webhook
   existant).
3. **Créer le domaine** `news.clozado.fr` par l'API (région `eu-west-1`,
   chemin de retour `send`, sous-domaine de suivi `links`, suivi des
   ouvertures et des clics) :

   ```
   POST https://api.resend.com/domains
   {"name":"news.clozado.fr","region":"eu-west-1","custom_return_path":"send",
    "tracking_subdomain":"links","open_tracking":true,"click_tracking":true}
   ```

   La réponse donne les enregistrements DNS. Les noms sont relatifs à la
   zone `clozado.fr` chez Hostinger : `resend._domainkey.news` (TXT, la
   clé DKIM — **la valeur change à chaque compte**), `send.news` (MX
   priorité 10 vers `feedback-smtp.eu-west-1.amazonses.com`, et TXT
   `v=spf1 include:amazonses.com ~all`), `rsend.news` (CNAME vers le
   relais indiqué par la réponse), `links.news` (CNAME de suivi, valeur
   indiquée par la réponse), plus `_dmarc.news` (TXT `v=DMARC1; p=none;`)
   que Resend ne demande pas mais que les grands fournisseurs de boîtes
   exigent. Ne toucher à aucun enregistrement de `mail`, `in` ni de la
   racine.
4. **Poser les enregistrements chez Hostinger**, puis demander la
   vérification (`POST /domains/{id}/verify`) et attendre le statut
   `verified` (quelques minutes après la propagation ; une heure au plus).
5. **Créer le webhook** par l'API vers
   `https://clozado.vercel.app/api/webhooks/resend`, événements
   `email.sent`, `email.delivered`, `email.delivery_delayed`,
   `email.bounced`, `email.complained`, `email.opened`, `email.clicked`,
   `email.failed` — jamais `email.received`, qui reste au compte
   transactionnel. Le `signing_secret` de la réponse va dans
   `RESEND_MARKETING_WEBHOOK_SECRET`. La route accepte les deux secrets à
   la fois (`webhookSecrets()`), l'ancien et le nouveau peuvent coexister
   le temps de la bascule.
6. **Poser les trois variables** sur Vercel, en Production et en Preview :
   `RESEND_MARKETING_API_KEY`, `EMAIL_MARKETING_DOMAIN=news.clozado.fr`,
   `RESEND_MARKETING_WEBHOOK_SECRET`. Elles ne sont vues qu'au
   déploiement suivant : pousser un commit, ou redéployer depuis le
   dashboard.
7. **Redéclarer les domaines des organisations** qui en ont un : dans les
   réglages de l'organisation, carte « Domaine d'envoi », retirer puis
   déclarer à nouveau ; l'identifiant fournisseur en base est remplacé par
   celui du nouveau compte, la clé DKIM du cabinet change et lui est
   redonnée par la carte.
8. **Retirer l'ancien webhook et l'ancienne clé** dans l'ancien compte,
   une fois le nouveau vérifié ; fermer l'ancien compte s'il ne sert plus
   à rien.

## Vérifier que rien n'est parti entre-temps

- Avant la bascule, noter dans l'écran des newsletters les envois en
  cours ou en pause : un envoi en pause reprend avec la clé du moment ; le
  laisser finir avant de changer de clé, ou le garder en pause.
- Le journal du serveur dit une fois par processus si le flux marketing
  n'est pas isolé (`email_marketing_flow_not_isolated`) ou si le domaine
  mutualisé manque (`email_marketing_domain_missing`) : après le
  déploiement, ces deux lignes doivent avoir disparu.
- Envoyer un **test** depuis la démo vers une seule adresse de test :
  l'en-tête `From` porte `@news.clozado.fr` (ou le domaine vérifié de
  l'organisation), et les événements `email.sent` puis `email.delivered`
  arrivent sur le webhook signés par le nouveau secret (la route répond
  `accepted`, jamais `invalid_signature`).
- Demander un **lien de connexion** : il part toujours de `EMAIL_FROM` sur
  `mail.clozado.fr`, par le compte transactionnel — s'il ne part pas, la
  bascule n'y est pour rien, vérifier `RESEND_API_KEY`.
- Les compteurs d'une newsletter envoyée (envoyés, en attente, en échec)
  se recomptent depuis les messages : aucun ne dépend du fournisseur.

## Historique

- 2026-09-17 : bascule vers un second compte provisoire (adresse dédiée,
  plan gratuit) — domaine `news.clozado.fr` et webhook créés par l'API,
  DNS à poser chez Hostinger, variables Vercel à poser. Le compte définitif
  suivra la même procédure.
