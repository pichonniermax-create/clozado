# Plan de stabilisation — avant la prospection

Rédigé le 2026-09-16 sur `main` au commit `c57f5f9`, à partir de
`docs/audit-crm.md`. Document seul : aucune ligne de code n'est modifiée par
ce plan. Il dit quoi corriger, quoi fusionner, quoi rendre optionnel, quoi
mesurer et quoi réparer sur téléphone pour que **ce qu'un prospect voit en
démo et ce qu'un pilote vit pendant sa première semaine tienne**.

Échelle d'effort : **S** = moins d'une demi-journée, **M** = un à deux
jours, **L** = trois jours ou plus. « Migration » = une migration Neon à
rédiger, montrer, et appliquer avec ton accord. Rappel : la migration 0018
(invitations) n'est appliquée qu'en local ; la prochaine passe de
`db:migrate:http` appliquera 0018 puis la nouvelle dans le même geste.

Chaque point se termine par un tableau *impact / effort / migration*. Les
suppressions de fonctionnalités visibles sont rassemblées en §7 pour ta
validation : rien n'y est décidé.

---

## 1. Les bloquants

Critère : peut **perdre des données**, **ouvrir une faille**, ou **casser
une démo ou la première semaine d'un pilote**. Chaque ligne renvoie au
constat de l'audit (§5.5 sauf mention) et dit la correction retenue.

### 1.1 Sécurité et isolation

