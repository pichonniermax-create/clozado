# Clozado

Suite d'outils d'assistance marketing pour des clients (courtiers, PME) qui
gardent leur propre CRM. Clozado n'est **pas** un CRM.

## Stack

- [Next.js](https://nextjs.org) (App Router) + TypeScript
- [Drizzle ORM](https://orm.drizzle.team) sur Postgres ([Neon](https://neon.tech))
- [Auth.js](https://authjs.dev)
- [Tailwind CSS](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com)
- Déploiement sur [Vercel](https://vercel.com) (auto-deploy sur push `main`)

## Développement

```bash
npm install
npm run dev
```

Le typecheck local est volontairement désactivé dans le workflow : c'est le
build Vercel qui valide chaque déploiement.
