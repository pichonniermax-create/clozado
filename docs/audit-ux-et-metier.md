# Audit UX et pains métier — chantier C, partie 2

Document seul (aucun code modifié), écrit le 2026-09-17 sur `main` =
`3ba6927`. Il répond au brief du 2026-09-16, chantier C partie 2 : **A.** l'UX
(recherche ⌘K, menu de gauche, formulaires de création, champs libres),
**A bis** la personnalisation, **A ter** la rapidité mesurée contre le site
en ligne, **A quater** le temps de création mesuré par navigateur
automatisé, **B.** les pains métier sourcés, **C.** le plan noté à la grille.
Les parties 3 (construction) attendent la validation de ce document et
l'ordre global B, C, D, E, F.

Tout ce qui est chiffré ici a été **mesuré** (site en ligne, session
d'admin par substitution dans l'espace de démo « Vasseur Courtage », et
session de Thomas, member) ou **lu dans une source citée** ; ce qui ne l'a
pas été est écrit « non mesuré » ou « non chiffré dans les sources ». Les
objectifs de la partie A ter sont des cibles, pas des mesures.

## 0. Ce qui compte

| # | Constat | Où |
|---|---|---|
| 1 | **Le champ de la recherche ⌘K est hors écran dès que la liste est pleine.** La palette pose `top-[12vh]` sur une boîte de dialogue qui garde son `-translate-y-1/2` : à 1366 × 768 comme à 390 px, la liste dépasse par le haut et l'on tape sans voir ce que l'on tape. C'est le « peu pratique » et le « laid » de l'audit précédent, avec sa cause. | §A.1 |
| 2 | **Toutes les pages authentifiées mettent 0,8 s avant le premier octet, même les plus simples**, parce que la fonction Vercel tourne à Washington (`iad1`) et la base à Francfort (`eu-central-1`) : chaque requête SQL traverse l'Atlantique, et le tableau de bord en enchaîne une vingtaine, dont une écriture. Une page « connecté » sans aucune donnée (la redirection de `/login`) coûte déjà 0,47 s. | §A ter |
| 3 | **Le tableau de bord est la page la plus lente du produit** (contenu visible à 2,1 s, réseau calme à 5,0 s, 69 requêtes) alors que c'est la première page de chaque session ; l'écran des tâches pèse 1,29 Mo de HTML parce qu'il rend un formulaire d'édition complet par ligne. | §A ter |
| 4 | **Créer un contact prend 7 clics et 7,8 s ; une affaire, 9 clics et 6,6 s** (saisie simulée comprise) : 0,8 s pour ouvrir le formulaire, 2,3 à 2,8 s d'attente après « Créer ». Le chemin minimal est bon (3 clics + 1 champ) ; ce qui coûte, c'est le formulaire de 12 champs et l'attente. | §A quater |
| 5 | **Le menu de gauche a 19 entrées sur 5 sections, plus Réglages** : à 1366 × 768 il faut défiler pour voir Règles, Veille, Concurrents, Chiffres, Newsletters ; sur téléphone, tout ce qui suit Veille. Cinq entrées « Analytique » et sept « Outils » pour aucune lecture du matin. | §A.2 |
| 6 | **Neuf champs libres devraient être une liste, une suggestion ou un format** : société (le lien `company_id` existe et n'est jamais posé), fonction, ville, code postal, pays, téléphone (texte, pas `tel`), métier du partenaire, montant (nombre sans décimales), et il n'existe **aucun champ d'origine** (recommandation, salon, site) sur un contact ni à la création d'une affaire. | §A.3, §A.4 |
| 7 | **En substitution super admin, tout contact et toute affaire créés naissent sans responsable** (« Personne ») : le formulaire propose l'utilisateur courant, qui n'est pas membre de l'organisation. C'est le cas de chaque démo faite depuis ce compte. | §A.3 |
| 8 | **Le thème clair / sombre existe déjà** (menu de compte, vérifié en production) ; il n'y a ni densité ni préférences en base : le choix des colonnes vit dans le navigateur, le thème et la visite dans des cookies. Un tableau de bord par utilisateur n'est pas retenu ; le filtre « moi » et les vues enregistrées le remplacent. | §A bis |
| 9 | **Aucun chiffre français sur le temps administratif des trois métiers n'existe en source ouverte** ; les avis publics sur les logiciels métier français sont quasi inexistants (Hektor : 0 avis sur Appvizer et Capterra). Ce qui fait crier dans les avis lus, ce n'est pas le périmètre fonctionnel : c'est la **panne d'email, le support injoignable, l'opacité tarifaire, le mobile**. | §B |
| 10 | **Le terrain le plus sûr pour des fonctionnalités métier, ce sont les obligations datées** : DER avant lettre de mission, KYC « actualisé », registre des mandats sans trou, pièces qui périment à trois mois, 10 jours de rétractation, renouvellement ORIAS au 31 janvier. Cinq fonctionnalités simples en découlent (§C). | §B, §C |

---

## A. UX

### A.1 La recherche ⌘K

**Ce qu'elle fait** (`src/components/app-shell/command-palette.tsx`,
`src/db/queries/search.ts`) : ⌘K ou Ctrl+K partout, ou le bouton
« Rechercher… » de l'en-tête. Sans saisie, la liste montre les 18 écrans du
menu (19 pour le super admin), les 4 créations (contact, affaire, tâche,
partenaire), « Marque & réglages » et « Visite guidée ». Dès deux lettres,
180 ms après la dernière frappe, une action serveur cherche dans
l'organisation : contacts (nom, email, société), affaires (libellé, nom du
client), partenaires (nom, société) — `ilike` sous-chaîne, **5 résultats
par type, triés par date de modification** (pas par pertinence). Les groupes
s'affichent dans l'ordre contacts, affaires, partenaires, navigation, créer,
plus, et une ligne « Voir tous les contacts pour « … » » ferme la liste.
Flèches, Entrée, Échap ; le focus revient au champ à chaque ouverture ; une
erreur serveur rend une liste vide sans le dire (`.catch(() => [])`).

**Mesuré en production** : 0,82 à 0,90 s entre la troisième lettre et le
premier résultat (admin et Thomas, trois passes chacun), délai de 180 ms
compris.

**Ce qui ne va pas, prouvé sur captures (1366 × 768 et 390 × 844).**

1. **Le champ de saisie est hors écran.** `DialogContent`
   (`src/components/ui/dialog.tsx:58`) centre la boîte par
   `top-1/2 -translate-y-1/2` ; la palette remplace `top` par `top-[12vh]`
   mais garde la translation de moitié. La liste ayant jusqu'à
   `min(60vh, 24rem)` de haut, la boîte remonte au-dessus de la fenêtre
   dès qu'elle contient une dizaine de lignes : à l'ouverture (24 lignes
   statiques) et sur toute recherche qui rend des fiches, on ne voit ni
   l'entrée ni les premiers résultats, seulement la fin de la liste
   (captures `palette-vide-1366.png`, `palette-ma-1366.png`). Sur
   téléphone, même boîte, même défaut. Correction : retirer la translation
   verticale quand `top` est posé (une ligne), ou ancrer la palette en haut
   avec une hauteur maximale de liste calculée sur la fenêtre. **Effort S,
   à faire avant tout le reste.**
2. **Le téléphone ne se cherche pas** (`search.ts:31-35`), alors que la
   liste des contacts le fait, espaces retirés (`contacts.ts:52-58`). Un
   conseiller qui reçoit un appel cherche par numéro.
3. **Rien d'autre que les trois dossiers** : tâches, règles, cibles,
   newsletters, emails reçus, rendez-vous ne se trouvent pas. Le brief
   demande nom, email, téléphone, ville : la ville n'est cherchée nulle
   part.
4. **Pas de récents, pas d'actions rapides.** Rien ne mémorise les fiches
   ouvertes ; un résultat ne propose qu'« ouvrir ». Aucune ligne
   « Créer le contact « … » » quand la recherche ne rend rien : la palette
   dit « Aucun résultat » et s'arrête.
