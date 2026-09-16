# Audit du CRM clozado — phase 1, le constat

Relevé le 2026-09-16 sur `main` au commit `433cdbf`. Lecture seule : aucun
fichier de code n'a été modifié, aucune correction n'est proposée ici — ce
document ne fait que constater. Il prépare le benchmark (phase 2) et le
plan de progression (phase 3).

**Méthode.** Sept lecteurs à périmètres disjoints ont lu les écrans en
entier (Aujourd'hui ; Contacts ; Affaires et partenaires ; Règles, cibles
et emails reçus ; Analytique, veille et newsletters ; Réglages, auth et
coquille ; isolation par organisation sur 628 points d'accès à la base),
puis leurs constats ont été recoupés et les plus lourds revérifiés dans le
code. ESLint a tourné sur tout `src` (457 fichiers, 0 message). Chaque
affirmation renvoie à un `fichier:ligne` ; ce qui n'a pas été prouvé au
navigateur est dit « plausible ». Aucun chiffre de ce document n'est
estimé : ce sont des comptes faits dans le code.

**Une correction factuelle avant tout.** Le brief dit que la File de
décision a été « livrée récemment ». Au commit audité, elle n'existe que
comme document d'étape 0 (`docs/module-file-decision.md`, commit
`433cdbf`) : aucune route, aucune table, aucun composant (`grep -ri "file de
décision\|/decisions\|stagnant" src` : vide). Cet audit la traite donc
comme un **projet**, et le §3.5 examine son recouvrement avec ce qui existe
à partir de sa conception écrite.

---

## 0. Synthèse — les douze constats qui comptent

| # | Constat | Où |
|---|---|---|
| 1 | **Le produit ne mesure pas son propre usage.** Aucune trace de quel écran est ouvert, par qui, dans quelle organisation ; pas de `last_login` ; palette, premiers pas et visite guidée ne laissent que des cookies. Impossible aujourd'hui de prouver l'adoption à un pilote autrement qu'en le lui demandant. | §4 |
| 2 | **« Ce qui m'attend » est éclaté sur 3 écrans et 7 emplacements, et une même situation compte deux fois** (ligne du suivi + tâche automatique + deux badges). Cocher la tâche ne vide pas le suivi ; agir sur le suivi ne coche pas la tâche. | §2.1, §3.5 |
| 3 | **Le PRM (partage d'affaires à des confrères) s'impose à tout le monde** : trois tuiles sur quatre du tableau de bord, tout `/suivi`, le composeur de partage déplié sur chaque fiche d'affaire, l'étape par défaut « Partagée », l'étape 3 des premiers pas — vides à jamais pour un conseiller sans apporteur. | §3.6 |
| 4 | **Aucun email individuel ne s'envoie depuis une fiche contact.** Les seuls chemins : un brouillon posé par une règle, ou une newsletter adressée à une cible entière. Le lien de partage PRM lui-même n'est jamais envoyé par le produit (presse-papier). | §2.5 |
| 5 | **Neuf formules différentes de « sans nouvelles »** coexistent (suivi ×2, tâche automatique, règles ×4, cible, gabarit métier), qui ne retiennent pas les mêmes personnes ; la File de décision en ajouterait une dixième, au niveau de l'affaire. | §3.5 |
| 6 | **Aucun des neuf écrans « Analytique / Outils » n'est un écran du matin** ; quatre forment une chaîne marketing (veille → concurrents → chiffres → newsletter) qui exige une « cible » avant d'écrire un mot ; les taux du marché, seule lecture quotidienne utile à un courtier, sont enterrés dans un réglage de l'IA. | §3.7 |
| 7 | **Les réglages exposent 54 champs et 41 boutons sur 12 cartes**, dont 2 sont nécessaires à un conseiller seul ; un `member` y arrive aussi, tout grisé ; trois erreurs de saisie courantes y produisent l'écran « Les réglages n'ont pas pu être chargés ». | §3.4, §5.5 |
| 8 | **Une affaire naît incomplète** : sans responsable (jamais posé), sans contact rattachable après coup, sans changement de pipeline possible, et le second type d'affaire n'a pas d'écran de création ; « Perdue » depuis la fiche exige deux enregistrements. | §1.3, §5.5 |
| 9 | **Le vocabulaire n'est pas celui d'un conseiller** : pipeline, kanban, funnel, lead, cible, facette, vague, gabarit, opt-in, plafond, passage, ingestion, DKIM, pack, encours, observation, « le composer » — et un même objet porte jusqu'à cinq noms (type / pipeline / étape / statut / gagné-perdu ; suivi / relances du PRM / confrère / partenaire / apporteur). | §3.3 |
| 10 | **Isolation par organisation : solide.** 628 points d'accès examinés, 0 fuite exploitable par un admin ou un membre ; cinq presque-constats (oracles d'existence, cas du super admin en vue globale) ; en revanche douze orthographes coexistent pour trois gardes. | §5.3 |
| 11 | **Quatre gestes destructifs sans confirmation ni retour** : fusionner deux contacts, archiver une règle (sans « restaurer »), écarter un article de veille, supprimer une interaction depuis le journal ; et le formulaire de règle perd toute la saisie à la première erreur. | §5.5 |
| 12 | **Sur téléphone, les gestes du quotidien sont les plus mal servis** : le numéro à appeler est la 12e section de la fiche contact et n'est pas un lien `tel:` ; le kanban affiche une colonne par écran, colonnes vides comprises ; `/suivi` est à deux touches sans badge ; l'éditeur de newsletter ne se manipule pas au doigt. | §5.4 |

Et deux contradictions de positionnement à trancher avant tout benchmark :
la page d'accueil dit « Clozado n'est pas un CRM » (`src/messages/fr/home.json:4`),
la métadonnée racine dit « Suite d'outils d'assistance marketing »
(`shell.json:81`), la navigation offre 19 écrans dont contacts, affaires,
tâches ; et le rôle `member` existe dans le schéma sans qu'aucun chemin du
produit ne permette d'en créer un (§3.4).

---

## 1. Inventaire des écrans

### 1.1 La carte

38 pages (`page.tsx`), 17 gestionnaires de route, 131 actions serveur
exportées par `src/lib/*/actions.ts` plus les actions écrites dans les pages.

La navigation (`src/components/app-shell/navigation.ts:53-96`) : 5 sections,
19 entrées, dont 18 pour un utilisateur d'organisation.

| Section | Entrées | Remarque |
|---|---|---|
| Aujourd'hui | Tableau de bord · Tâches (badge) · Suivi (badge) | « Suivi » = relances de partages PRM seulement |
| Dossiers | Contacts · Affaires · Partenaires | |
| Analytique | Funnel · Délais · Pertes · Partenariats · Origines | « Origines » est un écran de réglage, pas de lecture |
| Outils | Emails reçus · Cibles · Règles de relance · Veille · Concurrents · Chiffres · Newsletters | sept outils, dont quatre forment la chaîne marketing |
| Gestion | Invitations d'espaces | super admin réel seulement |

Hors navigation : `/settings` (lien en pied de barre, offert aussi à un
`member`, `navigation-list.tsx:52-56`), `/profil` (menu de compte seul),
`/regles/journal` (bouton de `/regles`), `/contacts/import` (bouton de la
liste et états vides), `/cibles/new`, `/newsletters/new`, `/regles/new`.
Barre d'onglets mobile (`bottom-nav.tsx:24-30`) : Accueil · Contacts ·
Affaires · Tâches (badge) · Menu — le badge « Suivi » n'y est pas.
Menu « Nouveau » (`navigation.ts:99-105`) : Contact · Affaire · Tâche ·
Partenaire — jamais une interaction (appel, rendez-vous).
Palette ⌘K : 18 écrans, 4 créations, fiches contact/affaire/partenaire par
nom (pas par téléphone, `src/db/queries/search.ts:31-35`) ; tâches, règles,
cibles, newsletters, emails reçus ne s'y cherchent pas.

### 1.2 Écran par écran

