# Module PRM — partage d'affaires entre apporteurs

Notes de suivi du chantier, pas une documentation utilisateur. Complète au
fil de l'eau — voir `docs/module-mails.md` pour l'équivalent côté mailing.

## Chantiers ouverts, laissés tels quels délibérément

### Limitation de débit de la route publique (`/api/partage/[token]`)

`src/lib/deal-shares/rate-limit.ts` est **en mémoire, par instance**. Sur
Vercel (serverless, instances multiples et éphémères), ce compteur n'est
pas partagé entre instances : il freine un script naïf qui tape la même
instance en rafale, il ne bloque pas un attaquant qui distribue ses
requêtes. Décision au moment de la construction de la route (commit
`41b25c1`) : gardé tel quel pour l'instant, pas de table Postgres ni de
Redis/Upstash dédié.

Ce n'est pas la défense principale contre le brute-force — l'entropie du
jeton (256 bits) rend déjà l'énumération infaisable, rate-limité ou pas. Ce
limiteur sert uniquement à freiner l'abus/la charge.

**Si ça doit être renforcé un jour** : compteur centralisé (table Postgres
dédiée aux tentatives, ou Redis/Upstash), migration à montrer avant
application, comme pour toute évolution de schéma de ce module.
