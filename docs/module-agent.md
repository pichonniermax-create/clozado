# La brique agent — conception (étape 0)

Écrit le 2026-09-21 sur `main` = `72a5ba9`. **Aucune ligne de code** : ce
document est la conception, section par section, à valider avant toute
construction.

Le constat qui l'a commandé : le CRM est complet, et c'est son risque. Un
conseiller qui ouvre le produit voit des écrans, pas une conduite à tenir.
La brique agent ne refond rien : elle se pose **au-dessus**. Chaque matin,
elle lit l'activité de l'organisation et les signaux du marché, elle dit
ce qui mérite l'attention, **dans l'ordre**, **avec la raison**, et elle
prépare l'action. Le conseiller valide, modifie, reporte ou écarte. Rien
ne part sans lui.

Elle absorbe le concept de **file de décision** (`docs/module-file-decision.md`,
jamais construit) : sa définition de « dernière activité » et sa règle de
précédence sont reprises telles quelles (§2.4), son écran devient le point
du jour (§3).

**La doctrine, non négociable**, rappelée ici parce que tout le document
en découle :

1. Ce qui remonte et dans quel ordre est décidé **de façon déterministe**.
   Jamais par un appel IA.
2. Chaque score est **expliqué en français**, à partir des signaux qui
   l'ont produit.
3. L'IA n'intervient que pour **préparer** : rédiger un brouillon, résumer
   une fiche, proposer un sujet. Toujours un brouillon, jamais un envoi.
4. L'IA ne cite que des chiffres **fournis depuis la base**. Aucun chiffre
   inventé, aucune promesse de performance, aucun conseil en
   investissement.
5. Tout ce que l'agent propose et **ce que l'humain en fait** est
   journalisé.

---

## 1. Inventaire des signaux existants

Ce que le produit sait déjà détecter, lu dans le code. Colonne
« exploitable » : **tel quel** = la fonction existe et rend déjà ce qu'il
faut ; **à étendre** = la donnée est là, la lecture manque ; **à
construire** = rien n'existe.

### 1.1 Le suivi des partages — `src/db/queries/deal-follow-up.ts`

`getFollowUpBoard` rend trois piles, seuils lus sur `organizations`
(jamais en dur) :

| Signal | Ce qu'il produit aujourd'hui | Seuil | Exploitable |
|---|---|---|---|
| **Partage sans réponse** (`pendingAlerts`) | par partage : jours depuis l'envoi, jours avant expiration, `critical` (silence ≥ seuil urgent ou expiration proche) | `share_pending_reminder_days` (3), `share_pending_urgent_days` (7), `share_expiring_soon_days` (2) | **tel quel** |
| **Affaire acceptée sans suite** (`acceptedStale`) | jours depuis la dernière activité du partage | `deal_accepted_stale_days` (5) | **tel quel** |
| **Commission confirmée non réglée** (`unpaidCommissions`) | base, taux, montant calculé, `confirmedAt` — **NULL = date inconnue**, et la règle ne compte alors aucun jour | `commission_unpaid_days` (14) | **tel quel** |

`daysBetween` (tranches de 24 h glissantes) est la seule définition de
« jours » du produit : la brique agent l'utilise, elle n'en écrit pas une
seconde.

### 1.2 Les tâches automatiques — `src/db/queries/tasks.ts`

`generateAutoTasks` matérialise les trois piles ci-dessus **plus les
confrères endormis**, à l'ouverture de l'écran des tâches. Idempotente par
index unique `(règle, source)` : une tâche existe une fois pour toujours
par situation, l'achever vaut « traité ».

| Signal | Source | Exploitable |
|---|---|---|
| **Confrère endormi** | `listDormantPartners(org, organizations.partner_stale_days (60), now)` — aucun apport ni échange depuis N jours | **tel quel** |
| Tâches en retard | `tasks.due_at < today AND status = 'open'`, `countTasksDueNow`, `getTasksDueSummary` | **tel quel** |

C'est le précédent le plus proche de l'agent : même idée (matérialiser un
signal en action), sans ordre, sans score, sans explication.

### 1.3 Le moteur de règles — `src/lib/rules/`

Cinq déclencheurs (`criteria.ts`) : `no_appointment`, `no_interaction`,
`email_not_opened`, `email_not_clicked`, `share_unanswered`. Quatre
actions : `create_task`, `notify_owner`, `prepare_draft`, `send_email`.
Évaluation quotidienne par le cron (`/api/cron/envois`), journalisée dans
`rule_runs` ; la vague d'emails attend un clic humain (`wave.ts`) ; la
fenêtre d'envoi est dite, pas imposée (`window.ts`).

