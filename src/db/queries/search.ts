import { and, asc, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { contacts, deals, partners, tasks } from "@/db/schema";
import type { OrgScopeUser } from "@/lib/session";

/**
 * LA RECHERCHE GLOBALE de la palette de commandes (chantier UI/UX) : ce
 * que la personne cherche par son nom, dans les trois dossiers du produit
 * — contacts, affaires, partenaires — et dans ses tâches ouvertes
 * (correctif du 2026-09-17 : la palette cherche ce qu'elle annonce),
 * limité à quelques résultats chacun,
 * TOUJOURS dans son organisation (le WHERE porte sur `user.organizationId`,
 * jamais sur un identifiant reçu). Une recherche sans organisation (vue
 * globale super admin) ne rend rien. Le motif est échappé : « % » et « _ »
 * saisis restent des caractères, pas des jokers.
 */
export type SearchHit = { kind: "contact" | "deal" | "partner" | "task"; id: string; title: string; subtitle: string | null; href: string };

export const SEARCH_LIMIT_PER_KIND = 5;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function searchEverything(user: OrgScopeUser, query: string): Promise<SearchHit[]> {
  const organizationId = user.organizationId;
  const needle = query.trim();
  if (!organizationId || needle.length < 2 || needle.length > 80) return [];
  const like = `%${escapeLike(needle)}%`;

  const [contactRows, dealRows, partnerRows, taskRows] = await Promise.all([
    db
      .select({ id: contacts.id, name: contacts.name, email: contacts.email, companyName: contacts.companyName })
      .from(contacts)
      .where(and(eq(contacts.organizationId, organizationId), isNull(contacts.deletedAt), or(ilike(contacts.name, like), ilike(contacts.email, like), ilike(contacts.companyName, like))))
      .orderBy(desc(contacts.updatedAt))
      .limit(SEARCH_LIMIT_PER_KIND),
    db
      .select({ id: deals.id, title: deals.title, clientName: deals.clientName })
      .from(deals)
      .where(and(eq(deals.organizationId, organizationId), or(ilike(deals.title, like), ilike(deals.clientName, like))))
      .orderBy(desc(deals.updatedAt))
      .limit(SEARCH_LIMIT_PER_KIND),
    db
      .select({ id: partners.id, name: partners.name, company: partners.company })
      .from(partners)
      .where(and(eq(partners.organizationId, organizationId), or(ilike(partners.name, like), ilike(partners.company, like))))
      .orderBy(desc(partners.updatedAt))
      .limit(SEARCH_LIMIT_PER_KIND),
    // Les tâches OUVERTES, par leur titre ; la fiche liée en sous-titre. L'écran des tâches les montre par `?tache=`.
    db
      .select({ id: tasks.id, title: tasks.title, dealTitle: deals.title, contactName: contacts.name })
      .from(tasks)
      .leftJoin(deals, eq(tasks.dealId, deals.id))
      .leftJoin(contacts, eq(tasks.contactId, contacts.id))
      .where(and(eq(tasks.organizationId, organizationId), eq(tasks.status, "open"), ilike(tasks.title, like)))
      .orderBy(asc(tasks.dueAt), desc(tasks.createdAt))
      .limit(SEARCH_LIMIT_PER_KIND),
  ]);

  return [
    ...contactRows.map((c) => ({ kind: "contact" as const, id: c.id, title: c.name, subtitle: c.companyName || c.email || null, href: `/contacts/${c.id}` })),
    ...dealRows.map((d) => ({ kind: "deal" as const, id: d.id, title: d.title, subtitle: d.clientName, href: `/affaires/${d.id}` })),
    ...partnerRows.map((p) => ({ kind: "partner" as const, id: p.id, title: p.name, subtitle: p.company, href: `/partenaires/${p.id}` })),
    ...taskRows.map((t) => ({ kind: "task" as const, id: t.id, title: t.title, subtitle: t.dealTitle ?? t.contactName ?? null, href: `/taches?tache=${t.id}` })),
  ];
}
