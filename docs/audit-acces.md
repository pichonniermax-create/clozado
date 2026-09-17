# Audit — accès contrôlé à l'inscription (chantier J, partie 1)

Document seul, court, comme convenu. Date : 2026-09-17. Ce qui est
chiffré l'est à partir de tarifs publics cités ; ce qui ne l'est pas est
dit tel quel.

## 0. Ce qui compte

1. **Aujourd'hui, n'importe quelle adresse crée un espace complet** en
   trois clics, sans vérification, avec accès à tout ce qui coûte : envois
   au nom du domaine mutualisé `mail.clozado.fr`, composer et veille par
   IA, ingestion, API, déclaration de domaines. Aucun quota par
   organisation n'existe : seules des limites de débit par minute.
2. **Le compte d'envoi est mutualisé** : une suspension chez Resend, ou
   une réputation dégradée du domaine partagé, touche tous les espaces en
   même temps — y compris les liens de connexion tant que le second compte
   n'est pas en place.
3. **L'invitation existe déjà** (module invitations, migration 0018) : un
   lien réservé à une adresse, expirant, révocable, qui crée l'espace à la
   soumission. C'est la porte « fermée » du produit ; il manque la porte
   « demande d'accès » et, derrière les deux, des quotas.
4. Recommandation : **option (a)**, demande d'accès validée à la main,
   avec la démo publique en lecture seule comme terrain d'exploration
   immédiat — et les quotas de l'option (b) construits ensuite, parce
   qu'un espace approuvé a aussi besoin de bornes.

## A. Existant

**Qui peut créer un espace.** Toute personne avec une adresse plausible,
hors domaines réservés aux exemples, par `/inscription`
(`src/lib/auth/actions.ts`, `signUpAction`) : nom du cabinet + email. Trois
inscriptions par minute et par adresse IP. Ou par un lien d'invitation
réservé à une adresse (`/inscription?invitation=<jeton>`). Aucune
vérification de profession, d'entreprise, ni d'adresse professionnelle.

**Ce qu'il obtient immédiatement** (`createOrganizationWithAdmin`,
`src/db/queries/signup.ts`) : une organisation avec lui comme admin, le
pipeline et les statuts par défaut, un type d'affaire, une clé de site
publique pour la collecte des visites — puis, après le lien de connexion,
**tout le produit** : contacts, affaires, tâches, partages PRM avec
commissions, newsletters envoyées depuis `<slug>@mail.clozado.fr` (domaine
mutualisé, `EMAIL_SHARED_DOMAIN`), règles de relance qui envoient seules,
composer et mise en page par IA, veille quotidienne résumée par IA,
adresse d'ingestion d'emails, clés d'API et réception de leads, jusqu'à
trois déclarations de domaine d'envoi par jour, invitations d'espaces
(vue globale exclue).

**Ce qui est limité.** Des limites de débit seulement, en mémoire d'une
instance, donc indicatives : inscription 3/min/IP, connexion 10/min/IP et
3 liens par adresse et 10 minutes, mise en page IA 20 par heure et par
utilisateur, domaines 3 par jour et par organisation, leads 120/min par
clé, rendu de newsletter 60/min. **Aucun quota** de contacts, d'envois,
d'appels IA, de stockage ni de membres par organisation ; aucune notion
de plan, d'essai ou de facturation (`docs/module-invitations.md §1.4`).