**Exploitable : tel quel, et c'est la brique la plus proche.** L'agent ne
le remplace pas — il lui donne une SORTIE : au lieu d'une tâche de plus
dans une liste, une recommandation ordonnée, expliquée, avec son geste.

### 1.4 L'engagement d'un contact — `src/db/queries/engagement.ts`

`indicatorSql` rend quatre fragments SQL réutilisables dans une autre
requête (c'est ainsi que les segments et les règles s'en servent) :
`lastOpened`, `lastClicked`, `lastInteraction` (= max activité, rendez-vous
tenu, clic), `lastAppointment`. **Exploitable tel quel** — l'agent les
joint à sa requête au lieu de recompter.

L'ouverture reste un signal **corrompu** (Apple préfabrique 62 % des
ouvertures, `docs/audit-newsletter.md` §E.5) : elle n'entre dans AUCUN
score. Le clic, lui, compte.

### 1.5 La veille — `src/db/schema/watch.ts`, `src/lib/watch/`

`watch_topics`, `watch_sources` (flux), `watch_items` (articles collectés,
résumés par l'IA), `watch_basket_items` (le panier), `watch_runs` (chaque
collecte : sources OK/en échec, articles nouveaux, articles résumés).
Collecte par cron quotidien ou à la visite.

**Exploitable tel quel** pour « il y a de la matière neuve sur un sujet
que vous suivez ». Ce qui manque pour en faire une recommandation : le
lien entre un article et **les contacts qu'il concerne** — aujourd'hui la
veille alimente le composer, pas la relation.

### 1.6 Les indicateurs de marché — `src/lib/watch/indicators.ts`, `market-readers.ts`

Treize indicateurs lus par API officielle, **sans aucune IA**, stockés
dans `market_observations` (période telle que publiée, valeur telle que
publiée) avec l'état de chaque lecteur dans `market_indicator_status` et
la sélection de chaque organisation dans `organization_indicators`.

| Fournisseur | Ce qui est lu |
|---|---|
| **Banque de France** (API Webstat) | TEC 10 ans, taux d'usure immobilier (20 ans, 10-20 ans), taux effectif moyen immobilier 20 ans |
| **BCE** (SDMX) | facilité de dépôt, refinancement, €STR, taux long terme France |
| **INSEE** (idbank) | inflation IPC, IRL et sa variation, prix des logements anciens |
| **Eurostat** | IPCH zone euro |

**Exploitable tel quel** : « le taux d'usure a changé » est un fait daté,
sourcé, déjà en base. C'est exactement le genre de signal de marché que
l'agent doit savoir relier à un portefeuille.

### 1.7 Le consentement — `contacts.email_consent_status`, `consent_events`

Statut courant par contact (`granted`, `client`, `professional`,
`not_established`, `objected`), journal des événements, suppressions par
organisation (`email_suppressions`) et par plateforme
(`platform_suppressions`, empreintes sha256).

**Exploitable tel quel**, et **il ne s'agit pas d'un signal mais d'un
filtre** : aucune recommandation d'écrire à un contact qui n'a pas
d'autorisation. La seule recommandation admise dans ce cas est
« recueillir l'autorisation ».

### 1.8 Les affaires sans mouvement

**À construire.** La définition existe, écrite et vérifiée
(`docs/module-file-decision.md` §1) : `last_activity_at` = MAX de six
sources (création de l'affaire, changements d'étape, interactions,
tâches achevées, événements du journal, interactions avec le client).
Rien ne la calcule aujourd'hui : ni colonne, ni requête. C'est la
principale dette de l'inventaire — et le signal le plus demandé.

### 1.9 Les signaux publics d'entreprise — **ABSENTS**

Ni BODACC, ni INPI-RNE, ni Sirene, ni DVF ne sont dans le code : aucune
mention, aucun lecteur, aucune table. Le seul « public » qui existe est
le marché macro-économique (§1.6).

Ce que chacun apporterait, et ce qu'il coûte :

