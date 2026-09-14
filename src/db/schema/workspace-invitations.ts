import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * LES INVITATIONS À CRÉER UN ESPACE (chantier « invitations d'espaces »,
 * docs/module-invitations.md) : le super admin génère un lien pour une
 * entreprise qu'il a rencontrée ; la personne qui l'ouvre crée son espace
 * en une minute, avec le nom et la langue déjà remplis. C'est un second
 * chemin d'entrée à côté de l'inscription libre — ni un remplacement, ni
 * une invitation de MEMBRE dans un espace existant (un autre chantier).
 *
 * Le jeton en clair n'est jamais stocké tel quel : son empreinte SHA-256
 * sert à le retrouver (`token_hash`, unique), et une copie chiffrée
 * (`token_encrypted`, AES-256-GCM avec une clé dérivée par usage,
 * src/lib/crypto.ts) permet au super admin de recopier le lien depuis la
 * liste sans en générer un nouveau. Une invitation ne sert qu'UNE fois :
 * `used_at` est posé par une écriture atomique (UPDATE … WHERE used_at IS
 * NULL … RETURNING) avant toute création, jamais après.
 *
 * Sans clé étrangère bloquante : l'organisation créée reste liée par
 * `organization_id` (mise à NULL si elle disparaît), l'auteur par
 * `created_by` (idem) — le journal survit aux deux.
 */
export const workspaceInvitations = pgTable(
  "workspace_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** L'empreinte SHA-256 (hexadécimal) du jeton présenté dans le lien — la clé de recherche. */
    tokenHash: text("token_hash").notNull().unique(),
    /** Le jeton chiffré (`v1:…`, src/lib/crypto.ts, usage `workspace-invitation`) — pour recopier le lien. */
    tokenEncrypted: text("token_encrypted").notNull(),
    /** Le nom d'entreprise proposé, pré-rempli à l'inscription (modifiable par la personne). */
    organizationName: text("organization_name").notNull(),
    /** L'adresse à laquelle le lien est réservé ; NULL = quiconque ouvre le lien. En minuscules. */
    email: text("email"),
    /** La langue de l'espace créé (« fr », « en ») et de l'email d'invitation — validée dans le code contre la liste des langues. */
    locale: text("locale").notNull().default("fr"),
    /** Une note interne du super admin (« rencontré au salon du courtage ») — jamais montrée à la personne invitée. */
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    /** L'adresse de l'auteur au moment de la création — survit à la disparition du compte. */
    createdByEmail: text("created_by_email"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** Le dernier envoi de l'email d'invitation (NULL = jamais envoyé, le lien a été transmis autrement). */
    sentAt: timestamp("sent_at", { withTimezone: true }),
    /** Le moment où le lien a servi — posé AVANT la création de l'espace, de façon atomique. */
    usedAt: timestamp("used_at", { withTimezone: true }),
    /** L'adresse qui a effectivement créé l'espace (égale à `email` quand le lien était réservé). */
    usedByEmail: text("used_by_email"),
    /** L'espace créé par cette invitation. */
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    // Une invitation utilisée l'a été par quelqu'un ; une invitation non utilisée n'a ni adresse d'usage ni espace.
    check(
      "workspace_invitations_used_consistency",
      sql`(${table.usedAt} IS NULL AND ${table.usedByEmail} IS NULL AND ${table.organizationId} IS NULL) OR (${table.usedAt} IS NOT NULL AND ${table.usedByEmail} IS NOT NULL)`
    ),
    check("workspace_invitations_expires_after_creation", sql`${table.expiresAt} > ${table.createdAt}`),
    index("workspace_invitations_created_idx").on(table.createdAt),
    index("workspace_invitations_organization_idx").on(table.organizationId),
  ]
);

export type WorkspaceInvitation = typeof workspaceInvitations.$inferSelect;
