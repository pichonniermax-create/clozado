"use server";

import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { mailTargets, newsletterBlocks, newsletters } from "@/db/schema";
import { assertOrgAccess, orgScope } from "@/db/scope";
import { requireUser } from "@/lib/session";
import { NEWSLETTER_OUTPUT_SCHEMA, parseBlockPayload, type AnyBlock } from "./blocks";

/**
 * Server actions Drizzle pour `newsletters`/`newsletter_blocks`. Toute
 * l'isolation entre organisations passe par `orgScope`/`assertOrgAccess`
 * (src/db/scope.ts) — jamais un `organizationId` fourni par l'appelant :
 * il vient soit de la cible visée (`mail_targets.organizationId`), soit
 * d'une ligne déjà chargée et vérifiée.
 *
 * Remplacement des blocs en delete + insert atomiques via `db.batch()` —
 * pas `db.transaction()` : le driver `drizzle-orm/neon-http` utilisé par ce
 * projet ne supporte pas les transactions classiques (chaque requête est un
 * appel HTTP séparé), mais expose `db.batch()` qui s'appuie sur le vrai
 * mécanisme de transaction HTTP atomique de Neon.
 */

const saveInputSchema = NEWSLETTER_OUTPUT_SCHEMA.extend({
  id: z.uuid().optional(),
  targetId: z.uuid(),
  title: z.string().min(1),
  /** Brief saisi, réutilisé par "Concevoir avec l'IA" — vide si la newsletter n'en a pas (créée depuis un modèle). */
  brief: z.string().trim().optional(),
});

export type SaveNewsletterInput = z.infer<typeof saveInputSchema>;

export async function saveNewsletter(input: SaveNewsletterInput) {
  const user = await requireUser();
  const parsed = saveInputSchema.parse(input);

  const target = await db.query.mailTargets.findFirst({
    where: eq(mailTargets.id, parsed.targetId),
  });
  if (!target) {
    throw new Error("Cible introuvable.");
  }
  assertOrgAccess(user, target.organizationId);

  let newsletterId = parsed.id;
  if (newsletterId) {
    const existing = await db.query.newsletters.findFirst({
      where: eq(newsletters.id, newsletterId),
    });
    if (!existing) {
      throw new Error("Newsletter introuvable.");
    }
    assertOrgAccess(user, existing.organizationId);

    await db
      .update(newsletters)
      .set({
        title: parsed.title,
        targetId: parsed.targetId,
        subject: parsed.subject,
        preheader: parsed.preheader,
        brief: parsed.brief ?? null,
        updatedAt: new Date(),
      })
      .where(eq(newsletters.id, newsletterId));
  } else {
    const [created] = await db
      .insert(newsletters)
      .values({
        organizationId: target.organizationId,
        title: parsed.title,
        targetId: parsed.targetId,
        subject: parsed.subject,
        preheader: parsed.preheader,
        brief: parsed.brief ?? null,
        createdBy: user.id,
      })
      .returning({ id: newsletters.id });
    newsletterId = created.id;
  }

  const insertValues = parsed.blocks.map((block, position) => {
    const { type, ...payload } = block;
    return { newsletterId: newsletterId!, type, position, payload };
  });

  await db.batch([
    db.delete(newsletterBlocks).where(eq(newsletterBlocks.newsletterId, newsletterId)),
    db.insert(newsletterBlocks).values(insertValues),
  ]);

  return newsletterId;
}

export async function loadNewsletter(id: string) {
  const user = await requireUser();

  const newsletter = await db.query.newsletters.findFirst({
    where: eq(newsletters.id, id),
  });
  if (!newsletter) {
    throw new Error("Newsletter introuvable.");
  }
  assertOrgAccess(user, newsletter.organizationId);

  const rows = await db.query.newsletterBlocks.findMany({
    where: eq(newsletterBlocks.newsletterId, id),
    orderBy: asc(newsletterBlocks.position),
  });

  // `parseBlockPayload` a déjà validé chaque payload contre le schéma de
  // son type au chargement — reconstituer `{ type, ...payload }` reproduit
  // exactement la forme validée, jamais une forme devinée.
  const blocks = rows.map(
    (row) => ({ type: row.type, ...parseBlockPayload(row.type, row.payload) }) as AnyBlock
  );

  return { newsletter, blocks };
}

export async function listNewsletters() {
  const user = await requireUser();
  const scope = orgScope(user, newsletters.organizationId);
  const query = db.select().from(newsletters).orderBy(desc(newsletters.updatedAt));
  return scope ? query.where(scope) : query;
}

/** Garde d'auteur : suppression seulement par le créateur (au-delà de l'isolation d'organisation). */
export async function deleteNewsletter(id: string) {
  const user = await requireUser();

  const newsletter = await db.query.newsletters.findFirst({
    where: eq(newsletters.id, id),
  });
  if (!newsletter) {
    throw new Error("Newsletter introuvable.");
  }
  assertOrgAccess(user, newsletter.organizationId);

  if (newsletter.createdBy !== user.id) {
    throw new Error("Accès refusé : seul le créateur peut supprimer cette newsletter.");
  }

  // `newsletter_blocks.newsletter_id` est ON DELETE CASCADE : pas de
  // suppression manuelle des blocs à faire ici.
  await db.delete(newsletters).where(eq(newsletters.id, id));
}