| Source | Ce qu'on y lit | Ce qu'il faut | Verdict proposé |
|---|---|---|---|
| **Sirene** (API INSEE, gratuite, clé) | identité légale d'une entreprise, effectif, activité, **cessation** | un SIREN par fiche société (absent) | **étape ultérieure** : sans SIREN sur les fiches, rien à interroger |
| **BODACC** (Opendatasoft, gratuite) | procédures collectives, ventes de fonds, changements de dirigeant | idem SIREN | **fort intérêt**, après Sirene |
| **INPI-RNE** (gratuite, compte) | dirigeants, comptes annuels déposés | idem | intérêt moyen, format lourd |
| **DVF** (data.gouv, gratuite) | ventes immobilières par commune et par prix | rien à raccorder aujourd'hui (pas de bien dans le modèle) | **non retenu maintenant** |

Aucune n'est un préalable au point du jour. Elles viendront quand une
fiche société portera un SIREN — c'est une étape à part (§7).

### 1.10 Ce que le produit ne sait pas faire aujourd'hui

- **Aucun coût d'IA n'est mesuré.** Pas de table, pas de compteur de
  jetons : `watch_runs.items_summarized` compte des articles, pas des
  appels. Le modèle par défaut est `claude-sonnet-5`
  (`src/lib/ai/anthropic.ts`). Un plafond par organisation n'existe pas.
- **Aucun score nulle part.** Le produit n'ordonne rien : il liste.
- **Aucune notion de « ce qui est déjà traité »** hors tâches : reporter
  ou écarter un signal n'existe pas.

---

## 2. Le modèle de recommandation

### 2.1 Le principe du score

Un score est une **somme de points nommés**, chacun borné, tous montrés.
Pas de pondération cachée, pas de modèle appris, pas d'appel IA. Deux
lignes se comparent en lisant leurs composantes :

```
score = retard + enjeu + fraîcheur + relation − pénalités
```

| Composante | Borne | Calcul | Pourquoi |
|---|---|---|---|
| **Retard** | 0 à 40 | `min(40, 2 × jours au-delà du seuil)` | Ce qui attend depuis longtemps passe devant. Le seuil est celui de l'organisation, déjà en base. |
| **Enjeu** | 0 à 30 | paliers du montant de l'affaire : 0 € ou inconnu → 0 · < 50 k€ → 10 · < 200 k€ → 20 · ≥ 200 k€ → 30 | Un dossier à 300 000 € passe devant un dossier à 8 000 €. Montant inconnu = 0 point, **et la phrase le dit** (jamais un montant supposé). |
| **Fraîcheur** | 0 à 15 | signal du jour → 15 · de la semaine → 10 · du mois → 5 · au-delà → 0 | Un clic d'hier vaut plus qu'un clic d'il y a six semaines. |
| **Relation** | 0 à 15 | client existant → 15 · prospect avec rendez-vous tenu → 10 · prospect sans rendez-vous → 5 · contact sans autorisation → 0 | On rappelle d'abord ceux avec qui la relation existe. |
| **Pénalités** | 0 à −40 | reporté une fois → −10, deux fois → −25, trois fois et plus → −40 · contact en pression (≥ 3 emails sur 30 jours) → −15 | Ce qu'on a déjà repoussé redescend. Ce qu'on a déjà trop sollicité aussi. |

Score borné à 0. **Tri : score décroissant, puis retard décroissant, puis
identifiant** — déterministe à égalité, comme la file de décision.

La phrase d'explication est composée par le code, jamais par l'IA, et
suit toujours la même forme : **le fait, puis le barème**.

> « Partage envoyé il y a 12 jours à Notaire Lemoine, sans réponse
> (seuil : 3 jours) — affaire à 250 000 €, client depuis 2024.
> **44 points** : retard 18, enjeu 30, fraîcheur 0, relation 15,
> report −19. »

### 2.2 Les dix types de recommandation

Chacun : le signal qui le déclenche (existant §1), l'action proposée, ce
que l'IA prépare (§4), et ce qui manque pour le construire.