5. **Le rendu.** Une seule colonne de texte, l'indice à droite tronqué
   (« emma.david@messagerie.examp… »), les groupes séparés par une
   étiquette en capitales grises sans compteur ; aucun état « recherche en
   cours » entre la frappe et la réponse (0,8 s de silence) ; les lignes de
   navigation (« Tâches — Aujourd'hui ») se mêlent aux fiches sans
   hiérarchie visuelle.
6. **Cinq par type, tri par date** : deux « Julie Michel » de la démo
   sortent dans un ordre qui ne dit pas laquelle est laquelle (même nom,
   emails différents) ; une organisation à 5 000 contacts n'a aucun moyen
   de voir la sixième.

**Ce qui est bien et à garder** : une seule source pour les écrans
(`navigation.ts`), le pliage des accents et de la casse, l'anti-réponse
périmée (`requestId`), le clavier complet, le repli sur `/contacts?q=`.

**Proposition pour la partie 3, étape 1** (grille en §C) : corriger la
position (S) ; chercher aussi téléphone normalisé et ville ; ajouter
tâches ouvertes et newsletters ; grouper par type avec compteur, état
« Recherche… », **récents** (dix dernières fiches ouvertes, par
utilisateur, en base) ; **actions rapides** sur un résultat (ouvrir ·
appeler `tel:` · écrire `mailto:` · nouvelle affaire · nouvelle tâche) ; une
ligne « Créer le contact « … » » quand rien ne sort ; tri par pertinence
(préfixe avant sous-chaîne, puis date) ; index `pg_trgm` sur nom, email,
téléphone normalisé quand le volume l'exige (migration → STOP).

### A.2 Le menu de gauche

**Ce qu'il est** (`navigation.ts:53-96`, captures `dashboard-1366.png`,
`menu-390.png`) : 5 sections, 19 entrées, dont 18 pour un utilisateur
d'organisation, plus « Réglages » en pied, offert aussi à Thomas (member)
— tout gris une fois ouvert. À 1366 × 768, la barre montre Aujourd'hui (3),
Dossiers (3), Analytique (5) et les deux premières entrées d'Outils ; il
faut défiler la barre pour atteindre Règles de relance, Veille,
Concurrents, Chiffres, Newsletters, Invitations. Sur téléphone (390 × 844),
le panneau « Menu » montre jusqu'à Veille ; Concurrents, Chiffres,
Newsletters sont sous le pli. La barre d'onglets mobile (Accueil ·
Contacts · Affaires · Tâches · Menu) est saine.

**Lisibilité.** Les libellés d'Analytique et d'Outils sont du jargon pour
un conseiller (Funnel, Délais, Pertes, Partenariats, Origines, Cibles,
Veille, Concurrents, Chiffres) — constat 9 de `docs/audit-crm.md` §3.3.
Aucune de ces douze entrées n'est un écran du matin (constat 6). Les deux
badges (Tâches, Suivi) comptent deux fois la même situation (constat 2,
décisions V1 et V4 en attente).

**Nombre et ordre : la proposition.** Une barre à **trois blocs et neuf
entrées visibles au plus**, le reste replié :

| Bloc | Entrées visibles par défaut | Remarque |
|---|---|---|
| (sans titre) | Aujourd'hui (badge unique) · Contacts · Affaires · Tâches | Aujourd'hui = tableau de bord recadré par le chantier B (V1, V2, V4) |
| Relations | Partenaires · Newsletters · Emails reçus | Partenaires seulement si le PRM est activé (V9) ; Emails reçus seulement si une adresse d'ingestion est posée |
| Analyser (replié) | Funnel, Délais, Pertes, Partenariats, Origines → **un écran « Analyse » à onglets** | cinq entrées de menu deviennent une ; « Origines » retourne dans les réglages |
| Outils (replié) | Cibles · Règles de relance · Veille · Concurrents · Chiffres | activables par l'admin (module par module) ; jamais un module désactivé |

Puis, par utilisateur (partie 3, étape 2) : barre **repliable** mémorisée,
**favoris épinglés** en tête, **masquer / réordonner** parmi les modules
activés, « Réinitialiser l'affichage ». Ces préférences vivent en base par
utilisateur et par organisation (table `user_preferences`, migration →
STOP), pas dans un cookie : elles doivent suivre la personne d'un
navigateur à l'autre et ne jamais fuir entre organisations.

Ordre à respecter avec le chantier B : B·3 « Aujourd'hui » touche le menu
et les badges ; C partie 3 étape 2 touche la même barre. **Une seule
passe** sur `navigation.ts`, `navigation-list.tsx`, `bottom-nav.tsx` : B
d'abord (ce que la barre contient), C ensuite (comment chacun la range).

### A.3 Les formulaires de création

Inventaire complet (chaque champ, son contrôle, son obligation, sa valeur
par défaut, sa liste, son format, ce qui pourrait le remplir) dans le
scratchpad de la session ; ce qui décide est ici. Les chemins sont comptés
depuis `/dashboard`, d'après le code, puis **mesurés** en §A quater.

