import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { appointments, contacts, users } from "@/db/schema";
import { orgScope } from "@/db/scope";
import { AppError } from "@/lib/errors";
import type { OrgScopeUser } from "@/lib/session";
import { getContact } from "./contacts";

/**
 * LES RENDEZ-VOUS (chantier engagement, Partie 3, §5.1) : saisis en un
 * clic depuis une fiche (`source` = manual) ou reçus de Calendly par
 * webhook (`source` = calendly — src/lib/calendly). Deux niveaux :
 * les fonctions de session (OrgScopeUser) pour les écrans et actions,
 * et les fonctions par organisation pour le webhook, qui n'a pas de
 * session — même découpage que l'ingestion d'emails.
 *
 * Un rendez-vous — pris ou saisi — ARRÊTE l'envoi automatique du contact
 * (`auto_send_stopped_at`, raison `appointment`) : le contact a réagi, la
 * machine se tait (§5.3). L'arrêt ne s'écrit que s'il n'existe pas déjà —
 * on ne remplace jamais une raison antérieure.
 */

export type AppointmentRow = {
  id: string;
  source: string;
  title: string | null;
  startsAt: Date;
  endsAt: Date | null;
  status: string;
  canceledAt: Date | null;
  notes: string | null;
  /** La personne de l'organisation qui reçoit — nom, sinon email. */
  hostLabel: string | null;
};

/** Les rendez-vous d'une fiche, les plus récents d'abord (à venir compris). */
export async function listContactAppointments(user: OrgScopeUser, contactId: string): Promise<AppointmentRow[]> {
  const rows = await db
    .select({
      id: appointments.id,
      source: appointments.source,
      title: appointments.title,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      status: appointments.status,
      canceledAt: appointments.canceledAt,
      notes: appointments.notes,
      hostName: users.name,
      hostEmail: users.email,
    })
    .from(appointments)
    .leftJoin(users, eq(users.id, appointments.userId))
    .where(and(orgScope(user, appointments.organizationId), eq(appointments.contactId, contactId)))
    .orderBy(desc(appointments.startsAt))
    .limit(50);
  return rows.map(({ hostName, hostEmail, ...row }) => ({ ...row, hostLabel: hostName ?? hostEmail ?? null }));
}

/**
 * L'arrêt de l'envoi automatique à la prise d'un rendez-vous — par
 * organisation (le webhook Calendly n'a pas de session). N'écrase jamais
 * un arrêt existant ; jamais sur une pierre tombale.
 */
export async function stopAutoSendOnAppointment(organizationId: string, contactId: string): Promise<void> {
  await db
    .update(contacts)
    .set({ autoSendStoppedAt: sql`now()`, autoSendStopReason: "appointment", updatedAt: sql`now()` })
    .where(
      and(
        eq(contacts.id, contactId),
        eq(contacts.organizationId, organizationId),
        isNull(contacts.autoSendStoppedAt),
        isNull(contacts.deletedAt)
      )
    );
}

export type ManualAppointmentInput = {
  contactId: string;
  /** null = maintenant (le formulaire vide vaut « rendez-vous maintenant »). */
  startsAt: Date | null;
  title?: string | null;
};

/** La saisie en un clic depuis une fiche — le contact doit être vivant et de l'organisation. */
export async function createManualAppointment(user: OrgScopeUser, createdBy: string, input: ManualAppointmentInput) {
  const contact = await getContact(user, input.contactId);
  if (contact.deletedAt) throw new AppError("ce_contact_a_ete_supprime");
  const [row] = await db
    .insert(appointments)
    .values({
      organizationId: contact.organizationId,
      contactId: contact.id,
      userId: createdBy,
      source: "manual",
      title: input.title?.trim() || null,
      startsAt: input.startsAt ?? new Date(),
      createdBy,
    })
    .returning({ id: appointments.id });
  await stopAutoSendOnAppointment(contact.organizationId, contact.id);
  return row;
}

/** L'annulation — le rendez-vous reste (statut `canceled`), les indicateurs l'ignorent. */
export async function cancelAppointment(user: OrgScopeUser, appointmentId: string): Promise<void> {
  const updated = await db
    .update(appointments)
    .set({ status: "canceled", canceledAt: sql`now()`, updatedAt: sql`now()` })
    .where(
      and(
        orgScope(user, appointments.organizationId),
        eq(appointments.id, appointmentId),
        eq(appointments.status, "scheduled")
      )
    )
    .returning({ id: appointments.id });
  if (updated.length === 0) throw new AppError("rendez_vous_introuvable_ou_deja_annule", undefined, 404);
}