Les trois états : **V** = vide géré, **C** = squelette propre (sinon le
squelette générique de `(app)/loading.tsx`), **E** = `error.tsx` propre
(sinon `(app)/error.tsx` « Cet écran n'a pas pu être chargé » ou celui du
dossier parent, dont le message parle alors d'un autre écran). Aucune route
n'est sans état : le groupe `(app)` fournit un squelette et une erreur
génériques à tout le monde.

| Route | Rôle | Ce qu'il affiche | Actions | V / C / E |
|---|---|---|---|---|
| `/dashboard` | Le matin : ce qui attend, indicateurs, activité | En-tête (nom, « N contacts · N affaires · N partenaires », Contacts, Nouvelle affaire) ; carte Premiers pas (8 étapes) ; 4 tuiles (À faire, À relancer, Sans suite, À encaisser) ; 6 tâches ; 5 relances de partages ; 8 tuiles d'indicateurs du pack (période, CSV) ; journal de l'organisation (8 entrées, sans saisie) — jusqu'à 12 tuiles, 2 listes, 1 journal (`dashboard/page.tsx:208-452`) | Cocher une tâche (rechargement complet), supprimer une interaction, masquer les premiers pas, changer la période | V / C / E |
| `/taches` | Poste de travail des tâches | Pastilles par conseiller (si > 1), création repliée, 4 piles (En retard, Aujourd'hui, À venir, Sans échéance), 50/page, achevées récentes | Créer (titre, échéance, priorité, responsable = moi, récurrence ; **ni notes ni contact/affaire**), modifier, achever, rouvrir, supprimer (sans confirmation, `taches/page.tsx:376-383`) | V / C / E |
| `/suivi` | Relances des **partages à des partenaires** | 3 piles (sans réponse ≥ 3 j, acceptées sans suite ≥ 5 j, commissions à encaisser), En cours, Partages clos | Renvoyer le lien (nouveau jeton à copier soi-même), Marquer réglée ; pile 2 sans action | V / C / E |
| `/contacts` | Liste | Recherche (nom, email, société, téléphone normalisé), filtre conseiller (si > 1), 50/page, nom + email ou téléphone ; **aucune colonne** conseiller, étiquette, dernière interaction, affaires ; aucun tri | Créer (repli, 12 champs, nom seul obligatoire), importer, ouvrir | V / C / E |
| `/contacts/[id]` | La fiche | 15 sections dans l'ordre : en-tête, doublons, étiquettes + « Dans les cibles », 4 tuiles (dernier email ouvert, clic, interaction, rendez-vous), désinscrit, société, Affaires liées, Tâches, Rendez-vous, Relances automatiques, Activité (saisie + fil 100 entrées), Newsletters reçues, puis en colonne droite : Fiche (formulaire toujours ouvert), Étiquettes, Journal des accès, Export et suppression (`contacts/[id]/page.tsx:139-553`) ; 12 requêtes en parallèle + 1 écriture | Consigner une interaction, ajouter tâche, rendez-vous, fusionner (sans confirmation), modifier, étiqueter, exporter (×2), nouvelle affaire (×3), newsletter pour ce contact, supprimer | V / C (ne ressemble pas à la page) / hérité (message de liste) + not-found |
| `/contacts/import` | Import CSV | Dépôt, correspondance des colonnes (12 cibles), aperçu, mode doublon, rapport | Importer (personnes seulement, appariement par email seul) | V / C / hérité |
| `/affaires` | Pipeline : kanban ou liste | Onglets de pipelines (si > 1), création repliée (libellé, client texte libre, type, montant, description ; **ni responsable, ni contact, ni clôture**), kanban (colonnes, sommes brutes) ou liste (50/page, 7 colonnes, tri, filtres étape/conseiller) | Créer (redirige vers la liste, pas la fiche), glisser, menu « Déplacer vers », select natif au doigt, motif de perte facultatif après dépôt | V (six variantes) / C (kanban même en liste) / E |
| `/affaires/[id]` | La fiche d'affaire | En-tête ; carte Pipeline (étape, montant, probabilité, clôture, responsable, motif si déjà perdue) + temps par étape ; Origine (lead) ; partages (si ≥ 1) ; **composeur de partage déplié par défaut** (3 cartes + aperçu complet de la page partenaire, `affaires/[id]/page.tsx:412`) ; tâches ; journal — 13 requêtes en parallèle | Enregistrer, révoquer, renvoyer, confirmer / régler une commission, partager | V / C / hérité + not-found |
| `/partenaires`, `/partenaires/[id]` | Carnet des confrères | Liste + création repliée ; fiche : Écrire (`mailto:`), Appeler (`tel:`), formulaire, affaires partagées (sans montant ni commission) | Créer, modifier, désactiver | V / C / E ; fiche : hérité + not-found |
| `/analytique/funnel` · `delais` · `pertes` · `partenaires` | Lectures mensuelles | Filtres (du, au, conseiller, type, pipeline, origine) ; funnel 3 sections + 11 définitions ; délais (seuil 5 observations) ; pertes 4 tuiles + 4 répartitions ; partenariats 11 colonnes | Filtrer, exporter CSV, ouvrir la liste des affaires | V (« Pas encore assez de données ») / C partagé / E partagé |
| `/analytique/origines` | Réglage des origines | À rapprocher, configurées, affaires sans origine | Rattacher, créer | V / partagé / partagé |
| `/emails-recus` | Ce que l'adresse d'ingestion a reçu | Adresse secrète + copier, 3 onglets (à confirmer, traités, refusés), 25/page, une carte de confirmation par email (sens, fiche, 5 champs) | Confirmer, ignorer | V / générique / générique |
| `/cibles`, `/cibles/new`, `/cibles/[id]` | Segments de newsletter | Liste + cibles du métier ; formulaire : 17 critères + 6 facettes d'« identité éditoriale » + signataire ; fiche : membres du jour, envois, formulaire replié | Créer, dupliquer, désactiver, réactiver, ajouter/retirer des membres | V / C / E ; fiche + not-found |
| `/regles`, `/regles/new`, `/regles/[id]`, `/regles/journal` | Moteur de relance « en phrases » | Vague en attente (20 premiers sur 500), liste des règles, Évaluer maintenant, erreur brute du dernier passage ; formulaire : nom, déclencheur (5), seuil, action (4), 4 conditions, gabarit, opt-in ; journal 200 lignes sans pagination | Envoyer la vague, activer, archiver (sans confirmation ni retour), évaluer, créer, modifier | V / **générique** / **générique** ; règle introuvable = 404 générique |
| `/veille`, `/concurrents` | Préparation éditoriale | Jusqu'à 200 articles à 3 boutons, panier, sujets, sources, collectes ; concurrents et « écart de contenu » ; **collecte IA lancée par la visite** après 24 h (`veille/page.tsx:117-130`, `concurrents/page.tsx:108-119`) | Actualiser, mettre de côté, écarter (irréversible), écrire une newsletter | V / C / E |
| `/chiffres` | Liste blanche des chiffres citables par l'IA | Indicateurs de marché suivis (taux d'usure, OAT, BCE, inflation, IRL), catalogue de 13, chiffres internes | Suivre, ne plus suivre, ajouter, modifier, supprimer | V / C / E |
| `/newsletters`, `new`, `[id]` | Production d'emails de masse | Liste ; éditeur (cible obligatoire, brief → génération IA, 8 types de blocs, revue continue) ; fiche : envoi test, envoi réel avec case de confirmation, agrégats | Écrire, envoyer, marquer envoyée, supprimer (créateur seul) | V / C / **générique** (aucun `error.tsx` dans le module) + not-found |
| `/settings` | Les 12 cartes de réglages | Marque, Domaine d'envoi, Pied de page, Adresse d'ingestion, Envois automatiques, Langue/devise/fuseau, Logo, Pack métier, Pipeline(s), Nouveau pipeline, Collecte, Motifs de perte — 54 champs, 41 boutons, 11 ancres (détail §3.4) | Tout | V par carte / C / E |
| `/profil` | Adresse de réponse, lien de rendez-vous, Calendly | | Enregistrer, connecter | – / générique / générique |
| `/invitations` | Super admin : liens de création d'espace | | Générer, copier, envoyer, révoquer | V / C / générique |
| `/`, `/login`, `/login/verifier`, `/inscription` | Entrée | Accueil (« n'est pas un CRM »), lien magique, inscription 2 champs | | – |
| `/partage/[token]`, `/desinscription/[id]` | Publics par jeton | Vitrine partenaire (accepter, refuser, statut, commentaire) ; désinscription | | V / C / E |

### 1.3 Construit mais pas branché, à moitié fini, ou inaccessible

**Code mort ou jamais appelé**
- `listDeals`, `getPipelineTotals` (`src/db/queries/deals.ts:24-38, 452-463`) : aucune importation.
- `countAutomaticDrafts` (`src/db/queries/rules.ts:627-633`) : aucun appelant — **rien ne signale qu'une vague attend** (ni badge, ni notification).
- `restoreItemAction` / `listWatchItems({ includeDismissed })` (`src/lib/watch/actions.ts:276`, `watch.ts:395, 460`) : « Écarter » un article est sans retour à l'écran.
- `AIProvider.designNewsletter` non-flux (`src/lib/ai/types.ts:10`) : aucun appelant hors `lib/ai`.
- `recentActivities` : 50 lignes chargées à chaque ouverture de fiche contact et jamais lues (`src/db/queries/contacts.ts:118-123`, `contacts/[id]/page.tsx:88`).

**Paramètres acceptés par la requête, jamais passés par l'écran**
- `listContacts({ tagId })` (`contacts.ts:42, 63-69`) : la liste ne lit que `q`, `page`, `conseiller` (`contacts/page.tsx:19`) — aucun filtre par étiquette, type, source, ville.
- `listAutomaticDrafts({ ruleId })`, `sendAutomaticWave({ ruleId })` (`rules.ts:600`, `wave.ts:36`) : pas d'envoi par règle.
- `listRuleJournal({ contactId })` (`rules.ts:557`) ; `taskId`/`messageId` rapportés mais jamais liés : « Faite » sans ouvrir la tâche ou l'email créés.
- `listDealsBoard` renvoie `probability` et `contactId` (`deals.ts:325, 331`) que le kanban n'affiche pas.

**Colonnes sans écran**
- `contacts.companyId` (lien personne → société) : lu, **jamais posable** ; le message `contacts.json:54` décrit une fonction qui n'existe pas. `contacts.source` jamais affiché ; `externalSystem`, `externalId`, `lastSyncedAt` (synchro « anticipée, non construite »).
- `appointments.notes`, `appointments.endsAt`, `contactTags.color` : jamais saisis.
- `organizations` : `customDomain` (« schéma seulement »), `logoUrl`, `logoLockupText`, `secondaryColor`, `inkColor`, `backgroundColor`, `headingFontFamily`, `headingFontFallback`, `bodyFontFallback`, `borderRadius`, `tagline`, `toneOfVoice`, `editorialGuidelines` — la carte Marque n'écrit que nom, couleur, police, expéditeur (`settings/page.tsx:109-115`).
- Les cinq seuils du suivi (`share_pending_reminder_days` 3, `share_pending_urgent_days` 7, `share_expiring_soon_days` 2, `deal_accepted_stale_days` 5, `commission_unpaid_days` 14, `src/db/schema/organizations.ts:43-63`) : **aucun écran ne les règle**, rien à l'écran ne dit pourquoi un partage bascule « sans réponse » au 3e jour.
- `deals.probability` et `deal_statuses.probability` : saisies, affichées en colonne « Prob. », **jamais pondérées** (sommes brutes, `kanban-board.tsx:132`).
- `rules.position` : assigné, jamais réordonné.

**À moitié fini**
- Types d'affaire : le premier se crée dans l'état vide de `/affaires` ; `deals.json:117` promet « tu pourras en ajouter d'autres ensuite » — **aucun écran** ne le permet (grep `createDealType` : un seul appelant, `affaires/page.tsx:33, 60-66`).
- Changer une affaire de pipeline : refusé par `changeDealStage` (« sera un geste dédié », `deals.ts:187-191`), geste jamais écrit.
- Rattacher un contact à une affaire après création : `DEAL_DETAILS_SCHEMA` sans `contactId` (`deals.ts:244-250`).
- Import CSV : personnes physiques seulement, appariement par email seul (une ligne sans email crée toujours une fiche : réimporter un fichier sans emails double la base, `contacts.ts:697-765`) ; ni date de naissance, ni conseiller, ni étiquettes.
- Rendez-vous : le type d'interaction « Rendez-vous » du journal (passé seulement) et la section « Rendez-vous » (table `appointments`) coexistent ; un rendez-vous de la section n'apparaît pas dans le fil « Activité » (`activities.ts:176-331, 460-471` ne fusionne pas `appointments`).
- Le rôle `member` : dans le schéma, l'enum, les gardes serveur et le semis démo — **aucun chemin du produit ne crée un membre** (`signup.ts:105` force `admin` ; `auth.ts:81-89` refuse toute adresse absente ; les invitations d'espaces sont explicitement « ni une invitation de membre », `schema/workspace-invitations.ts:11-12`).
- La carte « Premiers pas » masquée ne revient jamais (seul `masque` est envoyé, `onboarding-checklist.tsx:30`) ; la visite guidée relancée depuis le menu repart toujours de l'étape 1 (`tour-card.tsx:60`).
- `/profil` sans `loading`/`error` ; `/regles/*` et `/emails-recus` sans `loading`/`error`/`not-found` ; `/newsletters/*` sans `error`.
- Journal des règles : les règles archivées y ont des lignes mais ne sont pas filtrables (le select est alimenté par `listRules` sans archivées).

### 1.4 Le benchmark d'août 2026 : ce qui a été construit

| Retenu en août | État au 2026-09-16 | Preuve |
|---|---|---|
| Gabarits d'emails 1:1 et envoi depuis la fiche | **Non construit.** Aucun composeur (`grep compose src/lib/email src/components/contacts` : vide). Ersatz : brouillon posé par une règle `prepare_draft`, envoyable depuis la fiche ; « Rédiger une newsletter pour ce contact » crée une newsletter pour une cible entière | `contact-auto-send.tsx:89-119` ; `lib/contacts/actions.ts:155-168` ; gabarits seulement côté règles (`rules.json:61-69`, `lib/rules/template.ts:10-19`) |
| Champs personnalisés simples | **Non.** Schéma fermé par conception | `schema/contacts.ts:37-40` ; grep `custom_field` : vide |
| Vues enregistrées | **Non.** Filtres en URL seulement ; le kanban ne filtre rien ; pas de « mes affaires » | `contacts/page.tsx:19` ; `affaires/page.tsx:73` |
| Statut de relation (prospect / client…) | **Non.** Seuls `kind` (personne / société) et `source` (jamais affiché) ; « Clients » et « Prospects » sont des cibles calculées ; les étiquettes libres servent de substitut | `schema/contacts.ts:27, 30` ; `templates.json:33-35, 126-128` |
| Dates clés avec déclencheur | **Non.** Une seule date métier (`birthDate`), non importable, critère d'âge des cibles ; déclencheurs de règles = délais d'inactivité seulement | `schema/contacts.ts:73` ; `schema/rules.ts:49` |
| Foyers / ménages | **Non.** Seul lien personne → société, sans interface pour le poser | `schema/contacts.ts:67` |
| Centre de notifications | **Partiel.** `FlashToaster` = notification éphémère d'une action (`?erreur=`, `?info=`) ; aucune table, aucun historique, rien ne signale une vague en attente ou un email reçu | `app-shell/flash-toaster.tsx` |
| Prévisionnel pondéré | **Non.** Probabilités saisies, jamais multipliées aux montants | `kanban-board.tsx:132` ; grep « pondér », « weighted » : vide |
| Séquences multi-étapes (reporté) | Non, conforme au report : une règle = un déclencheur + une action ; le plafond « un email automatique par contact par 14 jours » bride tout enchaînement | `schema/rules.ts:9-12` |
| Application native, scoring opaque, OAuth boîtes mail (rejetés) | Non construits, conforme | — |

Sur huit éléments retenus en août, **un seul est partiellement construit**
(les notifications), sept ne le sont pas. L'effort depuis août a porté sur
l'engagement (envoi réel, ingestion, règles), la démo, la sécurité, l'UI et
les invitations d'espaces.

---

## 2. Les parcours quotidiens

Compte fait depuis `/dashboard` après connexion, sur bureau, en clics
minimaux (un « clic » = un clic ou une touche Entrée ; la frappe n'est pas
comptée). Puis ce qui change sur téléphone.

| Parcours | Écrans | Clics | Champs | Verdict |
|---|---|---|---|---|
| 1. Voir ce que j'ai à faire aujourd'hui | 3 (`/dashboard`, `/taches`, `/suivi`) | 0 à 4 | 0 | 7 emplacements, vision du cabinet entier, double comptage |
| 2. Ajouter un prospect | 2 | 3 | 1 obligatoire sur 12 visibles | Court, mais le conseiller doit se choisir lui-même comme responsable à chaque fois |
| 3. Noter un appel ou un rendez-vous | 2 | ~3 + frappe | 1 à 2 | La saisie est la 10e section de la fiche ; deux endroits pour un rendez-vous ; impossible depuis la liste ou le tableau de bord |
| 4. Faire avancer une transaction | 1 | 2 (glisser) | 0 | Rapide ; mais rien ne suit ; « Perdue » depuis la fiche = 4 clics et 2 rechargements |
| 5. Relancer quelqu'un | 1 à 2 | 2 à 5 | 1 à 2 | Client : pas d'email 1:1, une tâche au mieux ; partenaire : lien à coller soi-même + tâche automatique à cocher ensuite |
| 6. Retrouver un contact | 1 à 2 | 2 à 3 | 1 | ⌘K en deux gestes, mais pas par téléphone ; rien sur `/affaires` |
| 7. Traiter la File de décision | 0 | — | — | N'existe pas ; l'équivalent d'aujourd'hui est `/suivi` (partages) + `/taches` (tâches automatiques) |

### 2.1 Voir ce que j'ai à faire aujourd'hui

L'information est répartie sur **sept emplacements et trois écrans** : la
tuile « À faire » et la liste de 6 tâches (`dashboard/page.tsx:319-395`),
les tuiles « À relancer / Sans suite / À encaisser » et la liste « À
traiter en priorité » (5 partages, sans les commissions, `:397-434`), les
badges « Tâches » et « Suivi » de la barre latérale, puis `/taches` (4
piles, 50 par page) et `/suivi` (3 piles).

- **Vision du cabinet, jamais « la mienne »** : la tuile, la liste et le
  badge comptent les tâches ouvertes de toute l'organisation
  (`src/db/queries/tasks.ts:243-257, 271-298`). Le seul filtre « moi » est une
  pastille de `/taches`, en paramètre d'URL, non mémorisée (`taches/page.tsx:81-87`) ;
  les tâches « Personne » n'apparaissent sous aucune pastille.
- **Double comptage** : chaque situation du suivi engendre une tâche
  automatique datée du jour (`tasks.ts:486-564`, à chaque ouverture de
  `/dashboard` et `/taches`). Un partage sans réponse apparaît donc dans la
  pile de `/suivi`, la tuile « À relancer », la liste « À traiter en
  priorité », la liste « À faire aujourd'hui », `/taches`, le badge
  « Tâches » et le badge « Suivi ». Cocher la tâche ne change rien au suivi ;
  « Renvoyer le lien » ou « Marquer réglée » ne ferme pas la tâche
  (`deal-shares.ts:167-193`, `commissions.ts:59-94` ne touchent pas `tasks`),
  et le nouveau partage engendre une nouvelle tâche trois jours plus tard.
- **Toute tâche automatique devient « En retard » le lendemain** (échéance
  = jour de création, `tasks.ts:524`) : la pile rouge et le badge grossissent
  sans geste de l'utilisateur ; ces tâches ne se suppriment pas
  (`tasks.ts:460-468`).
- **Pour un conseiller sans apporteur d'affaires**, trois tuiles sur quatre
  et la liste « À traiter en priorité » sont vides à jamais, `/suivi` aussi ;
  la moitié de l'écran « Aujourd'hui » ne le concerne pas.
- Cocher une tâche = un clic puis un **rechargement serveur complet**
  (`completeTaskAction` → `redirect`, `lib/tasks/actions.ts:117-127`), sans
  état optimiste.
- Sur un espace en mise en route, la carte « Premiers pas » (8 lignes, dont
  4 de marketing : cible, newsletter, règle, domaine d'envoi ; première
  étape proposée : « Poser ta marque ») est au-dessus des tuiles
  (`dashboard/page.tsx:292`), et la visite guidée (8 écrans) se lance seule
  par-dessus à la première visite d'un navigateur (`tour-card.tsx:60-71`).
- Les 8 tuiles d'indicateurs (« médiane », « masqué : il manque N
  observations », sélecteur de période, export CSV) suivent immédiatement :
  matière analytique sur l'écran du matin.

