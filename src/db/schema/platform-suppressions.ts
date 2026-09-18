import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * LA LISTE REPOUSSOIR DE LA PLATEFORME (chantier envoi, garde-fous).
 *
 * `email_suppressions` est par ORGANISATION : une désinscription chez le
 * cabinet A ne regarde pas le cabinet B, et c'est juste — chacun est un
 * expéditeur distinct. Mais un REBOND DUR (l'adresse n'existe pas) et une
 * PLAINTE (« ceci est un spam ») ne parlent pas de la relation avec un
 * cabinet : ils parlent de l'adresse et de la réputation de tout le
 * service. Réécrire à une adresse morte depuis une autre organisation, ou
 * réécrire à quelqu'un qui a cliqué « spam », abîme la délivrabilité de
 * TOUS les clients — c'est d'ailleurs ce qu'imposent les fournisseurs
 * d'envoi (règle validée par l'utilisateur : « à l'échelle de la
 * plateforme »).
 *
 * L'adresse n'est jamais stockée en clair : seulement son EMPREINTE
 * (sha256 de l'adresse en minuscules, sans espace). La ligne survit donc à
 * la suppression de la fiche et de l'organisation, sans conserver de donnée
 * personnelle lisible — c'est la forme que la CNIL attend d'une liste
 * repoussoir. Rien ne relie l'empreinte à une organisation : la liste est
 * commune, et un envoi la consulte avant toute chose.
 *
 * IRRÉVERSIBLE par nature. Le seul retour possible est humain et rare (une
 * adresse rendue valide) : il passe par le super admin, qui répond de la
 * réputation du service, jamais par une organisation cliente.
 */
export const platformSuppressions = pgTable(
  "platform_suppressions",
  {
    /** sha256 hexadécimal de l'adresse en minuscules — 64 caractères. */
    emailSha256: text("email_sha256").primaryKey(),
    /** `bounced` : rebond DUR (adresse inexistante). `complained` : plainte pour spam. */
    reason: text("reason").notNull(),
    /** Combien de fois le cas s'est reproduit, toutes organisations confondues. */
    occurrences: integer("occurrences").notNull().default(1),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    /** Ce que le fournisseur a dit, en clair, pour qu'un humain puisse trancher un cas limite. */
    detail: text("detail"),
  },
  (table) => [
    check("platform_suppressions_reason_check", sql`${table.reason} IN ('bounced', 'complained')`),
    check("platform_suppressions_hash_check", sql`${table.emailSha256} ~ '^[0-9a-f]{64}$'`),
  ]
);

export type PlatformSuppression = typeof platformSuppressions.$inferSelect;
