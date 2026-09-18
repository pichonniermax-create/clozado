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