**Mobile.** `/suivi` est à deux touches (Menu → Suivi) et son badge n'est
visible qu'en ouvrant le panneau ; la carte de visite occupe le bas de
l'écran ; dans « À traiter en priorité », le détail de droite (« sans
réponse depuis 12 jours », non tronqué, `list-card.tsx:66-69`) écrase le titre
à 390 px.

### 2.2 Ajouter un prospect

« Nouveau » (1) → « Contact » (2) → `/contacts?nouveau=1`, repli déjà
ouvert → Nom → « Créer le contact » (3) → fiche. **2 écrans, 3 clics, 1
champ obligatoire** ; nom + téléphone suffisent ; aucun statut, origine ou
type à choisir. Frictions :
- 12 champs visibles d'un coup (date de naissance, pays, code postal,
  fonction, notes, conseiller) pour une fiche qui n'a besoin que de deux
  (`contact-create-form.tsx:66-140`) ; le formulaire utilise le `Select` Base
  UI alors que la fiche utilise `NativeSelect` ;
- « Conseiller attribué » vaut « Personne » par défaut
  (`contact-create-form.tsx:114`) : un conseiller seul doit se choisir
  lui-même à chaque création, sinon la fiche n'est « suivie par »
  personne — et le select s'affiche dès un seul utilisateur (`:109`) alors
  que le filtre de la liste n'apparaît qu'à deux (`contacts/page.tsx:68`) ;
