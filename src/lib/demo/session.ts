import { cache } from "react";
import { cookies } from "next/headers";
import { decode, encode } from "next-auth/jwt";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { DEMO_COOKIE, DEMO_SESSION_MAX_AGE } from "./public";

/**
 * LA SESSION DE VISITE de la démo publique (docs/module-demo.md §1.4) : un
 * visiteur sans compte entre dans l'organisation de démo à la place de sa
 * persona (l'admin fondatrice), en lecture seule. Le cookie porte un JWT
 * signé par `AUTH_SECRET` avec son propre sel — jamais un cookie Auth.js —
 * et chaque requête revérifie EN BASE que l'organisation est toujours démo
 * ET publique : éteindre l'interrupteur tue toutes les visites à la
 * requête suivante. Toute anomalie (signature, expiration, organisation
 * fermée, persona disparue) vaut « pas de visiteur » — jamais une erreur.
 */

export type DemoClaims = { org: string; uid: string; demo: true };

export type DemoVisitorUser = {
  id: string;
  email: string;
  name: string | null;
  role: "admin";
  organizationId: string;
  readOnly: true;
};

function secret(): string {
  const value = process.env.AUTH_SECRET;
  // eslint-disable-next-line local/no-visible-text -- invariant de configuration, jamais affiché à une personne
  if (!value) throw new Error("AUTH_SECRET manquante : la session de visite ne peut être ni signée ni lue.");
  return value;
}

/** L'organisation de démo ouverte au public — la seule (index unique) et seulement si l'interrupteur est allumé. */
export async function getPublicDemoOrganization() {
  const rows = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.isDemo, true), eq(organizations.demoPublicEnabled, true)))
    .limit(1);
  return rows[0] ?? null;
}

/** La persona du visiteur : l'admin de l'organisation de démo (le plus ancien — le semis n'en crée qu'un). */
export async function getDemoPersona(organizationId: string) {
  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.organizationId, organizationId), eq(users.role, "admin")))
    .orderBy(asc(users.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function issueDemoToken(claims: DemoClaims): Promise<string> {
  return encode<DemoClaims>({ token: claims, secret: secret(), salt: DEMO_COOKIE, maxAge: DEMO_SESSION_MAX_AGE });
}

/**
 * Le visiteur de la requête courante, ou null. Mis en cache par requête :
 * la coquille, les réglages d'affichage et chaque page l'appellent.
 */
export const readDemoVisitor = cache(async (): Promise<{ organizationId: string; user: DemoVisitorUser } | null> => {
  const store = await cookies().catch(() => null);
  const raw = store?.get(DEMO_COOKIE)?.value;
  if (!raw) return null;
  let claims: DemoClaims | null = null;
  try {
    claims = (await decode<DemoClaims>({ token: raw, secret: secret(), salt: DEMO_COOKIE })) ?? null;
  } catch {
    claims = null;
  }
  if (!claims || claims.demo !== true || typeof claims.org !== "string" || typeof claims.uid !== "string") return null;
  const org = await getPublicDemoOrganization();
  if (!org || org.id !== claims.org) return null;
  const persona = (await db.select().from(users).where(and(eq(users.id, claims.uid), eq(users.organizationId, org.id))).limit(1))[0];
  if (!persona) return null;
  return {
    organizationId: org.id,
    user: { id: persona.id, email: persona.email, name: persona.name, role: "admin", organizationId: org.id, readOnly: true },
  };
});
