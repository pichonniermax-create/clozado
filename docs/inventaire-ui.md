# Inventaire de l'interface — carte du chantier de refonte

Constat, pas correction. Établi avant toute conception, pour pouvoir
vérifier à la fin qu'aucun écran n'a été oublié.

Relevé le 2026-08-21, au commit `51fc189`.

---

## 1. Le constat qui domine tout le reste

**Aucune route de l'application n'a d'état de chargement ni d'état
d'erreur.** Zéro `loading.tsx`, zéro `error.tsx`, zéro `not-found.tsx` dans
tout `src/app`. Concrètement :

- pendant qu'une page charge ses données, l'écran précédent reste figé sans
  rien dire ;
- si une requête échoue, l'utilisateur tombe sur l'écran d'erreur brut de
  Next.js, en anglais, avec un identifiant technique — c'est exactement ce
  qui s'est produit en production sur `/suivi` et `/affaires/[id]`
  (corrigé depuis, mais la page d'erreur, elle, est toujours celle-là).

Les états VIDES existent sur 7 écrans, mais réécrits à la main à chaque
fois, et souvent réduits à un constat (« Aucune affaire pour l'instant »)
sans dire ce qu'est l'écran ni proposer d'action.

---

## 2. Routes

Légende : ✅ présent · ⚠️ présent mais insuffisant · ❌ absent

### Application (derrière authentification, coquille `(app)`)

| Route | Rôle | Vide | Chargement | Erreur |
|---|---|---|---|---|
| `/dashboard` | Point d'entrée. Chiffres du jour + à traiter en priorité. Branche séparée pour un super admin (liste des organisations). | ⚠️ « Rien qui attende une relance » | ❌ | ❌ |
| `/suivi` | Les trois piles d'action : sans réponse, acceptées sans suite, commissions à encaisser. | ⚠️ une phrase par pile | ❌ | ❌ |
| `/affaires` | Liste des affaires + création repliée. | ⚠️ « Aucune affaire pour l'instant » | ❌ | ❌ |
| `/affaires/[id]` | Fiche : partages, commissions, composeur de partage, journal. | ⚠️ implicite | ❌ | ❌ (`notFound()` sans page dédiée) |
| `/partenaires` | Liste des confrères + création repliée. **Écran de référence du chantier.** | ⚠️ « Aucun partenaire actif » | ❌ | ❌ |
| `/partenaires/[id]` | Fiche partenaire + historique des affaires partagées. | ⚠️ une ligne | ❌ | ❌ (`notFound()` sans page dédiée) |
| `/settings` | Marque de l'organisation (logo, couleurs, police). Redirige un super admin. | s.o. | ❌ | ❌ |
| `/newsletters` | Liste des newsletters. | ⚠️ « Aucune newsletter » | ❌ | ❌ |
| `/newsletters/new` | Éditeur, document vierge. | ✅ (état vierge conçu) | ❌ | ⚠️ erreurs de génération affichées |
| `/newsletters/[id]` | Éditeur, brouillon existant. | s.o. | ❌ | ❌ |

> `/newsletters/*` — **hors périmètre pour l'instant** (chantier composer).
> À traiter en dernier, après accord.

### Publiques

| Route | Rôle | Vide | Chargement | Erreur |
|---|---|---|---|---|
| `/` | Porte d'entrée. Redirige vers `/dashboard` si connecté. | s.o. | ❌ | ❌ |
| `/login` | Connexion par lien email. | s.o. | ✅ (état d'envoi) | ✅ (message neutre) |
| `/login/verifier` | « Vérifie tes emails ». | s.o. | s.o. | s.o. |
| `/inscription` | Création d'un espace + organisation. | s.o. | ✅ | ✅ |
| `/partage/[token]` | **La vitrine.** Page vue par un partenaire extérieur. Porte la marque du CLIENT. | s.o. | ❌ | ✅ (deux catégories, sans jamais nommer personne) |

### Routes d'API (pas d'interface)

`/api/auth/[...nextauth]` · `/api/partage/[token]` (seule route publique par
jeton) · `/api/newsletters/render` · `/api/newsletters/ai/design`.

---

## 3. Composants

### Socle réutilisable (`components/ui/`, shadcn sur Base UI)

`avatar` · `badge` · `button` · `card` · `dropdown-menu` · `input` ·
`label` · `select` · `separator` · `textarea`.

Manquants pour ce qui est pourtant utilisé partout : **table/liste**,
**état vide**, **squelette de chargement**, **panneau d'erreur**,
**champ de formulaire** (libellé + aide + erreur), **info-bulle**,
**boîte de dialogue**.

### Composants produit

| Composant | Où | Remarque |
|---|---|---|
| `app-shell/sidebar` + `nav-link` + `page-header` | Coquille interne | Récents, cohérents |
| `auth/auth-shell` + formulaires | Écrans publics | Cohérents |
| `stat-tile` | Tableau de bord | Une seule utilisation |
| `deal-shares/*` | Partage d'affaires | 5 composants |
| `newsletter/editor/*` | Éditeur | Hors périmètre |

---

## 4. Le même élément visuel, réimplémenté

C'est ici que se joue l'essentiel du chantier.

| Motif | Réimplémenté dans | Occurrences |
|---|---|---|
| **Liste en carte** (`overflow-hidden rounded-xl border border-border bg-card` + `<li>` séparés) | dashboard, affaires, affaires/[id], partenaires, newsletters, suivi (×2) | **7** |
| **État vide en pointillés** (`rounded-xl border border-dashed border-border px-4 py-10 text-center`) | dashboard, affaires, partenaires, newsletters, newsletters/new, suivi (×2) | **7** |
| **Ligne cliquable** (titre + sous-titre + chevron) | affaires, partenaires, newsletters, dashboard | **4** |
| **Formulaire de création replié** (`<details>` + `Plus` qui pivote) | affaires, partenaires | **2** |
| **Badge d'état** — tantôt `<Badge>`, tantôt un `<span>` coloré à la main | affaires, partenaires/[id], suivi, affaires/[id] | **4**, deux traitements différents |

Aucun de ces motifs n'existe en composant. Chaque écran a recopié les
classes, ce qui garantit qu'ils divergeront.

---

## 5. Valeurs en dur dans des composants

À supprimer (critère d'acceptation du chantier) :

| Fichier | Valeur | Nature |
|---|---|---|
| `deal-shares/partner-share-view.tsx:156` | `#2563eb` | Couleur de repli quand le client n'a pas de couleur — **légitime**, mais doit devenir un jeton |
| `deal-shares/partner-share-view.tsx:218` | `text-amber-700` | Couleur Tailwind brute, échappée aux corrections précédentes |
| `app/(app)/settings/page.tsx:100` | `#2563eb` | Exemple dans un `placeholder` — inoffensif, mais à sortir |
| `ui/dropdown-menu.tsx:138` | `[96px]` | Taille arbitraire, fichier généré shadcn |
| `ui/badge.tsx:8` | `[3px]` | Idem |

`render-email.ts` est **exclu** : ses valeurs de repli sont le gabarit
email, pas l'interface, et sont déjà documentées comme neutres.

---

## 6. Chiffres et formats

**Chiffres tabulaires** — présents à seulement 5 endroits (suivi ×2,
stat-tile, nav-link, affaires/[id]). Manquants là où des montants s'empilent
réellement en colonne : listes d'affaires (montants estimés), historique de
partages, commissions de la fiche affaire.

**Formatage français** — `src/lib/deal-shares/format.ts` centralise euros,
dates et commissions… mais son nom le rattache au module PRM, et
`app/(app)/newsletters/page.tsx` a déjà sa **propre** `formatDate` locale.
La duplication a donc commencé. Manquent : durées relatives (« il y a
9 jours »), pourcentages, et l'espace insécable dans les montants.

---

## 7. Identité : application vs client

Distinction à tenir, relevée telle qu'elle est aujourd'hui.

- **Identité Clozado** — coquille, listes, formulaires. Aujourd'hui la
  palette de `globals.css`, identique pour tous.
- **Identité du client** — n'apparaît que sur **deux surfaces** :
  1. `/partage/[token]` (et son aperçu dans `/affaires/[id]`) ;
  2. le HTML des emails (`render-email.ts`).

  Elle transite par `RenderBrand`, résolu depuis `organizations` via
  `toRenderBrand()`.

**Une fuite existe déjà** : `app-shell/sidebar.tsx` peint la pastille de
navigation avec `org.primaryColor`, et affiche le logo du client. C'est la
marque d'un client qui teinte l'interface de l'application — exactement ce
que le chantier interdit. À trancher lors de la conception.

---

## 8. Ce qui manque à la coquille

- Pas de barre d'en-tête : ni recherche, ni actions rapides, ni menu de
  compte (la déconnexion est une icône en bas de la navigation).
- La navigation est écrite en dur pour 3 sections et 5 entrées ; rien ne
  prévoit huit modules.
- **Aucun état « super admin en vue d'un client »** : un super admin voit
  aujourd'hui les données de toutes les organisations mélangées, sans aucun
  repère visuel indiquant de quel point de vue il regarde.
