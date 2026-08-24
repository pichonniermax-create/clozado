# Refonte UI — notes de chantier

Même rôle que `docs/module-prm.md` et `docs/module-relationnel.md` : les
décisions et l'avancement, pas une documentation utilisateur. L'inventaire
de départ est dans `docs/inventaire-ui.md` (constat au commit `51fc189`).

## Le plan, acté le 2026-08-21

| Étape | Contenu | État |
|---|---|---|
| 0 | Inventaire de l'existant (`docs/inventaire-ui.md`) | fait, `32ee82f` |
| 1 | Le socle : les motifs recopiés deviennent des composants (`ListCard`, `EmptyState`, `DetailsCard`, `Field`, badges d'état, `lib/format.ts`, `lib/brand.ts`) | fait, `3b7d810` |
| 2 | Jamais l'écran brut : chargement, erreur, introuvable sur toutes les routes ; états vides qui disent ce qu'est l'écran et proposent le geste suivant | fait, voir ci-dessous |
| 3 | La coquille : identité Clozado seule dans la barre latérale (la marque du client ne vit que sur `/partage/[token]` et dans les emails), bandeau permanent super admin, en-tête avec menu de compte, navigation prête à grandir | fait, voir ci-dessous |

`/newsletters/*` est hors périmètre tant qu'aucun accord n'est donné pour y
toucher (chantier composer) ; les filets de sécurité posés au niveau du
groupe `(app)` le couvrent malgré tout, voir étape 2.

---

## Étape 2 — jamais l'écran brut

### Trois composants, une silhouette commune

- **`Skeleton`** et ses compositions (`PageSkeleton`, `SkeletonTiles`,
  `SkeletonCard`, `SkeletonList`, `SkeletonKanban`, `SkeletonSectionTitle`)
  dans `components/ui/skeleton.tsx` : chaque `loading.tsx` compose sa
  silhouette en quelques lignes, avec des hauteurs proches des vrais
  composants — un squelette occupe la place exacte de ce qui va apparaître,
  il ne dit rien. `aria-busy` sur le conteneur.
- **`ErrorState`** (`components/ui/error-state.tsx`, composant client) :
  titre en français, explication « passager, ce n'est pas toi », jamais
  l'identifiant technique, bouton « Réessayer » branché sur `retry()` (la
  convention Next 16.3 : recharge les données du segment ; `reset` n'est
  plus utilisé), lien de repli optionnel.
- **`NotFoundState`** (`components/ui/not-found-state.tsx`) : « ça n'existe
  pas », avec un retour vers la liste parente. On ne distingue jamais
  « lien périmé » de « donnée d'un autre espace » : le dire confirmerait
  l'existence d'une donnée qu'on n'a pas le droit de voir.

### Où les fichiers d'état vivent

- **Racine** : `not-found.tsx` (URL inconnue, dans le cadre des écrans
  publics), `error.tsx` (accueil, connexion, inscription), `loading.tsx`,
  et `global-error.tsx` — le dernier filet, avec ses propres `<html>` et
  `<body>` et un rendu volontairement sans dépendance.
- **Groupe `(app)`** : `loading.tsx`, `error.tsx`, `not-found.tsx` génériques.
  Ils servent à toute route de la coquille sans fichier propre — c'est ce
  qui couvre `/newsletters/*` (y compris le `notFound()` de
  `/newsletters/[id]`) sans qu'aucun fichier de ce périmètre ne soit
  touché ni ajouté.
- **Par route** : squelette propre partout (`dashboard`, `contacts`,
  `contacts/[id]`, `contacts/import`, `affaires`, `affaires/[id]`, `taches`,
  `suivi`, `partenaires`, `partenaires/[id]`, `settings`), `error.tsx` sur
  chaque liste (une frontière d'erreur couvre aussi les fiches en dessous),
  `not-found.tsx` sur chaque fiche.
- **Vitrine publique `/partage/[token]`** : squelette et erreur neutres,
  sans marque tant que le partage n'est pas résolu, ne nommant jamais
  personne — même discipline que sa page d'erreur métier.

### Les états vides : trois formes, une règle

`EmptyState` garde ses deux formes d'avant (paragraphe ; ligne avec icône
pour les piles du suivi) et gagne la forme **structurée** : un titre, une
explication, une ou plusieurs actions. La règle : un écran vide dit ce
qu'il est et propose le geste suivant, il ne constate pas l'absence.