| # | Recommandation | Signal déclencheur | Action proposée | L'IA prépare | Manque |
|---|---|---|---|---|---|
| **A1** | Relancer un confrère sans réponse | `pendingAlerts` (§1.1) | email au confrère, ou tâche d'appel | le brouillon d'email | rien |
| **A2** | Reprendre une affaire acceptée sans suite | `acceptedStale` | tâche d'appel au confrère | le brouillon | rien |
| **A3** | Réclamer une commission non réglée | `unpaidCommissions`, `confirmed_at` connue | email de relance de règlement | le brouillon, avec le montant **lu en base** | rien |
| **A4** | Réveiller une affaire sans mouvement | `last_activity_at` ≥ seuil (§1.8) | changer d'étape, appeler, ou clore | le résumé de l'affaire | **le calcul de `last_activity_at`** |
| **A5** | Reprendre contact avec un confrère endormi | `listDormantPartners` (§1.2) | email ou appel | le brouillon | rien |
| **A6** | Rappeler un contact qui a cliqué sans suite | `lastClicked` (§1.4) récent, aucun rendez-vous depuis, autorisation OK | proposer un rendez-vous | le brouillon avec `{lien_rdv}` | la jointure clic → absence de rendez-vous (N1 de l'audit newsletter) |
| **A7** | Écrire le compte rendu d'un rendez-vous passé | `appointments.starts_at < now`, `status = 'scheduled'`, aucune interaction depuis | saisir le compte rendu | la mise en forme d'une note dictée ou collée | rien |
| **A8** | Traiter une tâche en retard | `tasks.due_at < today` | ouvrir la tâche | rien | rien |
| **A9** | Recueillir une autorisation manquante | contact actif (interaction < 90 j) et `email_consent_status = 'not_established'` | demander l'autorisation | le brouillon de demande | rien |
| **A10** | Saisir un sujet de newsletter | veille neuve (§1.5) **ou** indicateur qui a bougé (§1.6) | ouvrir le composer | le sujet et l'angle, **avec le chiffre lu en base** | le lien veille → cible |

Trois ne demandent rien de neuf côté données (A1, A2, A3, A5, A7, A8,
A9 : sept, en fait) ; trois demandent un calcul (A4, A6, A10).

### 2.3 Ce qui n'est jamais recommandé

- Écrire à un contact **sans autorisation** (`not_established`,
  `objected`) : la seule recommandation possible est A9.
- Écrire à une adresse **supprimée** (organisation ou plateforme).
- Relancer un contact **au-delà du plafond de pression** de
  l'organisation : il descend par pénalité, et au-delà du plafond il
  sort.
- Une action **sur une organisation en pause d'envoi** (garde-fous du
  chantier envoi) : la recommandation reste, l'action d'envoi est
  remplacée par « appeler ».

### 2.4 « Dernière activité », reprise de la file de décision

Pour A4, on reprend **mot pour mot** la définition vérifiée de
`docs/module-file-decision.md` §1 : `last_activity_at` = MAX de la
création de l'affaire, des changements d'étape, des interactions
(`activities.occurred_at`), des tâches achevées, des événements du
journal (`share_sent`, `share_accepted`, `share_declined`,
`share_revoked`, `commented`, `commission_updated`) et des interactions
avec le client. Ne comptent pas : `deals.updated_at`, `share_viewed`,
`share_expired`, les tâches ouvertes, les emails envoyés, les ouvertures,
les rendez-vous à venir.

Seuil : `COALESCE(deal_statuses.stagnation_days, organizations.stagnation_days,
platform_settings.stagnation_days)` — et **la source retenue est
affichée** (« seuil de l'étape », « seuil du cabinet », « seuil du
produit »).

---

## 3. Le point du jour

### 3.1 Ce que c'est

L'écran d'entrée d'un conseiller : `/aujourd-hui`. Il remplace le tableau
de bord comme page d'arrivée (le tableau de bord reste, il devient un
écran de chiffres). Trois choses, dans cet ordre :

1. **Une phrase d'état** : « 5 choses aujourd'hui, la plus urgente depuis
   12 jours » — ou, les bons jours, « rien qui presse ».
2. **La liste du jour**, ordonnée par score, chaque ligne portant sa
   phrase d'explication (§2.1).
3. **La carte courante**, dépliée : le contexte (fiche, affaire,
   historique court), l'action préparée, et les quatre gestes.

Deux modes, un interrupteur dans les préférences de la personne (déjà
en base : `user_preferences`) : **une carte à la fois** (on décide, la
suivante arrive) ou **la liste** (on balaie et on choisit). Le mode carte
est le défaut : c'est celui qui fait avancer.

### 3.2 Les quatre gestes