| Formulaire | Champs visibles d'un coup | Obligatoires | Chemin minimal (code) | Doublon | Validation serveur |
|---|---|---|---|---|---|
| Contact, personne (`contact-create-form.tsx`) | **12** (radio, prénom, nom, email, téléphone, société, fonction, date de naissance, ville, code postal, pays, notes) + conseiller à plusieurs | 1 (nom) | Nouveau → Contact → nom → Créer : **3 clics + 1 champ** | nom exact ou email exact (pas le téléphone) → « Créer quand même » | zod (`contacts/input.ts`) |
| Contact, société (même formulaire, radio) | **8** | 1 (raison sociale) | 4 clics + 1 champ | idem | zod |
| Affaire (`affaires/page.tsx:274-342`) | **5** (libellé, client, type, montant, description) + responsable | 3 (libellé, client, **type — obligatoire côté serveur sans `required`**) | Nouvelle affaire → libellé → client → type (2 clics) → Créer : **4 clics + 2 champs** ; depuis une fiche contact, client pré-rempli : 3 clics + 1 champ | **aucune** | zod (`deals.ts:69-78`) — montant = texte de 40 caractères, la base refuse le reste |
| Tâche (`taches/page.tsx:120-152`) | 6 contrôles | 1 (titre) | Nouveau → Tâche → titre → Créer : 3 clics + 1 champ | aucune | manuelle, pas de zod ; échéance illisible → vide en silence |
| Partenaire (`partenaires/page.tsx:62-89`) | 6 | 1 (nom) | 3 clics + 1 champ, puis **la liste**, pas la fiche | aucune | zod |
| Interaction (journal d'une fiche) | 3 (4 pour un email) | 0 | 3 clics + 0 champ | — | manuelle |

**Il n'existe pas d'entité « entreprise ».** Une société est un contact de
type `company` (`src/db/schema/contacts.ts:29-30`) ; la société d'une
personne est le texte libre `company_name`, et le lien structuré
`company_id` (colonne, FK composite, priorité à l'affichage) **n'est écrit
par aucun formulaire** — seule la fusion et la suppression y touchent. Le
champ « Société » d'une personne ne propose donc jamais les fiches société
existantes, et « Personnes rattachées » sur une fiche société reste vide
par construction.

**Champ par champ — déductible, pré-rempli, auto-complété, liste ?**

| Champ | Aujourd'hui | Possible | Source |
|---|---|---|---|
| Conseiller / responsable | pré-rempli avec la personne connectée (P1, P3) ; **sauf en substitution super admin : « Personne »** (`contact-create-form.tsx:108`, `affaires/page.tsx:323`, l'identifiant du super admin n'est pas dans la liste) | replier sur le premier admin de l'organisation, ou stocker vide et le dire | `users` |
| Pipeline, étape d'une affaire | déduits (onglet affiché, première étape) | — | déjà fait |
| Type d'affaire | jamais pré-choisi, même s'il n'y en a qu'un | choisi seul s'il n'y en a qu'un ; sinon le dernier utilisé | `deal_types` |
| Libellé d'affaire | libre, obligatoire, **jamais modifiable ensuite** | proposé « {type} — {client} », modifiable | type + fiche |
| Origine d'une affaire | aucun champ ; posée seule depuis le dernier lead du contact | une liste « Origine » à la création (recommandation, salon, site, partenaire, newsletter) | table `origins` |
| Origine d'un contact | aucune (`source` est technique : manual/import/external/lead) | même liste | `origins` |
| Société d'une personne | texte libre | recherche à suggestions parmi les fiches société, écriture de `company_id` | `contacts` kind company |
| Fonction | texte libre | suggestions parmi les fonctions déjà saisies dans l'organisation | valeurs distinctes de `job_title` |
| Ville, code postal | deux textes libres, sans masque | code postal numérique + ville proposée depuis le code postal | **externe** : API Adresse (STOP, dépendance) — sinon suggestions des villes déjà saisies |
| Pays | texte libre, jamais pré-rempli | liste ISO, pré-remplie avec le pays de l'organisation | `organizations.country` |
| Téléphone | `type="text"`, brut, doublon ignoré | `type="tel"`, normalisation à l'enregistrement, doublon par téléphone comme à l'import | `match-keys.ts:25-30` existe déjà |
| Email | `type="email"` + regex serveur | — | déjà fait |
| Date de naissance, notes, description | libres | rien à déduire | — |
| Montant estimé | `type="number"` sans `step` : **une décimale est refusée par le navigateur** ; texte côté serveur | `inputMode="decimal"`, `step`, nombre côté zod, format monétaire | `organizations.currency` |
| Échéance d'une tâche | date libre | raccourcis aujourd'hui / demain / dans une semaine | `todayAsStoredDate` |
| Métier d'un partenaire | texte libre (« CGP, courtier crédit… ») | liste éditable | valeurs distinctes de `partners.profession` |
| Civilité | n'existe pas en base | liste courte, si la liste fermée de données personnelles l'admet | en table |

**Autres constats de lecture, vérifiés au navigateur.**
- Aucune marque de champ obligatoire dans `Field` (`ui/field.tsx`) :
  l'obligation ne se découvre qu'au refus. Le type d'affaire est le seul
  obligatoire sans `required` : clic muet puis notification.
- Le formulaire de contact ouvert (`/contacts?nouveau=1`) montre 12 champs
  avant le bouton, et la **carte de la visite guidée le recouvre** sur un
  navigateur neuf (V13 : elle se lance seule).
- « 2 contactspour « jul » » : le compteur de la liste des contacts colle
  le complément (`contacts.json:209`, `{contacts}{n}` sans espace ;
  `contacts/page.tsx:98`). Une espace à ajouter au message, fr et en.
- Après création, un contact ouvre sa fiche ; un partenaire renvoie à la
  liste ; une tâche renvoie à la liste ; une affaire ouvre sa fiche. Deux
  conventions.
- Le libellé, la description, le type et le pipeline d'une affaire ne se
  modifient nulle part après création (`deals.ts:255-262`).
- Détection de doublon : contact à la création (nom exact ou email exact),
  import (email → téléphone → nom + ville) ; rien pour affaire, tâche,
  partenaire.

### A.4 Les champs libres à transformer

| Champ | Vers quoi | Source des valeurs | Effort | Migration |
|---|---|---|---|---|
| Contact · Société | suggestions parmi les fiches société + écriture de `company_id` | `contacts` (kind company) | S | non |
| Contact · Fonction | suggestions | `job_title` distincts par organisation | S | non |
| Contact · Pays | liste ISO pré-remplie | `organizations.country` | S | non (conversion des textes existants : à la lecture) |
| Contact · Téléphone | `tel` + normalisation + doublon | `match-keys.ts` | S | non |
| Contact · Code postal / Ville | masque + suggestions locales ; API Adresse À PROPOSER | villes déjà saisies ; externe | S / M | non / STOP |
| Contact, Affaire · Origine | liste | `origins` (existe) | S | **oui** (`contacts.origin_id`, `deals.origin_id`) |
| Contact · Civilité | liste | table | S | **oui** |
| Affaire · Type | `required` + défaut | `deal_types` | S | non |
| Affaire · Montant | décimal + zod nombre | — | S | non |
| Affaire · Libellé | proposé | type + client | S | non |
| Affaire · Libellé, description, type, pipeline | modifiables sur la fiche | — | S | non |
| Tâche · Échéance | raccourcis + refus d'une date illisible | — | S | non |
| Partenaire · Métier | liste éditable | `profession` distincts | S | non |
| Partenaire · Email | regex serveur | comme le contact | S | non |
| Tous · Champ obligatoire | marque visuelle dans `Field` | — | S | non |
| Interaction · Compte rendu | zone de texte au lieu d'une ligne | — | S | non |

### A bis. Personnalisation

| Sujet | État | Utile ? | Effort | Complexité pour l'utilisateur | Verdict |
|---|---|---|---|---|---|
| Tableau de bord par utilisateur (tuiles à choisir, sections à ranger) | Le tableau de bord est le même pour toute l'organisation ; ses tuiles et sa liste « À traiter en priorité » sont en cours de recadrage (V2, V8) | **Faible** pour 15 pilotes à 1-3 personnes : ce qui change d'une personne à l'autre, c'est **de qui** sont les fiches, pas la forme de l'écran | M | ajoute | **Non retenu.** Le filtre « moi » par défaut (V8, V14) et les vues enregistrées (partie 3, étape 3) couvrent le besoin sans nouvel écran de réglage |
| Densité (compact / confortable) | Aucune | Faible : les listes tiennent déjà sans défilement horizontal (chantier C partie 1) ; utile seulement pour les tableaux analytiques | S (une classe sur `<html>`, des jetons d'espacement) | ajoute un réglage | **Non retenu** pour l'instant ; à reconsidérer après les vues enregistrées (choix de colonnes = la vraie densité) |
| Thème clair / sombre / système | **Existe** : menu de compte → Thème (Comme le système, Clair, Sombre), cookie `clozado-theme` par navigateur, classe `dark` posée avant la première peinture, jetons sombres de marque dérivés (`BrandStyle`). Vérifié en production le 2026-09-17 (capture `menu-compte-sombre.png`). Le commentaire de `globals.css:142` (« aucun écran ne pose `.dark` ») est périmé | déjà là | — | — | **Rien à construire** ; retirer le commentaire périmé ; le thème pourrait suivre la personne (en base) plutôt que le navigateur quand `user_preferences` existera |
| Préférences en base | **Aucune table** : colonnes choisies (localStorage, par tableau), thème (cookie), visite (cookie), langue (cookie `localeChoice` ou `users.locale`), organisation active du super admin (cookie) | Nécessaire dès que le menu, les vues et les récents sont par utilisateur (partie 3, étapes 1-3 ; V14) | S (table `user_preferences(user_id, organization_id, key, value jsonb)`) | neutre | **Retenu**, migration → STOP avant application |

### A ter. Rapidité — mesurée contre le site en ligne

**Méthode.** Le 2026-09-17, contre `https://clozado.vercel.app`, depuis ce
Codespace (bord Vercel `lhr1`, fonction `iad1` — lu dans `x-vercel-id`),
Chromium headless 1366 × 768, session forgée (admin par substitution dans
« Vasseur Courtage », 45 contacts, 28 affaires ; puis Thomas, member).
Trois passes par page après une visite de chauffe ; les valeurs ci-dessous
sont des **médianes** (étendue entre parenthèses). « Premier octet » vient de
`curl` (trois requêtes par page, cookie de session) ; « contenu visible »
= délai entre la navigation et l'apparition du texte propre à la page
(le contenu est streamé derrière `loading.tsx`) ; « réseau calme » =
plus aucune requête pendant 500 ms ; « requêtes » = réponses reçues ;
« HTML » = octets du document.

| Page | Premier octet | DOM chargé | Contenu visible | Réseau calme | Requêtes | HTML |
|---|---|---|---|---|---|---|
| Tableau de bord | 0,76-0,79 s (1re visite 1,19 s) | 1,69 s | **2,11 s** (2,10-2,13) | **5,02 s** (4,70-5,35) | 69 | 363 Ko |
| Contacts (liste) | 0,77-0,82 s | 1,00 s | 1,59 s (0,90-1,64) | 3,11 s (3,06-3,46) | 46 | 346 Ko |
| Fiche contact | 0,79-0,87 s | 1,30 s | 1,63 s (1,60-2,17) | 3,07 s (3,04-3,57) | 46 | 381 Ko |
| Affaires, kanban | 0,79-0,87 s | 1,09 s | 1,71 s (1,66-1,75) | **4,98 s** (4,68-4,99) | 57 | 373 Ko |
| Affaires, liste | 0,78-0,86 s | 1,03 s | 1,61 s (0,90-1,64) | 3,57 s (3,26-3,60) | 47 | 368 Ko |
| Réglages | 0,79-0,84 s | 1,17 s | 1,73 s (1,59-1,77) | 2,40 s (2,23-2,51) | 31 | 604 Ko |
| Tâches | 0,77-0,83 s | non mesuré | non mesuré | non mesuré | — | **1 293 Ko** |
| `/login` avec session (redirection 307, aucune donnée) | **0,46-0,48 s** | — | — | — | — | — |

Thomas (member) obtient les mêmes ordres de grandeur : tableau de bord
2,11 s / 4,98 s, contacts 0,91 s / 3,47 s, fiche 2,11 s / 3,38 s, kanban
1,69 s / 4,77 s, liste 0,92 s / 3,41 s, réglages 1,59 s / 2,21 s.

**Navigation sans rechargement** (clic dans la barre ou sur une ligne,
jusqu'au contenu de la page d'arrivée ; admin, médiane de 3) : tableau de
bord → contacts **0,96 s** ; contacts → fiche **1,83 s** (1,50-2,49) ;
fiche → affaires **0,83 s** ; affaires → tableau de bord **1,86 s**.

**Recherche ⌘K** : 0,82-0,90 s entre la troisième lettre et le premier
résultat.

**Gestes — du clic au retour visible** (admin, médiane de 3, mesurés sur
des données remises en l'état) :

| Geste | Retour visible | Réponse du serveur | Note |
|---|---|---|---|
| Changer d'étape (kanban, menu « Déplacer vers ») | **0,20 s** (optimiste) | **0,74 s** (0,68-1,09) | l'écran bouge tout de suite ; l'action puis `router.refresh()` rechargent toute la page derrière |
| Créer une tâche (`/taches`, formulaire, jusqu'à la ligne dans la liste) | **2,99 s** (2,97-3,52) | idem | envoi du formulaire → redirection → re-rendu d'une page de 1,29 Mo |
| Enregistrer une fiche contact (notes, jusqu'à la fiche rechargée avec la valeur) | **2,01 s** (1,86-2,31) | idem | action → redirection vers la fiche → 13 requêtes + une écriture de journal |

**Pour comparaison** : un `select 1` depuis ce Codespace vers la base Neon
(Francfort) répond en 18-20 ms à chaud (121 ms au premier appel).

**Les causes, vérifiées dans le code et les en-têtes.**

1. **La fonction est à Washington, la base à Francfort.** `vercel.json` ne
   fixe aucune région (crons seulement) ; `x-vercel-id` = `lhr1::iad1::…`
   sur chaque réponse ; `DATABASE_URL` pointe `eu-central-1`. Chaque
   requête SQL traverse l'Atlantique aller-retour. Le plancher mesuré d'une
   réponse « connecté » sans donnée (0,47 s pour la redirection de
   `/login` : démarrage, lecture de la session en base, redirection) le
   montre ; chaque page y ajoute ses requêtes en série. Je n'ai pas pu
   mesurer l'aller-retour depuis Vercel lui-même : il se mesurera après le
   changement de région.
2. **Une requête HTTP par requête SQL, en série.** Le client est
   `neon-http` (`src/db/index.ts`) : pas de connexion tenue, pas de
   transaction, chaque `await db…` est un appel HTTPS. Le tableau de bord
   enchaîne : session (1) → coquille (`getWorkspace`, organisations,
   badges : `getFollowUpBoard` = 4 requêtes en série + `countTasksDueNow`)
   → page : `getFollowUpBoard` **une seconde fois** (`dashboard/page.tsx:208`,
   la coquille l'a déjà calculé pour le badge, `layout.tsx:84`) →
   `generateAutoTasks` (organisation, réglages, fuseau, affaires, **une
   écriture** `insert … on conflict do nothing` à chaque affichage,
   `tasks.ts:504-582`) → neuf lectures en parallèle. Soit une vingtaine
   d'allers-retours dont la moitié en série. Aucune de ces fonctions n'est
   mémoïsée par requête (`cache` de React ne couvre que `getSession`,
   `getWorkspace`, `readDemoVisitor`).
3. **La fiche contact** : une lecture, **une écriture** (journal des
   accès), puis treize lectures en parallèle (`contacts/[id]/page.tsx:96-123`)
   — c'est la parallélisation qui la sauve ; l'écriture, elle, est en
   série avant tout.
4. **Le poids des pages.** Le document HTML embarque le rendu ET sa
   copie RSC (68 % du tableau de bord, 255 Ko sur 363 ; 74 balises
   `<script>`). `/taches` pèse 1,29 Mo parce que chaque ligne rend son
   formulaire d'édition complet (titre, échéance, priorité, responsable,
   récurrence, notes, suppression) : « Supprimer cette tâche » y figure 64
   fois (32 lignes × HTML + RSC). `/settings` pèse 604 Ko (douze cartes,
   54 champs).
5. **Après chaque geste, toute la page se recalcule.** Le kanban appelle
   `router.refresh()` après l'action (0,74 s de serveur pour déplacer une
   carte) ; créer une tâche ou enregistrer une fiche passe par un envoi de
   formulaire, une redirection et un rendu complet — d'où 2 à 3 s là où
   l'écran optimiste du kanban répond en 0,2 s.
6. **Le réseau calme tardif** (5 s sur le tableau de bord et le kanban)
   suit le nombre de requêtes (69 et 57, contre 31 pour les réglages) :
   ce sont, après le rendu, les préchargements des liens (`<Link>`) vers
   les fiches et les écrans du menu et les scripts de route chargés à la
   demande — à confirmer à l'étape 4 par la liste des requêtes. Le contenu
   est là bien avant ; la barre de progression du navigateur, elle,
   tourne encore.

**Objectifs chiffrés** (cibles pour la partie 3, étape 4 ; à mesurer
avec les mêmes scripts, mêmes conditions, avant / après) :

| Écran ou geste | Aujourd'hui (médiane) | Objectif | Ce qui y mène |
|---|---|---|---|
| Premier octet, toute page connectée | 0,78 s | **≤ 0,30 s** | région de la fonction = région de la base (`vercel.json` `"regions": ["fra1"]`, un changement de configuration, à valider avant de pousser) ; mémoïser par requête organisation, réglages, fuseau, board |
| Tableau de bord, contenu visible | 2,11 s | **≤ 1,0 s** | ne calculer le board qu'une fois ; retirer l'écriture `generateAutoTasks` (V3) ; « Aujourd'hui » (chantier B) rend moins de blocs |
| Tableau de bord, réseau calme | 5,02 s | **≤ 2,5 s** | moins de préchargements (liens de la liste en `prefetch={false}` hors viewport), moins de scripts de route |
| Liste des contacts, fiche, affaires, contenu visible | 1,6-1,7 s | **≤ 1,0 s** | région ; requêtes en parallèle là où elles sont en série ; écriture du journal d'accès après la réponse (`after()`) |
| Tâches, HTML | 1 293 Ko | **≤ 300 Ko** | formulaire d'édition rendu à la demande (une ligne dépliée à la fois), 25 lignes par page |
| Navigation interne, liste → fiche | 1,83 s | **≤ 0,8 s** | idem fiche |
| Recherche ⌘K, premier résultat | 0,85 s | **≤ 0,40 s** | région ; une seule requête `union` au lieu de trois ; index `pg_trgm` quand le volume l'exige |
| Changer d'étape, réponse serveur | 0,74 s | **≤ 0,40 s** | région ; une écriture groupée (affaire + historique + événement en une requête) ; pas de `router.refresh()` complet : l'action rend la carte |
| Créer une tâche | 2,99 s | **≤ 1,0 s** | action qui rend la ligne (`useActionState`), pas de redirection ; page allégée |
| Enregistrer une fiche | 2,01 s | **≤ 1,0 s** | action qui rend la carte « Fiche », pas de redirection ; journal d'accès en `after()` |

Le changement de région est la correction au meilleur rapport : une
ligne, réversible, et il vaut pour toutes les pages, tous les gestes et
tous les crons. Il ne touche ni migration, ni dépendance, ni
authentification ; c'est un changement de production, je le proposerai
avant de le pousser.

### A quater. Temps de création — mesuré, à rejouer après construction

**Scénarios** (`scripts/_tmp-c2-create.ts`, non committé ; à rejouer à
l'identique après la partie 3) : Chromium 1366 × 768, session admin par
substitution dans la démo, visite guidée fermée, chaque touche frappée
avec 50 ms de délai (saisie simulée), chaque clic compté, le temps mesuré
du premier clic à l'affichage de la fiche créée. Les données créées ont
été supprimées après la mesure (0 contact, 0 affaire, 0 tâche « Mesure »
restants).

| Scénario | Étapes | Clics | Touches | Champs | Écrans | Total | dont saisie | dont attente |
|---|---|---|---|---|---|---|---|---|
| **Contact (personne)** : Nouveau → Contact → prénom, nom, email, téléphone → Créer → fiche | 9 | **7** | 68 | 4 | 2 | **7,75 s** | 3,40 s | **4,35 s** (formulaire ouvert 0,81 s ; après « Créer » 2,81 s) |
| **Entreprise** (contact « Société ») : Nouveau → Contact → Société → raison sociale, email, téléphone → Créer → fiche | 9 | **7** | 68 | 3 | 2 | **7,70 s** | 3,40 s | **4,30 s** (0,80 s ; 2,80 s) |
| **Affaire** : Nouveau → Affaire → libellé, client (fiche proposée choisie), type (ouvrir + choisir), montant → Créer → fiche | 12 | **9** | 39 | 4 | 2 | **6,58 s** | 1,95 s | **4,63 s** (formulaire 0,82 s ; proposition de fiche 0,81 s ; après « Créer » 2,30 s) |

Lecture : hors saisie, **plus de 4 s d'attente par création**, dont 0,8 s
pour ouvrir le formulaire (une navigation complète vers `/contacts?nouveau=1`
alors qu'on est déjà dans l'application) et 2,3 à 2,8 s après « Créer »
(action, redirection, rendu complet de la fiche neuve). Le chemin minimal
(3 clics + 1 champ) est bon sur le papier ; en pratique, un conseiller qui
note nom + téléphone + email fait 7 clics parce que chaque champ est un
clic, et regarde 12 champs pour en remplir 3.

**Objectifs après la partie 3, étape 5 (création rapide dans une fenêtre,
sans quitter la page) :**

| Scénario | Clics | Champs visibles | Attente hors saisie | Après création |
|---|---|---|---|---|
| Contact | **≤ 4** (Nouveau → Contact → nom → tél/email → Créer, champs enchaînés au clavier par Tab) | 4 (nom, téléphone, email, société) + « plus de champs » | **≤ 1,5 s** (fenêtre instantanée ; ≤ 1 s après « Créer ») | rester sur la page, fiche ouvrable d'un clic |
| Entreprise | ≤ 4 | 3 | ≤ 1,5 s | idem |
| Affaire | **≤ 5** (type choisi seul s'il n'y en a qu'un, libellé proposé) | 4 | ≤ 1,5 s | idem |

Tableau **avant / après** à remplir au rejeu (mêmes scripts, même heure de
la journée, trois passes) : total, saisie, attente, clics, champs.

---

## B. Les pains métier — sources citées

**Méthode.** Recherche web du 2026-09-17 : 37 requêtes, 41 sources
tentées, 28 pages réellement ouvertes et lues (avis produits et
comparateurs, forums, presse et études, textes officiels, associations
professionnelles, éditeurs). Chaque pain porte le nombre de sources où il
apparaît **sur les 41 consultées**, une citation courte et l'URL ; les
sources d'un éditeur ou d'un organisme de formation sont marquées
« [éditeur] ». Les chiffres ne sont repris que s'ils sont lus dans la
source ; deux citations clés ont été revérifiées à la main
(financialreporter.co.uk : « only 35% on client meetings », « between 6-16
hours a week is being spent on governance, risk and compliance
activity » ; service-public F32244 : « doit obligatoirement tenir un
registre recensant par ordre les mandats signés », « En absence de
mandat, la transaction est nulle. »). Le rapport complet (méthode, tableau
des 41 sources, ce qui n'a rien donné) est dans le scratchpad de la
session ; ce qui décide est ici.

**Ce que la recherche n'a PAS trouvé, et qui compte.**
- **Aucun chiffre français** sur le temps administratif d'un CGP, d'un
  courtier ou d'un agent immobilier en source ouverte. Les chiffres de
  temps ci-dessous sont **britanniques, américains ou australiens**, et
  dits comme tels ; ils ne décrivent pas le marché français.
- **Aucun avis public** pour O2S / Harvest, Big, Prisme, Upsideo,
  Fundvisory, WealthCorner (CGP) ; Empruntis Pro, Meilleurtaux Pro, Hypnos,
  Symbolik, Immo Facile Courtage, Neoxiam (IOBSP) ; Périclès, Immo-facile,
  Whise, Leizee, Transactionnel, Meilleurs Agents Pro (immobilier).
  Hektor : 0 avis sur Appvizer et Capterra Canada (les avis existent sur
  Trustpilot au nom de l'éditeur, La Boîte Immo). Reddit francophone :
  rien. Aucun forum public de CGP ou de courtiers en accès libre. **Toute
  phrase du type « les CGP se plaignent que… » est invérifiable en source
  ouverte** : c'est une conclusion d'audit en soi, et une raison de plus
  de mesurer l'usage des pilotes (`usage_events`, chantier B).
- Les deux chiffres les plus « vendeurs » croisés — « 60 % des agences
  perdent des leads par manque de suivi » (maformationimmo.fr) et « 30 à
  45 minutes gagnées par annonce » (diffuze.fr) — **ne sont sourcés par
  aucune étude** sur les pages qui les publient. Ils ne sont pas repris.

### B.1 CGP / CIF

| Pain | Sources | Citation, URL | Ce que fait le CRM aujourd'hui | Fonctionnalité simple (une phrase) |
|---|---|---|---|---|
| Le temps client est minoritaire ; conformité et administratif prennent la semaine | 4 / 41 (UK, US) | « only 35% on client meetings » ; « between 6-16 hours a week is being spent on governance, risk and compliance activity » — étude Model Office / Fidelity Adviser Solutions, [financialreporter.co.uk, 18/11/2024](https://www.financialreporter.co.uk/advisers-spending-just-35-of-time-meeting-clients-amid-admin-demands.html) ; « barely 20% of their time actually meeting with clients » (43 h/semaine, dont 4,2 h d'administratif pur) — [kitces.com, 03/2019](https://www.kitces.com/blog/how-do-financial-advisors-spend-time-research-study-productivity-capacity-efficiency/) | Rien qui mesure ou allège la conformité : ni document, ni date de remise, ni échéance | (voir dates clés, ci-dessous) |
| Une chaîne de documents par client, dans un ordre et à des dates imposés : DER **avant** la lettre de mission, questionnaire daté, rapport d'adéquation **à chaque recommandation** | 4 / 41 | « Le document d'information mentionné à l'article 325-5 … doit être remis lors de l'entrée en relation avec un nouveau client, avant la signature de la lettre de mission » — [AMF, DOC-2006-23, MAJ 28/09/2023](https://www.amf-france.org/sites/institutionnel/files/private/2023-10/doc-2006-23_vf7.pdf) ; checklist [éditeur] [glyphe.eu](https://glyphe.eu/blog/conformite-cgp) | Aucune date clé sur la fiche (le benchmark d'août l'avait retenu, jamais construit) ; les tâches existent mais rien ne les crée à partir d'un événement de la fiche | **Dates clés** : « DER remis le », « lettre de mission signée le », « KYC mis à jour le » sur la fiche, chacune avec son rappel automatique en tâche (F1) |
| Le dossier client n'est jamais « fini » : connaissance actualisée en continu (LCB-FT) | 3 / 41 | « une vigilance constante … cohérentes avec la connaissance actualisée qu'elles ont de leur relation d'affaires » — [Legifrance, L561-6 CMF](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000033517733) | Rien : aucune notion de « revue » ni d'ancienneté d'une information | F1 : une date clé « KYC mis à jour » à reconduction annuelle, tâche « à revoir » à l'échéance |
| Les CRM généralistes ne connaissent aucun objet métier | 2 / 41, [éditeur] ×2 | « ne connaissent rien au recueil patrimonial, au KYC réglementaire, au DER ou au rapport d'adéquation » — [majors.finance](https://support.majors.finance/ressources/crm-cgp.html) | clozado non plus (constat, pas obligation) | F1 apporte les dates ; le recueil patrimonial reste hors périmètre (§C, non retenu) |
| Dépendance à un outil unique : quand il tombe, retour au papier | 3 / 41 | « les clients ont fonctionné en mode dégradé (papier et crayon) », cyberattaque Harvest du 27/02/2025 — [lemondeinformatique.fr, 14/03/2025](https://www.lemondeinformatique.fr/actualites/lire-apres-une-cyberattaque-harvest-tente-de-rassurer-ses-clients-96331.html) | Export des données d'une fiche existe ; pas d'export global de l'organisation | argument commercial (export + données à soi), pas une fonctionnalité de ce chantier |
| Les outils patrimoniaux déçoivent : lenteur, indisponibilité | 2 / 41 | MoneyPitch 2,5/5 sur 67 avis : « Trop souvent indisponible », « Chargement long » — [App Store](https://apps.apple.com/fr/app/moneypitch/id1245738156) | Voir §A ter : 0,8 s avant le premier octet | la rapidité (partie 3, étape 4) EST une fonctionnalité métier |

### B.2 Courtiers IOBSP

| Pain | Sources | Citation, URL | Ce que fait le CRM aujourd'hui | Fonctionnalité simple |
|---|---|---|---|---|
| La course aux pièces justificatives est le premier poste de temps perdu | 5 / 41 (UK, AU) | « The biggest thing stopping brokers and lenders completing more deals is the admin work gathering, checking, and chasing information and documents » — étude Nivo, [mortgagesolutions.co.uk, 07/05/2026](https://www.mortgagesolutions.co.uk/specialist-lending/complex-buy-to-let/2026/05/07/wasted-admin-is-biggest-inefficiency-for-brokers/) ; [éditeur] « 80% of Mortgage Brokers Feel Buried by Admin » — [equifax.com.au, 2025](https://www.equifax.com.au/knowledge-hub/news-and-media/new-survey-reveals-80-mortgage-brokers-feel-buried-admin-while-74-face-escalating) | Rien : aucune liste de pièces sur une affaire ; les tâches sont libres | **Pièces à collecter** : sur une affaire, une liste de pièces (modèle par type d'affaire, en table) cochée reçue / manquante / périmée, avec relance en un clic (F2) |
| Information incomplète au premier envoi → reprise du dossier | 2 / 41 (UK) | « 50 % » d'informations correctes du premier coup, « 15 à 20 cycles de messages » par dossier — [mortgagesolutions.co.uk, 07/05/2026](https://www.mortgagesolutions.co.uk/specialist-lending/complex-buy-to-let/2026/05/07/wasted-admin-is-biggest-inefficiency-for-brokers/) | Rien | F2 (la liste dit ce qui manque avant l'envoi à la banque) |
| Pièces à validité courte : ce qui a été collecté périme | 2 / 41 | « trois mois pour les justificatifs de domicile et les relevés bancaires » — [meilleurtaux.com](https://www.meilleurtaux.com/credit-immobilier/le-guide-de-l-emprunteur/pieces-a-fournir-pour-un-credit-immobilier.html) (courtier) | Rien | F2 : une date de réception par pièce et une validité par type de pièce (en table) → « périmée » toute seule |
| Le client ne sait pas où en est son dossier | 3 / 41 | « Les réponses de la courtière sont restées très vagues (« je relance », « je n'ai pas plus d'informations ») » — [forum MoneyVox](https://www.moneyvox.fr/forums/fil/probleme-de-suivi-et-de-transparence-avec-une-courtiere-avis-recherches.53507/) ; « Le manque de réactivité et de suivi est un commentaire qui revient régulièrement » — [hellopret.fr](https://www.hellopret.fr/courtier-immobilier/empruntis-avis/) | Aucun email 1:1 depuis une fiche (constat 4 de l'audit CRM) ; l'envoi réel existe (module engagement) | **Point d'avancement** : depuis l'affaire, un email au client préparé à partir de l'étape et des pièces manquantes, relu et envoyé par le conseiller, consigné au journal (F3) |
| Relances perdues entre client, banque, notaire ; délais qui s'empilent | 3 / 41 | « trois mois » avant d'apprendre que des pièces manquaient — [forum MoneyVox](https://www.moneyvox.fr/forums/fil/probleme-de-suivi-et-de-transparence-avec-une-courtiere-avis-recherches.53507/) | Règles de relance par email (vague validée), tâches récurrentes ; « clôture prévue » sur l'affaire, sans rappel | F1 sur l'affaire : « condition suspensive jusqu'au », « offre valable jusqu'au » avec rappel |
| Devoir de conseil formalisé, sur informations actualisées, à chaque recommandation | 3 / 41 | « La recommandation est fondée sur des informations actualisées » — [Legifrance, R519-22-1 CMF](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032543866) | Rien | F1 (« fiche de conseil remise le ») |
| Renouvellement ORIAS annuel bloquant | 2 / 41 (sources secondaires : [brookeo.fr](https://www.brookeo.fr/post/renouvellement-orias-tout-savoir-obligation-legale), [maformationiobsp.fr](https://www.maformationiobsp.fr/linscription-et-le-renouvellement-aupres-de-lorias/)) | date limite au 31 janvier, radiation au 1er février (non vérifié sur orias.fr, FAQ illisible) | Rien | F1 au niveau de l'organisation : « ORIAS à renouveler avant le », « carte pro expire le », « heures de formation à justifier avant le » |

### B.3 Agents immobiliers

| Pain | Sources | Citation, URL | Ce que fait le CRM aujourd'hui | Fonctionnalité simple |
|---|---|---|---|---|
| Les relances non faites font perdre mandats et ventes | 4 / 41 ([éditeur] ; le « 60 % » n'est pas sourcé) | « Un acheteur qui ne reçoit pas de rappel après sa visite oublie le bien. Un propriétaire laissé sans nouvelles transforme son mandat exclusif en simple » — [pilotim.com](https://www.pilotim.com/activer-vos-contacts-dormants-methode-en-5-etapes-pour-generer-des-mandats-caches/) | Règles de relance (email), « sans nouvelles » du chantier B | déjà couvert ; F3 (compte rendu au mandant) le complète |
| L'après-midi passe en administratif de dossiers | 3 / 41 (aucun chiffre) | « L'après-midi est souvent consacrée à la gestion administrative et à la préparation des dossiers » — [join-safti.com](https://www.join-safti.com/fr/pourquoi-immobilier/metiers-de-l-immobilier/agent-immobilier-independant/une-journee-type-dans-la-peau-d-un-agent-immobilier) (réseau) | — | F2 (diagnostics, pièces du compromis) |
| La conformité anti-blanchiment mange des heures | 2 / 41 (UK) | [éditeur] « Agents are losing 6-8 hours per week to AML-related admin » — [altosoftware.co.uk, 09/04/2026](https://www.altosoftware.co.uk/blog/aml-checks-estate-agents-cost-fines/), citant une enquête Credas 2025 (250 agents UK) | Rien | F2 (pièce « identité vérifiée le ») ; la vérification elle-même = dépendance externe, non retenue |
| Saisir la même annonce sur chaque portail | 3 / 41, [éditeur] ×3 | « sans ressaisie ni prise de tête » — [ubiflow.net](https://www.ubiflow.net/multidiffusion-annonces-immobilieres) | Hors périmètre (pas de biens ni d'annonces) | non retenu (§C) |
| Registres légaux tenus en continu, sans trou de numérotation, sous peine de nullité du mandat | 3 / 41 | « doit obligatoirement tenir un registre recensant par ordre les mandats signés » — [service-public, F32244](https://sites.service-information-publique.fr/vias/guide-associations/F32244.html) ; « relié et coté sans discontinuité », conservation 10 ans, « le mandat est nul si le numéro d'inscription n'y figure pas » — [juritravail.com](https://www.juritravail.com/Actualite/agent-immobilier-quels-sont-les-registres-obligatoires-que-vous-devez-obligatoirement-tenir/Id/377278) | Rien | **Registre des mandats** : chaque mandat reçoit un numéro d'ordre qui ne saute jamais, avec date, mandant, bien, durée, et le registre s'exporte (F4, pack immobilier) |
| Les logiciels métier tombent en panne d'emails et l'agence perd des contacts | 2 / 41 | « Depuis le 11 juin 2026, nous ne recevons plus aucun e-mail » ; « Perte de visites, de contacts qualifiés » — Modelo Office (ex-Netty), [Capterra](https://www.capterra.com/p/184513/Netty/) | Statut d'envoi par message (module engagement), ingestion avec journal | argument commercial : fiabilité prouvée (chantier D partie 2, santé d'envoi) |
| Fichiers acquéreurs volumineux : lent, appariement à la main | 2 / 41 | « gestion de fichiers acquéreurs volumineux est décrite comme lente et fastidieuse » — [diffuze.fr](https://www.diffuze.fr/blog/netty-avis-tarifs-alternatives-2026) | Cibles (segments vivants) ; pas de biens | rapidité (partie 3, étape 4) ; l'appariement bien / acquéreur est hors périmètre |
| Bon de visite et comptes rendus au mandant : à produire et à classer | 2 / 41 | « La tenue de comptes rendus réguliers est une obligation spécifique au mandat exclusif » — [famille-droit-avocat.com](https://www.famille-droit-avocat.com/le-mandat-de-vente-exclusif-obligations-et-enjeux-pour-les-professionnels-de-limmobilier/) | Journal d'interactions ; pas d'envoi au client | F3 (compte rendu envoyé et consigné) |

### B.4 Obligations qui créent de la saisie (faits datés, sources officielles sauf mention)

| Obligation | Profession | Source | Ce qu'elle impose de saisir ou suivre | Périodicité |
|---|---|---|---|---|
| DER (document d'entrée en relation) | CIF | [AMF DOC-2006-23](https://www.amf-france.org/sites/institutionnel/files/private/2023-10/doc-2006-23_vf7.pdf), RG AMF 325-5 | remise avant la lettre de mission, trace de la remise | à chaque entrée en relation |
| Lettre de mission | CIF | idem ; reconduction annuelle selon des modèles de la profession ([cgpp.fr](https://cgpp.fr/accueil/nos-obligations/lettre-de-mission), secondaire) | signée, datée, archivée | entrée en relation ; annuelle |
| Recueil de connaissance client, rapport d'adéquation | CIF | AMF DOC-2006-23 §4.7 ; L541-8-1 CMF | trois blocs d'information ; rapport horodaté | avant tout conseil ; à chaque recommandation |
| Vigilance constante LCB-FT | CIF, IOBSP, immobilier | [L561-6 CMF](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000033517733) | connaissance actualisée, analyses documentées | en continu |
| RGPD : durées de conservation | les trois | [CNIL](https://www.cnil.fr/fr/passer-laction/les-durees-de-conservation-des-donnees) ; « 3 ans à compter du dernier contact » pour un prospect lu via [leto.legal](https://www.leto.legal/guides/rgpd-quelle-est-la-duree-de-conservation-de-vos-donnees) et [silexo.fr](https://silexo.fr/article/113/rgpd-les-durees-de-conservation-prospection-commerciale-et-marketing) (secondaires) | purge des prospects sans contact ; registre des traitements | permanent |
| Immatriculation et renouvellement ORIAS | IOBSP, CIF, IAS | orias.fr (FAQ non exploitable) ; secondaires ci-dessus | renouvellement annuel | 31 janvier (secondaire) |
| Information précontractuelle et fiche de conseil | IOBSP | [ABE Infoservice](https://www.abe-infoservice.fr/fr/lintermediaire-en-operations-de-banque-et-en-services-de-paiement-iobsp) ; R519-22 / R519-22-1 CMF | support durable, personnalisé par contrat ; recommandation sur informations actualisées | avant chaque opération |
| Mandat IOBSP | IOBSP | [note ANACOFI, 06/2023](https://www.anacofi.asso.fr/wp-content/uploads/2023/06/Note-ANACOFI-Courtage-Le-Mandat-IOBSP-Juin-2023.pdf) | mandat écrit signé : parties, nature, durée, rémunération | par client |
| Formation continue | IOBSP (7 h/an), DDA (15 h/an), immobilier loi ALUR (14 h/an ou 42 h / 3 ans, dont 2 h non-discrimination et 2 h déontologie) | secondaires [éditeur formation] : [peritusformation.com](https://peritusformation.com/les-obligations-de-formation-continue-des-iobsp), [lefebvre-dalloz](https://formation.lefebvre-dalloz.fr/actualite/formation-continue-des-professionnels-de-limmobilier-une-obligation-pour-exercer) | heures suivies et **justifiées** | annuel / triennal |
| Carte professionnelle | immobilier | [service-public F32244](https://sites.service-information-publique.fr/vias/guide-associations/F32244.html) | numérotée, affichée ; garantie financière | valable 3 ans |
| Registre des mandats, registre-répertoire | immobilier | [arrêté du 15/09/1972](https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000451099) ; décret 72-678 art. 72 et 53 | numéro d'ordre sans discontinuité, date, mandants, bien ; tout mouvement de fonds | à chaque mandat ; 10 ans |
| Mentions d'annonce : honoraires, DPE | immobilier | service-public F32244 ; secondaires pour le DPE | prix honoraires inclus / exclus, classe énergie et climat | chaque annonce |
| Rétractation SRU, condition suspensive de prêt | immobilier, IOBSP | L271-1 CCH ; loi Scrivener (lus via [seloger](https://edito.seloger.com/conseils-d-experts/acheter/delai-de-retractation-apres-signature-compromis-de-vente-article-35593.html), [empruntis](https://www.empruntis.com/financement/guide/delai-compromis-de-vente.php), secondaires) | 10 jours calendaires ; condition suspensive d'au moins un mois | par affaire |

### B.5 Ce que les avis reprochent aux logiciels métier — lecture transversale

Sur les avis 1★ lus (Modelo Office ex-Netty 4,4/5 sur 83 avis Capterra ;
Hektor / La Boîte Immo 4,3/5 sur 323 avis Trustpilot ; Ubiflow 3,4/5 sur
2 avis ; MoneyPitch 2,5/5 sur 67 avis App Store ; Apimo 4,3/5 sur 15
avis), **quatre sur cinq portent sur la fiabilité et le support, pas sur
le périmètre** : « Plus personne ne répond au SAV », « Bugs de plus en
plus récurrents », « Aucun suivi !!!! », panne d'emails de plusieurs
jours, annonces qui disparaissent. Viennent ensuite l'**opacité
tarifaire** (« Pas de version gratuite ni d'essai libre-service »,
« vous payez chaque abonnement portail séparément ») et le **mobile**
(« démunie d'options », « app native restrictive »). Pour clozado, cela
dit trois choses : la santé d'envoi (chantier D partie 2) et la rapidité
(partie 3, étape 4) sont des arguments de vente, pas des chantiers
techniques ; le prix doit être affiché ; les gestes mobiles du chantier B
comptent autant qu'une fonctionnalité.

---

## C. Le plan

Grille : impact usage (fort / moyen / faible), impact conversion (fort /
moyen / faible), complexité pour l'utilisateur (retire / neutre /
ajoute), effort (S / M / L), migration (oui / non). « Conversion » = ce
qui aide un prospect en démo à signer et un pilote à rester la première
semaine.

### C.1 Les cinq fonctionnalités métier retenues (au plus cinq, comme demandé)

| # | Fonctionnalité, en une phrase | Cible | Pains couverts | Usage | Conversion | Complexité | Effort | Migration |
|---|---|---|---|---|---|---|---|---|
| **F1** | **Dates clés avec rappel** : sur une fiche contact, une affaire ou l'organisation, une date typée (types en table par pack métier : DER remis, lettre de mission signée, KYC mis à jour, fiche de conseil remise, mandat signé / expire, condition suspensive jusqu'au, offre valable jusqu'au, carte pro expire, ORIAS à renouveler, heures de formation à justifier) qui crée sa tâche de rappel N jours avant et se reconduit si son type le demande | les trois | B.1 ×3, B.2 ×3, B.3 ×1, B.4 presque toutes | fort | fort (c'est ce qu'un CGP ou un courtier montre à son contrôleur) | ajoute une section « Dates clés » sur la fiche, retire des tâches tapées à la main | M | **oui** (`key_date_types`, `key_dates`) |
| **F2** | **Pièces à collecter par affaire** : une liste de pièces (modèles par type d'affaire, en table, validité par type de pièce) cochée reçue / manquante / périmée, avec la relance des pièces manquantes en un clic (email 1:1 validé par le conseiller) | IOBSP d'abord, immobilier | B.2 ×3, B.3 ×2 | fort (le premier poste de temps perdu des courtiers, dans toutes les sources qui le chiffrent) | fort | ajoute une section sur l'affaire, retire des emails écrits à la main | M | **oui** (`document_types`, `deal_documents`) — jamais le fichier lui-même dans ce chantier (stockage = dépendance, STOP) |
| **F3** | **Point d'avancement au client** : depuis une affaire, un email 1:1 préparé à partir de l'étape, des dates clés et des pièces manquantes, relu, envoyé par le conseiller et consigné au journal | IOBSP, immobilier (compte rendu au mandant), CGP | B.2 ×2, B.3 ×2 ; constat 4 de l'audit CRM (aucun email 1:1) | fort | moyen | neutre (un bouton sur l'affaire) | M (réutilise l'envoi réel et le journal ; gabarit en table ; l'IA ne fait que proposer le texte) | non (si le gabarit vit dans les gabarits existants) |
| **F4** | **Registre des mandats** (pack immobilier) : chaque mandat reçoit un numéro d'ordre qui ne saute jamais, avec date, mandant, bien, durée, et le registre s'exporte | immobilier | B.3 ×1, B.4 | moyen (une agence sur les trois cibles) | fort pour cette cible (obligation à nullité) | ajoute un écran, retire un cahier | M | **oui** (`mandates`, séquence par organisation) |
| **F5** | **Purge RGPD des prospects sans contact** : une liste « sans aucun contact depuis 3 ans » (délai réglable en table, 3 ans par défaut selon la CNIL lue en source secondaire), suppression tombale en un clic, journalisée | les trois | B.4 (RGPD) | faible au quotidien, fort au premier contrôle | moyen | neutre | S (réutilise la suppression tombale et « dernière interaction ») | non |

Ordre proposé entre elles : F1 (les dates portent F2 et F3), F2, F3, F5,
F4. F1 + F2 + F3 forment un tout cohérent pour un courtier : « ce qu'il
me manque, quand ça expire, ce que je dis au client ».

### C.2 Les étapes UX de la partie 3, notées à la même grille

| Étape (brief) | Usage | Conversion | Complexité | Effort | Migration | Dépend de |
|---|---|---|---|---|---|---|
| 0. Champ ⌘K hors écran (§A.1 point 1), espace « contactspour », responsable « Personne » en substitution, `required` sur le type d'affaire, `step` du montant | fort | fort (visible en démo) | retire | **S** | non | rien — à faire en premier |
| 1. Recherche ⌘K (téléphone, ville, tâches, récents, actions rapides, créer depuis la recherche, tri) | fort | moyen | retire | M | oui (récents dans `user_preferences` ; index `pg_trgm` optionnel) | `user_preferences` |
| 2. Menu de gauche (blocs, replié, favoris, masquer / réordonner, réinitialiser) | moyen | moyen | retire (moins d'entrées) puis neutre | M | oui (`user_preferences`) | **B·3 « Aujourd'hui » d'abord** (V1, V4, V9) |
| 3. Vues enregistrées (filtres combinables, colonnes, tri, personnelle ou partagée, par défaut) | fort | moyen | ajoute un menu « Vues », retire des filtres retapés | L | oui (`saved_views`) | `user_preferences` ; réutilise le moteur de critères des cibles |
| 4. Rapidité (§A ter : région, mémoïsation, board une fois, tâches allégées, actions sans redirection) | fort | fort (une démo lente se voit) | retire | M | non | région = changement de production à valider |
| 5. Création rapide (fenêtre sans quitter la page ; listes à recherche ; formats ; doublon pendant la saisie ; API SIREN et Adresse À PROPOSER) | fort | fort | retire (4 champs au lieu de 12) | M (L avec les API) | non (oui pour l'origine et la civilité, §A.4) | 0 ; les API = STOP |
| 6. Formulaires modifiables par l'admin + champs personnalisés simples | moyen | moyen | ajoute une carte de réglages (contre le principe « jamais une nouvelle carte » : à limiter à « masquer / ordonner les champs existants » + champs personnalisés texte / nombre / date / liste) | L | oui (`custom_fields`, `custom_values`) | 5 |
| 7. UI générale (grille et composants communs) | moyen | moyen | retire | M | non | en fil rouge |
| 8. Les cinq fonctionnalités métier (§C.1) | fort | fort | ajoute (sections sur fiche et affaire) | M × 4 + S | oui (F1, F2, F4) | 5 pour les listes à recherche |

### C.3 Non retenu, et pourquoi

| Idée | Raison |
|---|---|
| Tableau de bord composable par utilisateur | faible utilité à 1-3 personnes par organisation ; le filtre « moi » (V8, V14) et les vues enregistrées suffisent ; un écran de réglage de plus |
| Densité d'affichage | faible utilité tant que les listes tiennent ; le choix des colonnes fait le travail |
| Thème | existe déjà |
| Questionnaire KYC / profil de risque, rapport d'adéquation, DER générés | c'est un produit de conformité à part entière (documents, signatures, versions) ; F1 en garde la trace, pas le contenu |
| Multidiffusion d'annonces, appariement bien / acquéreur | clozado n'a ni biens ni annonces ; hors thèse produit |
| Vérification d'identité / LCB-FT automatisée | dépendance externe payante (fournisseur de vérification) ; F2 garde la date « identité vérifiée le » à la main |
| Stockage des pièces (fichiers) dans F2 | dépendance de stockage (Blob) et données sensibles : F2 ne stocke que l'état et les dates ; à proposer séparément avec le coût et la conservation |
| Compteur d'heures de formation | une date clé « heures à justifier avant le » (F1) suffit ; le décompte se fait chez l'organisme |
| Portail client (le client consulte son dossier) | authentification d'un tiers = STOP, et un canal de support de plus ; F3 (l'email d'avancement) rend le même service sans compte |
| Signature électronique de la lettre de mission / du mandat | dépendance externe payante ; F1 enregistre la date signée |
| Chiffres « 60 % des agences perdent des leads », « 30-45 min par annonce » comme arguments | non sourcés par les pages qui les publient |
| Chiffres de temps administratif « du marché français » | inexistants en source ouverte ; les seuls chiffres sont UK / US / AU et sont dits tels quels |
| Suggestions de ville depuis le code postal par API Adresse, SIREN par API Recherche d'entreprises | dépendances externes : À PROPOSER à l'étape 5, STOP avant |

---

## D. Ce que cet audit ne prouve pas

- Les temps ont été mesurés **depuis un Codespace** (bord Vercel de
  Londres) : un conseiller à Nantes verra un premier octet du même ordre
  (la fonction reste à Washington quel que soit le bord), mais les temps
  de « réseau calme » dépendent de sa connexion. Rien n'a été mesuré sur
  téléphone en 4G.
- Le gain du changement de région est **estimé par raisonnement** (un
  aller-retour transatlantique par requête SQL), pas mesuré : il se
  mesurera après.
- Les scénarios de création simulent la frappe à 50 ms par caractère ;
  un humain hésite, relit, corrige : le temps réel est plus long, l'écart
  avant / après sera juste si les deux passes utilisent le même script.
- Les pains métier viennent de 41 sources dont 28 lues en entier ; aucune
  n'est un conseiller, un courtier ou un agent interrogé. Les entretiens
  de prospection de l'utilisateur sont la source qui manque.
- Aucune organisation réelle n'a été mesurée : la démo a 45 contacts et
  28 affaires ; une organisation à 5 000 contacts (jeu `perf-dataset`)
  n'a pas été rejouée en production.

## E. Méthode et preuve

- Code lu : `command-palette.tsx`, `search.ts`, `dialog.tsx`,
  `navigation.ts`, `navigation-list.tsx`, `sidebar.tsx`, `bottom-nav.tsx`,
  `contact-create-form.tsx`, `contact-picker.tsx`, `affaires/page.tsx`,
  `contacts/[id]/page.tsx`, `dashboard/page.tsx`, `(app)/layout.tsx`,
  `deal-follow-up.ts`, `tasks.ts`, `session.ts`, `theme.ts`, `db/index.ts`,
  `vercel.json` ; inventaire exhaustif des formulaires par un lecteur
  dédié (rapport dans le scratchpad, chaque ligne pointant fichier:ligne).
- Site en ligne : sessions forgées (`scripts/_tmp-c2-session.ts`, jeton
  Auth.js signé avec le secret de `.env.local`, cookie
  `__Secure-authjs.session-token`, substitution par `clozado-active-org`),
  captures (`_tmp-c2-perf.ts shots` et `_tmp-c2-dark.ts`, 14 captures, 9 relues), mesures de pages
  (`pages`, 36 chargements + 6 recherches + 24 navigations internes),
  gestes (`gestes`, `etape`), scénarios de création (`_tmp-c2-create.ts`),
  `curl` avec cookie (24 requêtes), analyse des documents HTML (taille,
  part RSC, balises `<script>`), nettoyage (`_tmp-c2-cleanup.ts` :
  3 tâches, 2 affaires, 2 contacts supprimés, 0 restant). Les scripts
  restent dans `scripts/_tmp-*` (jamais committés) et dans le scratchpad
  de la session pour le rejeu ; les fichiers de résultats
  (`perf-pages.json`, `perf-gestes.json`, `perf-etape.json`,
  `create-scenarios.json`, `curl-ttfb.txt`) aussi.
- Données de la démo touchées puis remises en l'état : l'affaire « Maison
  neuve — Carquefou » déplacée six fois Nouveau ↔ Partagée (l'historique
  d'étapes de la démo porte ces douze mouvements) ; les notes de « Julie
  Michel » écrites puis vidées trois fois.
- Web : 37 requêtes, 41 sources, 28 pages lues ; deux citations
  revérifiées à la main ; aucun chiffre repris sans URL.
