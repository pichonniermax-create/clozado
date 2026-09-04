import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Le journal des créations et réinitialisations de l'organisation de démo
 * (docs/module-demo.md §1.1 et §1.7) : chaque passage y laisse une ligne —
 * qui l'a demandé, quand, ce qui a été supprimé (comptes par table, AVANT)
 * et re-créé (comptes par table, APRÈS), l'erreur éventuelle.
 *
 * Volontairement SANS clé étrangère vers `organizations` : la
 * réinitialisation supprime la ligne de l'organisation (la cascade emporte
 * tout), et le journal doit y survivre. L'identifiant de la démo est fixe
 * d'une réinitialisation à l'autre (src/lib/demo/constants.ts).
 */
export const demoResets = pgTable(
  "demo_resets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    organizationSlug: text("organization_slug").notNull(),
    requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
    /** L'adresse au moment de la demande — survit à la disparition du compte. */
    requestedByEmail: text("requested_by_email"),
    /** `seed` : création (rien n'est supprimé) ; `reset` : suppression puis re-création. */
    kind: text("kind").notNull(),
    status: text("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    error: text("error"),
    /** Comptes par table avant la suppression (`{ contacts: 41, deals: 26, … }`). */
    deleted: jsonb("deleted"),
    /** Comptes par table après la re-création. */
    created: jsonb("created"),
  },
  (table) => [
    check("demo_resets_kind_check", sql`${table.kind} IN ('seed', 'reset')`),
    check("demo_resets_status_check", sql`${table.status} IN ('running', 'done', 'failed')`),
    check("demo_resets_finished_consistency", sql`(${table.status} = 'running') = (${table.finishedAt} IS NULL)`),
    index("demo_resets_started_idx").on(table.startedAt),
  ]
);

export type DemoReset = typeof demoResets.$inferSelect;
