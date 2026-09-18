-- Chantier envoi, garde-fous (2026-09-18) : l'autorisation d'écrire contact
-- par contact, les quotas d'envoi par organisation, et la liste repoussoir
-- de la PLATEFORME (rebonds durs et plaintes, en empreintes).
--
-- REJOUABLE de bout en bout (le migrateur neon-http n'ouvre aucune
-- transaction : un échec au milieu doit pouvoir être relancé sans dégât).
-- N'EFFACE RIEN, NE DÉPLACE RIEN : trois tables neuves, huit colonnes qui
-- naissent avec une valeur par défaut. Les fiches existantes arrivent en
-- « autorisation non établie » — on ne s'invente pas un consentement.
-- NON APPLIQUÉE tant qu'elle n'est pas validée.

CREATE TABLE IF NOT EXISTS "consent_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contact_id" uuid,
	"email" text,
	"channel" text DEFAULT 'email' NOT NULL,
	"status" text NOT NULL,
	"basis" text,
	"source" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by" uuid,
	"consent_text_id" uuid,
	"evidence" jsonb,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consent_events_status_check" CHECK ("consent_events"."status" IN ('granted', 'client', 'professional', 'not_established', 'objected')),
	CONSTRAINT "consent_events_channel_check" CHECK ("consent_events"."channel" IN ('email', 'phone')),
	CONSTRAINT "consent_events_source_check" CHECK ("consent_events"."source" IN ('site_form', 'double_opt_in', 'import', 'manual', 'ingestion', 'appointment', 'deal_won', 'unsubscribe', 'complaint'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "consent_texts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consent_texts_id_org_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "consent_texts_kind_check" CHECK ("consent_texts"."kind" IN ('site_form', 'booking', 'reconsent'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_suppressions" (
	"email_sha256" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"occurrences" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"detail" text,
	CONSTRAINT "platform_suppressions_reason_check" CHECK ("platform_suppressions"."reason" IN ('bounced', 'complained')),
	CONSTRAINT "platform_suppressions_hash_check" CHECK ("platform_suppressions"."email_sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "daily_send_quota" integer DEFAULT 2000 NOT NULL;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "send_warmup_started_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "sending_paused_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "sending_pause_reason" text;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "email_consent_status" text DEFAULT 'not_established' NOT NULL;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "email_consent_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "phone_consent_status" text DEFAULT 'not_established' NOT NULL;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "phone_consent_at" timestamp with time zone;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consent_events_organization_id_organizations_id_fk') THEN
    ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consent_events_recorded_by_users_id_fk') THEN
    ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consent_events_contact_org_fk') THEN
    ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_contact_org_fk" FOREIGN KEY ("contact_id","organization_id") REFERENCES "public"."contacts"("id","organization_id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consent_events_text_org_fk') THEN
    ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_text_org_fk" FOREIGN KEY ("consent_text_id","organization_id") REFERENCES "public"."consent_texts"("id","organization_id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consent_texts_organization_id_organizations_id_fk') THEN
    ALTER TABLE "consent_texts" ADD CONSTRAINT "consent_texts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "consent_events_org_contact_idx" ON "consent_events" USING btree ("organization_id","contact_id","occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "consent_events_org_email_idx" ON "consent_events" USING btree ("organization_id","email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "consent_texts_org_kind_idx" ON "consent_texts" USING btree ("organization_id","kind","created_at");
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_daily_send_quota_check') THEN
    ALTER TABLE "organizations" ADD CONSTRAINT "organizations_daily_send_quota_check" CHECK ("organizations"."daily_send_quota" >= 0 AND "organizations"."daily_send_quota" <= 200000);
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_sending_pause_check') THEN
    ALTER TABLE "organizations" ADD CONSTRAINT "organizations_sending_pause_check" CHECK (("organizations"."sending_paused_at" IS NULL) = ("organizations"."sending_pause_reason" IS NULL));
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contacts_email_consent_check') THEN
    ALTER TABLE "contacts" ADD CONSTRAINT "contacts_email_consent_check" CHECK ("contacts"."email_consent_status" IN ('granted', 'client', 'professional', 'not_established', 'objected'));
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contacts_phone_consent_check') THEN
    ALTER TABLE "contacts" ADD CONSTRAINT "contacts_phone_consent_check" CHECK ("contacts"."phone_consent_status" IN ('granted', 'client', 'professional', 'not_established', 'objected'));
  END IF;
END $$;
