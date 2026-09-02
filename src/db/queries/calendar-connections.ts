import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { calendarConnections, users, type CalendarConnection } from "@/db/schema";

/**
 * LA CONNEXION D'AGENDA d'une personne (Calendly en v1, §5.1) — une par
 * personne et par fournisseur (PK), l'organisation portée pour
 * l'isolation. Le jeton d'accès n'est JAMAIS ici : seulement la clé de
 * signature que nous avons générée, chiffrée (src/lib/crypto.ts).
 * Se reconnecter réutilise la ligne ; se déconnecter la garde
 * (`disconnected_at`) — le webhook ignore une connexion déconnectée.
 */

export async function getCalendarConnection(userId: string): Promise<CalendarConnection | null> {
  const row = await db.query.calendarConnections.findFirst({
    where: and(eq(calendarConnections.userId, userId), eq(calendarConnections.provider, "calendly")),
  });
  return row ?? null;
}

export async function saveCalendarConnection(input: {
  organizationId: string;
  userId: string;
  externalUserUri: string;
  externalOrganizationUri: string;
  subscriptionUri: string | null;
  signingKeyEncrypted: string;
}): Promise<void> {
  await db
    .insert(calendarConnections)
    .values({ ...input, provider: "calendly" })
    .onConflictDoUpdate({
      target: [calendarConnections.userId, calendarConnections.provider],
      set: {
        organizationId: input.organizationId,
        externalUserUri: input.externalUserUri,
        externalOrganizationUri: input.externalOrganizationUri,
        subscriptionUri: input.subscriptionUri,
        signingKeyEncrypted: input.signingKeyEncrypted,
        connectedAt: sql`now()`,
        disconnectedAt: null,
      },
    });
}

export async function disconnectCalendarConnection(userId: string): Promise<void> {
  await db
    .update(calendarConnections)
    .set({ disconnectedAt: sql`now()` })
    .where(and(eq(calendarConnections.userId, userId), eq(calendarConnections.provider, "calendly")));
}

export type ActiveConnection = {
  organizationId: string;
  userId: string;
  signingKeyEncrypted: string;
};

/**
 * La connexion ACTIVE de l'hôte d'un événement — l'email lu dans la
 * charge n'est qu'un INDICE de recherche : rien n'est cru tant que la
 * signature n'a pas validé le message entier (la leçon du `Return-Path`
 * de l'étape 3). L'email des personnes est unique en base.
 */
export async function findActiveConnectionByHostEmail(email: string): Promise<ActiveConnection | null> {
  const rows = await db
    .select({
      organizationId: calendarConnections.organizationId,
      userId: calendarConnections.userId,
      signingKeyEncrypted: calendarConnections.signingKeyEncrypted,
    })
    .from(calendarConnections)
    .innerJoin(users, eq(users.id, calendarConnections.userId))
    .where(
      and(
        sql`lower(${users.email}) = lower(${email})`,
        eq(calendarConnections.provider, "calendly"),
        isNull(calendarConnections.disconnectedAt)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function touchCalendarConnection(userId: string): Promise<void> {
  await db
    .update(calendarConnections)
    .set({ lastEventAt: sql`now()` })
    .where(and(eq(calendarConnections.userId, userId), eq(calendarConnections.provider, "calendly")));
}