**Ce qui coûte, à chaque espace créé** : les appels à l'API Anthropic
(composer, mise en page, veille du matin pour chaque organisation ayant
des sujets, lecture des signatures d'emails reçus), les envois Resend
(newsletters, relances, tests, liens de connexion — un seul compte pour
l'instant), la base Neon (stockage des contacts, des emails reçus, des
images de marque en `bytea`), les fonctions Vercel. Rien n'est facturé à
l'utilisateur : tout est à la charge du produit.

## B. Benchmark — comment les SaaS des professions réglementées ouvrent l'accès

Pages lues le 2026-09-17 ; « proxy » = site qui refuse les robots, lu par
un relais, contenu de la page d'origine.

| Produit | Ouverture de l'accès | Essai | Vérification | Source |
|---|---|---|---|---|
| HubSpot (CRM gratuit) | inscription libre, « No credit card required » | gratuit sans limite de durée, 2 utilisateurs, 1 000 contacts | aucune | https://www.hubspot.com/products/crm |
| Pipedrive | inscription libre | « 14 jours d'essai. Aucune carte de crédit requise. » | aucune | https://www.pipedrive.com/fr/pricing |
| Attio | inscription libre | plan gratuit (3 sièges, 50 000 fiches) + 14 jours de Pro | aucune | https://attio.com/pricing |
| Harvest (O2S, Fidnet), CGP | formulaire de contact seulement, « Notre équipe va vous recontacter » ; ni prix ni essai | aucun | aucune mention | https://www.harvest.fr/contact/ (proxy) |
| MoneyPitch (Harvest), CGP | « Demander une démo » | aucun affiché | aucune mention | https://www.harvest.fr/produit/moneypitch/ (proxy) |
| Eloa (eCrédits), courtiers | « Réservez votre démo gratuite », rappel téléphonique ; champs : prénom, nom, email, téléphone, société | promotion datée de 2022, obtenue par une démo de 30 min ; pas d'essai libre | aucune (ni ORIAS ni SIREN demandés) | https://www.eloa.io/demo (proxy) |
| Hektor (La Boîte Immo), immobilier | « Réserver une démo », brochure | aucun ; prix non publiés | aucune mention | https://www.la-boite-immo.com/logiciel-immobilier/gestion-biens-immobiliers |
| Apimo, immobilier | formulaire « Nous contacter » ; prix affichés 89 et 139 €/mois | aucun | aucune mention | https://apimo.com/fr |
| Netty → Modelo, immobilier | « Demander une démo » ; tarifs sur formulaire de rappel | aucun | aucune mention | https://modelo.fr/tarifs |
| Qonto (compte pro, contrôle d'entreprise) | ouverture en ligne avec pièces : identité du dirigeant, statuts, justificatif de siège, immatriculation SIREN/SIRET, bénéficiaires ≥ 25 % | — | existence juridique et identité ; pas la profession | https://qonto.com/fr/open-an-account |

Non vérifié : Manymore (site en erreur 503 toute la session) ; « Lorem »
(aucun éditeur de ce nom trouvé).

Lecture. Les généralistes sont en libre-service sans vérification ; **tous
les éditeurs métier français lus passent par une démo ou un contact
commercial**, sans essai libre-service ni contrôle d'habilitation
affiché ; la fintech vérifie l'entreprise, pas la profession. L'option (a)
est donc la norme de la cible, pas une exception qui la ferait fuir.

## C. Risques chiffrés par risque

Tarifs publics lus le 2026-09-17 : Resend (https://resend.com/pricing :
Free 3 000 emails par mois et 100 par jour, 3 domaines ; Pro 20 $ par mois
pour 50 000, 10 domaines, 0,90 $ par millier au-delà) ; Anthropic
(https://claude.com/pricing : Sonnet 5 à 2 $ en entrée et 10 $ en sortie
par million de jetons, Opus 5 à 5 $ et 25 $, Fable 5.1 à 10 $ et 50 $) ;
Neon (https://neon.com/pricing : Free 0,5 Go et 100 heures de calcul par
projet ; Launch 0,35 $ par Go et par mois, 0,106 $ par heure de calcul) ;
Vercel (https://vercel.com/pricing : Hobby gratuit, 100 Go de transfert,
1 M d'invocations, 4 h de CPU actif par mois, « for personal,
non-commercial use » ; Pro 20 $ par mois).

| Risque | Ce qu'un inconnu peut engager aujourd'hui | Ordre de grandeur | Borne existante |
|---|---|---|---|
| **Usage de l'IA** | composer (jusqu'à 4 096 jetons de sortie par appel), mise en page, veille du matin, lecture des signatures reçues | un appel de composer ≈ 0,05 $ en Sonnet 5 (6 000 jetons d'entrée, 4 000 de sortie) ; la mise en page est bornée à 20 appels par heure et par utilisateur = 24 $ par jour au pire pour un seul compte ; la veille ≈ 0,05 à 0,20 $ par jour et par organisation ayant des sujets, tous les matins, tant que l'espace existe | débit par heure seulement ; aucun plafond par jour ni par organisation |
| **Envois** | newsletters et vagues de règles depuis le domaine mutualisé, sans plafond par organisation | 5 000 contacts importés et une newsletter par jour = 150 000 emails par mois : au-delà du plan Pro, ≈ 90 à 115 $ de dépassement ; sur le plan gratuit, le plafond de 100 par jour est atteint par le premier envoi de quiconque | quota du compte Resend, partagé par tous ; 3 domaines déclarés par jour et par organisation |
| **Stockage** | contacts, emails reçus (corps stockés si l'option est cochée), images de marque en base (jusqu'à ≈ 1,4 Mo par organisation depuis le cadrage) | négligeable en argent (0,35 $ par Go et par mois) ; le risque est un import massif qui fait sortir du plan gratuit Neon (0,5 Go) et ralentit tout le monde | aucune limite de taille d'import ni de nombre de contacts |
| **Réputation d'envoi mutualisée** | un inscrit qui envoie une newsletter non sollicitée depuis `<slug>@mail.clozado.fr` : plaintes et rebonds comptés sur LE domaine et LE compte de tout le monde | pas un coût : une suspension du compte ou du domaine arrête les newsletters de tous les pilotes, et, tant que le second compte n'est pas en place, les liens de connexion aussi ; les seuils de plainte des fournisseurs se comptent en dixièmes de pour cent | aucune ; la séparation des comptes (en cours) limite le dégât aux newsletters |
| **Regard des concurrents** | tout le produit visible en trois clics : écrans, vocabulaire, règles, composer | pas chiffrable | aucune |
| **Plan Vercel** | la production tourne sur le plan Hobby, « for personal, non-commercial use » (crons à la précision de l'heure, journaux d'une heure) | le passage à Pro coûte 20 $ par mois ; le risque n'est pas l'argent mais les conditions d'usage à respecter avant d'ouvrir au public | — |

## D. Options

| Option | Ce que voit un inconnu | Ce que ça protège | Ce que ça coûte | Effort | Migration |
|---|---|---|---|---|---|
| **(a) Demande d'accès validée par moi, espace ouvert manuellement** | un formulaire de demande (nom, cabinet, profession, SIREN, numéro ORIAS ou de carte, email, message) et la démo publique ; une confirmation « nous revenons vers vous sous 24 h » | tout : aucun coût engagé, aucun envoi, aucune fuite du produit avant ton accord ; la réputation d'envoi reste entre des mains connues | un geste manuel par demande (une carte dans ton espace gestionnaire : approuver → l'espace est créé et le lien part ; refuser → une phrase) ; un délai pour le prospect, compensé par la démo et par une notification immédiate chez toi | **S à M** : une table `access_requests`, le formulaire, la carte, deux emails | oui (une table) |
| **(b) Inscription libre, espace bridé tant que tu n'as pas approuvé** | un espace tout de suite, sans envoi, sans IA, borné (par exemple 50 contacts), avec un bandeau « en attente d'ouverture » | les coûts et la réputation, à condition que **chaque** chemin qui coûte vérifie l'état : envois, règles, veille, composer, ingestion, API, domaines — sept gardes à poser et à prouver | plus de code, plus de surface d'oubli ; des espaces inconnus qui s'accumulent et qu'il faut purger ; le produit reste visible d'un concurrent (formulaires, écrans, vocabulaire) | **M** | oui (état de l'organisation + quotas) |
| **(c) Inscription libre réservée aux adresses professionnelles, quotas serrés** | comme aujourd'hui, mais refus des domaines grand public (gmail, outlook, orange…) | peu : un domaine se loue pour quelques euros ; les quotas seuls protègent les coûts, pas la réputation ni le regard des concurrents | les quotas doivent exister (ils n'existent pas), et une liste de domaines à tenir | **M à L** | oui (quotas) |

**Recommandation : (a), maintenant.** Trois raisons. La phase est celle
de quinze pilotes et d'une prospection en octobre : chaque demande mérite
une réponse humaine, et une file de demandes est une liste de prospects
qualifiés. La démo publique en lecture seule couvre déjà le « je veux
voir tout de suite » qui fait l'argument de (b). Et (a) est ce qui se
construit en moins de temps avec le moins de surface d'erreur : une
seule porte, fermée par défaut.

Ce que (b) a de juste et qu'il faut garder : **des quotas par
organisation** (contacts, envois par jour, appels IA par jour, membres),
parce qu'un espace approuvé peut aussi déraper — une adresse compromise,
un import massif, une règle mal réglée. Ils viennent en second lot, avec
un plafond visible dans les réglages, jamais silencieux.

## E. Vérification de la profession — ce qui est déterministe

| Registre | Ce qui est public | Automatisable ? | Source |
|---|---|---|---|
| **ORIAS** (courtiers IOBSP, CIF, IAS…) | recherche publique par n° SIREN, n° ORIAS, dénomination, nom ; fiche par SIREN : statut inscrit/radié, catégories avec leurs dates, code NAF, RCS, autorité, encaissement de fonds autorisé ou non ; 72 666 intermédiaires au 31/12/2025 | **partiellement** : un « web service ORIAS » existe sur inscription et autorisation (fichiers par API ou Excel), avec des conditions strictes (accès réservé aux personnes autorisées, confidentialité, interdiction d'extraire la base) ; **le site public interdit contractuellement les robots et l'exploitation commerciale** — pas de scraping ; aucun jeu sur data.gouv.fr | https://www.orias.fr/home/showAdvancedSearch , https://www.orias.fr/webService/inscription , https://ws.orias.fr/webService/mentionsLegalesWebService , https://orias.fr/home/documents/ORIAS-STATIC-HOME-MENTIONS-LEGALES |
| **CIF** | inscrits à l'ORIAS (filtre « CIF » et association) ; l'AMF renvoie à l'ORIAS, GECO ne liste que les associations | comme l'ORIAS | https://www.amf-france.org/en/professionals/other-professionals/financial-investment-advisor-status-fia |
| **Agents immobiliers** (carte professionnelle) | fichier tenu par CCI France, site public prévu par le décret 2015-703 art. 5 (identité, numéro et validité de la carte, chambre, RCS, activités, garant, assureur) ; carte valable 3 ans | **non** : le site est derrière un mur anti-robot, aucun export ni jeu de données ouvert ; contrôle humain seulement | https://www.legifrance.gouv.fr/loda/id/JORFTEXT000030754020 , https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000051898206 |
| **SIRENE** (API Recherche d'entreprises) | dénomination, SIREN et SIRET, code NAF, état administratif, dirigeants, siège ; 7 appels par seconde, sans clé, Licence Ouverte 2.0 | **oui** pour l'existence et l'état actif d'une entreprise par SIREN ; **partiel** pour la profession : le NAF est déclaratif (66.19B « autres auxiliaires financiers » couvre conseils en placement et courtiers en crédit, 68.31Z les agences immobilières), un CGP peut être ailleurs | https://www.data.gouv.fr/fr/dataservices/api-recherche-dentreprises/ , https://www.insee.fr/fr/metadonnees/nafr2/sousClasse/66.19B , https://www.insee.fr/fr/metadonnees/nafr2/sousClasse/68.31Z |

Ce qui est faisable sans ton accord préalable : rien qui décide. Ce que je
propose de construire, avec ton accord : à la demande d'accès, le SIREN
est obligatoire et le numéro ORIAS ou de carte selon la profession ; la
carte de la demande, chez toi, appelle l'API Recherche d'entreprises
(raison sociale, NAF, état, dirigeants) et affiche les liens directs vers
la fiche ORIAS et le site CCI pour le contrôle humain. Le web service
ORIAS, s'il t'intéresse, se demande auprès de l'ORIAS ; ses conditions
interdisent toute constitution de base à partir du flux — il ne servirait
qu'à confirmer une demande, une à la fois.

Principe posé dès maintenant : la vérification **assiste** la décision,
elle ne la prend pas. La demande d'accès porte le SIREN et, selon la
profession, le numéro ORIAS ou de carte professionnelle ; la carte de la
demande, chez toi, affiche ce que les registres publics disent (raison
sociale, activité, inscription, catégories) avec le lien vers la fiche
officielle. Rien n'est refusé ni approuvé automatiquement sans ton
accord.

## F. Le mot de passe en option

**Ce que ce serait.** Une colonne `users.password_hash`, un formulaire
« email + mot de passe » à côté du lien, la réinitialisation par le lien
de connexion existant (c'est déjà, de fait, une réinitialisation), et —
parce qu'un mot de passe seul est le facteur le plus faible — une double
authentification.

| Sujet | Sans dépendance | Avec dépendance (STOP) | Effort |
|---|---|---|---|
| Stockage du mot de passe | `crypto.scrypt` de Node (sel par personne, poivre en variable d'environnement, paramètres mémoire réglables) | argon2id (`argon2`) : recommandé par l'OWASP, mais un module natif à compiler chez Vercel | S |
| Réinitialisation | le lien de connexion actuel, puis « choisir un nouveau mot de passe » ; expiration et usage unique déjà en place | — | S |
| Double authentification | TOTP (RFC 6238) en HMAC-SHA1 avec `crypto` de Node ; le secret affiché en texte et en adresse `otpauth://` ; codes de secours hachés | un générateur de QR (`qrcode`) pour l'enrôlement ; ou les **passkeys** (WebAuthn, `@simplewebauthn`) : résistantes à l'hameçonnage, sans mot de passe | M (TOTP) ; M (passkeys, avec dépendance) |
| Surface d'attaque | bourrage d'identifiants (mots de passe réutilisés), force brute (verrou après N essais, par adresse et par IP), hameçonnage (un mot de passe se donne, un lien de connexion moins), mots de passe faibles (vérification contre les listes connues = appel externe, STOP) | — | — |
| Support | « mot de passe oublié », « compte verrouillé », « j'ai perdu mon téléphone (2FA) » : trois motifs de contact qui n'existent pas avec le lien seul ; codes de secours à expliquer | — | — |

**Recommandation : pas de mot de passe.** Le lien de connexion, désormais
robuste (page de confirmation, code à six chiffres, durées en base),
prouve la possession de la boîte email — et la boîte email est de toute
façon le canal de réinitialisation de tout système à mot de passe : un
mot de passe n'apporterait pas plus de sécurité que la boîte qui le
réinitialise, et apporterait la surface (bourrage, force brute,
hameçonnage) et le support. Pour une cible qui manipule des données
patrimoniales, l'amélioration qui compte est un **second facteur sur la
session**, pas un premier facteur plus faible : d'abord des sessions
plus courtes pour les admins (le réglage existe), puis, quand une
dépendance sera acceptée, les **passkeys** — un clic, résistant à
l'hameçonnage, sans rien à retenir — avec le TOTP en repli. Effort de
cette voie : M ; effort de la voie « mot de passe + 2FA » : L, pour un
niveau de sécurité inférieur.

## G. Plan

Grille : impact usage, impact conversion, complexité pour l'utilisateur,
effort, migration.

| # | Retenu | Usage | Conversion | Complexité | Effort | Migration |
|---|---|---|---|---|---|---|
| **J1** | **Demande d'accès (a)** : formulaire public à la place de l'inscription libre (l'inscription par invitation reste), table `access_requests`, carte des demandes dans l'espace gestionnaire (approuver → espace créé + lien envoyé ; refuser → phrase), notification à ton adresse à chaque demande, réponse « sous 24 h » au prospect | fort pour toi (file de prospects) | fort (une réponse humaine à chaque demande) | retire (un formulaire de 6 champs, pas un espace vide à remplir seul) | S à M | oui |
| **J2** | **Pré-vérification assistée** dans la carte de demande : SIREN → raison sociale et activité (API publique), numéro ORIAS ou carte → présence dans le registre ; liens vers les fiches ; jamais une décision automatique | moyen | moyen (tu approuves vite et sûr) | neutre | S | non |
| **J3** | **Quotas par organisation** : contacts, envois par jour, appels IA par jour, membres, taille des imports ; visibles dans les réglages, journalisés quand ils bloquent ; valeurs par défaut en base, modifiables par toi par organisation | moyen | moyen (une démo qui dérape n'existe plus) | neutre (invisible tant qu'on ne les atteint pas) | M | oui |
| **J4** | **Sessions plus courtes pour les admins** et, plus tard, passkeys avec TOTP en repli (dépendance à proposer) | faible aujourd'hui | moyen pour un cabinet exigeant | ajoute (un enrôlement) | M | oui (secrets, codes de secours) |

Ordre : J1, J2 (dans la même passe), puis J3 avant toute ouverture au
public, J4 quand un pilote le demande. Non retenus : mot de passe (§F),
option (c) (n'arrête ni les concurrents ni la réputation), captcha tiers
(dépendance et pistage ; la limite de débit, le champ piège et la
validation serveur suffisent à un formulaire de six champs), vérification
automatique bloquante (tu tranches).

## H. Méthode

- Code lu : `signup.ts`, `auth/actions.ts`, `module-invitations.md`, les
  limites de débit (`checkRateLimit`, 19 points), les points d'appel de
  l'IA (`src/lib/ai`, quatre appelants) et de l'envoi (`send-newsletter`,
  `rules/wave`, `domain.ts`), `vercel.json` (crons).
- Web : les pages tarifaires et les registres cités en B, C et E, lues le
  2026-09-17 par un lecteur dédié ; aucun chiffre repris sans URL ; ce qui
  n'a pas pu être lu (Manymore en erreur, « Lorem » introuvable, site CCI
  derrière un mur anti-robot, prix du web service ORIAS) est dit non
  vérifié.
