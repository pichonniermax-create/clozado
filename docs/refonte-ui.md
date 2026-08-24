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
| 3 | La coquille : identité Clozado seule dans la barre latérale (la marque du client ne vit que sur `/partage/[token]` et dans les emails), bandeau permanent super admin, en-tête avec menu de compte, navigation prête à grandir | à faire — deux décisions déjà tranchées, ne pas les rouvrir |

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
