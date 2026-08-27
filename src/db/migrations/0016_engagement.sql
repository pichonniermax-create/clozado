-- Chantier engagement, étape 1 (docs/module-engagement.md §6) — schéma validé dans son principe le
-- 2026-08-27, migration montrée avant application. Rien n'est renommé ni supprimé : des colonnes et des
-- tables S'AJOUTENT.
--   organizations        : le domaine d'expédition tel que le fournisseur le voit (id, statut, enregistrements
--                          renvoyés, dernière vérification, dernière erreur) ; les FAITS du pied de page
--                          (pays, adresse postale, mention légale, politique de confidentialité — le profil
--                          par pays vit en données) ; l'adresse d'ingestion (jeton secret, option corps) ;
--                          les envois automatiques (interrupteur, période du plafond, heures de bureau).
--   users                : l'adresse de réponse de la personne (surcharge du Reply-To), son lien de rendez-vous.
--   contacts             : l'arrêt des envois automatiques (date, raison : replied, appointment, manual —
--                          réarmable par une personne) ; la désinscription, elle, vit dans email_suppressions.
--   newsletters          : send_mode (declared : marquée à la main ; sent : envoyée par le produit),
--                          rempli à 'declared' pour les newsletters déjà marquées AVANT la contrainte.
--   activities           : direction (inbound : le contact a écrit ; outbound : on lui a écrit).
--   tasks                : rule_id (la règle qui a créé la tâche), une seule tâche ouverte par (règle, contact).
--   newsletter_sends     : l'envoi comme travail de fond (bail, pause, compteurs, photographie du rendu).
--   email_messages       : un email par destinataire (newsletter, test, automatique, manuel), l'id uuid v4
--                          = clé d'idempotence et jeton de désinscription.
--   email_events         : la chronologie brute des webhooks (sans IP ni navigateur), rejouable par unicité.
--   email_suppressions   : les adresses auxquelles on n'écrit plus, PAR organisation ; une désinscription
--                          est IRRÉVERSIBLE : le déclencheur email_suppressions_keep_unsubscribed refuse le
--                          DELETE et toute modification d'une ligne 'unsubscribed' (hors drizzle-kit, posé ici).
--   inbound_emails       : les emails ingérés (verdict d'authentification, proposition, sort).
--   inbound_rejections   : les refus sans organisation (adresse inconnue), en compteurs.
--   appointments         : les rendez-vous (Calendly ou saisis) ; calendar_connections : la connexion par personne.
--   rules, rule_templates, rule_runs, rule_actions : le moteur de règles, ses gabarits figés par versions,
--                          ses évaluations (verrou par la base), son journal complet.
-- Toutes les FK sont écrites DANS les CREATE TABLE (l'ordre des tables suit les dépendances) ; IF NOT EXISTS
-- sur les CREATE, les ADD COLUMN et les INDEX ; les contraintes ajoutées à des tables existantes passent par
-- un bloc DO qui vérifie leur absence : tout le fichier se rejoue après un échec au milieu (pas de
-- transaction en HTTP). Les noms sont ceux de l'instantané drizzle-kit (meta/0016_snapshot.json).

-- ---------------------------------------------------------------------------------------------------------
-- Colonnes ajoutées aux tables existantes
-- ---------------------------------------------------------------------------------------------------------
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "email_domain_provider_id" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "email_domain_status" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "email_domain_records" jsonb;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "email_domain_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "email_domain_check_error" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "country" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "postal_address" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "legal_mention" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "privacy_policy_url" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "ingest_token" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "store_inbound_bodies" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "auto_send_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "auto_send_period_days" integer DEFAULT 14 NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "office_hours_start" integer DEFAULT 9 NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "office_hours_end" integer DEFAULT 18 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "reply_to_email" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "booking_url" text;--> statement-breakpoint
ALTER TABLE "newsletters" ADD COLUMN IF NOT EXISTS "send_mode" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "auto_send_stopped_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "auto_send_stop_reason" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "rule_id" uuid;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "direction" text;--> statement-breakpoint
-- Les newsletters déjà marquées envoyées l'ont été à la main : 'declared', avant la contrainte qui l'exige (sans effet la seconde fois).
UPDATE "newsletters" SET "send_mode" = 'declared' WHERE "sent_at" IS NOT NULL AND "send_mode" IS NULL;--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------------------
-- Tables nouvelles, dans l'ordre des dépendances
-- ---------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"archived_at" timestamp with time zone,
	"trigger" text NOT NULL,
	"threshold_days" integer NOT NULL,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"action" text NOT NULL,
	"auto_send_confirmed_at" timestamp with time zone,
	"auto_send_confirmed_by" uuid,
	"last_run_at" timestamp with time zone,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rules_id_org_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "rules_trigger_check" CHECK ("rules"."trigger" IN ('no_appointment', 'no_interaction', 'email_not_opened', 'email_not_clicked', 'share_unanswered')),
	CONSTRAINT "rules_action_check" CHECK ("rules"."action" IN ('create_task', 'notify_owner', 'prepare_draft', 'send_email')),
	CONSTRAINT "rules_threshold_check" CHECK ("rules"."threshold_days" >= 1 AND "rules"."threshold_days" <= 365),
	CONSTRAINT "rules_auto_send_optin_check" CHECK ("rules"."action" <> 'send_email' OR "rules"."auto_send_confirmed_at" IS NOT NULL),
	CONSTRAINT "rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "rules_auto_send_confirmed_by_users_id_fk" FOREIGN KEY ("auto_send_confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rule_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rule_templates_id_org_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "rule_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "rule_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "rule_templates_rule_org_fk" FOREIGN KEY ("rule_id","organization_id") REFERENCES "public"."rules"("id","organization_id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rule_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"trigger" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"evaluated" integer DEFAULT 0 NOT NULL,
	"matched" integer DEFAULT 0 NOT NULL,
	"actions_done" integer DEFAULT 0 NOT NULL,
	"actions_skipped" integer DEFAULT 0 NOT NULL,
	"error" text,
	CONSTRAINT "rule_runs_id_org_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "rule_runs_trigger_check" CHECK ("rule_runs"."trigger" IN ('cron', 'manual')),
	CONSTRAINT "rule_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rule_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"run_id" uuid,
	"rule_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"action" text NOT NULL,
	"outcome" text NOT NULL,
	"skip_reason" text,
	"task_id" uuid,
	"message_id" uuid,
	"template_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rule_actions_action_check" CHECK ("rule_actions"."action" IN ('create_task', 'notify_owner', 'prepare_draft', 'send_email')),
	CONSTRAINT "rule_actions_outcome_check" CHECK ("rule_actions"."outcome" IN ('done', 'skipped')),
	CONSTRAINT "rule_actions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "rule_actions_run_org_fk" FOREIGN KEY ("run_id","organization_id") REFERENCES "public"."rule_runs"("id","organization_id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "rule_actions_rule_org_fk" FOREIGN KEY ("rule_id","organization_id") REFERENCES "public"."rules"("id","organization_id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "rule_actions_contact_org_fk" FOREIGN KEY ("contact_id","organization_id") REFERENCES "public"."contacts"("id","organization_id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "rule_actions_template_org_fk" FOREIGN KEY ("template_id","organization_id") REFERENCES "public"."rule_templates"("id","organization_id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "newsletter_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"newsletter_id" uuid NOT NULL,
	"started_by" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"lease_until" timestamp with time zone,
	"paused_until" timestamp with time zone,
	"pause_reason" text,
	"error" text,
	"queued" integer DEFAULT 0 NOT NULL,
	"sent" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"subject" text NOT NULL,
	"html" text NOT NULL,
	"text_body" text NOT NULL,
	CONSTRAINT "newsletter_sends_id_org_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "newsletter_sends_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "newsletter_sends_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "newsletter_sends_newsletter_org_fk" FOREIGN KEY ("newsletter_id","organization_id") REFERENCES "public"."newsletters"("id","organization_id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"newsletter_id" uuid,
	"send_id" uuid,
	"contact_id" uuid,
	"rule_id" uuid,
	"to_email" text NOT NULL,
	"from_email" text NOT NULL,
	"reply_to" text,
	"subject" text NOT NULL,
	"body" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"provider_message_id" text,
	"queued_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"first_opened_at" timestamp with time zone,
	"last_opened_at" timestamp with time zone,
	"open_count" integer DEFAULT 0 NOT NULL,
	"first_clicked_at" timestamp with time zone,
	"last_clicked_at" timestamp with time zone,
	"click_count" integer DEFAULT 0 NOT NULL,
	"bounced_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"failure_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_messages_id_org_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "email_messages_kind_check" CHECK ("email_messages"."kind" IN ('newsletter', 'test', 'automatic', 'manual')),
	CONSTRAINT "email_messages_status_check" CHECK ("email_messages"."status" IN ('draft', 'queued', 'sent', 'delivered', 'delayed', 'bounced', 'complained', 'failed', 'canceled')),
	CONSTRAINT "email_messages_kind_links_check" CHECK (("email_messages"."kind" = 'newsletter' AND "email_messages"."newsletter_id" IS NOT NULL AND "email_messages"."contact_id" IS NOT NULL)
        OR ("email_messages"."kind" = 'test' AND "email_messages"."contact_id" IS NULL)
        OR ("email_messages"."kind" = 'automatic' AND "email_messages"."rule_id" IS NOT NULL AND "email_messages"."contact_id" IS NOT NULL)
        OR ("email_messages"."kind" = 'manual' AND "email_messages"."contact_id" IS NOT NULL)),
	CONSTRAINT "email_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "email_messages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "email_messages_newsletter_org_fk" FOREIGN KEY ("newsletter_id","organization_id") REFERENCES "public"."newsletters"("id","organization_id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "email_messages_send_org_fk" FOREIGN KEY ("send_id","organization_id") REFERENCES "public"."newsletter_sends"("id","organization_id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "email_messages_contact_org_fk" FOREIGN KEY ("contact_id","organization_id") REFERENCES "public"."contacts"("id","organization_id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "email_messages_rule_org_fk" FOREIGN KEY ("rule_id","organization_id") REFERENCES "public"."rules"("id","organization_id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"url" text,
	"detail" jsonb,
	"provider_event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_events_type_check" CHECK ("email_events"."type" IN ('sent', 'delivered', 'delivery_delayed', 'bounced', 'complained', 'opened', 'clicked', 'failed', 'suppressed', 'unsubscribed')),
	CONSTRAINT "email_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "email_events_message_org_fk" FOREIGN KEY ("message_id","organization_id") REFERENCES "public"."email_messages"("id","organization_id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_suppressions" (
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"reason" text NOT NULL,
	"source" text NOT NULL,
	"message_id" uuid,
	"contact_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_suppressions_organization_id_email_pk" PRIMARY KEY("organization_id","email"),
	CONSTRAINT "email_suppressions_reason_check" CHECK ("email_suppressions"."reason" IN ('unsubscribed', 'bounced', 'complained', 'manual')),
	CONSTRAINT "email_suppressions_source_check" CHECK ("email_suppressions"."source" IN ('link', 'one_click', 'webhook', 'manual')),
	CONSTRAINT "email_suppressions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "email_suppressions_message_org_fk" FOREIGN KEY ("message_id","organization_id") REFERENCES "public"."email_messages"("id","organization_id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "email_suppressions_contact_org_fk" FOREIGN KEY ("contact_id","organization_id") REFERENCES "public"."contacts"("id","organization_id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inbound_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider_email_id" text NOT NULL,
	"message_id_header" text,
	"received_at" timestamp with time zone NOT NULL,
	"sender_email" text NOT NULL,
	"sender_user_id" uuid,
	"auth_result" text NOT NULL,
	"auth_detail" jsonb,
	"status" text NOT NULL,
	"rejection_reason" text,
	"mode" text,
	"subject" text,
	"counterpart_email" text,
	"counterpart_name" text,
	"original_date" timestamp with time zone,
	"contact_id" uuid,
	"activity_id" uuid,
	"proposal" jsonb,
	"body_text" text,
	"size_bytes" integer,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inbound_emails_status_check" CHECK ("inbound_emails"."status" IN ('pending', 'confirmed', 'ignored', 'rejected')),
	CONSTRAINT "inbound_emails_auth_check" CHECK ("inbound_emails"."auth_result" IN ('dkim_aligned', 'spf_aligned', 'failed', 'unavailable')),
	CONSTRAINT "inbound_emails_mode_check" CHECK ("inbound_emails"."mode" IS NULL OR "inbound_emails"."mode" IN ('forward', 'copy')),
	CONSTRAINT "inbound_emails_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "inbound_emails_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "inbound_emails_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "inbound_emails_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "inbound_emails_contact_org_fk" FOREIGN KEY ("contact_id","organization_id") REFERENCES "public"."contacts"("id","organization_id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inbound_rejections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reason" text NOT NULL,
	"detail" text NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"user_id" uuid,
	"source" text NOT NULL,
	"external_id" text,
	"title" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"canceled_at" timestamp with time zone,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointments_source_check" CHECK ("appointments"."source" IN ('calendly', 'manual')),
	CONSTRAINT "appointments_status_check" CHECK ("appointments"."status" IN ('scheduled', 'canceled')),
	CONSTRAINT "appointments_canceled_consistency" CHECK (("appointments"."status" = 'canceled') = ("appointments"."canceled_at" IS NOT NULL)),
	CONSTRAINT "appointments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "appointments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "appointments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "appointments_contact_org_fk" FOREIGN KEY ("contact_id","organization_id") REFERENCES "public"."contacts"("id","organization_id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calendar_connections" (
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_user_uri" text,
	"external_organization_uri" text,
	"subscription_uri" text,
	"signing_key_encrypted" text NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_event_at" timestamp with time zone,
	"disconnected_at" timestamp with time zone,
	CONSTRAINT "calendar_connections_user_id_provider_pk" PRIMARY KEY("user_id","provider"),
	CONSTRAINT "calendar_connections_provider_check" CHECK ("calendar_connections"."provider" IN ('calendly')),
	CONSTRAINT "calendar_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "calendar_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------------------
-- Index
-- ---------------------------------------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS "email_events_provider_id_unique" ON "email_events" USING btree ("provider_event_id") WHERE "email_events"."provider_event_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_events_org_message_occurred_idx" ON "email_events" USING btree ("organization_id","message_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_messages_provider_id_unique" ON "email_messages" USING btree ("provider_message_id") WHERE "email_messages"."provider_message_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_messages_org_contact_created_idx" ON "email_messages" USING btree ("organization_id","contact_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_messages_org_newsletter_status_idx" ON "email_messages" USING btree ("organization_id","newsletter_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_messages_org_kind_sent_idx" ON "email_messages" USING btree ("organization_id","kind","sent_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_messages_send_status_idx" ON "email_messages" USING btree ("send_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_suppressions_org_contact_idx" ON "email_suppressions" USING btree ("organization_id","contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "newsletter_sends_newsletter_open_unique" ON "newsletter_sends" USING btree ("newsletter_id") WHERE "newsletter_sends"."finished_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "newsletter_sends_org_started_idx" ON "newsletter_sends" USING btree ("organization_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inbound_emails_provider_id_unique" ON "inbound_emails" USING btree ("provider_email_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inbound_emails_org_received_idx" ON "inbound_emails" USING btree ("organization_id","received_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inbound_emails_org_status_idx" ON "inbound_emails" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inbound_rejections_reason_detail_unique" ON "inbound_rejections" USING btree ("reason","detail");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "appointments_org_external_unique" ON "appointments" USING btree ("organization_id","external_id") WHERE "appointments"."external_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "appointments_org_contact_starts_idx" ON "appointments" USING btree ("organization_id","contact_id","starts_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "appointments_org_starts_idx" ON "appointments" USING btree ("organization_id","starts_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calendar_connections_org_idx" ON "calendar_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rule_actions_org_contact_occurred_idx" ON "rule_actions" USING btree ("organization_id","contact_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rule_actions_org_rule_occurred_idx" ON "rule_actions" USING btree ("organization_id","rule_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rule_runs_org_open_unique" ON "rule_runs" USING btree ("organization_id") WHERE "rule_runs"."finished_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rule_runs_org_started_idx" ON "rule_runs" USING btree ("organization_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rule_templates_rule_version_unique" ON "rule_templates" USING btree ("rule_id","version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rules_org_enabled_idx" ON "rules" USING btree ("organization_id","enabled");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_ingest_token_unique" ON "organizations" USING btree ("ingest_token") WHERE "organizations"."ingest_token" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tasks_rule_contact_open_unique" ON "tasks" USING btree ("rule_id","contact_id") WHERE "tasks"."rule_id" IS NOT NULL AND "tasks"."status" = 'open';--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------------------
-- Contraintes ajoutées à des tables existantes (Postgres n'a pas de ADD CONSTRAINT IF NOT EXISTS)
-- ---------------------------------------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_rule_org_fk') THEN
    ALTER TABLE "tasks" ADD CONSTRAINT "tasks_rule_org_fk" FOREIGN KEY ("rule_id","organization_id") REFERENCES "public"."rules"("id","organization_id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_country_check') THEN
    ALTER TABLE "organizations" ADD CONSTRAINT "organizations_country_check" CHECK ("organizations"."country" IS NULL OR "organizations"."country" ~ '^[A-Z]{2}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_auto_send_period_check') THEN
    ALTER TABLE "organizations" ADD CONSTRAINT "organizations_auto_send_period_check" CHECK ("organizations"."auto_send_period_days" >= 1 AND "organizations"."auto_send_period_days" <= 365);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_office_hours_check') THEN
    ALTER TABLE "organizations" ADD CONSTRAINT "organizations_office_hours_check" CHECK ("organizations"."office_hours_start" >= 0 AND "organizations"."office_hours_end" <= 24 AND "organizations"."office_hours_start" < "organizations"."office_hours_end");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'newsletters_send_mode_check') THEN
    ALTER TABLE "newsletters" ADD CONSTRAINT "newsletters_send_mode_check" CHECK ("newsletters"."send_mode" IS NULL OR "newsletters"."send_mode" IN ('declared', 'sent'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'newsletters_send_mode_pair') THEN
    ALTER TABLE "newsletters" ADD CONSTRAINT "newsletters_send_mode_pair" CHECK (("newsletters"."sent_at" IS NULL) = ("newsletters"."send_mode" IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contacts_auto_send_stop_pair') THEN
    ALTER TABLE "contacts" ADD CONSTRAINT "contacts_auto_send_stop_pair" CHECK (("contacts"."auto_send_stopped_at" IS NULL) = ("contacts"."auto_send_stop_reason" IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contacts_auto_send_stop_reason_check') THEN
    ALTER TABLE "contacts" ADD CONSTRAINT "contacts_auto_send_stop_reason_check" CHECK ("contacts"."auto_send_stop_reason" IS NULL OR "contacts"."auto_send_stop_reason" IN ('replied', 'appointment', 'manual'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activities_direction_check') THEN
    ALTER TABLE "activities" ADD CONSTRAINT "activities_direction_check" CHECK ("activities"."direction" IS NULL OR "activities"."direction" IN ('inbound', 'outbound'));
  END IF;
END $$;
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------------------
-- La désinscription est irréversible — garanti par la base, pas seulement par l'interface (obligation légale).
-- Un DELETE ou une modification d'une ligne 'unsubscribed' est refusé tant que l'organisation existe ; la
-- suppression en cascade de l'organisation entière (la ligne parente est déjà partie quand le déclencheur
-- s'exécute) reste possible. CREATE OR REPLACE : rejouable.
-- ---------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION email_suppressions_keep_unsubscribed() RETURNS trigger AS $$
BEGIN
  IF OLD.reason = 'unsubscribed' AND EXISTS (SELECT 1 FROM organizations o WHERE o.id = OLD.organization_id) THEN
    RAISE EXCEPTION 'email_suppressions: une désinscription ne se retire ni ne se modifie jamais (organisation %, adresse %)', OLD.organization_id, OLD.email
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS email_suppressions_keep_unsubscribed ON "email_suppressions";
--> statement-breakpoint
CREATE TRIGGER email_suppressions_keep_unsubscribed BEFORE DELETE OR UPDATE ON "email_suppressions" FOR EACH ROW EXECUTE FUNCTION email_suppressions_keep_unsubscribed();