- homonyme ou même email → création suspendue, « Créer quand même » (4e
  clic) ; deux vrais homonymes garderont l'encadré « Doublons possibles » à
  vie (aucun « ce n'est pas un doublon », `contacts.ts:175-196`) ;
- aucune validation serveur (pas de zod : `lib/contacts/actions.ts:80` ne
  vérifie que le nom), alors que l'import en a une ;
- à l'arrivée, la fiche neuve montre **six sections vides et quatre
  « Jamais »** avant l'identité (§3.1).

**Mobile.** Onglet Contacts (1) → repli (2) → Créer (3) ; 12 champs en une
colonne.

### 2.3 Noter un appel ou un rendez-vous

Impossible depuis le tableau de bord (journal en `context="org"`, sans
saisie, `journal.tsx:78, 98`), depuis la liste des contacts (aucune action de
ligne) ni depuis la palette (pas d'« Interaction » dans « Créer »).

Chemin le plus court : ⌘K (1) → deux lettres → Entrée sur la fiche (2) →
défiler jusqu'à la **10e section** « Activité » → type (Appel par défaut),
compte rendu facultatif, date vide = maintenant → « Consigner » (3). **2
écrans, ~3 clics + frappe, 0 à 1 champ.** Le futur est refusé au-delà de
5 minutes (`activities.ts:576-578`) ; pas de durée, d'issue ni de « prochaine
action ».

**Deux endroits pour un rendez-vous** : « Rendez-vous » est un type
d'interaction du journal (passé seulement — le texte renvoie vers une tâche,
`activities.json:24`) **et** une section « Rendez-vous » à part (à venir ou
maintenant, table `appointments`). Un rendez-vous saisi dans la section
n'apparaît jamais dans « Activité » (§1.3). Le conseiller doit deviner où
saisir.

Aucune passerelle : cocher la tâche « Rappeler M. X » (sur `/dashboard`) et
consigner l'appel (sur la fiche) sont deux gestes sur deux écrans. Un email
consigné à la main ne vaut pas « a répondu » (`direction` reste `null`,
`activities.ts:589` ; seul l'email ingéré et confirmé porte `inbound`).

**Mobile.** Identique, avec la saisie rapide en escalier (`journal.tsx:103-125`
: `Input min-w-56 flex-1` + `datetime-local` + select + bouton en
`flex-wrap`), même chose pour le rendez-vous (`appointment-section.tsx:88`) ;
la correction « une colonne sous sm » a été appliquée aux tâches, pas ici.

### 2.4 Faire avancer une transaction

`/affaires` (1) → glisser la carte (1 geste) = **2 clics, 1 écran** ; sans
souris : poignée → étape (3). Mise à jour optimiste puis `router.refresh()`
(`kanban-board.tsx:84-92`). Vers « Perdue » : motif facultatif, proposé sur
la carte après le dépôt (+1 clic, écriture séparée). Depuis la fiche :
select « Étape » → Enregistrer (2 clics) ; vers « Perdue » avec motif : **4
clics et deux rechargements**, car le champ « Motif » n'existe dans le
formulaire que si l'étape courante est déjà perdue (`affaires/[id]/page.tsx:257`).

Ensuite : trois écritures atomiques (`deals.ts:204-230`) et **rien d'autre**
— pas de tâche, pas de prochaine étape proposée, pas de demande de clôture
prévue ou de montant, pas de notification. Le motif de perte posé depuis la
fiche n'est jamais journalisé (`deals.ts:277-307`).

**Mobile.** Onglet Affaires → kanban **une colonne par écran**
(`kanban-board.tsx:143`, `w-[calc(100vw-3rem)]`), colonnes vides comprises,
chacune avec « Dépose une affaire ici » sur un appareil sans glisser ; puis le
select natif « Déplacer vers » sous la carte : **2 taps + n balayages**. La
vue liste ne permet aucun changement d'étape.

### 2.5 Relancer quelqu'un

**Un client.** Il n'y a **pas d'email individuel** depuis la fiche : ni
composeur, ni `mailto:` (téléphone et email sont des `Input`,
`contacts/[id]/page.tsx:405-408`). Les seuls chemins : (a) envoyer un
brouillon **posé par une règle** (`contact-auto-send.tsx:89-119`, seulement si
une règle `prepare_draft` a tourné pour ce contact) ; (b) « Rédiger une
newsletter pour ce contact », qui crée une newsletter **pour une cible
entière** avec un brief prérempli (`lib/contacts/actions.ts:155-168`), à
condition qu'une cible existe. Les gabarits n'existent que côté règles
(`{prenom}`… `{lien_rdv}`). Reste la tâche de relance depuis la fiche :
titre + échéance + « Ajouter » (1 saisie, 1 clic ; pas de raccourci « dans 7
jours ») ; ou une règle (§3.5), en quatre clics et deux saisies, dont l'effet
n'apparaît que sur `/taches`, sur les fiches ou dans la vague.

**Un partenaire.** `/suivi` (1) → « Renvoyer le lien » (2) → « Copier le
lien » (3) → **coller soi-même dans un email ou un SMS hors produit** →
« Terminé » (4), puis cocher la tâche automatique restée ouverte (5). Le
produit **n'envoie jamais** le lien de partage (grep `/partage/` dans
`src/` : aucun gabarit d'email ; `shares.json:76` « Ce lien ne sera plus
jamais réaffiché ») ; l'email du partenaire ne sert qu'au `mailto:` de sa
fiche. Un dossier « accepté sans suite » n'a aucune action : la ligne ouvre
l'affaire ; la pile ne se vide que par un événement rattaché au partage —
un appel consigné dans le journal de l'affaire ne compte pas
(`deal-follow-up.ts:121-129`).

### 2.6 Retrouver un contact

⌘K → deux lettres → Entrée : **2 gestes** ; mais la palette cherche nom,
email, société, **pas le téléphone** (`search.ts:31-35`), 5 résultats par type,
sans indicateur de chargement, erreur avalée (`command-palette.tsx:95`).
Liste : « Contacts » (1) → saisie → « Rechercher » (2) → fiche (3) ; sous-
chaîne sur nom, email, société, téléphone normalisé (« 06 12 » trouve
« 0612… », « +33 6 » ne trouve pas « 06 ») ; pas sur notes, ville, fonction ;
pas de recherche instantanée. Aucune recherche texte sur `/affaires`.

### 2.7 Traiter la File de décision

Aucun écran. Ce qui en tient lieu aujourd'hui : les deux premières piles de
`/suivi` (partages, pas affaires) et leurs tâches automatiques. Voir §3.5.

---

## 3. Complexité

### 3.1 Champs obligatoires, champs inutiles, écrans redondants

**Obligatoires** : le produit est sobre — nom du contact, libellé + client +
type d'affaire, titre de tâche, nom de règle, nom de cible, cible d'une
newsletter, adresse postale avant tout envoi réel. Deux exceptions : le
**type d'affaire** est obligatoire côté serveur mais le select n'a pas de
`required` → clic muet sur « Créer l'affaire » (`affaires/page.tsx:153, 278`) ;
la **cible** est obligatoire pour écrire une newsletter, ce qui impose trois
écrans avant de taper un mot (liste → « Écrire la première » → « Aucune cible »
→ `/cibles`).

**Exposés sans besoin au quotidien** : à la création d'un contact, date de
naissance, pays, code postal, fonction, notes, conseiller (§2.2) ; sur la
fiche d'affaire, probabilité, clôture prévue, « Origine (lead) », composeur
de partage déplié avec commission cochée par défaut et aperçu complet de la
page partenaire ; sur la fiche de cible, six facettes d'« identité
éditoriale » (« Qui est cette personne », « Ce qu'on ne lui dit pas ») avec
formulaire ouvert d'office et badge « Identité à compléter », alors que « tout
est facultatif » (`targets.json:198`).

**Une fiche contact fraîchement créée, dans l'ordre** : en-tête → [doublons] →
« Dans les cibles : aucune pour l'instant » → 4 tuiles « Jamais » → Affaires
liées vide → Tâches vide → Rendez-vous vide → Relances automatiques (texte +
bouton « Arrêter ») → Activité vide → Newsletters reçues vide → Fiche → ...
Soit **six sections vides et quatre « Jamais »** avant d'atteindre le
téléphone. La fiche fait 12 requêtes en parallèle plus une écriture
(journal des accès) à chaque ouverture ; « Exporter les données » y figure
deux fois et « Nouvelle affaire » trois fois (`contacts/[id]/page.tsx:155-162,
528-534, 557-575`).

**Écrans redondants** : « Réglages » (menu de compte) et « Marque &
réglages » (tableau de bord, pied de navigation) pour `/settings` ; « Tableau
de bord » et « Accueil » ; deux façons de « brancher Calendly » sur `/profil`
(lien de rendez-vous et jeton) sans phrase qui les distingue ; « Rendez-
vous » en deux endroits (§2.3) ; trois réglages du même geste d'envoi
automatique sur trois écrans (`/settings#envois-automatiques`, le formulaire
de règle, `/regles`).

### 3.2 Notions en doublon

| Une chose | Ses noms dans l'interface | Où |
|---|---|---|
| L'étape d'une affaire | « Étape » (select), « Statut de l'affaire » (en-tête de la fiche, vitrine), « · gagné / · perdu » (marqueur), « Marqueur de fin » (réglages) — et le **statut du partage** (En attente / Acceptée / Refusée / Révoquée) à quelques lignes | `affaires/[id]/page.tsx:171, 184, 193` ; `shares.json:51, 117-122` |
| Type d'affaire vs pipeline | décrits avec les **mêmes exemples** (« Crédit immobilier », « crédit, placement, transaction… »), stockés indépendamment, sans lien | `deals.json:117, 122` ; `schema/deals.ts:60-62` |
| « Partagée » | une **étape** par défaut du pipeline **et** l'objet « partage » PRM ; `createDealShare` ne déplace pas l'étape : une affaire peut être « Partagée » sans partage, ou partagée en « Nouveau » | `deal-statuses.ts:29` ; `deal-shares.ts:27-108` |
| Le suivi PRM | « Suivi », « relances du PRM » (sigle jamais expliqué), « confrère », « partenaire », « apporteur d'affaires » | `nav.json:19` ; `tasks.json:23` ; `followup.json:16` ; `dashboard.json:11, 21` |
| La pile « sans réponse » | « À relancer », « Partages sans réponse », « Partage sans réponse » (badge), « Relancer {partenaire} — partage sans réponse sur … » (tâche), « Le confrère n'a pas répondu » | `dashboard.json:48, 73` ; `followup.json:16, 20` ; `tasks.json:5, 64` |
| La pile « sans suite » | « Sans suite », « Acceptées, puis silence », « Acceptées sans suite », « Affaire sans suite », « Faire le point avec X — … sans nouvelle », « dossiers sans suite », « Aucun dossier accepté ne stagne » | `dashboard.json:51, 79` ; `followup.json:5, 6, 13` ; `tasks.json:4, 60` |
| « Relance » | `/suivi` (« À relancer ») **et** `/regles` (« Règles de relance », visite « Les relances ») | `dashboard.json:48` ; `nav.json:18` ; `tour.json:45-48` |
| Responsable / créé par | `owner_id` éditable, jamais posé à la création ; `created_by` jamais affiché ; « Conseiller attribué » (formulaire) vs « Suivi par » (en-tête) | `deals.ts:130-144` ; `contacts.json:60, 98` |
| « Personne » | personne physique (radio) **et** aucun conseiller (select) dans le même formulaire | `contacts.json:35, 90` |
| « Société » | personne morale (badge, radio) **et** champ texte libre d'une personne | `contacts.json:38-39` |
| « Montant » | Montant estimé, Montant de référence (prérempli avec l'estimé), Montant fixe, Montant (€), montant calculé de la commission — sur la même fiche | `affaires/[id]/page.tsx:206` ; `share-composer.tsx:352, 377, 388` |
| Probabilité | celle de l'étape (réglages) et celle de l'affaire en dérogation | `deal-statuses.probability`, `deals.probability` |
| Lead / contact / origine / source | « lead » (objet reçu), « origine » de l'affaire et « origine d'acquisition », « source » du contact (jamais montrée), « Comment la fiche est entrée » (critère de cible) | `deals.json:8-40` ; `criteria-editor.tsx:176-189` |
| Étiquettes / cibles | côte à côte sur la fiche ; les cibles modèles dépendent d'étiquettes (`tagsAny`) | `contacts/[id]/page.tsx:202-225` ; `templates.json:20, 31, 72` |
| Écrire à un contact | « brouillon de règle », « relances automatiques », « newsletter pour ce contact » — aucun n'est un email simple | §2.5 |
| Brouillon | « Préparer un brouillon sur la fiche » et « Préparer un envoi automatique (vague) » créent le **même objet** (`kind` différent) | `evaluate.ts:232-237` |
| Deux indicateurs pour une mesure | `share_response_delay` et `partner_response_delay` | `lib/metrics/definitions.ts:57, 177` |
| Deux périodes par défaut | analytique « Depuis le début », tableau de bord « 90 jours » : « Affaires perdues » n'a pas la même valeur d'un écran à l'autre | `search-params.ts:35` ; `packs.ts:145` |

### 3.3 Le jargon, tel qu'il s'affiche

Occurrences dans `src/messages/fr/*.json` : « pipeline » 103, « partage »
175, « commission » 130, « cible » 125, « funnel » 44, « pack » 39, « vague »
22, « ingestion » 16, « kanban » 11, « matière » 11, « segment » 11, « webhook »
12, « DKIM » 5, « clé de site » 5, « signataire » 4, « apporteur » 4, « pile » 4.

Par famille, avec un exemple visible :
- **Pipeline** : « Pipeline », « Kanban », « Prob. », « Libellé » (pour le titre), « Marqueur de fin », « Étape intermédiaire », « Probabilité indicative en % », champ « Couleur » attendant `#2563eb` (`deals.json:34, 94, 99, 110` ; `settings.json:159, 180, 189`).
- **Acquisition et analytique** : « lead » (47 + 88 occurrences), « funnel », « cohorte », « déperdition », « taux de passage », « observation(s) » (« 3/5 observations »), « médiane », « encours », « masqué : il manque N observations pour afficher un taux », « pack métier », « clé de site », « clé d'API », « intégrateur », « Authorization: Bearer », « payload », `data-simulator`, `clozado.track(...)` (`dashboard.json:29-42` ; `settings.json:3-8, 138-232`).
- **Engagement** : « vague », « gabarit », « version figée », « opt-in », « interrupteur général », « plafond », « passage », « Jamais évaluée », « retenus », « déclencheur », « seuil », « réarmer », « Envois automatiques actifs — une réponse, un rendez-vous ou une désinscription les arrête » (`rules.json:14-36, 61-70, 92, 118-133, 149-164`).
- **Ingestion** : « adresse d'ingestion », « copie cachée », « DKIM », « SPF », « aligné », « d= », « s= », « À qualifier », « Le sens de cet email », « variable EMAIL_INBOUND_DOMAIN » à l'écran (`inbound.json:13-36, 50-88` ; `settings.json:81-93`).
- **Contenu** : « cible », « segment vivant », « sélection manuelle », « facette », « identité éditoriale », « étiquette d'audience », « signataire par défaut », « matière », « panier », « écart de contenu », « angle », « flux », « chiffres vérifiés », « encart », « surtitre », et **« le composer »**, nom interne de la génération IA, dans six phrases visibles (`figures.json` ; `newsletters.json`).
- **Réglages** : « Identifiant : {slug} », « Repli » (badge de toute organisation neuve), « enregistrements DNS », « TXT, MX, CNAME », « propagation », « profil appliqué : Union européenne », « SIREN, ORIAS, RCS », « fuseau horaire » avec plusieurs centaines d'identifiants IANA (`settings.json:25-73, 103-122, 239` ; `timezone.ts:26-28`).
- **Contact** : « Dans les cibles », « Consigner », « interaction », « Journal des accès », « brief », « marquée envoyée », « Partage révoqué / expiré (constaté) », « Approximatif (le préchargement compte comme une ouverture) », « identité effacée, traçabilité des affaires conservée », et une faute : « rien ni personne ne peut le revenir » (`contacts.json:55-117` ; `email.json:18` ; `activities.json:3-36`).
- **Commande shell à l'écran** : « applique-la (npm run db:migrate:http) » (`invitations.json:41-42`, super admin).

Bon point : « préheader » est traduit « Aperçu », « CTA » « Encart d'action »,
« eyebrow » « Surtitre » ; les étapes par défaut du pipeline (« Nouveau, En
négociation, Acceptée, Perdue ») sont saines — sauf « Partagée ».

### 3.4 Les réglages exposés

`/settings` (`src/app/(app)/settings/page.tsx`, 747 lignes) : 12 cartes sur une
page à ancres, **54 champs, 41 boutons, 11 liens de sommaire** pour un admin
d'organisation neuve (hors champs cachés et boutons « Copier »). Un `member`
voit la même page, tout grisé (« Lecture seule — seul l'admin… ») — et la
barre latérale lui offre le lien (`navigation-list.tsx:52-56`).

| Carte | Nécessaire à un conseiller seul ? | Champs / boutons |
|---|---|---|
| Marque | Non pour travailler ; nom d'expéditeur et adresse de réponse le jour d'un premier email | 5 / 12 (8 palettes, pipette, hex, « Contrastes vérifiés (9) ») |
| Domaine d'envoi | Non : le repli `<slug>@mail.clozado.fr` envoie déjà | 1 / 1 (+ Vérifier, Retirer, tableau DNS, 7 hébergeurs après déclaration) |
| Pied de page des emails | **Oui** dès le premier envoi réel : l'adresse postale est bloquante | 4 / 1 |
| Adresse d'ingestion | Non (geste optionnel de copie cachée) | 0-1 / 1-3 |
| Envois automatiques | Non tant qu'aucune règle `send_email` n'existe | 4 / 1 |
| Langue, devise, fuseau | Non (défauts fr / EUR / Paris) | 3 / 1 |
| Logo | Non | 2 / 1-3 |
| Pack métier | Utile (choisit les tuiles), non bloquant | 4 radios / 1 |
| Pipeline | Partiellement (renommer une étape) ; couleur hex, probabilité, marqueur relèvent du paramétrage d'outil | 25 / 17 |
| Nouveau pipeline | Non | 1 / 1 |
| Collecte des leads et des visites | Non — pour un intégrateur | 3 / 3-4 |
| Motifs de perte | **Oui**, à la première affaire perdue ; vide au départ (rien n'est semé) | 1 / 1 |

Deux cartes nécessaires, une utile, **neuf d'intégrateur, de multi-pays ou de
marque blanche**. Ce qu'un nouvel espace **doit** régler avant d'être utile :
rien pour contacts / affaires / tâches / partenaires (tout marche sur le
semis : 1 pipeline de 5 étapes, 1 clé de site) ; l'adresse postale pour tout
envoi réel ; l'interrupteur pour les envois automatiques. Et rien ne conduit
vers l'adresse postale : elle n'est pas dans les premiers pas.

Autres réglages hors `/settings` : les seuils du suivi (aucun écran), la
période et les heures de bureau (carte 5), le jeton Calendly et le lien de
rendez-vous (`/profil`, hors navigation).

### 3.5 Le recouvrement : suivi, tâches automatiques, règles, cibles — et la File de décision

**Aujourd'hui, une même situation vit déjà en deux mécanismes et sept
emplacements** (§2.1) : les piles de `/suivi` et les tâches automatiques
(`share_pending`, `deal_accepted_stale`, `commission_unpaid`), sans lien
entre elles.

**Neuf formules de « sans nouvelles »** coexistent, qui ne retiennent pas les
mêmes personnes :

| # | Où | Objet | Formule | Seuil |
|---|---|---|---|---|
| 1 | `/suivi` pile 1, tâche `share_pending` | partage | `pending` et jours depuis `sent_at` ≥ seuil ; critique ≥ 7 j ou expiration ≤ 2 j (`deal-follow-up.ts:148-160`) | 3 / 7 / 2 j (organisation, sans écran) |
| 2 | `/suivi` pile 2, tâche `deal_accepted_stale` | partage | `accepted` et jours depuis le dernier `deal_events` (`status_changed`, `commented`, `commission_updated`) **de ce partage** ≥ seuil (`:118-135`) — une activité du journal ne compte pas | 5 j |
| 3 | tâche `commission_unpaid` | commission | confirmée depuis ≥ seuil (approché par `updated_at`) | 14 j |
| 4 | règle `no_interaction`, tuile « Dernière interaction » | contact | `GREATEST(activités, RDV tenus, clics d'email) < now − N` (`engagement.ts:34-47` ; `rules.ts:343-346`) — une ouverture d'email ne compte pas | N par règle |
| 5 | règle `no_appointment` | contact | aucun RDV `scheduled` avec `starts_at > now − N` — exclut aussi un contact qui a un rendez-vous dans trois semaines (`rules.ts:337-342`) | N |
| 6 | règles `email_not_opened` / `email_not_clicked` | contact | dernier email `newsletter`/`manual` remis depuis > N j, jamais ouvert / cliqué | N |
| 7 | règle `share_unanswered` | contact-partenaire | partage `pending` depuis > N j vers un partenaire de même email | N |
| 8 | cible `inactiveForDays` | contact | aucune **activité** depuis N j — ni rendez-vous ni clic (`mail-targets.ts:145-149`) | N |
| 9 | gabarit métier « Sans nouvelles depuis six mois » | contact | `inactiveForDays` 180 et `createdMoreThanDays` 180 (`lib/targets/templates.ts:32-37`) | 180 j |

S'y ajoutent l'anti-répétition d'une règle (même N que son déclencheur,
`rules.ts:443-447`), le plafond « un email automatique par contact par
période » (14 j) et les fenêtres du moteur. La cible « Sans interaction
depuis 30 jours » et la règle « Aucune interaction depuis 30 jours » ne
retiennent donc pas les mêmes contacts, et rien à l'écran ne le dit.

**La File de décision, telle que conçue** (`docs/module-file-decision.md`
§1-2), définirait une **dixième** formule, au niveau de l'**affaire** :
`MAX(created_at, changements d'étape, activités de l'affaire, tâches
achevées, six types de deal_events, et selon D2 les interactions du client)`
comparé à un seuil à trois niveaux (étape → organisation → plateforme). Son
propre audit le reconnaît (§0.2-10 : « la troisième définition d'inactivité
du dépôt ») et sa décision D9 recommande d'**accepter le double signalement**
avec `/suivi`. Conséquence concrète : une affaire ouverte, partagée, acceptée
et silencieuse depuis six jours apparaîtrait dans la pile 2 de `/suivi`,
comme tâche automatique dans `/taches` et sur le tableau de bord, comme carte
de la File, dans le bandeau et le badge de la File — et, si une règle
`no_interaction` existe, comme tâche de règle. **Deux endroits pour le même
problème, c'est de la complexité ; il y en aurait quatre.** Le constat de
cet audit est que la File ne peut pas s'ajouter sans qu'on décide ce qu'elle
remplace : c'est une question de phase 3.

### 3.6 Le PRM imposé à tout le monde

Le partage d'affaires à des confrères est le premier module du produit et
le premier « atout » de l'audit précédent. Il s'impose pourtant à un
conseiller qui n'a aucun apporteur :
- trois tuiles sur quatre du tableau de bord (À relancer, Sans suite, À
  encaisser) et la liste « À traiter en priorité » ne comptent que des
  partages ; `/suivi` entier ne montre que des partages, avec son badge et
  sa place dans « Aujourd'hui » ;
- sur **chaque fiche d'affaire ouverte non partagée**, le composeur de
  partage est **déplié** (`affaires/[id]/page.tsx:412`) : cartes « Partager
  cette affaire », « Commission » (cochée), « Aperçu — ce que le partenaire
  verra » (page partenaire entière), avec « Aucun partenaire actif — ajoute-en
  un depuis Partenaires » (`share-composer.tsx:269-279`) ;
- l'en-tête dit « Statut de l'affaire » pour se distinguer des statuts de
  partage ; la description de `/affaires` dit « Chaque affaire se partage à
  un confrère sans ressaisie » (`deals.json:98`) ;
- l'étape par défaut « Partagée » est semée dans tout nouvel espace
  (`deal-statuses.ts:29`) ;
- l'étape 3 des premiers pas est « Enregistrer un apporteur d'affaires »,
  la 2e étape de la visite guidée est `/partenaires` ;
- l'analytique « Partenariats » (11 colonnes) reste vide.

### 3.7 Le CRM et la chaîne marketing

Sur les neuf écrans « Analytique » et « Outils » (hors emails reçus, cibles
et règles), **aucun n'est un écran du matin** : quatre lectures mensuelles
dont deux (délais, partenariats) resteront « Pas encore assez de données »
ou vides pendant des mois pour un indépendant (seuil de 5 observations,
`definitions.ts:15`) ; un réglage (origines) ; quatre écrans qui forment une
chaîne de production éditoriale (veille → concurrents → chiffres →
newsletter). Cette chaîne est facultative techniquement (une newsletter se
rédige avec une cible et un brief), mais le produit pousse à la remplir :
sans chiffres vérifiés, la revue signale **chaque nombre** tapé
(`review.ts:160, 209-214` — « 3 conseils », « sur 20 ans » deviennent des
avertissements) ; sans matière, le bloc Sources n'a rien à citer.

Les taux du marché (usure, OAT, BCE, inflation, IRL) sont **la seule chose
de ces neuf écrans qu'un courtier voudrait lire en dix secondes le matin** —
mais l'écran s'appelle « Chiffres vérifiés », se présente comme « la source
unique des chiffres que le composer a le droit de citer », et parle du
« composer » quatre fois.

La veille et les concurrents lancent une **collecte IA à la première visite
de la journée** (flux, trois recherches web, classification, douze résumés ;
`refresh.ts:65-77`), sans geste de l'utilisateur — documenté comme
préchauffage, à connaître pour le coût.

Les cinq appels IA du produit (génération de newsletter, recherche
d'articles, résumé, classification des titres concurrents, proposition de
signature d'un email reçu) respectent la doctrine : **aucune sortie IA
n'écrit dans `contacts`**, ni statut, ni score ; la signature n'est qu'une
proposition à confirmer.

---

## 4. La mesure d'usage

**Le produit ne sait pas quels écrans et quelles actions sont utilisés, par
organisation ni par personne.** Précisément :

- Aucune dépendance d'analytique produit (`package.json` : ni `@vercel/analytics`,
  ni PostHog, ni Plausible, ni Sentry) ; aucun appel `pageview`/`track` dans
  `src` ; le seul script de la racine est celui du thème
  (`src/app/layout.tsx:65`).
- `s.js` et `POST /api/events` (`src/app/s.js/route.ts`, `api/events/route.ts`)
  mesurent les **visiteurs des sites des clients** (funnel d'acquisition),
  pas l'usage du CRM.
- `users` n'a ni `last_login_at` ni `last_seen_at` (`schema/users.ts:20-33`) ;
  la stratégie de session est JWT, sans table de sessions.
- `src/lib/log.ts` écrit des lignes JSON sur la console Vercel ; `log.info`
  n'est appelé que trois fois dans tout le code (`email_domain_created`,
  `contacts_imported`, `magic_link_unknown_email`) ; `onRequestError` et
  `reportError` ne journalisent que des erreurs — et trois `error.tsx`
  (`dashboard`, `taches`, `suivi`) n'appellent pas `reportError`.
- Palette ⌘K : rien d'enregistré. Premiers pas : un cookie `masque`, la
  progression est dérivée des données. Visite guidée : un cookie par
  navigateur ; personne ne sait qui l'a terminée, fermée ou jamais vue.
  Thème : cookie. Langue : colonne de préférence.
- Traces indirectes exploitables a posteriori, **gestes métier seulement,
  jamais écrans ouverts** : `contact_access_log` (vue de fiche dédupliquée à
  l'heure, `contacts.ts:321-348`, export, suppression, fusion),
  `tasks.created_by` / `completed_at`, `activities.created_by`,
  `deal_events.actor_user_id`, `deal_stage_changes`, `rule_actions`,
  `email_messages`.

Ce qu'on peut donc mesurer aujourd'hui, par organisation : le nombre de
fiches ouvertes (approximatif), les créations et gestes métier datés. Ce
qu'on **ne peut pas** mesurer : les personnes actives par jour ou par
semaine, les écrans jamais ouverts (`/suivi`, `/analytique/*`, `/veille`…),
la rétention hebdomadaire, l'usage de la palette, des filtres, de la visite,
le taux d'abandon d'un formulaire, le délai entre inscription et première
fiche. **Sans cette mesure, l'objectif « rétention à 3 mois > 85 % » ne se
constate qu'à la facturation, et l'adoption d'un pilote ne se prouve qu'en le
lui demandant.** C'est aussi ce qui empêche de trancher « trop compliqué »
autrement qu'à l'intuition.

---

## 5. Qualité

### 5.1 Les trois états

Toute route a un état de chargement et d'erreur, par héritage du groupe
`(app)` (`loading.tsx` : une carte + cinq lignes ; `error.tsx` : « Cet écran
n'a pas pu être chargé »). Ce qui manque, c'est la **fidélité** :

| Route | Squelette propre | `error.tsx` propre | `not-found` propre | Remarque |
|---|---|---|---|---|
| `/regles`, `/regles/new`, `/regles/[id]`, `/regles/journal` | non | non | non | une règle introuvable rend « Cette page n'existe pas dans ton espace » |
| `/emails-recus` | non | non | — | |
| `/profil` | non | non | — | |
| `/invitations` | oui | non | — | |
| `/newsletters`, `/newsletters/new`, `/newsletters/[id]` | oui | **non** | `[id]` oui | seul module de « Outils » sans `error.tsx` |
| `/contacts/[id]` | oui (mais une carte h-72 + un titre, sans rapport avec les deux colonnes réelles) | hérité (« Les contacts n'ont pas pu être chargés » — message de liste) | oui | |
| `/affaires/[id]`, `/partenaires/[id]`, `/cibles/[id]` | oui | hérité du dossier | oui | un échec d'enregistrement affiche « Les affaires n'ont pas pu être chargées » |
| `/affaires` | squelette **kanban** même sur `?vue=liste` | oui | — | |
| `/contacts/import` | oui | hérité | — | |

**Toute panne devient « n'existe pas »** sur trois fiches : `getContactPageData(...).catch(() => null)` →
`notFound()` (`contacts/[id]/page.tsx:83-84`), `loadNewsletter(id).catch(() => null)`
(`newsletters/[id]/page.tsx:33`), `getDeal(...).catch(() => null)` (`affaires/[id]/page.tsx:68`) :
une base indisponible s'affiche « Cette fiche n'existe pas ».

**Trois erreurs de saisie courantes produisent l'écran d'erreur** au lieu
d'un message sous le champ, parce que les actions internes de
`settings/page.tsx:220-262` ne rattrapent aucune `AppError` : pack non choisi
+ « Enregistrer le pack » (`organizations.ts:110-111`), couleur d'étape en
mots (« bleu ») (`pipelines.ts:80-85`), suppression d'un motif utilisé
(`loss-reasons.ts:39-43`, alors que le dialogue promet un refus propre).
Même mécanique pour la suppression d'un brouillon de newsletter créé par un
collègue (`lib/newsletter/actions.ts:184-186`, action inline sans
`try/catch`) et pour `updateContactAction` (`lib/contacts/actions.ts:113-118`,
ni validation ni `try/catch`).

**États vides** : présents partout et bien écrits, avec une réserve : ils
sont nombreux et durables — pour un conseiller sans partenaire, trois tuiles,
deux listes, `/suivi`, `/analytique/partenaires` et la section partages sont
vides à jamais ; pour un espace neuf, une fiche contact montre six sections
vides (§3.1).

### 5.2 Textes en dur passés entre les mailles

ESLint (`local/no-visible-text`) : **0 message sur 457 fichiers**, 27
exceptions déclarées (`eslint-disable`), toutes hors interface (JavaScript
servi aux sites clients, codes Auth.js, réponses machine des crons, le filet
`global-error.tsx`). La règle ne voit pas une chaîne **assignée à une
variable** ni **concaténée dans un gabarit**, ni les valeurs par défaut de
paramètres. Ce qui passe :

| Fichier:ligne | Texte | Visible où |
|---|---|---|
| `src/db/queries/acquisition.ts:598` | `` `Origine rattachée : ${…}` `` | écrit en français dans `deal_events.message`, journal de la fiche affaire, quelle que soit la langue |
| `src/db/queries/contacts.ts:848, 856` | `` `chez ${…}` ``, `` `« ${d.title} » (étape ${…})` `` | brief de la newsletter « pour ce contact », dans l'éditeur |
| `src/db/queries/activities.ts:133, 443` | `"Partenaire"`, `"(partenaire)"`, `"site"` | acteurs du journal unifié |
| `src/components/activities/journal.tsx:59` | `title = "Activité"` (valeur par défaut) | titre de section sur la fiche contact, en anglais aussi |
| `src/components/newsletter/newsletter-editor.tsx:648` | `` contact${t.count > 1 ? "s" : ""} `` | pluriel français dans le sélecteur de cible |
| `src/lib/ai/types.ts:258` | message d'`AITruncatedError` en français | renvoyé au navigateur et affiché dans l'éditeur |
| `src/app/api/analytique/export/route.ts:36, 39` | deux phrases françaises | corps des réponses 400 |
| `src/app/(app)/regles/page.tsx:220` | `latestRun.error` | message d'exception (souvent anglais) du dernier passage, affiché tel quel |
| `src/app/(app)/veille/page.tsx:277, 305` ; `concurrents`, `chiffres/page.tsx:146, 154` ; `newsletters/[id]/page.tsx:81, 112` | `run.error`, `source.lastError`, `m.failureReason`, `send.error` | chaînes brutes du collecteur ou du fournisseur |
| `src/app/(app)/settings/page.tsx:494, 521` ; `chiffres/page.tsx:303, 312` | `placeholder="%"`, `"910"`, `"2025"` | |
| `src/components/settings/legal-footprint-card.tsx:23` | `Intl.DisplayNames(["fr","en"])` | noms de pays toujours en français en interface anglaise |
| `src/components/rules/rule-form.tsx:68, 211` | `https://calendly.com/exemple`, liste `{prenom} · {nom} · …` | |
| `src/db/queries/mail-targets.ts:570` ; `schema/site-keys.ts:24` | `"(copie)"`, `"Site principal"` | suffixe de duplication, libellé de clé |
| `src/components/inbound/auth-badge.tsx:39-46` | `d=`, `s=`, `"?"` | preuves DKIM/SPF |
| `src/components/app-shell/*`, pages | `" · "`, `"—"`, `"…"`, `→` | séparateurs et attentes de bouton (`"…"` comme libellé pendant l'action, `reissue-share-button.tsx:79`) |

Deux autres fuites de registre : la vitrine partenaire vouvoie, sauf son
écran d'erreur qui tutoie (`shares.json:60`) ; les erreurs métier des actions
du kanban et du composeur sont affichées par `e.message`, or `AppError` met
**la clé** dans `message` (`lib/errors.ts:18`) : l'utilisateur lit
`cette_etape_appartient_a_un_autre_pipeline_9d7d` ou « un partage est déjà en
attente » sous forme de clé (`kanban-board.tsx:89, 113` ; `share-composer.tsx:185`),
jamais la phrase d'`errors.json` ; et le code `deal_closed` de la vitrine
n'est pas dans `ACTION_ERROR_CODES` → le confrère lit « Une erreur est
survenue » (`partner-share-view.tsx:74`).

### 5.3 Isolation par organisation

**Verdict : solide.** 628 points d'accès à la base examinés (32 fichiers de
requêtes, 329 fonctions ; actions serveur ; 13 routes API ; actions inline
des pages) : **aucune requête sur une table à `organization_id` n'est
laissée sans garde** pour un admin ou un membre. Toute lecture est bornée
par `orgScope`, par `eq(organizationId, <id vérifié>)`, ou par un chargement
par id suivi d'`assertOrgAccess` ; tout chemin public dérive l'organisation
d'un jeton, d'une clé ou d'un secret (partage par `token_hash`,
désinscription par uuid de message, webhooks Resend par signature Svix +
jeton d'ingestion + membre expéditeur, Calendly par HMAC par connexion,
`/api/events` par clé de site + `Origin`, `/api/leads` par clé d'API, crons
par `CRON_SECRET` avec `organizationId` passé partout). 60 clés étrangères
composites doublent la garde en base.

Cinq presque-constats, sans donnée exposée :
1. `resumeSendAction` appelle `getLatestSend(id)` **avant** toute garde
   (`lib/newsletter/actions.ts:285-297` ; `email-sends.ts:102-105`) : un membre
   de A soumettant l'id d'une newsletter de B obtient une erreur différente
   selon que B a un envoi ouvert — un oracle d'existence, rien de plus.
2. `createTask` écrit `contactId`/`dealId` sans les vérifier
   (`tasks.ts:351-380`) : tenu par les seules FK composites (erreur 23503
   générique), contrairement à `createActivity` qui vérifie.
3. Super admin en vue globale : `saveNewsletter` peut poser le `target_id`
   d'une organisation B sur une newsletter de A (FK simple,
   `schema/newsletters.ts:7-9`) — l'envoi est refusé ensuite ; la fiche
   d'affaire remplit « Motif de perte » et « Responsable » avec les valeurs de
   **toutes** les organisations (`affaires/[id]/page.tsx:85, 87`) ; la liste
   des newsletters mélange toutes les organisations (`newsletters/page.tsx:26-30`,
   seul écran sans le test de vue globale).
4. `listCommissionsForDeal` charge puis vérifie ligne à ligne
   (`commissions.ts:10-14`).
5. `createRule`/`updateRule` acceptent des `targetIds`, `tagsAny`, `ownerIds`
   étrangers (sans effet à la lecture, `rules.ts:167-228`).

Deux **écarts de rôle** : `updateAutoSendSettings` n'a aucune porte admin
(`rules.ts:836-857`) — un `member` peut modifier l'interrupteur, le plafond et
les heures par soumission forgée alors que l'écran le grise ; et le rôle
`member` n'a **aucune règle métier** (« ne voit que ses affaires » n'existe
pas : `orgScope` traite admin et membre à l'identique ; un membre peut
déplacer, partager, révoquer, confirmer et régler une commission sur toute
affaire ; `createPartner` et `createDealType` sont ouverts à tous alors que
pipelines, étapes et motifs exigent l'admin).

**Douze orthographes pour trois questions** (« a-t-il une organisation ? »,
« est-il admin ? », « cette ligne est-elle à lui ? ») : `orgScope` ; `findFirst`
+ `assertOrgAccess` (~40 sites) ; `assertOrgAdmin` (pipelines, motifs,
domaine) ; le test manuel `user.role !== "admin" || !user.organizationId` (7
fois dans `organizations.ts`, 5 dans `acquisition.ts`, `requireAdmin` local
dans `organization-assets.ts`) ; `getOwnOrganizationOrThrow` défini dans
`queries/newsletters.ts:207-218` et non dans `scope.ts` ; trois
`requireOrganization` locaux à trois clés de message (`acquisition.ts:33`,
`watch.ts:51`, `market.ts:30`) ; `organizationOf` (`metrics/filters.ts:38-43`,
seul à refuser la vue globale) ; treize `if (!user.organizationId)` inline ;
`assertUserInOrg` vs relecture manuelle (`deals.ts:258-263`) vs
`assertSignatoryInOrg` ; trois `requireSuperAdmin` locaux. Un même geste n'a
pas le même comportement pour un super admin en vue globale selon la garde
rencontrée (tout voir, rien voir, ou erreur).

Non vérifié : exécution contre une base, migrations SQL (0018 n'est
appliquée qu'en local), JSX des pages au-delà des segments de chargement.

### 5.4 Rendu mobile

Le socle a été corrigé le 2026-09-14/15 (barre d'onglets, cibles tactiles,
select natif, tuiles deux par ligne, tableaux dans leur cadre). Ce qui
reste, lu dans le code :

- **Fiche contact** : le téléphone et l'email sont dans la colonne droite,
  rendue **après** onze sections sur téléphone (`contacts/[id]/page.tsx:229-230,
  363`), et ce sont des `Input`, pas des liens `tel:` / `mailto:` (`:405-408`) ;
  les quatre tuiles « Jamais » passent en colonne ; les badges de l'en-tête
  s'étirent en pleine largeur comme des boutons (`page-header.tsx:53`) ; saisie
  du journal et du rendez-vous en escalier (§2.3).
- **Kanban** : une colonne par écran, colonnes vides comprises avec « Dépose
  une affaire ici » ; poignée et menu masqués sous `md`. **Liste des
  affaires** : `min-w-[56rem]` (896 px) à faire défiler sur 390 px
  (`affaires/page.tsx:536-538`).
- **Fiche d'affaire** : composeur de partage et aperçu complet dépliés,
  défilement interne de l'aperçu désactivé sous `lg` (`share-composer.tsx:475-477`)
  → une page très longue sur toute affaire non partagée.
- **Tâches** : grille d'édition serrée (select de récurrence ~50 px,
  `taches/page.tsx:446-469`) ; onze pastilles pour dix personnes.
- **Suivi** : à deux touches, badge invisible sur la barre.
- **Réglages** : sommaire collant qui défile horizontalement sans barre
  visible (112 px figés), cinq étapes × quatre champs + trois boutons en
  `flex-wrap`, tableau DNS, select de fuseaux à plusieurs centaines d'options,
  paragraphe d'API à neuf `<code>`.
- **Éditeur de newsletter** : feuille d'email à largeur fixe dans un
  conteneur `overflow-hidden` (coupée sur 390 px, `newsletter-editor.tsx:501, 522`),
  glisser-déposer natif inopérant au toucher (`unit-frame.tsx:53`), barres
  d'action et « + » d'insertion en `opacity-0` sans survol (`:86`,
  `insertion-point.tsx:58`) : ni réordonner ni insérer entre deux blocs.
- **Veille** : jusqu'à 200 lignes à trois boutons ; réglages sous tout ça.
- **Vitrine partenaire** : select de statut `h-7` (28 px) sur une page
  tactile (`partner-share-view.tsx:322`).
- **Bandeau démo** collant sur plusieurs lignes (`demo-banner.tsx:22-43`).
- **Palette** : par la loupe seulement ; pas de saisie d'interaction.
- Le sommaire des réglages (`top-14 z-10`) passe sous le bandeau super admin
  (`md:top-14 z-30`) sur bureau (`settings-nav.tsx:31` ; `super-admin-bar.tsx:41`).

### 5.5 Bugs et incohérences repérés en lisant le code

Classés par ce qu'ils coûtent à l'utilisateur. Non exécutés : « plausible »
quand la lecture ne suffit pas à conclure.

**Perte de données ou geste irréversible sans garde**
1. Fusion de deux contacts par un simple `<form>` sans confirmation
   (`contacts/[id]/page.tsx:181`) ; l'absorbé devient une pierre tombale
   (`contacts.ts:500-595`). Contredit « confirmations sur tout geste
   destructif » (commit `c3d2282`).
2. Archiver une règle : sans confirmation (`regles/page.tsx:184-194`) et
   **sans retour** (aucun `restoreRule` ; `listRules` exclut les archivées ;
   `getRule` les refuse en 404).
3. Le formulaire de règle **perd toute la saisie** à la première erreur
   serveur (non contrôlé ; `lib/rules/actions.ts:66, 80` redirigent avec
   `?erreur=`) — dix lignes de gabarit avec `{age}` : tout est effacé. Le
   `TargetForm` est contrôlé précisément pour éviter cela.
4. Supprimer une interaction depuis le journal, supprimer une tâche,
   retirer un membre d'une cible : sans confirmation (`journal.tsx:217-232` ;
   `taches/page.tsx:376-383` ; `cibles/[id]`).
5. Édition d'un contact importé (`name` = « Jean Dupont », prénom/nom vides)
   : saisir seulement Prénom = « Jean » réduit `name` à « Jean »
   (`lib/contacts/actions.ts:49` ; `contacts.ts:249`).
6. « Écarter » un article de veille : irréversible à l'écran (§1.3).

**Écran d'erreur ou clic muet sur un geste ordinaire**
7. Pack non choisi, couleur d'étape en mots, motif de perte utilisé → écran
   « Les réglages n'ont pas pu être chargés » (§5.1).
8. Suppression d'un brouillon de newsletter d'un collègue → écran générique
   (§5.1).
9. Type d'affaire non choisi → « Créer l'affaire » ne fait rien
   (`affaires/page.tsx:153, 278`) ; renommer un pipeline ou une étape à vide →
   silence (`pipelines.ts:70, 134`).
10. Panne de base → « Cette fiche n'existe pas » sur trois fiches (§5.1).
11. `updateContactAction` sans validation ni `try/catch` : une valeur refusée
    par Postgres envoie sur l'écran d'erreur de la liste.
12. `/emails-recus?page=1.5` → `.offset(12.5)` → erreur SQL → écran d'erreur
    (`emails-recus/page.tsx:47` ; `inbound.ts:213`).
13. Boutons « Confirmer » / « Marquer réglée » d'une commission : `try/finally`
    sans `catch` — une erreur est un rejet non géré, le bouton se réactive sans
    message (`confirm-commission-button.tsx:15-23`).
14. Erreurs métier affichées en clé brute (kanban, composeur) ; `deal_closed`
    → « Une erreur est survenue » chez le partenaire (§5.2).

**Le produit dit faux ou se contredit**
15. « Rien à faire pour l’instant{value} » + « pour ce conseiller » rend
    « l’instantpour ce conseiller » (`tasks.json:32, 37` ; `taches/page.tsx:155`).
16. Tuile « À relancer » rouge dès 3 jours (`dashboard/page.tsx:336`) alors que
    `/suivi` ne rougit qu'à 7 (`deal-follow-up.ts:151-156`) ; tuile « À encaisser »
    verte à vide (`:349` ; `stat-tile.tsx:43-44`).
17. « Journal des accès (n) » avec n ≤ 15 (`contacts/[id]/page.tsx:504` ;
    `contacts.ts:351`) : pas le vrai total.
18. La vague annonce « Envoyer les N emails » jusqu'à 500, en envoie 200 par
    clic (`rules.ts:624, 734`), sans montrer le corps ; « avant 9h00 »
    (`rules.json:26`) alors que le cron tourne à 06:00 UTC après la reprise des
    newsletters (`vercel.json` ; `cron/envois/route.ts:29, 55-62`).
19. `EMAIL_SHARED_DOMAIN` absente → « Aujourd'hui, tes emails partent de :  »
    (vide) (`email-domain-card.tsx:60, 65`).
20. `deals.json:117` promet des types d'affaire « ensuite » (§1.3) ;
    `contacts.json:54` décrit un lien société qui ne se pose nulle part.
21. Le sommaire des réglages annonce 11 sections ; « Nouveau pipeline » et tout
    pipeline après le premier n'ont pas d'ancre.
22. Le dialogue de suppression d'un motif promet un refus propre ; le code lève
    (bug 7).
23. « Envoyés aujourd'hui » borné en UTC (`newsletters/[id]/page.tsx:63`) alors
    que la date d'envoi lit le fuseau de l'organisation ; `todayIso` UTC sur le
    kanban (`affaires/page.tsx:444`) : entre minuit et deux heures, la veille
    compte ou une clôture d'hier n'est pas signalée.
24. Deux périodes par défaut (§3.2) ; deux indicateurs pour une mesure (§3.2).
25. Colonnes « Sim. démarrées/terminées » du funnel introuvables entre 1024 et
    1279 px (`funnel/page.tsx:325-326, 348-349`).
26. Les messages `?erreurX=` / `?infoX=` de l'URL sont réfléchis tels quels
    dans un encadré (`lib/form-actions.ts:11-18` ; `contacts/[id]/page.tsx:317-320`)
    : sans XSS (React échappe), mais n'importe quel lien fait afficher
    n'importe quelle phrase dans une fiche.

**Comportements qui trompent le quotidien**
27. Tâches automatiques : « En retard » le lendemain, jamais closes par les
    gestes du suivi, insupprimables, une nouvelle tâche par nouveau partage
    (§2.1).
28. Un rendez-vous saisi n'apparaît pas dans « Activité » ; un appel consigné
    ne réveille pas un dossier « sans suite » ; un email consigné ne vaut pas
    « a répondu » (§2.3, §2.5).
29. Une affaire naît sans responsable → « — » en liste, « Personne » sur la
    fiche, exclue du filtre « conseiller » et des analyses « suivies par »
    (`deals.ts:130-144`).
30. « Perdue » depuis la fiche = deux enregistrements ; motif jamais journalisé
    (§2.4).
31. `reissueDealShare` n'exige pas une affaire ouverte (`deal-shares.ts:167-193`)
    : on peut renvoyer un lien sur une affaire close.
32. L'arrêt automatique « a répondu » ne se pose **qu'à la confirmation
    humaine** d'un email entrant (`inbound/confirm.ts:79`) : un contact qui
    répond mais dont l'email n'est jamais confirmé continue de recevoir la
    vague. Et une adresse d'ingestion en **Cc visible** n'est plus reconnue,
    sans trace ni compteur (`ingest.ts:84-86`).
33. À la confirmation d'un email reçu avec une fiche existante, les cinq
    champs restent modifiables mais sont ignorés (`confirm.ts:50-51`).
34. Un second « Évaluer maintenant » dans l'heure est refusé alors que le
    conseiller vient de corriger sa règle (`rules.ts:162-165`).
35. La revue de newsletter signale chaque nombre pour une organisation sans
    chiffres vérifiés (§3.7).
36. Une adresse déjà désinscrite revoit le bouton « Confirmer »
    (`unsubscribe.ts:21-29`, idempotent).
37. `/login` et `/inscription` ne renvoient pas une personne déjà connectée
    (`login/page.tsx:21-44` ; `inscription/page.tsx:24-56`) ; un email déjà
    inscrit qui « crée un espace » arrive dans son ancien espace sans
    explication (`auth/actions.ts:132-137`, anti-énumération).
38. `/profil` : un super admin en vue globale voit la carte Calendly, dont
    « Connecter » échoue toujours ; en substitution, l'aide montre l'adresse de
    l'organisation choisie mais l'enregistrement modifie son propre profil.
39. Éditeur de newsletter : `history.replaceState` vers `/newsletters/:id`
    après le premier enregistrement (`newsletter-editor.tsx:364`) — un retour
    navigateur revient sur `/newsletters/new` vide dont la première frappe crée
    un second brouillon (plausible, non prouvé).
40. Badge « Tâches » de la barre latérale possiblement en retard d'un
    chargement le jour où des tâches automatiques naissent (le layout compte
    pendant que la page crée) — plausible.
41. Journal des règles : pas de pagination (200 lignes), pas de lien vers la
    tâche ou l'email créés, règles archivées non filtrables (§1.3).
42. Pagination d'une sélection manuelle de cible : `pageHref` ignore `q`
    (`cibles/[id]/page.tsx:71-76`).

**Coût et charge à chaque requête (constat D4 de l'audit précédent, toujours
vrai)**
43. `generateAutoTasks` **écrit** à chaque ouverture de `/dashboard` et
    `/taches` (`dashboard/page.tsx:213` ; `taches/page.tsx:71`) ;
    `getFollowUpBoard` tourne deux fois par requête (coquille + page) ;
    `getVisibleOrganizations` sans limite à chaque page d'un super admin
    (`layout.tsx:64`) ; `recentActivities` chargées jamais lues ; jusqu'à 25
    requêtes en série sur `/emails-recus` (`findContactCandidates` par ligne) ;
    collecte IA lancée par la visite de `/veille` et `/concurrents`.

### 5.6 Doctrine

- **Isolation** : respectée (§5.3), avec douze orthographes.
- **Valeurs spécifiques client en dur** : aucune couleur, aucun prix, aucun
  libellé client ; les seuils du suivi, les étapes par défaut, les défauts
  d'organisation vivent en base. Restent des **constantes de produit** qui
  mériteraient un réglage par organisation : le seuil par défaut d'une règle
  (15 j, `regles/new/page.tsx:23`), la taille d'une vague (200), les
  notifications par jour (500), la validité par défaut d'un partage (14 j,
  `expiry.ts:14-15`), les 180 jours des gabarits de cible, le seuil de 5
  observations, les deux périodes par défaut. Les couleurs hexadécimales des
  étapes semées (`deal-statuses.ts:27-33`) et la couleur `#2563eb` de repli
  (`lib/brand.ts:7`) sont des semis, acceptables.
- **Listes métier en lignes de table** : respectée (étapes, types, motifs,
  étiquettes, origines, cibles, règles). Les enums Postgres restants sont des
  protocoles techniques (`contact_source`, `activity_type`, `task_auto_rule`,
  `deal_event_type`, `stage_outcome`), documentés comme tels.
- **Aucun texte en dur** : ESLint passe ; une quinzaine de textes passent
  par des chemins que la règle ne voit pas (§5.2).
- **Qualification et scoring déterministes** : aucun scoring n'existe ;
  l'IA n'écrit jamais dans `contacts` (§3.7).
- **Aucun envoi automatique sans validation humaine** : respectée pour les
  contacts — `prepare_draft` et `send_email` créent un brouillon, seul un clic
  (« Envoyer les N emails », « Envoyer » sur la fiche) appelle le fournisseur
  (`wave.ts:36-99`). Deux réserves : `notify_owner` envoie un email **au
  conseiller** sans clic (`evaluate.ts:215-225`, 500/jour) ; et la vague envoie
  jusqu'à 200 emails dont l'utilisateur n'a vu que 20 sujets et aucun corps —
  un gabarit modifié après la préparation n'est pas re-rendu.
- **Trois états** : présents partout par héritage, propres sur les deux tiers
  des routes (§5.1).
- **Aucun chiffre inventé** : aucun « +30 % » dans l'interface ; chaque
  nombre sort d'une requête ; « Ouverts (approx.) » est étiqueté comme tel.

---

## 6. Ce que cet audit ne prouve pas

- Rien n'a été exécuté : pas de passage navigateur, pas de mesure de temps
  de réponse, pas d'accès à la base de production. Les comptes de clics sont
  lus dans le code.
- Les migrations SQL n'ont pas été relues ; 0018 n'est appliquée qu'en local.
- Le rendu réel sur 390 px est déduit des classes, pas capturé.
- Aucun utilisateur n'a été observé : ce document dit ce que le code impose,
  pas ce que les pilotes font — précisément parce que rien ne le mesure (§4).

Phase suivante : le benchmark (`docs/benchmark-v2.md`).
