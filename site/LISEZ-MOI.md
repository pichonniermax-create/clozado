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
- Côté application : à régler dans le tableau de bord Vercel du projet de
  l'app (Settings → Git → Ignored Build Step), avec la commande
  `git diff --quiet HEAD^ HEAD -- . ':(exclude)site'`.
