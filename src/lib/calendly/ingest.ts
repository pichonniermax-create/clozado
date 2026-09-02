import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { stopAutoSendOnAppointment } from "@/db/queries/appointments";
import { touchCalendarConnection } from "@/db/queries/calendar-connections";

/**
 * L'écriture d'un événement Calendly VÉRIFIÉ (signature passée) — §5.1 :
 * `invitee.created` → un rendez-vous (`external_id` = l'URI de l'invité,
 * unique par organisation : un rejeu ne crée rien), contact retrouvé par
 * email dans l'organisation de l'hôte, créé sinon (`source = external`,
 * `external_system = calendly`, `external_id` = l'URI de l'invité — la
 * paire est exigée par les CHECK de `contacts` ; les réservations
 * suivantes retrouvent la fiche par email) ; l'envoi automatique
 * s'arrête (raison `appointment`). `invitee.canceled` → statut `canceled`,
 * le rendez-vous reste, les indicateurs l'ignorent.
 */

export const CALENDLY_EVENT_SCHEMA = z.object({
  event: z.string(),
  payload: z.object({
    /** L'URI de l'invité — l'identité du rendez-vous, stable entre created et canceled. */
    uri: z.string().min(1),
    email: z.string().min(3),
    name: z.string().nullish(),
    first_name: z.string().nullish(),
    last_name: z.string().nullish(),
    scheduled_event: z.object({
      name: z.string().nullish(),
      start_time: z.string().min(1),
      end_time: z.string().nullish(),
      event_memberships: z.array(z.object({ user_email: z.string().nullish() })).default([]),
    }),
  }),
});

export type CalendlyEvent = z.infer<typeof CALENDLY_EVENT_SCHEMA>;

/** Les emails d'hôte de la charge — de simples INDICES de recherche de la connexion, jamais crus sans signature. */
export function hostEmailsOf(event: CalendlyEvent): string[] {
  return event.payload.scheduled_event.event_memberships
    .map((m) => m.user_email?.trim() ?? "")
    .filter((email) => email.length > 0);
}

/** La fiche vivante la plus ancienne portant cette adresse — la fiche « principale » quand il y a des doublons. */
async function findContactByEmail(organizationId: string, email: string): Promise<string | null> {
  const rows = await db.execute(sql`
    select id from ${contacts}
    where organization_id = ${organizationId} and lower(email) = lower(${email}) and deleted_at is null
    order by created_at asc limit 1`);
  return (rows.rows[0] as { id: string } | undefined)?.id ?? null;
}

async function ensureContact(organizationId: string, event: CalendlyEvent): Promise<string> {
  const { email, name, first_name, last_name, uri } = event.payload;
  const existing = await findContactByEmail(organizationId, email);
  if (existing) return existing;
  const inserted = await db
    .insert(contacts)
    .values({
      organizationId,
      kind: "person",
      name: name?.trim() || email,
      firstName: first_name?.trim() || null,
      lastName: last_name?.trim() || null,
      email,
      source: "external",
      externalSystem: "calendly",
      externalId: uri,
    })
    .onConflictDoNothing()
    .returning({ id: contacts.id });
  if (inserted[0]) return inserted[0].id;
  // Course perdue (rejeu simultané) : la fiche vient d'être créée par l'autre écriture.
  const again = await findContactByEmail(organizationId, email);
  if (again) return again;
  // eslint-disable-next-line local/no-visible-text -- invariant interne du webhook, jamais montré à une personne
  throw new Error("contact Calendly ni trouvé ni créé");
}

export type CalendlyOutcome = "recorded" | "replayed" | "canceled" | "ignored";

export async function ingestCalendlyEvent(
  connection: { organizationId: string; userId: string },
  event: CalendlyEvent
): Promise<CalendlyOutcome> {
  await touchCalendarConnection(connection.userId);

  if (event.event === "invitee.created") {
    const startsAt = new Date(event.payload.scheduled_event.start_time);
    if (Number.isNaN(startsAt.getTime())) return "ignored";
    const endsAtRaw = event.payload.scheduled_event.end_time;
    const endsAt = endsAtRaw ? new Date(endsAtRaw) : null;
    const contactId = await ensureContact(connection.organizationId, event);
    const inserted = await db.execute(sql`
      insert into appointments (organization_id, contact_id, user_id, source, external_id, title, starts_at, ends_at)
      values (${connection.organizationId}, ${contactId}, ${connection.userId}, 'calendly', ${event.payload.uri},
              ${event.payload.scheduled_event.name?.trim() || null}, ${startsAt.toISOString()},
              ${endsAt && !Number.isNaN(endsAt.getTime()) ? endsAt.toISOString() : null})
      on conflict (organization_id, external_id) where external_id is not null do nothing
      returning id`);
    if (inserted.rows.length === 0) return "replayed";
    await stopAutoSendOnAppointment(connection.organizationId, contactId);
    return "recorded";
  }

  if (event.event === "invitee.canceled") {
    const updated = await db.execute(sql`
      update appointments set status = 'canceled', canceled_at = now(), updated_at = now()
      where organization_id = ${connection.organizationId} and external_id = ${event.payload.uri} and status = 'scheduled'
      returning id`);
    return updated.rows.length > 0 ? "canceled" : "ignored";
  }

  return "ignored";
}
