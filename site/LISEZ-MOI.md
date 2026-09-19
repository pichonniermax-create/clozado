# site/ — le site marketing de Clozado

Projet Vercel **séparé** de l'application, sur le même dépôt.
`Root Directory = site`. Il ne partage avec `src/` ni dépendance, ni
fichier, ni build : un déploiement de l'un ne peut pas casser l'autre.

## Les règles tenues ici

- **Tout est statique.** Aucune route d'API, aucun proxy, aucune base,
  aucun rendu à la requête. Chaque page est un fichier HTML servi par le
  CDN.
- **Aucun tiers, aucun cookie.** Aucun script externe, aucune mesure
  d'audience, aucun stockage navigateur — donc aucun bandeau de
  consentement à afficher.
- **Aucune image affichée.** Ni photo, ni illustration, ni capture, ni
  emoji, ni pictogramme décoratif. Quand une section doit montrer le
  produit, elle en REDESSINE l'écran en HTML
  (`components/ecran-produit.tsx`) : c'est du texte, donc net à toutes les
  densités, sélectionnable, lu par une synthèse vocale, indexable, et
  gratuit à télécharger. Seules les images de PARTAGE (OpenGraph) sont
  générées — elles ne s'affichent jamais dans une page.
- **Une seule apparence, claire.** Le site ne suit plus le thème du
  système : pas de mode sombre, donc aucune règle `prefers-color-scheme`.
- **Le bordeaux ne sert qu'à ce qui est actionnable** : bouton plein, lien,
  souligné, état actif. Jamais un fond de section, jamais un aplat
  décoratif. Le reste est neutre — page blanc cassé (`#fafaf8`), surfaces
  blanches, filet de 1 px, aucune ombre portée.
- **Une seule famille**, Geist, auto-hébergée. Les titres sont lourds,
  très grands et fluides (`clamp`), sans point de rupture. Aucune police
  décorative, aucun dégradé de texte.
- **Les formes** : un bouton est une pilule (rayon plein), une carte a
  16 px de rayon, et tout espacement est un multiple de 4 px.
- **Le mouvement** (accueil seulement) tient en deux fichiers :
  `app/globals.css` pour les transitions, `lib/mouvement.ts` pour les
  observateurs. Aucune librairie d'animation. Tout est conditionné par
  `[data-mouvement]`, posé sur `<html>` par un script synchrone en tête de
  page : **sans JavaScript, rien n'est masqué et rien n'attend**. Chaque
  entrée ne joue qu'une fois — la cible est retirée de l'observateur —, les
  durées tiennent entre 150 et 250 ms, et `prefers-reduced-motion` rend tout
  instantané, cycle des onglets compris (il ne démarre pas). Un contrôle qui
  ne marcherait pas sans script (la liste d'onglets) n'est affiché que si le
  script répond.
- **Aucun texte dans le code.** Tout ce qui se lit à l'écran vit dans
  `content/<langue>/`. Le français est la langue de référence : sa forme
  est le contrat auquel toute autre langue devra se conformer.
- **Aucun lien mort.** `lib/routes.ts` déclare les pages et dit lesquelles
  sont construites. En-tête, pied de page, sitemap et page 404 n'affichent
  que celles-là. Ouvrir une page, c'est basculer un booléen.
- **Aucune adresse en dur.** `lib/site-config.ts` est le seul fichier à
  toucher quand une adresse change (l'application, la prise de rendez-vous).

## Les quatre garde-fous de la construction

`npm run build` enchaîne quatre contrôles avant `next build`. Chacun arrête
la construction, aucun n'avertit sans conséquence : un site se dégrade par
petites tolérances.

1. **`verifier:libelles`** — aucun crochet à compléter (« [prix] ») dans un
   texte affiché, hors les deux pages légales, exemptées à voix haute.
2. **`verifier:collisions`** — le TABLEAU DE COLLISION. Les treize écrans de
   preuve sont rangés en cinq familles ; deux familles ne partagent ni nom
   propre, ni montant, ni date. À l'intérieur d'une famille le partage est
   voulu : l'accueil montre un seul cabinet, et les six écrans du parcours
   suivent un seul dossier.
3. **`verifier:additions`** — le TABLEAU DES ADDITIONS. Quatre-vingt-trois
   contrôles refont les calculs de chaque écran : un total est la somme de
   ses lignes, un pourcentage est le rapport qu'il annonce, un écart est la
   différence de ses deux bornes. Rien n'est recopié dans le contrôle, tout
   est relu dans `content/fr/` — corriger un nombre suffit, le contrôle dira
   s'il est cohérent.
4. **`eslint`** — dont la règle locale `no-visible-text` : aucun texte
   affiché n'est écrit dans un composant. Elle n'existait ici que depuis le
   2026-09-19 ; le site n'était linté par rien, et la règle du dépôt visait
   `src/` seulement. `client-namespaces`, la seconde règle du dépôt, ne se
   transporte pas : elle surveille `next-intl`, que le site n'utilise pas.

Le contrôle du site EN LIGNE est à part : `./scripts/verifier.sh <adresse>`
lit le sitemap publié et vérifie chaque adresse qu'il déclare, plus les
redirections, le flux RSS et les en-têtes de sécurité.

## Les redirections des anciennes adresses Framer

Elles vivent dans `vercel.json`, avec un **vrai 301** (`statusCode: 301` ;
`permanent: true` de Next ne produit qu'un 308).

**Une redirection permanente est mise en cache par le navigateur pour
toujours.** On n'en publie donc JAMAIS une dont la cible n'existe pas
encore : chaque redirection Framer s'ajoute au moment où sa page
d'arrivée est construite, pas avant.

## L'étanchéité des deux projets

- Côté site : `vercel.json` → `ignoreCommand`. Un commit qui ne touche pas
  `site/` n'entraîne aucun déploiement du site.

  **Piège de la première construction** : si le projet Vercel est créé alors
  que le dernier commit ne touchait pas `site/`, la règle s'applique aussi à
  lui — le projet existe et n'a jamais construit (`DEPLOYMENT_NOT_FOUND`).
  Un commit touchant `site/`, ou un « Redeploy » depuis le tableau de bord,
  le débloque. Cela n'arrive qu'une fois.
- Côté application : à régler dans le tableau de bord Vercel du projet de
  l'app (Settings → Git → Ignored Build Step), avec la commande
  `git diff --quiet HEAD^ HEAD -- . ':(exclude)site'`.
