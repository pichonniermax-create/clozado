import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Un "organizations" = un espace client isolé (un courtier, une PME...).
 * Toute donnée métier de l'app appartiendra toujours à une organisation.
 */
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** Identifiant court et lisible (ex: "dupont"), unique. Utile pour de futures URLs propres. */
  slug: text("slug").notNull().unique(),
  // --- Marque blanche (socle) ---
  /** Lien vers une image déjà hébergée ailleurs, pas d'upload pour l'instant. */
  logoUrl: text("logo_url"),
  /** Texte de lockup affiché à la place/à côté du logo (ex: deux mots séparés). */
  logoLockupText: text("logo_lockup_text"),
  /** Couleur principale de la marque, en hexadécimal (ex: "#2563eb"). */
  primaryColor: text("primary_color"),
  /** Couleur secondaire de la marque, en hexadécimal. */
  secondaryColor: text("secondary_color"),
  /** Couleur de texte principale (encre), en hexadécimal. */
  inkColor: text("ink_color"),
  /** Couleur de fond de page (hors carte/contenu), en hexadécimal. */
  backgroundColor: text("background_color"),
  /** Police des titres (ex: "Playfair Display"). */
  headingFontFamily: text("heading_font_family"),
  /** Pile de secours web-safe pour la police des titres (ex: 'Georgia, "Times New Roman", serif'). */
  headingFontFallback: text("heading_font_fallback"),
  /** Nom de la police du corps de texte (ex: "Inter"), simple préférence stockée. */
  fontFamily: text("font_family"),
  /** Pile de secours web-safe pour la police du corps (ex: "Arial, Helvetica, sans-serif"). */
  bodyFontFallback: text("body_font_fallback"),
  /** Rayon de bordure du design system, en pixels (ex: 0 pour des angles vifs). */
  borderRadius: integer("border_radius"),
  // --- Profil éditorial (injecté dans le prompt IA, jamais en dur dans le code) ---
  /** Accroche de marque courte. */
  tagline: text("tagline"),
  /** Description du ton de voix éditorial de l'organisation. */
  toneOfVoice: text("tone_of_voice"),
  /** Règles/interdits/contexte métier libres, injectés dans le prompt IA. */
  editorialGuidelines: text("editorial_guidelines"),
  // --- Seuils du suivi PRM (écran de suivi des affaires partagées) ---
  // Valeurs par défaut posées ici (DEFAULT en base, jamais en dur dans le
  // code de l'écran) — pas d'écran de réglages pour les changer pour
  // l'instant : à rendre modifiable si un client indique qu'elles ne
  // collent pas à son métier.
  /** Jours sans réponse avant qu'un partage "en attente" soit signalé (ni urgent, ni neutre). */
  sharePendingReminderDays: integer("share_pending_reminder_days").notNull().default(3),
  /** Jours sans réponse avant qu'un partage "en attente" devienne critique (rouge). */
  sharePendingUrgentDays: integer("share_pending_urgent_days").notNull().default(7),
  /** Jours restants avant expiration à partir desquels un partage "en attente" devient critique (rouge), indépendamment de son ancienneté. */
  shareExpiringSoonDays: integer("share_expiring_soon_days").notNull().default(2),
  /** Jours sans événement (statut changé, commentaire) après acceptation avant qu'un partage "accepté" soit signalé comme sans suite. */
  dealAcceptedStaleDays: integer("deal_accepted_stale_days").notNull().default(5),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