| # | Constat | Correction | Impact | Effort | Migration |
|---|---|---|---|---|---|
| S1 | Un `member` peut modifier l'interrupteur, le plafond et les heures des envois automatiques par soumission forgée : `updateAutoSendSettings` n'a aucune porte admin (`src/db/queries/rules.ts:836-857`) alors que l'écran grise la carte | `assertOrgAdmin(user)` en tête de la fonction (comme pipelines, motifs, domaine) | sécurité | S | non |
| S2 | `resumeSendAction` appelle `getLatestSend(id)` avant toute garde (`src/lib/newsletter/actions.ts:285-297`) : oracle d'existence sur les envois d'une autre organisation | `getNewsletterOrThrow(user, id)` avant `getLatestSend` | sécurité (faible) | S | non |
| S3 | `createTask` écrit `contactId`/`dealId` sans les vérifier (`tasks.ts:351-380`) : tenu par les FK composites seulement, erreur 23503 générique sur un id forgé | Vérifier contact et affaire comme le fait `createActivity` (`activities.ts:548-569`), erreur à clé | sécurité (faible), pilote (message lisible) | S | non |
| S4 | Super admin en vue globale : la fiche d'affaire remplit « Motif de perte » et « Responsable » avec les valeurs de toutes les organisations (`affaires/[id]/page.tsx:85, 87`) ; la liste des newsletters mélange toutes les organisations (`newsletters/page.tsx:26-30`) ; `saveNewsletter` peut poser la cible d'une organisation B sur une newsletter de A (`lib/newsletter/actions.ts:73-96`) | Borner les trois lectures à `deal.organizationId` / `newsletter.organizationId` (motif des partenaires, `:108-117`) ; test de vue globale sur la liste des newsletters comme sur les autres écrans | sécurité (super admin seul), démo (c'est toi qui démontres en substitution) | S | non |
| S5 | Les messages `?erreur=` / `?info=` de l'URL sont réfléchis tels quels dans un encadré (`src/lib/form-actions.ts:11-18` ; fiche contact `:317-320`, journal, rendez-vous, relances) : n'importe quel lien fait afficher n'importe quelle phrase dans une page authentifiée | Passer la **clé** (et ses valeurs) dans l'URL, traduire au rendu, ignorer toute clé inconnue ; `withError` et `FlashToaster` changent ensemble, les appelants ne changent pas | sécurité (hameçonnage dans l'application), démo | M | non |

### 1.2 Perte de données et gestes irréversibles

| # | Constat | Correction | Impact | Effort | Migration |
|---|---|---|---|---|---|
| D1 | Fusion de deux contacts par un simple `<form>` (`contacts/[id]/page.tsx:181`) ; l'absorbé devient une pierre tombale ; deux homonymes gardent l'encadré à vie | `ConfirmSubmit` (dialogue du socle) qui nomme les deux fiches et dit ce qui disparaît ; le « ce n'est pas un doublon » demande une table et va en §2 (migration) | pilote (données), démo (un clic de trop en démonstration) | S | non |
| D2 | Le formulaire de règle perd toute la saisie à la première erreur serveur (`rule-form.tsx` non contrôlé ; `lib/rules/actions.ts:66, 80`) | Même motif que `TargetForm` : `useActionState`, erreur en ligne, valeurs conservées ; les accolades inconnues signalées **avant** envoi (le contrôle `template.ts:28-38` est pur, il s'exécute côté client) | pilote (sa première règle) | M | non |
| D3 | Éditer un contact importé (`name` renseigné, prénom/nom vides) en ne saisissant que le prénom réduit `name` au prénom (`lib/contacts/actions.ts:49` ; `contacts.ts:249`) | Ne recomposer `name` que si prénom **et** nom sont fournis ; sinon garder `name` et n'écrire que le champ saisi | pilote (import CSV puis retouches) | S | non |
| D4 | Archiver une règle : sans confirmation (`regles/page.tsx:184-194`) et sans retour (aucun `restoreRule` ; archivées invisibles partout) | `ConfirmSubmit` ; section repliée « Règles archivées (N) » avec « Restaurer » (`archived_at` existe déjà) ; le journal filtre aussi sur les archivées | pilote | S | non |
| D5 | Supprimer une interaction depuis le journal (`journal.tsx:217-232`), une tâche (`taches/page.tsx:376-383`), un membre d'une sélection manuelle : sans confirmation | `ConfirmSubmit` sur les trois | pilote, démo | S | non |
| D6 | « Écarter » un article de veille est sans retour à l'écran (`restoreItemAction` existe, `lib/watch/actions.ts:276`) | Repli « Écartés (N) » avec « Reprendre » | pilote (faible) | S | non |
| D7 | Import CSV : appariement par email seul ; une ligne sans email crée toujours une fiche — réimporter un fichier sans emails double la base (`contacts.ts:697-765`) | Apparier par email, sinon par téléphone normalisé, sinon par nom exact + ville ; la ligne appariée « complète » comme aujourd'hui ; le rapport dit sur quoi chaque ligne a été reconnue | pilote (confiance dans les données dès le premier jour) | M | non |

### 1.3 Écrans d'erreur et clics muets sur un geste ordinaire

| # | Constat | Correction | Impact | Effort | Migration |
|---|---|---|---|---|---|
| E1 | Trois erreurs de saisie courantes tombent sur « Les réglages n'ont pas pu être chargés » : pack non choisi (`organizations.ts:110-111`), couleur d'étape en mots (`pipelines.ts:80-85`), suppression d'un motif utilisé (`loss-reasons.ts:39-43`) — les actions internes de `settings/page.tsx:220-262` ne rattrapent rien | Chaque action de la page passe par `try/catch` + `withError` (motif de `email/actions.ts`) ; le champ Couleur devient `type="color"` ; « Enregistrer le pack » désactivé sans choix ; le motif utilisé affiche la phrase promise par le dialogue | démo (la page de réglages se montre), pilote (sa première configuration) | S | non |
| E2 | Une panne de base s'affiche « Cette fiche n'existe pas » sur trois fiches : `.catch(() => null)` puis `notFound()` (`contacts/[id]/page.tsx:83-84`, `newsletters/[id]/page.tsx:33`, `affaires/[id]/page.tsx:68`) | Ne convertir en `notFound()` qu'une `AppError` 403/404 ; relancer tout le reste vers `error.tsx` | pilote (diagnostic), démo | S | non |
| E3 | Les erreurs métier du kanban et du composeur s'affichent en **clé brute** (`kanban-board.tsx:89, 113` ; `share-composer.tsx:185` ; `AppError` met la clé dans `message`, `lib/errors.ts:18`) ; `deal_closed` absent d'`ACTION_ERROR_CODES` → « Une erreur est survenue » chez le partenaire (`partner-share-view.tsx:74`) | Les actions `moveDealStageAction`, `updateDealDetailsAction`, `createDealShareAction` **retournent** `{ error: phrase traduite }` (via `errorMessage`) au lieu de lever ; le client affiche la phrase ; `deal_closed` ajouté aux codes de la vitrine | démo (le kanban est la première chose montrée), pilote | S | non |
| E4 | Type d'affaire non choisi → « Créer l'affaire » ne fait rien (`affaires/page.tsx:153, 278`) ; renommer un pipeline ou une étape à vide → silence (`pipelines.ts:70, 134`) | `required` sur le select ; les retours silencieux deviennent des `AppError` à clé, rattrapées en `withError` | pilote, démo | S | non |
| E5 | `updateContactAction` sans validation ni `try/catch` (`lib/contacts/actions.ts:113-118`) : une valeur refusée par Postgres envoie sur l'écran d'erreur de la liste ; `createContactAction` n'a pas de zod non plus (`:80`) | Un schéma zod commun (longueurs, email plausible, date valide) pour créer et modifier ; `withError` vers la fiche | pilote | S | non |
| E6 | Supprimer un brouillon de newsletter d'un collègue → écran d'erreur générique (`lib/newsletter/actions.ts:184-186`, action inline sans `try/catch`) | Corbeille masquée si l'on n'est pas le créateur ; `try/catch` + `withError` | pilote (cabinet à deux) | S | non |
| E7 | `/emails-recus?page=1.5` → `.offset(12.5)` → erreur SQL (`emails-recus/page.tsx:47`) ; boutons « Confirmer » / « Marquer réglée » d'une commission en `try/finally` sans `catch` (`confirm-commission-button.tsx:15-23`) | `Number.isInteger` sur la page ; `catch` + message dans les deux boutons | pilote | S | non |

### 1.4 Ce qui casse la démo ou la première semaine

| # | Constat | Correction | Impact | Effort | Migration |
|---|---|---|---|---|---|
| P1 | Une affaire naît **sans responsable** (`createDeal` n'écrit jamais `ownerId`, `deals.ts:130-144`) → « — » en liste, « Personne » sur la fiche, exclue du filtre conseiller ; et **sans contact rattachable** après coup (`DEAL_DETAILS_SCHEMA` sans `contactId`, `deals.ts:244-250` ; aucun sélecteur à la création) | À la création : `ownerId = user.id` par défaut, champ « Responsable » visible (défaut moi) ; champ « Client » = recherche de fiche (motif du `⌘K`, `searchEverything`) avec repli texte libre ; sur la fiche : « Rattacher une fiche contact » (ajout de `contactId` au schéma, vérification d'appartenance, copie du nom, journal `origin_changed` réutilisé ou message dédié) ; redirection vers **la fiche créée**, pas la liste (`affaires/page.tsx:165`) | démo (chaque affaire créée devant un prospect est incomplète), pilote (le filtre « moi » de §2 en dépend) | M | non |
| P2 | Le **second type d'affaire n'a pas d'écran** (seul appelant de `createDealTypeAction` : l'état vide, `affaires/page.tsx:33, 60-66` ; `deals.json:117` promet le contraire) | Carte « Types d'affaire » dans `/settings` : liste, ajouter, renommer (table `deal_types` existante ; suppression refusée si référencé) | pilote (bloqué dès sa deuxième famille d'affaires) | S | non |
| P3 | « Conseiller attribué » vaut « Personne » par défaut à la création d'un contact (`contact-create-form.tsx:114`) ; le select s'affiche dès un seul utilisateur | Défaut = la personne connectée ; select masqué à un seul utilisateur (même règle que le filtre de la liste, `contacts/page.tsx:68`) | pilote (ses fiches ne sont « suivies par » personne, le filtre « moi » de §2 serait vide) | S | non |
| P4 | Un email **consigné à la main** ne vaut pas « a répondu » (`direction` reste `null`, `activities.ts:589`) ; et l'arrêt automatique « a répondu » ne se pose qu'à la confirmation humaine d'un email ingéré (`inbound/confirm.ts:79`) : un contact qui répond continue de recevoir la vague | Dans la saisie rapide, le type « Email » demande « reçu / envoyé » ; « reçu » pose `direction = inbound` et déclenche l'arrêt `replied` comme la confirmation d'ingestion | pilote (la promesse « aucun envoi après une réponse » ne tient pas), sécurité de la promesse | S | non |
| P5 | L'adresse d'ingestion en **Cc visible** n'est plus reconnue → `not_for_us` sans trace ni compteur (`inbound/ingest.ts:84-86`) | Accepter Cc et Cci ; compter et montrer les refus par cause dans l'onglet « Refusés » | pilote (il croira l'ingestion en panne) | S | non |
| P6 | La vague annonce « Envoyer les N emails » jusqu'à 500 et en envoie 200 par clic (`rules.ts:624, 734`), sans montrer le corps ; « avant 9h00 » (`rules.json:26`) alors que le cron tourne à 06:00 UTC | Le bouton dit le nombre réellement envoyé au clic ; chaque ligne de la vague ouvre le brouillon (corps lisible avant envoi, comme sur la fiche) ; le texte dit l'heure réelle lue depuis `vercel.json` ou ne la dit plus | pilote (confiance dans ce qui part), doctrine « validation humaine » | S | non |
| P7 | Textes faux visibles en démo : « l’instantpour ce conseiller » (`tasks.json:32, 37` ; `taches/page.tsx:155`) ; tuile « À encaisser » verte à vide (`dashboard/page.tsx:349` ; `stat-tile.tsx:43-44`) ; « Aujourd'hui, tes emails partent de :  » vide sans `EMAIL_SHARED_DOMAIN` (`email-domain-card.tsx:60, 65`) ; « Journal des accès (n) » plafonné à 15 (`contacts/[id]/page.tsx:504`) | Corriger les quatre (la tuile disparaît de toute façon en §2) | démo | S | non |
| P8 | `/login` et `/inscription` ne renvoient pas une personne déjà connectée (`login/page.tsx:21-44`, `inscription/page.tsx:24-56`) ; un email déjà inscrit qui « crée un espace » arrive dans son ancien espace sans explication (`auth/actions.ts:132-137`) | Redirection vers `/dashboard` si session ; sur l'inscription d'un email connu, la page « Vérifie tes emails » dit « si cette adresse a déjà un espace, le lien t'y ramène » (sans énumération) | pilote (première connexion), démo (tu ouvres `/inscription` devant un prospect) | S | non |
| P9 | Les tâches automatiques deviennent « En retard » le lendemain, ne se ferment jamais par les gestes du suivi, ne se suppriment pas, et une même situation compte deux fois (§2.1 de l'audit) | **Traité par §2** (elles disparaissent) ; rien d'intermédiaire : une rustine en chantier A serait défaite trois semaines plus tard | pilote, démo | — | — |
| P10 | La page d'accueil dit « Clozado n'est pas un CRM : tu gardes le tien » (`home.json:4`) ; la métadonnée dit « Suite d'outils d'assistance marketing » (`shell.json:81`) — un prospect qui vient du site lit l'inverse du discours de vente | **Décision de positionnement, pas un bug** : deux phrases à réécrire une fois le discours arrêté (S, sans migration) ; consignée en §7 | démo | S | non |

Non retenus comme bloquants, à connaître : les 46-50 requêtes SQL du
tableau de bord (constat D4 de l'audit production-ready ; `/` répondait en
2,45 s) ne cassent pas une démo mais la ralentissent — `cache()` de React sur
cinq fonctions est un M sans migration, à glisser dans le chantier B si le
temps le permet ; le limiteur de débit en mémoire par instance (non global) ;
les 12 colonnes de marque sans écran ; `Intl.DisplayNames` en français dans
l'interface anglaise.

Frictions de la première semaine qui ne sont pas des bugs (S chacune, sans
migration, **à décider**) : l'ordre des premiers pas (« Poser ta marque »
avant « Ajouter tes contacts », 4 étapes marketing sur 8, l'adresse postale
absente alors qu'elle bloque tout envoi) ; la visite guidée qui se lance
seule sur 8 écrans (proposition : ne se lance que par le bouton, et ne
visite que les écrans du CRM : Aujourd'hui, Contacts, une fiche, Affaires) ;
les motifs de perte vides à la création (semis en §2, il en faut pour
« Perdue »).

---

## 2. Une seule définition de « sans nouvelles », un seul endroit « ce qui m'attend »

### 2.1 La définition

Aujourd'hui neuf formules coexistent (audit §3.5). Proposition d'**une
seule**, écrite en français tel qu'elle s'affichera, puis en colonnes.

> **Une nouvelle**, c'est un fait daté qui implique la personne ou l'affaire
> et qu'un humain a fait ou constaté : un appel, un email ou une note
> consignés, un email reçu et confirmé, un rendez-vous tenu, un passage
> d'étape, une réponse ou un commentaire d'un partenaire, une tâche achevée.
> **Ne sont pas des nouvelles** : un email envoyé par le produit, une
> ouverture, un clic, un partage consulté, une modification de champ.
> « Sans nouvelles depuis 12 jours » = la dernière nouvelle date d'il y a
> 12 jours révolus (tranches de 24 h, comme aujourd'hui).

`derniere_nouvelle(contact)` = MAX de :

| Source | Colonne | Condition |
|---|---|---|
| `activities` | `occurred_at` | `contact_id = c` — tous types, manuels ou ingérés (`direction` quelconque) |
| `appointments` | `starts_at` | `contact_id = c AND status = 'scheduled' AND starts_at <= now` (tenu) |
| `deal_stage_changes` (des affaires du contact) | `changed_at` | toutes |
| `deal_events` (des affaires du contact) | `created_at` | `type IN ('share_accepted','share_declined','commented','commission_updated')` |
| `tasks` | `completed_at` | `contact_id = c OR deal_id IN (affaires de c)`, `status = 'done'` |

`derniere_nouvelle(affaire)` = MAX de : `deals.created_at` (plancher) ;
`deal_stage_changes.changed_at` ; `activities.occurred_at` où `deal_id = d`
**ou** `contact_id = d.contact_id` ; `appointments` tenus du client ;
`deal_events` des quatre types ci-dessus ; `tasks.completed_at` de l'affaire
ou du client. Un contact à plusieurs affaires les réveille toutes quand il
donne signe de vie — c'est dit sur la carte (« nouvelle : appel du 4/09 »).

Ce qui change par rapport aux formules actuelles, et pourquoi :
- les **clics** sortent de « Dernière interaction » (`engagement.ts:44`) :
  un clic est passif et parfois robotique, il ne dit pas qu'on s'est parlé ;
  les tuiles « Dernier email ouvert / cliqué » de la fiche restent, ce sont
  des faits d'email, pas des nouvelles ;
- les **partages** ne sont plus mesurés à part : un partage envoyé sans
  réponse n'est pas une nouvelle, l'affaire reste donc « sans nouvelles »
  depuis son envoi ; un partage accepté ou commenté en est une ;
- la **cible** `inactiveForDays` (activités seules, `mail-targets.ts:145-149`)
  et la règle `no_interaction` adoptent la même fonction : « Sans nouvelles
  depuis 30 jours » retient les mêmes personnes partout.

Une seule implémentation : un fragment SQL `derniereNouvelleSql(contact)` et
`derniereNouvelleSql(affaire)` dans un seul fichier (`src/db/queries/news.ts`,
ou l'extension de `engagement.ts:34-47` qui est déjà le fragment partagé des
règles et des segments), utilisé par : l'endroit unique (§2.2), le badge, la
règle `no_interaction`, le critère de cible `inactiveForDays`, le gabarit
métier « Sans nouvelles depuis six mois », la tuile « Dernière nouvelle » de
la fiche contact, et l'analytique si elle en a besoin. Calculé à la lecture,
un seul `now` par requête (motif déjà retenu dans `docs/module-file-decision.md`
§1), jamais par cron.

**Un seul seuil par organisation** : `organizations.sans_nouvelles_days`
(`integer NOT NULL DEFAULT 10 CHECK 1..365`), réglable dans une carte
« Sans nouvelles » de `/settings` (« Une affaire ou un contact est sans
nouvelles après N jours »). Il remplace `share_pending_reminder_days`,
`share_pending_urgent_days` et `deal_accepted_stale_days`, qui n'ont jamais
eu d'écran. Restent, parce qu'ils mesurent autre chose :
`share_expiring_soon_days` (une date d'expiration est un fait, pas un
silence) et `commission_unpaid_days` (de l'argent dû). Pas de seuil par
étape ni de niveau « critique » : la liste est triée du plus ancien au plus
récent, l'ancienneté suffit ; le rouge est réservé au lien de partage qui
expire.

Les déclencheurs de règles qui **ne sont pas** « sans nouvelles » gardent
leur nom, corrigé pour dire ce qu'ils font : `no_appointment` devient
« Aucun rendez-vous tenu depuis N jours ni prévu » (aujourd'hui un rendez-
vous dans trois semaines n'exclut pas le contact, `rules.ts:337-342`) ;
`email_not_opened` / `email_not_clicked` restent tels quels ;
`share_unanswered` disparaît (sa situation est une carte d'affaire, §2.2) —
**suppression visible, §7**.

### 2.2 L'endroit unique : « Aujourd'hui »

**Où.** `/dashboard` garde son URL ; l'entrée de navigation s'appelle
« Aujourd'hui » (`nav.json`), avec **le seul badge** du produit : le nombre
d'éléments qui attendent **la personne connectée**. `/suivi` disparaît, les
quatre tuiles d'urgence et la liste « À traiter en priorité » disparaissent,
`generateAutoTasks` et ses trois règles disparaissent, le badge « Tâches »
disparaît. Ce qui reste sous « Aujourd'hui » : la liste ci-dessous, puis les
indicateurs du pack (inchangés, après le travail du jour), puis le journal.

**Quoi.** Une liste de cartes, triées par urgence puis ancienneté, en trois
familles calculées à la lecture par trois requêtes bornées par
l'organisation et la personne :

1. **Mes tâches en retard et du jour** (`tasks.status = 'open'`, `due_at <
   demain`) — carte : titre, échéance, fiche liée ; gestes : **Faite**,
   **Reporter à** (date), **Ouvrir**.
2. **Mes affaires sans nouvelles** — ouvertes (`outcome IS NULL`), non
   archivées, `review_at IS NULL OR review_at <= aujourd'hui`, et
   `jours(derniere_nouvelle) >= sans_nouvelles_days` ; **plus**, seuil ou
   non, toute affaire dont un partage `pending` expire dans moins de
   `share_expiring_soon_days` (raison : « le lien envoyé à X expire dans 2 j »).
   Carte : titre, client, étape, montant, « sans nouvelles depuis N j —
   dernière nouvelle : appel consigné le 4/09 », partage en attente s'il y en
   a un. **Cinq décisions, et la carte ne part qu'avec l'une d'elles** :
   - **Relancer** — « Consigner un appel / un email maintenant » (une
     activité datée de maintenant : l'affaire a une nouvelle, elle sort) ou
     « Me le rappeler le … » (une tâche sur l'affaire à cette date, et
     `review_at` = cette date : l'affaire sort jusque-là ; non faite à
     l'échéance, la tâche **et** l'affaire reviennent le même jour, une seule
     carte d'affaire avec sa tâche dedans — pas deux) ; avec un partage en
     attente, un troisième bouton **Renvoyer le lien** (existant) ;
   - **Changer d'étape** — select des étapes de son pipeline sauf la
     courante (`changeDealStage`, existant) ;
   - **Reporter** — date strictement postérieure à aujourd'hui → `review_at` ;
     un événement `postponed` au journal ; pas de plafond de reports, mais la
     carte dit « reportée 3 fois » (compte des événements) ;
   - **Perdue** — motif **obligatoire** (motifs actifs de l'organisation ;
     aucun → bouton désactivé + lien vers la carte des motifs), commentaire
     facultatif → `changeDealStage` vers l'étape perdue (une seule → directe ;
     plusieurs → choix ; aucune → désactivé + lien réglages) ;
   - **Archiver** — `archived_at = now`, événement `archived` ; l'affaire sort
     du kanban, de la liste et des totaux ; une liste « Archivées (N) » dans
     `/affaires` avec « Désarchiver » (événement `unarchived`) ; un partenaire
     ne peut plus faire avancer une affaire archivée par son jeton.
3. **Commissions à encaisser** (PRM activé, §3) — confirmées depuis
   `commission_unpaid_days` ; gestes : **Marquer réglée**, **Ouvrir**.

Pas de « Supprimer » dans les cartes : supprimer une affaire est un geste
de correction de saisie, il reste sur la fiche (à écrire un jour avec ses
refus : commission, partage, événement partenaire — pas dans ce plan).

Pas de traitement carte par carte imposé (« Tinder ») : une liste où chaque
carte porte ses gestes marche au doigt comme à la souris, et rien ne se
« passe » : une carte d'affaire reste jusqu'à une décision. C'est la
contrainte qui compte, pas la chorégraphie.

**Pour qui.** Par défaut, **ce qui m'attend** : tâches dont je suis
responsable (ou sans responsable et créées par moi), affaires dont je suis
responsable (ou sans responsable et créées par moi — D1 du document de la
File), commissions de mes affaires. Pour un cabinet à une personne, c'est
tout. Un admin a un bouton « Toute l'équipe » (paramètre d'URL, mémorisé en
cookie) qui regroupe par personne. Le badge suit le même filtre. P1 et P3 de
§1 (responsable posé par défaut) sont ce qui rend ce filtre juste.

**Le même défaut sur les listes** (ajouté le 2026-09-16 après le test en
member) : sur `/taches`, `/contacts` et `/affaires` (vue liste), le filtre
par conseiller vaut **la personne connectée** par défaut dès que
l'organisation compte plus d'une personne — « Tout le monde » à un clic,
mémorisé en cookie, pour un member comme pour un admin. Aujourd'hui Thomas
ouvre `/taches` sur « Tout le monde » et voit les 44 fiches du cabinet
avant de filtrer. Le kanban ne change pas (il ne filtre rien) — **V14**.

**Ce qui disparaît ou fusionne**

| Aujourd'hui | Devient |
|---|---|
| `/suivi` (écran, entrée de navigation, badge « Suivi ») | les cartes d'affaire (partage sans réponse = affaire sans nouvelles ; accepté sans suite = idem ; commission = carte de commission) ; « En cours » et « Partages clos » vivent déjà sur la fiche d'affaire et la fiche partenaire |
| 4 tuiles d'urgence + liste « À traiter en priorité » du tableau de bord | la liste « Aujourd'hui » elle-même, avec son compte dans le titre |
| Section « À faire aujourd'hui » (6 tâches) | la famille 1 de la liste |
| `generateAutoTasks` et les règles `share_pending`, `deal_accepted_stale`, `commission_unpaid` (`tasks.ts:486-564`) | rien : la situation est une carte, pas une tâche ; les tâches automatiques **ouvertes** existantes sont fermées par la migration (`status = 'done'`, `completed_at = now`, elles restent lisibles dans « Achevées ») — **§7** |
| Badge « Tâches » | le badge « Aujourd'hui » (une situation, un compte) ; `/taches` reste sans badge : c'est l'écran de planification (toutes les tâches, à venir, sans échéance, récurrences, par personne) |
| Seuils `share_pending_reminder_days`, `share_pending_urgent_days`, `deal_accepted_stale_days` | `sans_nouvelles_days`, réglable ; les trois colonnes cessent d'être lues et se retirent dans une migration ultérieure |
| Déclencheur `share_unanswered` | supprimé (les règles existantes qui l'utilisent sont désactivées par la migration avec une ligne de journal) — **§7** |
| Tuile « Dernière interaction » de la fiche contact | « Dernière nouvelle », même fonction, sans les clics |
| Tuiles « À relancer / Sans suite » rouges dès 3 jours vs `/suivi` rouge à 7 (bug 16) | plus de niveaux : ancienneté triée, rouge seulement pour un lien qui expire |
| Neuf formules (audit §3.5) | une fonction SQL, un seuil, une phrase |

**Ce qui reste** : `/taches` (planification), `/affaires` (pipeline, avec la
liste des archivées), les fiches, `/regles` (déclencheurs : sans nouvelles,
aucun rendez-vous, email non ouvert / non cliqué), `/cibles`, les
indicateurs, le journal.

**Base** (une migration) : `deals.review_at timestamptz NULL`,
`deals.archived_at timestamptz NULL`, index partiels `(organization_id)
WHERE archived_at IS NOT NULL` et `(organization_id, review_at) WHERE
review_at IS NOT NULL` ; `organizations.sans_nouvelles_days integer NOT NULL
DEFAULT 10 CHECK (1..365)` ; `deal_event_type` + `postponed`, `archived`,
`unarchived` (l'enum est un protocole technique déjà existant, on l'étend
comme pour `origin_changed`) ; semis des **motifs de perte par défaut** pour
toute organisation qui n'en a aucun (quatre libellés dans sa langue, lignes
de table, `INSERT … WHERE NOT EXISTS`, même mécanique que les étapes) et à
la création d'un espace ; fermeture des tâches automatiques ouvertes ;
désactivation des règles `share_unanswered` ; index `(organization_id,
deal_id, created_at)` sur `deal_events` (absent, nécessaire au MAX). Pas de
nouvelle table, pas de réglage plateforme : le défaut est un `DEFAULT` de
colonne, l'organisation le change dans ses réglages.

**Ce que ça retire de la doctrine de l'audit précédent** : le partage
d'affaires reste le premier module, mais il cesse d'être la grille de
lecture de l'écran du matin.

| Point | Impact | Effort | Migration |
|---|---|---|---|
| Fonction unique + seuil + réglage | pilote (une seule phrase à comprendre), démo | M | oui |
| « Aujourd'hui » : liste, filtre « moi », badge, cinq décisions, archivées | démo (c'est l'écran qui vend), pilote (c'est l'écran qu'il ouvre) | L | oui (la même) |
| Retraits (`/suivi`, tuiles, tâches automatiques, badge, déclencheur) | pilote (moins de doubles), démo | S | oui (la même) |

---

## 3. Le PRM activable par organisation

**Aujourd'hui** : trois tuiles sur quatre, `/suivi`, le composeur déplié sur
chaque fiche d'affaire, l'étape « Partagée », l'étape 3 des premiers pas, la
visite, l'analytique « Partenariats » — imposés à un cabinet sans apporteur.

**Proposition** : `organizations.prm_enabled boolean NOT NULL DEFAULT false`.
La migration le pose à `true` pour toute organisation qui a déjà un
partenaire ou un partage (et pour la démo). Un nouvel espace naît sans PRM ;
une carte « Partage d'affaires entre confrères » dans `/settings` (admin)
l'active en une case, avec la phrase qui explique ce que ça ouvre. Le
désactiver ne supprime rien : les données restent, les écrans se cachent,
**les liens de partage déjà envoyés continuent de fonctionner** (la vitrine
par jeton ne regarde jamais ce drapeau — un confrère ne doit pas trouver une
page morte).

**PRM désactivé, ce qui se cache** (une seule condition lue dans le layout
et passée aux composants, jamais recalculée) :
- navigation : « Partenaires », « Partenariats » (analytique) ; menu
  « Nouveau » et ⌘K : « Partenaire » et le groupe partenaires ;
- fiche d'affaire : section « N partage(s) », composeur « Partager cette
  affaire », et le libellé « Statut de l'affaire » redevient « Étape » ;
- « Aujourd'hui » : pas de cartes de commission ; description du tableau de
  bord sans « N partenaires actifs » ;
- indicateurs du pack : les tuiles de la famille `partners` sont retirées
  (les packs en ont deux à quatre sur huit, `packs.ts:73-119`) ; le pack en
  montre six ; à l'activation, elles reviennent ;
- premiers pas : l'étape « Enregistrer un apporteur d'affaires » disparaît
  (7 étapes) ; visite guidée : l'étape partenaires est sautée ;
- règles : la condition « Est un partenaire de l'une de ces professions »
  disparaît du formulaire ;
- semis d'un espace neuf : les étapes par défaut deviennent Nouveau · En
  négociation · Acceptée · Perdue (sans « Partagée ») ; un espace qui
  active le PRM plus tard renomme ou ajoute une étape s'il le veut — **§7** ;
- `/affaires` : description sans « se partage à un confrère ».

**PRM désactivé, ce qu'affiche le tableau de bord** : la liste « Aujourd'hui »
(tâches, affaires sans nouvelles), les indicateurs du pack sans les tuiles
partenaires, le journal. Rien de vide « à jamais ».

**PRM activé** : tout ce qui existe aujourd'hui, réorganisé par §2 (les
partages sans réponse et les commissions sont des cartes d'« Aujourd'hui »).

| Point | Impact | Effort | Migration |
|---|---|---|---|
| Drapeau, carte de réglage, condition dans le layout | pilote (un espace neuf n'est plus à moitié vide), démo (tu montres le PRM à qui en a besoin) | M | oui (une colonne + remplissage) |

---

## 4. La mesure d'usage minimale

**But** : prouver l'adoption d'un pilote sans outil tiers — qui s'est
connecté quand, et quels gestes clés ont été faits, par personne et par
organisation, visible par le super admin.

**Base** (dans la même migration que §2-3) :
- `users.last_seen_at timestamptz NULL` — mis à jour par le layout au plus
  une fois par quart d'heure (`UPDATE … WHERE id = ? AND (last_seen_at IS NULL
  OR last_seen_at < now() - interval '15 minutes')`) : une écriture par
  session de travail, pas par page ; jamais pour un visiteur de la démo.
- `usage_events` : `id`, `organization_id` (cascade), `user_id` (SET NULL),
  `kind text NOT NULL CHECK (kind IN (…))`, `quantity integer NOT NULL
  DEFAULT 1`, `occurred_at timestamptz NOT NULL DEFAULT now()` ; index
  `(organization_id, occurred_at)` et `(organization_id, user_id,
  occurred_at)`. Aucun contenu, aucun identifiant de fiche : le type du geste
  et sa date, rien d'autre. Table ajoutée à `COUNTED_TABLES` du journal démo
  et au « zéro reliquat » de `test-isolation`.

**Les gestes retenus** (écrits par un `trackUsage(user, kind, quantity?)`
appelé dans l'action serveur existante, non bloquant, qui n'échoue jamais
la requête ; ignoré pour `readOnly` et pour la démo) :

| Geste | Où il s'écrit | Ce qu'il prouve |
|---|---|---|
| `signed_in` | callback de connexion par lien magique | la personne revient |
| `contact_created`, `contacts_imported` (quantité) | création, import | le carnet se remplit |
| `activity_logged` | saisie rapide (appel, email, rendez-vous, note), confirmation d'un email reçu | le CRM sert au quotidien |
| `appointment_created` | section rendez-vous, Calendly | idem |
| `deal_created`, `deal_stage_changed` | création, kanban, fiche, décision | le pipeline vit |
| `decision_taken` (quantité 1, `kind` distinct par décision : `decision_follow_up`, `decision_postponed`, `decision_lost`, `decision_archived`) | « Aujourd'hui » | la promesse « zéro transaction sans suite » |
| `task_created`, `task_completed` | tâches | |
| `share_sent` | composeur (PRM) | |
| `email_sent` | brouillon envoyé depuis la fiche, vague | |
| `newsletter_sent` | envoi réel | |
| `rule_created` | règles | |

Quinze sortes, pas plus : ce qui manque se rajoute par une valeur de CHECK
(migration légère), pas par un outil. Les écrans ouverts ne sont pas
mesurés : ils demanderaient une écriture par page, et « Aujourd'hui ouvert
sans rien faire » se lit déjà dans `last_seen_at` sans geste.

**Où ça se voit** : le tableau de bord du super admin (vue globale), déjà la
liste des organisations, gagne par organisation : nombre de personnes,
dernière connexion, actives sur 7 et 30 jours, gestes sur 7 et 30 jours (par
sorte), date de la première fiche, de la première affaire, de la première
décision. Et une page par organisation avec la **frise de la première
semaine** (jour par jour : gestes et personnes) — c'est ce qu'on montre à un
pilote au bilan. Rien n'est montré à l'organisation elle-même dans ce plan.

**Rétention** : les lignes de plus de 13 mois sont purgées par le cron
quotidien existant (`/api/cron/envois`, un DELETE borné en fin de passage —
pas de troisième cron sur le plan Hobby). À écrire dans le registre des
traitements le jour où il existe (constat P2/P5 de l'audit précédent).

| Point | Impact | Effort | Migration |
|---|---|---|---|
| `last_seen_at` + `usage_events` + `trackUsage` dans une quinzaine d'actions + écran super admin | pilote (la preuve d'adoption), et c'est ce qui permettra de mesurer la rétention à 3 mois autrement qu'à la facture | M | oui (la même) |

---

## 5. Mobile

### 5.1 La fiche contact : appeler en un geste

- **En-tête** : « Appeler » (`tel:`) et « Écrire » (`mailto:`) comme boutons
  d'action quand le numéro ou l'adresse existent — exactement le motif de la
  fiche partenaire (`partenaires/[id]/page.tsx:66-77`), numéro nettoyé des
  espaces.
- **Sous l'en-tête, sur téléphone** : une ligne d'identité (téléphone,
  email, ville, « suivi par ») avant toute section ; la carte « Fiche »
  (formulaire) reste dans la colonne droite pour modifier.
- Les quatre tuiles passent sur deux colonnes sous `sm` (`grid-cols-2`,
  comme le tableau de bord) ; la saisie rapide du journal et le formulaire
  de rendez-vous passent en une colonne sous `sm` (la correction déjà faite
  pour les tâches, `task-section.tsx:74-78`).
- Le téléphone entre aussi dans la recherche de la palette (`search.ts:31-35`)
  avec la même normalisation que la liste.

### 5.2 Le kanban au doigt

Sous `md`, remplacer « une colonne par écran, colonnes vides comprises »
(`kanban-board.tsx:143`) par :
- une **barre d'étapes** horizontale (une pastille par étape : libellé +
  compte, la sélectionnée en couleur de marque), défilante, sans écran
  vide ;
- **les cartes de l'étape sélectionnée** dessous, pleine largeur ; étape
  choisie dans l'URL (`?etape=`) pour survivre au rafraîchissement ; par
  défaut la première étape qui a une carte ;
- sur chaque carte, le select natif « Déplacer vers » existant (`:231-242`)
  et le nom du client cliquable ;
- la vue liste (`min-w-[56rem]`, `affaires/page.tsx:536-538`) devient des
  cartes sous `md` (titre, client, étape, montant) — ou reste un tableau
  défilant si l'on préfère ne rien y toucher : c'est la vue « pour
  travailler » sur bureau.

Aucun changement de données ; composant client seulement.

| Point | Impact | Effort | Migration |
|---|---|---|---|
| Fiche contact (tel:, mailto:, identité en haut, formulaires en colonne, téléphone dans ⌘K) | démo (sur ton téléphone), pilote (en rendez-vous) | S | non |
| Kanban par étape sous `md` (+ liste en cartes) | démo, pilote | M | non |

---

## 6. L'ordre d'exécution — deux chantiers

### Chantier A — Les bloquants (aucune migration)

Tout §1, en cinq étapes committées et poussées séparément, chacune avec sa
liste d'URL à ouvrir :

1. **Sécurité** : S1, S2, S3, S4 (S chacun).
2. **Les gestes irréversibles** : D1, D4, D5, D6 (`ConfirmSubmit`), D3 (S).
3. **Les écrans d'erreur** : E1 à E7 (S), E3 en premier (le kanban est la
   première chose qu'un prospect voit).
4. **L'affaire complète** : P1 (M), P2, P3 (S), P8 (S).
5. **Formulaire de règle, import, emails** : D2 (M), D7 (M), P4, P5, P6, P7 (S), S5 (M).

Effort total : environ **six à huit jours**. Rien n'y dépend d'une décision
de §7, sauf P10 (positionnement) qui attend ton texte.

### Chantier B — « Aujourd'hui » (une migration, appliquée après ton accord)

1. **Mobile** (§5, S + M, sans migration) — en premier parce qu'indépendant
   de la migration : le chantier avance pendant que tu lis le SQL.
2. **La migration** — 0018 (déjà locale) puis 0019 dans la même passe :
   `deals.review_at`, `deals.archived_at`, index partiels ;
   `organizations.sans_nouvelles_days`, `organizations.prm_enabled` (+
   remplissage) ; `users.last_seen_at` ; `usage_events` ; extension de
   `deal_event_type` ; index `deal_events(organization_id, deal_id,
   created_at)` ; semis des motifs de perte ; fermeture des tâches
   automatiques ouvertes ; désactivation des règles `share_unanswered`.
   Rédigée, montrée, **STOP** ; appliquée par `db:migrate:http` avec ton
   accord ; le schéma TypeScript n'est poussé qu'après (protocole
   `docs/module-demo.md` §2).
3. **La définition et l'endroit unique** (§2, M + L) : la fonction SQL et
   ses cinq consommateurs, puis la liste « Aujourd'hui » et ses cinq
   décisions, le filtre « moi », le badge, les archivées dans `/affaires`,
   la carte de réglage du seuil ; puis les retraits (`/suivi`, tuiles,
   tâches automatiques, badge « Tâches », déclencheur).
4. **PRM optionnel** (§3, M).
5. **Mesure d'usage** (§4, M) : `trackUsage`, `last_seen_at`, l'écran super
   admin — en dernier pour que les gestes mesurés soient ceux de
   l'« Aujourd'hui » final.

Effort total : environ **dix à douze jours**. Preuve de chaque étape depuis
la production sur les organisations de démo existantes, jamais d'email vers
une adresse réelle autre que la tienne.

---

## 7. Les décisions à valider (suppressions de fonctionnalités visibles et choix de produit)

| # | Décision | Recommandation |
|---|---|---|
| V1 | Supprimer `/suivi` (écran, entrée, badge) au profit des cartes d'« Aujourd'hui » | oui |
| V2 | Supprimer les quatre tuiles d'urgence et la liste « À traiter en priorité » du tableau de bord | oui |
| V3 | Supprimer `generateAutoTasks` et les trois règles de tâches automatiques ; **fermer** (pas supprimer) les tâches automatiques encore ouvertes par la migration | oui — fermer plutôt que supprimer : elles restent lisibles dans « Achevées » |
| V4 | Retirer le badge « Tâches » ; un seul badge, sur « Aujourd'hui » | oui |
| V5 | Supprimer le déclencheur de règle `share_unanswered` (règles existantes désactivées par la migration, journalisées) | oui |
| V6 | Remplacer les trois seuils de partage par `sans_nouvelles_days` (défaut 10 jours, réglable) ; garder `share_expiring_soon_days` et `commission_unpaid_days` | oui ; la valeur 10 vient de l'exemple du cahier de la File |
| V7 | Les clics d'email ne sont plus des « nouvelles » (la tuile « Dernière interaction » change de valeur pour certains contacts) | oui |
| V8 | Le filtre « moi » par défaut sur « Aujourd'hui », « Toute l'équipe » en option pour l'admin | oui |
| V9 | PRM désactivé par défaut pour tout nouvel espace ; activé par la migration pour les espaces qui ont déjà un partenaire ou un partage | oui |
| V10 | Un espace neuf sans PRM est semé sans l'étape « Partagée » | oui |
| V11 | Semer quatre motifs de perte par défaut dans la langue de l'organisation (proposition : « Taux ou conditions concurrents », « Projet abandonné ou reporté », « Sans réponse », « Hors critères ») pour toute organisation qui n'en a aucun | oui ; libellés à ta main |
| V12 | Réécrire la phrase d'accueil « Clozado n'est pas un CRM » et la métadonnée « assistance marketing » | à toi : c'est le discours de vente |
| V13 | La visite guidée ne se lance plus seule ; premiers pas réordonnés (contacts, affaire, adresse postale, marque…) | oui, si tu veux que la première semaine commence par le CRM |
| V14 | Sur `/taches`, `/contacts` et la liste des affaires, le filtre par conseiller vaut la personne connectée par défaut (organisation à plusieurs), « Tout le monde » à un clic, mémorisé | oui |

Aucune de ces décisions n'est nécessaire au chantier A. Toutes le sont au
chantier B, dont la migration ne sera rédigée qu'après tes réponses.

---

## 8. Journal d'exécution

- **Chantier A, étape 1 — sécurité (S1 à S4) — faite le 2026-09-16.**
  `updateAutoSendSettings` passe par `assertOrgAdmin` ; `resumeSendAction`
  vérifie la newsletter avant de lire son envoi ; `createTask` vérifie le
  contact et l'affaire rattachés (refus lisible, plus de 23503) ; la fiche
  d'affaire lit motifs et conseillers par `listLossReasonsOf` /
  `listOrgUsersOf` (organisation de l'affaire) ; la liste des newsletters a
  son état « vue globale » et `listNewsletters` rend vide sans organisation ;
  `saveNewsletter` refuse une cible d'une autre organisation que la
  newsletter. Preuve : neuf contrôles ajoutés à `scripts/test-isolation.ts`
  (S1, S3, S4a), joués contre la base ; S2 et S4b-c prouvés par lecture et
  par le build.
- **Complément à l'étape 1 — faite le 2026-09-16.** Les gardes S2 et S4
  sortent des actions serveur dans `src/lib/newsletter/guards.ts`
  (`resolveSendToResume`, `assertTargetForNewsletter`), testées sans
  session par `guards.test.ts` (huit cas : newsletter d'une autre
  organisation refusée sans jamais lire son envoi, cible d'une autre
  organisation refusée, même organisation acceptée). Compte member de test :
  la persona « Thomas Renard » de la démo reçoit une adresse réelle par
  `scripts/demo-member.ts` (réversible), et le lien de connexion n'est plus
  refusé à une personne réelle rattachée à la démo (`src/auth.ts`).
- **Chantier A, étape 2 — gestes irréversibles (D1, D3, D4, D5, D6) — faite
  le 2026-09-16.** Fusion de contacts, suppression d'une interaction, d'une
  tâche, retrait d'un membre de cible et archivage d'une règle passent par
  `ConfirmSubmit` (qui gagne `triggerLabel` pour les déclencheurs-icônes) ;
  les règles archivées vivent repliées sous la liste avec « Restaurer »
  (`restoreRule`, revient désactivée) et se filtrent dans le journal ; les
  articles de veille écartés vivent repliés sous le fil avec « Reprendre »
  (`listDismissedWatchItems`) ; le nom d'une fiche ne se recompose qu'avec
  prénom ET nom (`displayNameAfterUpdate`, cinq tests). Preuve : sept
  contrôles ajoutés à `scripts/test-isolation.ts` (archiver / lister /
  restaurer, refus depuis une autre organisation, nom conservé puis
  recomposé), joués contre la base ; les confirmations se voient à l'écran.
  **D2 (formulaire de règle qui perd la saisie) n'est pas dans cette étape :
  il est planifié en étape 5 (§6, chantier A), avec l'import et les emails,
  parce que c'est un M (formulaire contrôlé, `useActionState`) et non un
  `ConfirmSubmit`.**
- **Complément à l'étape 2 — la garde de connexion de la démo, prouvée (le
  2026-09-16).** La garde du lien magique changée au complément de l'étape 1
  aurait dû passer par un STOP (changement d'authentification en
  production). Avant : refus si l'adresse est réservée aux exemples OU si le
  compte appartient à une organisation de démo. Après : refus si l'adresse
  est réservée aux exemples — le callback `signIn` refusant par ailleurs
  toute adresse absente de `users`. Les deux gardes vivent dans
  `src/lib/auth/magic-link-guard.ts` ; `scripts/test-isolation.ts` prouve
  contre la base qu'une adresse jamais rattachée, les personas fictives et
  le compte jetable du script ne reçoivent aucun lien, que seules les
  adresses réelles posées par script en reçoivent, et par sonde HTTP sur le
  site que la démo publique reste en lecture seule (écriture → 303
  `?demo=lecture-seule`, réglages interdits, API → 403).
- **Chantier A, étape 3 — écrans d'erreur et clics muets (E1 à E7) — faite
  le 2026-09-16.** E3 : `moveDealStageAction`, `updateDealDetailsAction`,
  `createDealShareAction`, `confirmCommissionAction`,
  `markCommissionSettledAction` RENDENT leur échec traduit (`actionResult`,
  `src/lib/form-actions.ts`) ; le kanban, le composeur, la carte Pipeline et
  les boutons de commission affichent la phrase ; `deal_closed` a la sienne
  chez le partenaire. E1 : les neuf actions de `/settings` rattrapent et
  renvoient en notification ; pack exigé (case + phrase), nom affiché exigé,
  couleur d'étape contrôlée (`pattern`) ; E4 : un libellé vide de pipeline,
  d'étape, de type ou de partenaire a sa phrase, « Créer l'affaire » dit ce
  qui manque (titre, type, client) et ramène au formulaire ouvert. E2 :
  `nullIfNotFound` — sept fiches ne rendent « introuvable » que pour un
  403/404, une panne remonte à `error.tsx`. E5 : `validateContactInput`
  (création et modification, phrase par refus). E6 : corbeille des
  newsletters réservée au créateur, échec rattrapé. E7 : `?page` entier,
  boutons de commission avec message. Preuve : `nullIfNotFound`,
  `actionResult`, `validateContactInput` par tests unitaires (dix cas) ;
  libellés vides refusés avec leur clé dans `scripts/test-isolation.ts`
  contre la base ; le reste se voit à l'écran.
- **Chantier A, étape 4 — l'affaire complète (P1, P2, P3) — faite le
  2026-09-16 ; P8 (redirections de connexion) présenté, en attente d'accord.**
  P1 : `createDeal` pose le responsable (la personne qui crée, sauf choix
  explicite ; jamais un id étranger), le formulaire de création choisit le
  client par son nom parmi les fiches existantes (`ContactPicker`, la
  recherche de la palette) ou garde un nom libre, propose le responsable
  quand l'organisation compte plusieurs personnes, et mène à la fiche
  créée ; `updateDealDetails` accepte `contactId` (fiche de l'organisation,
  vivante, nom copié) et la fiche d'affaire a « Rattacher une fiche
  contact ». P2 : les types d'affaire vivent dans la carte des pipelines
  (renommée « Pipelines et types d'affaire », ancre `#types`) — liste,
  renommer, ajouter, jamais supprimer ; un espace neuf naît avec un type
  « Dossier » (`defaultDealTypeValues`, dans le lot de création, dans sa
  langue) : plus de blocage « Choisis le type ». P3 : le conseiller d'un
  nouveau contact est la personne connectée ; le sélecteur n'apparaît qu'à
  plusieurs. Preuve contre la base : responsable par défaut, « Personne »
  explicite, responsable étranger refusé, rattachement d'une fiche avec
  copie du nom, fiche étrangère refusée, espace neuf créé par
  `createOrganizationWithAdmin` avec son type « Dossier » puis supprimé.
- **Chantier A, étape 5 — formulaire de règle, import, emails (D2, D7, P4,
  P5, P6, P7, S5) — faite le 2026-09-16.** S5 : la phrase d'un retour
  d'action part SIGNÉE (HMAC sur `AUTH_SECRET`, `src/lib/flash.ts`) ;
  `withError` signe, `FlashToaster` demande la phrase à `revealFlash`, les
  fiches (contact, affaire, newsletter) lisent par `readFlash` — une phrase
  posée dans un lien n'est jamais affichée ; **choix : la signature plutôt
  que la clé dans l'URL** — même garantie (rien d'autre que ce que le
  serveur a écrit ne s'affiche), et les 190 appelants de `withError` ne
  changent pas. D2 : `RuleForm` est contrôlé, `createRuleAction` /
  `updateRuleAction` rendent leur échec en état (`useActionState`), la
  saisie reste, les accolades interdites du gabarit sont signalées avant
  l'envoi (le contrôle pur `invalidTemplateTokens` tourne dans le
  navigateur, le bouton attend). D7 : `importContacts` reconnaît une fiche
  par l'email, sinon par le téléphone normalisé (neuf derniers chiffres,
  sans indicatif supposé — `src/lib/contacts/match-keys.ts`), sinon par le
  nom exact et la ville ; le rapport dit sur quoi chaque ligne a été
  reconnue (colonne « Reconnue par », motifs d'écart en clair) ; l'email se
  complète sur une fiche reconnue autrement. P4 : la saisie rapide demande
  le sens d'un email (« Reçu du contact » / « Envoyé au contact »,
  `QuickEntryType`), un email reçu arrête la vague (`createActivity` pose
  l'arrêt « a répondu », d'où que l'email soit consigné — la confirmation
  d'un email ingéré passe par le même chemin), le journal dit le sens.
  P5 : l'adresse d'ingestion en copie visible est de nouveau reconnue
  (`findIngestToken`, `src/lib/email/inbound/address.ts` — la refuser ne la
  rendait pas moins visible, elle perdait l'email en silence ; l'écran
  conseille la Cci) et l'onglet « Refusés » compte les refus par motif
  (`countRejectionsByReason`). P6 : le bouton de la vague dit ce qu'un clic
  envoie (`WAVE_BATCH_SIZE` = 200, le reste annoncé), le titre dit le vrai
  total, chaque ligne s'ouvre sur le corps du brouillon, la phrase du
  passage quotidien ne dit plus d'heure. P7 : « l'instant pour ce
  conseiller » (espace), tuile « À encaisser » neutre à vide, l'expéditeur
  effectif absent n'affiche plus une phrase vide, « Journal des accès (n) »
  dit le vrai total et « les 15 derniers sont affichés ». Preuve : tests
  unitaires (`flash.test.ts` — phrase relue, lien forgé ignoré, jeton
  altéré ignoré ; `match-keys.test.ts` ; `inbound/address.test.ts` ;
  `template.test.ts`) ; contre la base, `scripts/test-isolation.ts` :
  import reconnu par téléphone puis par nom + ville, inconnu créé, doublon
  de fichier écarté, B n'apparie jamais une fiche de A, email reçu → arrêt
  « a répondu », email envoyé → rien, refus comptés par motif pour A et
  invisibles de B ; au navigateur (build de production, organisation
  jetable) : une phrase forgée dans `?erreur=` / `?info=` n'apparaît nulle
  part et l'adresse est nettoyée, la confirmation signée « Règle créée. »
  arrive en notification, le formulaire de règle signale `{age}` avant
  l'envoi et garde nom, déclencheur, seuil, case cochée, action et gabarit
  après l'échec serveur (opt-in manquant), la saisie rapide demande le sens
  d'un email et « Email reçu du contact » arrête la vague, « pour ce
  conseiller » a son espace, zéro erreur de page. **Trouvé au navigateur,
  invisible à la lecture** : React 19 remet le formulaire à zéro quand
  l'action rend, même en échec, et un `<select>` contrôlé perd sa valeur
  dans le DOM (les champs texte gardent la leur) — la règle repartait
  « Créer une tâche » ; les champs du formulaire sont remontés après chaque
  retour d'action (`generation`). **P8 reste en attente d'accord.**

STOP.
