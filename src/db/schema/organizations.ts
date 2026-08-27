import { sql } from "drizzle-orm";
import { boolean, check, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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
  /**
   * Jours pendant lesquels une commission confirmée peut rester non réglée
   * avant de générer une tâche de relance (règle commission_unpaid de
   * `tasks`). La date de confirmation est approchée par la dernière
   * modification de la commission — même approximation, déjà documentée,
   * que la pile « commissions à encaisser » de l'écran de suivi.
   */
  commissionUnpaidDays: integer("commission_unpaid_days").notNull().default(14),
  // --- Acquisition (module analytique) — les clés de site vivent dans `site_keys` ---
  /**
   * Les domaines depuis lesquels `POST /api/events` est accepté pour cette
   * organisation (en-tête Origin du navigateur) — vide = rien n'est
   * accepté : sans domaine déclaré, n'importe qui pourrait polluer le
   * funnel amont.
   */
  allowedDomains: text("allowed_domains").array().notNull().default([]),
  // --- Pack métier (module analytique, étape 6) ---
  /**
   * La clé du pack métier choisi dans Marque & réglages (`BUSINESS_PACKS`,
   * src/lib/metrics/packs.ts) : c'est lui qui décide des indicateurs mis
   * en avant sur le tableau de bord. NULL = pas encore choisi — le tableau
   * de bord montre alors le pack « tout métier » et le dit. Validée dans le
   * code contre le registre des packs, pas par une contrainte : un pack
   * s'ajoute sans migration.
   */
  businessPack: text("business_pack"),
  // --- Marque blanche et internationalisation (chantier du 2026-08-26, migration 0015) ---
  /** Le nom d'expéditeur des emails (« Cabinet Dupont ») ; NULL = le nom de l'organisation. */
  senderName: text("sender_name"),
  /** L'adresse d'expéditeur souhaitée ; en Reply-To tant que le domaine d'expédition n'est pas vérifié. */
  senderEmail: text("sender_email"),
  /** Le domaine d'expédition (« cabinet-dupont.fr ») et sa vérification chez le fournisseur — schéma seulement, la mécanique viendra. */
  emailDomain: text("email_domain"),
  emailDomainVerifiedAt: timestamp("email_domain_verified_at", { withTimezone: true }),
  /** Le domaine de l'application propre à l'organisation — schéma seulement, la mécanique viendra. */
  customDomain: text("custom_domain"),
  customDomainVerifiedAt: timestamp("custom_domain_verified_at", { withTimezone: true }),
  /** La langue par défaut de l'interface (« fr », « en ») — validée dans le code contre la liste des langues, pas par une contrainte : une langue s'ajoute sans migration. */
  defaultLocale: text("default_locale").notNull().default("fr"),
  /** La devise d'affichage, ISO 4217 (« EUR », « CHF », « CAD »). */
  currency: text("currency").notNull().default("EUR"),
  /** Le fuseau de l'organisation (« Europe/Paris », « Europe/London », « America/Montreal ») — remplace le fuseau unique du produit. */
  timezone: text("timezone").notNull().default("Europe/Paris"),
  // --- Engagement (chantier du 2026-08-27, migration 0016) : le domaine d'expédition, tel que le fournisseur le voit ---
  /** L'identifiant du domaine chez le fournisseur d'envoi (Resend) ; NULL = jamais déclaré. */
  emailDomainProviderId: text("email_domain_provider_id"),
  /** Le statut global rendu par le fournisseur (« not_started », « pending », « verified », « failed », « temporary_failure ») — texte, jamais une liste figée. */
  emailDomainStatus: text("email_domain_status"),
  /** Les enregistrements DNS TELS QUE RENVOYÉS par le fournisseur, avec leur statut, plus notre ligne DMARC — jamais recomposés par le code. */
  emailDomainRecords: jsonb("email_domain_records"),
  emailDomainCheckedAt: timestamp("email_domain_checked_at", { withTimezone: true }),
  /** La dernière erreur de vérification (réseau, fournisseur), lisible — jamais un échec muet. */
  emailDomainCheckError: text("email_domain_check_error"),
  // --- Engagement : le pied de page conforme — les FAITS de l'organisation (le profil par pays vit en données, src/lib/email/footer-profiles.ts) ---
  /** Le pays de l'organisation, ISO 3166-1 alpha-2 (« FR », « CH », « CA ») ; NULL = le profil européen par défaut. */
  country: text("country"),
  /** L'adresse postale, telle qu'elle figure au pied des emails. */
  postalAddress: text("postal_address"),
  /** Les mentions légales libres (SIREN, ORIAS, RCS…) — on ne connaît pas toutes les professions. */
  legalMention: text("legal_mention"),
  /** La politique de confidentialité de l'organisation, liée au pied de page quand elle existe. */
  privacyPolicyUrl: text("privacy_policy_url"),
  // --- Engagement : l'ingestion d'emails ---
  /** La partie locale secrète de l'adresse d'ingestion (« a7k2…@in.<domaine> »), 20 caractères aléatoires ; NULL = pas encore générée. */
  ingestToken: text("ingest_token"),
  /** Conserver le corps des emails ingérés (option RGPD) ; faux = seuls l'objet, la date et la contrepartie sont gardés. */
  storeInboundBodies: boolean("store_inbound_bodies").notNull().default(false),
  // --- Engagement : les envois automatiques (règles) ---
  /** L'interrupteur général : faux = aucune règle n'envoie d'email, les tâches et notifications continuent. */
  autoSendEnabled: boolean("auto_send_enabled").notNull().default(false),
  /** Au plus un email automatique par contact par période, toutes règles confondues. */
  autoSendPeriodDays: integer("auto_send_period_days").notNull().default(14),
  /** La fenêtre d'envoi automatique : heures de bureau (dans le fuseau de l'organisation), jours ouvrés du lundi au vendredi. */
  officeHoursStart: integer("office_hours_start").notNull().default(9),
  officeHoursEnd: integer("office_hours_end").notNull().default(18),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // Un domaine ne peut appartenir qu'à une organisation ; NULL n'est pas un domaine.
  uniqueIndex("organizations_custom_domain_unique").on(table.customDomain).where(sql`${table.customDomain} IS NOT NULL`),
  // Trois lettres majuscules : la forme d'un code ISO 4217, pas la liste (elle change).
  check("organizations_currency_check", sql`${table.currency} ~ '^[A-Z]{3}$'`),
  // Deux lettres majuscules : la forme d'un code ISO 3166-1, pas la liste.
  check("organizations_country_check", sql`${table.country} IS NULL OR ${table.country} ~ '^[A-Z]{2}$'`),
  // Un jeton d'ingestion ne désigne qu'une organisation.
  uniqueIndex("organizations_ingest_token_unique").on(table.ingestToken).where(sql`${table.ingestToken} IS NOT NULL`),
  check("organizations_auto_send_period_check", sql`${table.autoSendPeriodDays} >= 1 AND ${table.autoSendPeriodDays} <= 365`),
  check(
    "organizations_office_hours_check",
    sql`${table.officeHoursStart} >= 0 AND ${table.officeHoursEnd} <= 24 AND ${table.officeHoursStart} < ${table.officeHoursEnd}`
  ),
]);

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
