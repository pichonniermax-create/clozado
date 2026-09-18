# La page de réservation — raccordement à l'agenda Google

Chantier « page de réservation sur mesure ». Ce document est la procédure
d'exploitation : ce qu'il faut créer chez Google, comment obtenir le jeton,
et — surtout — comment le révoquer.

## 1. Le client OAuth, une fois

Console Google Cloud → *Google Auth Platform* → *Clients* → **Application
Web**. Deux URI de redirection à enregistrer, **à la lettre près** (schéma,
hôte, port, casse, pas de slash final) :

```
https://app.clozado.fr/api/google/callback
http://localhost:3000/api/google/callback
```

Google compare cette adresse caractère par caractère : une différence, et le
consentement s'arrête sur `redirect_uri_mismatch`. Les adresses de
prévisualisation Vercel (sous-domaine généré à chaque déploiement) ne peuvent
pas être enregistrées : le raccordement ne se fait que depuis le local ou la
production.

**L'écran de consentement doit être publié** (*In production*). Tant qu'il
est en *Testing*, Google fait expirer le jeton de rafraîchissement au bout de
sept jours — « ça marchait, ça a cassé une semaine plus tard ».

`GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` vont dans les variables
d'environnement (local et Vercel).

## 2. Le jeton, une fois

1. Se connecter en **super admin** (le rôle réel : la substitution dans une
   organisation ne donne pas accès à cette route).
2. Ouvrir `https://app.clozado.fr/api/google/connect` (ou
   `http://localhost:3000/api/google/connect`) **à la main**, dans la barre
   d'adresse. Ce n'est lié depuis aucun écran : une route qui agit ne se
   clique pas par mégarde.
3. Consentir en laissant les **deux** autorisations cochées. Le consentement
   granulaire permet d'en décocher une : le produit refuse alors le jeton et
   le révoque immédiatement, plutôt que d'échouer des semaines plus tard.
4. La page de retour affiche le jeton **une seule fois**. Le copier dans
   `GOOGLE_REFRESH_TOKEN`, en local et sur Vercel.

Le jeton n'est écrit nulle part : ni en base, ni dans un fichier, ni dans un
journal. Fermer la page sans copier, c'est devoir recommencer — et révoquer
l'ancien, qui reste valide chez Google.

Les deux portées demandées, et rien d'autre :

| Portée | Ce qu'elle permet |
|---|---|
| `calendar.freebusy` | lire les plages OCCUPÉES de l'agenda (jamais le contenu des événements) |
| `calendar.events` | créer, modifier et supprimer les événements de rendez-vous |

## 3. La révocation — le geste normal, pas l'incident

C'est la seule vraie parade si le jeton a pu être vu (capture d'écran, proxy
d'entreprise qui déchiffre le trafic, épaule indiscrète) :

1. <https://myaccount.google.com/permissions> → l'application → *Supprimer
   l'accès* ; ou `POST https://oauth2.googleapis.com/revoke` avec
   `token=<le jeton>`.
2. Relancer `/api/google/connect` et recopier le nouveau jeton.

À faire sans hésiter : un jeton révoqué ne coûte qu'un consentement.

Deux limites à connaître : Google plafonne à **100 jetons de
rafraîchissement** par compte et par client (au-delà, le plus ancien est
invalidé sans avertissement), et un jeton inutilisé **six mois** expire.

## 4. Ce que le produit refuse

| Situation | Réponse |
|---|---|
| Visiteur anonyme, member, admin d'organisation | `404` — la route ne s'annonce pas |
| Super admin, sans `GOOGLE_CLIENT_ID`/`SECRET` | `503`, écran qui le dit |
| Préchargement du routeur | `204`, aucun cookie posé |
| `HEAD`, `POST` | `405` |
| Retour sans état valide (ou rejoué) | `400`, cookie effacé |
| Consentement refusé chez Google | `400`, rien d'enregistré |
| Autorisation amputée d'une portée | `400`, jeton révoqué |
| Cookie de la démonstration publique présent | `403` (le proxy refuse toute route `/api`) |

L'état du consentement vit dans un cookie **chiffré** (AES-256-GCM, clé
dérivée d'`AUTH_SECRET`), valable dix minutes, effacé à la première
tentative : il porte le jeton anti-CSRF, le vérifieur PKCE et l'adresse de
retour utilisée à l'aller.