| Écran | Avant | Maintenant |
|---|---|---|
| `/dashboard` (espace neuf : ni contact ni affaire — les partenaires ne comptent pas, on peut en avoir sans rien suivre encore) | des tuiles à zéro | « Bienvenue dans ton espace » + importer mes contacts / créer une affaire (+ ajouter un partenaire s'il n'y en a aucun) |
| `/contacts` | « Aucun contact pour l'instant. Crée… » | titre + ce qu'est une fiche + « Créer une fiche » (ouvre le formulaire) et « Importer un CSV » ; recherche sans résultat → sur quoi elle porte + « Tout afficher » |
| `/affaires` sans pipeline | une phrase | titre + ce qu'est un pipeline + « Configurer un pipeline » |
| `/affaires` kanban vide | cinq colonnes « Dépose une affaire ici » | au-dessus des colonnes : ce qu'est le kanban + « Créer une affaire » |
| `/affaires` liste vide / filtres sans résultat | une phrase | titre + « Créer une affaire » / « Retirer les filtres » |
| `/partenaires` | « Aucun partenaire actif pour l'instant. » | ce qu'est un partenaire (lien à ton nom, pas de compte) + « Ajouter un partenaire » |
| `/partenaires/[id]` | une ligne | d'où vient l'historique + « Voir les affaires » |
| `/suivi` sans aucun partage | trois piles « aucun… » | « Rien à suivre pour l'instant » + ce qui remplit le suivi + « Voir les affaires » (les piles reprennent dès le premier partage) |
| `/taches` | une phrase | titre + d'où viennent les tâches + « Créer une tâche » (ancre vers le formulaire) |

Mécanique commune : `?nouveau=1` déplie le formulaire de création
(`DetailsCard` gagne `defaultOpen`) sur `/contacts`, `/partenaires` et
`/affaires` — un état vide peut donc envoyer directement sur le geste.
`/affaires?contact=…` (venir d'une fiche contact) déplie aussi.

### Reliquats de l'inventaire soldés au passage

Les exemples de couleur en dur des réglages (`#2563eb`, `#16a34a` dans des
`placeholder`) passent par `DEFAULT_BRAND_PRIMARY` (`lib/brand.ts`).

---

## Étape 3 — la coquille

### Identité Clozado seule

La barre latérale ne porte plus le logo ni la couleur du client
(`sidebar.tsx` peignait la pastille avec `org.primaryColor` et affichait
`org.logoUrl` — la fuite relevée à l'inventaire §7). Elle porte la marque de
l'application (`BrandMark`, une seule définition pour la coquille, les
écrans publics et l'accueil — trois copies avant). Le nom de
l'organisation vit dans l'en-tête, comme un **contexte** (« dans quel espace
je travaille »), pas comme une marque. La marque du client ne s'affiche que
sur la vitrine de partage et dans les emails (`RenderBrand`), inchangés.

### L'en-tête

Nouveau, collant en haut de la colonne de contenu (`app-header.tsx`) :

- le nom de l'organisation (ou « Vue globale » pour un super admin sans
  organisation choisie) ;
- la recherche de contacts — un simple formulaire GET vers `/contacts?q=`,
  aucun JavaScript ;
- le menu **Nouveau** (contact, affaire, tâche, partenaire) : chaque entrée
  ouvre l'écran concerné avec son formulaire déjà déplié (`?nouveau=1`,
  mécanique de l'étape 2) — un raccourci, pas un second formulaire ;
- le menu de **compte** (initiales) : nom, email, « Marque & réglages »,
  « Se déconnecter » — la déconnexion reste un formulaire branché sur une
  action serveur, elle marche sans JavaScript. Avant, c'était une icône au
  pied de la navigation, et rien ne disait le nom du compte.

### Le bandeau super admin

Inchangé dans son rôle (permanent, visible du seul super admin, teinte
distincte, sélecteur d'organisation posé à l'étape 3 du module relationnel
à la demande de l'utilisateur) ; il se range désormais **sous l'en-tête**
(collant à `top-14`), toujours au même endroit.

### Navigation prête à grandir

`navigation.ts` décrit la navigation en données : sections, entrées, icône,
compteur (`tasksDue`, `followUp`) et la règle « exige une organisation »
(masqué en vue globale). Ajouter un module = ajouter une ligne ; la barre,
ses compteurs et le menu « Nouveau » (`QUICK_CREATE`) suivent. Les menus
s'appuient sur `dropdown-menu` (Base UI), jusqu'ici présent mais inutilisé.

### Navigation repliable sur petit écran (complément de l'étape 3)

En dessous de `md` (768 px), la barre latérale disparaît ; un bouton dans
l'en-tête ouvre **la même liste** (`NavigationList`, rendue depuis
`navigation.ts` — une seule source, deux emplacements) dans un panneau qui
glisse depuis la gauche par-dessus l'écran. Le panneau est le nouveau
composant du socle **`Sheet`** (`components/ui/sheet.tsx`), construit sur le
Drawer de Base UI : focus retenu, défilement de la page bloqué, fermeture à
Échap, au clic en dehors, au bouton « Fermer » et d'un glissement vers le
bord (le panneau suit le doigt via `--drawer-swipe-movement-x`). À la
navigation, il est remonté (`key={pathname}`) : toujours fermé sur l'écran
d'arrivée, sans état à synchroniser — la règle `react-hooks/set-state-in-
effect` interdit d'ailleurs la fermeture par effet. L'en-tête, le bandeau
super admin et le conteneur de contenu resserrent leurs marges sur petit
écran ; « Nouveau » n'y garde que son icône ; la recherche reste sur grand
écran seulement.

### Hors de cette étape, à décider

- Des fichiers d'état propres à `/newsletters/*` (voir étape 2).
- Info-bulle et boîte de dialogue, encore absentes du socle (inventaire §3).