| Geste | Ce qui se passe | Ce qui est écrit |
|---|---|---|
| **Valider** | l'action préparée s'exécute : la tâche est créée, le brouillon est **enregistré** (jamais envoyé — l'envoi garde son propre écran et sa confirmation), l'étape change | la recommandation passe `done`, avec l'objet créé |
| **Modifier** | l'écran cible s'ouvre sur l'objet préparé (le brouillon dans le composer, la fiche sur le champ à corriger) | `modified`, avec ce vers quoi on est parti |
| **Reporter** | la recommandation disparaît jusqu'à la date choisie (demain, la semaine prochaine, une date) | `postponed`, avec la date et le compteur |
| **Écarter** | elle ne revient pas pour ce motif ; un motif est demandé (liste par organisation + texte libre) | `dismissed`, avec le motif |

Après chaque geste : la carte suivante, sans rechargement. Aucun geste
n'envoie quoi que ce soit — c'est la doctrine 3.

### 3.3 Comment on évite la surcharge

- **Plafond : sept recommandations par jour et par conseiller.** Sept
  parce qu'une liste plus longue n'est pas traitée : elle est survolée.
  Le plafond est un réglage d'organisation (3 à 15), pas une constante.
- **Regroupement** : plusieurs signaux sur le MÊME contact ou la MÊME
  affaire forment **une** recommandation, dont la phrase les énumère
  (« sans réponse depuis 12 jours, et commission non réglée »). Le score
  retenu est le plus élevé, pas la somme : on ne fabrique pas de
  l'urgence par empilement.
- **Ce qui est reporté revient** à la date choisie, **et seulement s'il
  est encore vrai** : une affaire qui a bougé entre-temps ne revient pas.
- **Ce qui est écarté ne revient pas** pour le même motif, mais un
  nouveau fait (une réponse, un clic, un changement d'étape) rouvre la
  question — et la phrase le dit : « écartée le 3 mars, revenue parce que
  le confrère a répondu ».
- **Trois reports** sur la même recommandation déclenchent une question :
  « celle-ci revient pour la quatrième fois — l'écarter ? ».
- **Rien le week-end** : la génération suit la fenêtre de l'organisation
  (`window.ts`, jours ouvrés), déjà en base.

### 3.4 Où l'agent vit ailleurs

- Un **badge** dans la barre latérale (nombre du jour), comme les tâches.
- Une **ligne sur la fiche** : « l'agent propose : relancer Notaire
  Lemoine » avec les mêmes gestes — la fiche reste le lieu du détail.
- **Aucune notification par email** au conseiller dans la première étape.
  Le produit n'écrit pas à ses utilisateurs pour leur dire d'ouvrir le
  produit. À reconsidérer, avec un réglage, si le pilote le demande.

---

## 4. La place exacte de l'IA

Quatre usages, et aucun autre. Pour chacun : ce qui part, ce qui ne part
jamais, le garde-fou, et la panne.

### 4.1 Usage 1 — le brouillon de relance (A1, A2, A3, A5, A6, A9)

**Ce qui est envoyé au modèle**, champ par champ :

| Champ | Source | Pourquoi |
|---|---|---|
| Prénom du destinataire | `contacts.first_name` / `partners.name` | l'adresse du message |
| Nom de la société | `contacts.company_name` ou la fiche liée | le contexte |
| Type et étape de l'affaire | `deal_types.label`, `deal_statuses.label` | de quoi on parle |
| Montant de l'affaire | `deals.estimated_amount`, **formaté par le produit** | un chiffre lu, jamais calculé par le modèle |
| Dates clés | envoi du partage, dernière interaction, dernier rendez-vous | « depuis 12 jours » |
| Nature de la relance | le type de recommandation (A1…A9) | l'intention |
| Voix de l'organisation | `organizations.tone_of_voice`, `editorial_guidelines` | déjà utilisé par le composer |
| Signataire | nom et fonction du conseiller | la signature |
| Mentions obligatoires | pied de page réglementé du pack métier | elles sont posées, pas inventées |

**Ce qui n'est JAMAIS envoyé** : l'adresse email et le téléphone du
contact (le modèle n'a pas à les connaître pour écrire), la date de
naissance, les notes libres de la fiche (elles peuvent contenir n'importe
quoi — un réglage d'organisation pourra les inclure plus tard, par
défaut non), l'historique des emails reçus, les statuts de consentement,
tout contact autre que le destinataire, et tout identifiant interne.

**Garde-fou sur la sortie** — le même que la revue de la newsletter
(`src/lib/newsletter/review.ts`), réutilisé :

1. **tout nombre** qui n'est ni un chiffre fourni dans l'invite ni un
   `[placeholder]` est signalé et **retiré** ;
2. aucune **promesse de performance** ni **conseil en investissement** :
   liste de formulations refusées, en table, modifiable par le super
   admin (« vous gagnerez », « placement garanti », « rendement assuré ») ;
3. longueur bornée (objet ≤ 60 caractères, corps ≤ 1 200) ;
4. les **mentions métier** exigées par le pack sont présentes ;
5. le brouillon est **enregistré comme brouillon**, jamais envoyé.

**Si l'appel échoue** : la recommandation reste, et le brouillon vient du
**gabarit de la règle** (`rules.template`, variables `{prenom}`,
`{societe}`, `{lien_rdv}` — déjà en place). Le conseiller a une phrase
correcte, pas une page blanche. **Le produit reste entièrement utilisable
sans IA** : c'est la condition de cette architecture.

### 4.2 Usage 2 — le résumé d'une fiche avant un rendez-vous (A4, A7)

**Envoyé** : le nom, la société, l'étape et le montant de l'affaire, les
dix dernières interactions (type, date, et **le compte rendu** — c'est
lui qu'on résume), les rendez-vous passés, les tâches ouvertes.
**Jamais** : les coordonnées, les emails envoyés, les autres clients.

**Garde-fou** : le résumé ne contient que des faits présents dans
l'entrée (contrôle d'originalité : aucune suite de huit mots absente de
la source — même mécanique que la veille), aucun chiffre neuf, cinq
phrases au plus. **En panne** : la liste brute des interactions, telle
qu'elle est déjà affichée sur la fiche.

### 4.3 Usage 3 — le sujet de newsletter (A10)

**Envoyé** : les titres et nos propres résumés des articles de veille
retenus, le libellé et la valeur de l'indicateur qui a bougé (période
comprise), les six facettes d'identité éditoriale de la cible, les sujets
déjà traités (anti-répétition). **Jamais** : un contact.

**Garde-fou** : les chiffres ne viennent que de `market_observations` et
`verified_figures`, la revue déterministe du composer s'applique, les
sources sont citées depuis la base (liste blanche d'identifiants).
**En panne** : la liste des articles neufs, sans angle — ce qui existe
déjà dans la veille.

### 4.4 Usage 4 — la note dictée ou collée → des champs (A7)

**Envoyé** : le texte saisi par le conseiller, et la liste des champs
possibles. **Jamais** : la fiche entière.

**Garde-fou** : la sortie est **structurée** (compte rendu, prochaine
étape proposée, tâches proposées) et **chaque proposition est cochée à la
main** avant écriture. Aucune écriture directe. **En panne** : le texte
est enregistré tel quel en interaction — ce que la fiche sait déjà faire.

### 4.5 Ce que l'IA ne fait dans aucun cas

Décider qu'une ligne remonte. Calculer un score. Choisir un destinataire.
Envoyer. Qualifier un contact. Écrire en base sans validation humaine.

---

## 5. Coût et volume

### 5.1 L'hypothèse, écrite noir sur blanc

- Un cabinet de **3 conseillers**, 400 contacts, 40 affaires ouvertes.
- **7 recommandations par jour et par conseiller** (le plafond du §3.3).
- Le conseiller en **valide ou modifie 4**, en reporte 2, en écarte 1.
- L'IA n'est appelée **que pour les recommandations affichées**, et
  **paresseusement** : la carte ouverte déclenche la préparation, pas la
  génération nocturne des sept. En pratique : **4 appels de brouillon**,
  **1 résumé**, et **1 sujet de newsletter par semaine** par conseiller.
- Modèle : `claude-sonnet-5` (celui du produit), **2 $ / million de
  jetons en entrée, 10 $ en sortie**.
- Invite système et consignes **mises en cache** (elles ne changent pas
  d'un appel à l'autre) : la partie mise en cache est lue à ~10 % du prix
  d'entrée.

### 5.2 Le calcul

| Appel | Entrée | dont en cache | Sortie | Coût unitaire |
|---|---|---|---|---|
| Brouillon de relance | 2 400 jetons | 1 400 | 350 | (1 000 × 2 $ + 1 400 × 0,20 $ + 350 × 10 $) / 1 M ≈ **0,63 ¢** |
| Résumé de fiche | 3 500 | 1 200 | 250 | ≈ **0,74 ¢** |
| Sujet de newsletter | 6 000 | 1 500 | 600 | ≈ **1,53 ¢** |

**Par conseiller et par jour** : 4 brouillons + 1 résumé + 1/5 de sujet
≈ 2,52 + 0,74 + 0,31 = **3,6 ¢**, soit **~0,79 €/mois** (22 jours
ouvrés, 1 $ ≈ 0,92 €). **Pour le cabinet de trois : ~2,4 €/mois.**

Ordre de grandeur à retenir : **l'agent coûte moins d'un euro par
conseiller et par mois**. La veille, elle, coûte davantage (elle résume
tous les articles collectés, pas seulement ceux qu'on lit) — c'est le
poste à surveiller, et il existe déjà.

**Ce que ce calcul ne couvre pas** : les jetons de réflexion du modèle
(le produit ne l'active pas aujourd'hui), les reprises après échec, et
un usage anormal (un conseiller qui régénère vingt fois le même
brouillon). D'où le plafond.

### 5.3 Le plafond

Rien de tout cela n'existe aujourd'hui (§1.10). Il faut :

- une table **`ai_usage`** : organisation, usage (`draft`, `summary`,
  `topic`, `watch`), modèle, jetons d'entrée / en cache / de sortie, coût
  estimé en centimes, horodatage, et l'objet concerné ;
- un **plafond mensuel par organisation** en euros, défaut proposé
  **5 € par conseiller et par mois** (six fois l'usage estimé) ;
- au-delà : l'IA se tait, **le produit continue** (les gabarits prennent
  le relais, §4.1), l'admin est prévenu sur l'écran, le super admin le
  voit sur « Santé d'envoi » — qui devient « Santé de la plateforme ».
- un **plafond par personne et par heure** (30 appels) contre la boucle
  accidentelle.

---

## 6. Conformité

### 6.1 Ce qui part chez le fournisseur

Le tableau du §4 est la liste exhaustive. En une phrase : **des noms, des
libellés métier, des dates et des montants ; jamais une adresse, un
téléphone, une date de naissance, ni une note libre.** Ce sont des
données personnelles (un prénom et une société identifient une personne),
donc un traitement à déclarer.

### 6.2 Ce qu'il faut vérifier avant de construire

**À sourcer dans les conditions du fournisseur, et à écrire dans ce
document avant la première ligne de code** : la durée de conservation des
requêtes API, l'engagement de non-entraînement sur les données API, la
localisation du traitement, et l'existence d'un accord de sous-traitance
(DPA) signable. Je ne les affirme pas ici : ils n'ont pas été relevés à
la source, et l'audit de l'assistance IA (`docs/audit-assistance-ia.md`,
chantier E) n'a jamais été fait — c'est le bon moment.

### 6.3 Ce qu'il faudra écrire

**Dans la politique de confidentialité** (désormais unique, sur le site —
`clozado.fr/fr/confidentialite`, adresse tenue par une seule valeur de
configuration) :

- la **finalité** : « assister le conseiller dans la préparation de ses
  messages et la lecture de ses dossiers » ;
- la **base légale** : intérêt légitime du responsable de traitement (le
  cabinet), le contact restant destinataire d'un message écrit par un
  humain ;
- le **sous-traitant** nommé, avec le pays de traitement et la durée de
  conservation (§6.2) ;
- les **catégories de données transmises**, dans les mots du §4 ;
- le **droit d'opposition**, et son effet : les recommandations
  continuent (elles sont déterministes), les brouillons sont écrits par
  gabarit.

**Sur la page Conformité du site** : l'interrupteur par organisation et
par usage, le fait qu'aucun envoi n'est automatique, le fait que les
scores sont déterministes et expliqués, et le plafond de coût.

**Dans le produit** : un interrupteur **par organisation et par usage**
(quatre interrupteurs), éteint par défaut pour une organisation neuve
tant que le pilote n'a pas tranché ; et la mention, sur chaque brouillon,
« préparé par l'assistant, à relire ».

### 6.4 Le registre

Une ligne de plus au registre des traitements : finalité, catégories,
destinataire, durée, mesures. À écrire avec le reste du
production-ready (`docs/audit-production-ready.md` D9).

---

## 7. Découpage

Chaque étape est livrable seule et utile seule. Les migrations sont
nommées ; **aucune n'est appliquée sans accord explicite sur son SQL**.

| # | Étape | Ce qu'elle livre | Migration | Réutilisé / neuf |
|---|---|---|---|---|
| **1** | **Le socle et trois recommandations** | `/aujourd-hui`, mode carte et liste, les quatre gestes, le score et sa phrase, A1 + A2 + A3 (les trois piles du suivi, déjà calculées) | **oui** : `agent_recommendations` (l'instance du jour, son score, ses composantes, son état) et `agent_decisions` (le journal des gestes) | réutilise `getFollowUpBoard`, `daysBetween`, les seuils d'organisation ; neuf : le score, l'écran, les gestes |
| **2** | **Quatre recommandations de plus** | A5 (confrère endormi), A7 (rendez-vous sans compte rendu), A8 (tâche en retard), A9 (autorisation manquante) | non | réutilise `listDormantPartners`, `appointments`, `tasks`, `email_consent_status` |
| **3** | **L'IA de préparation** | brouillons (usage 1) et résumés (usage 2), avec garde-fous, repli par gabarit, et le compteur | **oui** : `ai_usage` + plafonds sur `organizations` + interrupteurs par usage | réutilise `src/lib/ai/`, `review.ts`, `rules.template` |
| **4** | **Les affaires sans mouvement (A4)** | `last_activity_at` calculé, seuils par étape, la file de décision absorbée | **oui** : colonnes de `deals` (`review_at`, `postpone_count`, `archived_at`, `wake_at`), `stagnation_days` sur `deal_statuses` et `organizations`, `platform_settings` — le SQL est déjà écrit dans `docs/module-file-decision.md` §3 | reprend la conception vérifiée du 2026-09-15 |
| **5** | **La boucle commerciale (A6)** | clic sans rendez-vous → recommandation, avec le lien de prise de rendez-vous | non (N1 de l'audit newsletter demande un déclencheur de règle, pas une table) | réutilise `indicatorSql`, le moteur de règles |
| **6** | **Le marché et la veille (A10)** | un indicateur qui bouge ou une matière neuve devient un sujet proposé | **oui** (petite) : `organization_indicators` gagne un seuil de variation qui « fait signal » | réutilise `market_observations`, `watch_items` |
| **7** | **Les signaux publics d'entreprise** | SIREN sur les fiches société, puis Sirene (cessation, effectif), puis BODACC (procédures) | **oui** : `contacts.siren`, table `company_signals` | tout neuf ; dépend d'une décision : quelle source, à quel coût d'exploitation |

**Ordre recommandé** : 1 → 2 → 3 → 4 → 5 → 6 → 7. Les étapes 1 et 2 ne
demandent **aucune IA** et rendent déjà le produit conduisible ; l'étape
3 ajoute la préparation ; l'étape 4 règle la dette la plus visible.

### 7.1 Ce qui est réutilisé, en un coup d'œil

`getFollowUpBoard` et ses seuils · `daysBetween` · `generateAutoTasks`
(son idempotence par index unique est le modèle à suivre pour les
recommandations) · le moteur de règles et ses gabarits · `indicatorSql` ·
`market_observations` et ses lecteurs · la revue déterministe du composer
· `src/lib/ai/` · les statuts de consentement · la fenêtre d'envoi ·
`user_preferences` · le socle d'écran (`PageHeader`, `InlineField`,
`ListCard`).

### 7.2 Ce qui est vraiment neuf

Le **score** et sa phrase · la **table des recommandations** et leur
cycle de vie (proposée, validée, modifiée, reportée, écartée) · l'**écran
du point du jour** · le **regroupement** par contact et par affaire · le
**plafond quotidien** · la **mesure du coût de l'IA** et son plafond ·
`last_activity_at` (conçu, jamais construit) · les **signaux publics
d'entreprise** (étape 7).

---

## 8. Ce que ce document ne tranche pas

Cinq décisions attendent, et elles changent la construction :

1. **Le point du jour remplace-t-il le tableau de bord** comme page
   d'arrivée, ou s'ajoute-t-il à côté ?
2. **Sept par jour** : est-ce le bon plafond pour un cabinet de trois
   conseillers, ou faut-il partir plus bas (cinq) ?
3. **Les notes libres d'une fiche** peuvent-elles partir au modèle pour
   écrire un meilleur brouillon (par organisation, éteint par défaut) ?
4. **Le plafond de coût** : 5 € par conseiller et par mois, ou un
   plafond de cabinet ?
5. **Les signaux publics** (étape 7) : on investit dans le SIREN et
   Sirene/BODACC, ou l'agent reste-t-il sur les signaux internes ?
