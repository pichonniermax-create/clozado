-- Module ciblage et contenu, étape 2 (docs/module-ciblage-contenu.md, « Étape 2 »).
-- Rien n'est renommé ni supprimé : des colonnes et des tables S'AJOUTENT.
--   mail_targets      : la cible devient un segment vivant (kind, criteria) ou une
--                       sélection manuelle (mail_target_members), avec une identité
--                       éditoriale en six facettes ; editorial_voice devient facultatif ;
--                       archived_at (une cible se désactive, ne se supprime pas).
--   newsletters       : « marquée envoyée » (sent_at, sent_marked_by), la photographie de
--                       l'audience, les sujets ; newsletter_recipients (les membres à cet
--                       instant) ; newsletter_sources (les articles utilisés).
--   verified_figures  : source et date sur tout chiffre ; indicator_key pour un chiffre
--                       alimenté par la collecte.
--   watch_*           : sujets, sources et concurrents (avec leur santé), articles SANS
--                       corps ni extrait (par construction), panier, journal des collectes.
--   market_*          : observations officielles partagées (la seule table sans
--                       organisation, exception validée), santé par indicateur,
--                       indicateurs suivis par organisation.
--   contact_tag_assignments : index (organization_id, tag_id, contact_id) pour le critère
--                       « porte cette étiquette ».
-- Ordre corrigé à la main : les contraintes UNIQUE (id, organization_id) de mail_targets
-- et newsletters précèdent les FK composites qui les référencent (drizzle-kit les plaçait
-- après, ce que Postgres refuse ; sans transaction en HTTP, l'état serait resté partiel).
-- IF NOT EXISTS sur les CREATE et ADD COLUMN : rejouable après un échec au milieu ; les
-- ADD CONSTRAINT ne le sont pas (Postgres ne le permet pas) — à retirer à la main si l'on
-- rejoue après un échec survenu après eux.
CREATE TABLE IF NOT EXISTS "mail_target_members" (
	"organization_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_target_members_target_id_contact_id_pk" PRIMARY KEY("target_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "newsletter_recipients" (
	"organization_id" uuid NOT NULL,
	"newsletter_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	CONSTRAINT "newsletter_recipients_newsletter_id_contact_id_pk" PRIMARY KEY("newsletter_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "newsletter_sources" (
	"organization_id" uuid NOT NULL,
	"newsletter_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "newsletter_sources_newsletter_id_item_id_pk" PRIMARY KEY("newsletter_id","item_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "watch_basket_items" (
	"organization_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"added_by" uuid,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watch_basket_items_organization_id_item_id_pk" PRIMARY KEY("organization_id","item_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "watch_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"source_id" uuid,
	"topic_id" uuid,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"url_hash" text NOT NULL,
	"publisher" text NOT NULL,
	"published_at" timestamp with time zone,
	"country" text,
	"lang" text,
	"summary" text,
	"summary_state" text DEFAULT 'pending' NOT NULL,
	"summary_model" text,
	"themes" text[] DEFAULT '{}' NOT NULL,
	"angle" text,
	"discovered_via" text NOT NULL,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watch_items_id_org_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "watch_items_summary_state_check" CHECK ("watch_items"."summary_state" IN ('pending', 'done', 'refused', 'failed')),
	CONSTRAINT "watch_items_discovered_via_check" CHECK ("watch_items"."discovered_via" IN ('feed', 'search'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "watch_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"trigger" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"sources_ok" integer DEFAULT 0 NOT NULL,
	"sources_failed" integer DEFAULT 0 NOT NULL,
	"items_new" integer DEFAULT 0 NOT NULL,
	"items_summarized" integer DEFAULT 0 NOT NULL,
	"error" text,
	CONSTRAINT "watch_runs_trigger_check" CHECK ("watch_runs"."trigger" IN ('visit', 'manual', 'cron'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "watch_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"site_url" text NOT NULL,
	"feed_url" text,
	"country" text,
	"lang" text,
	"topic_id" uuid,
	"last_fetched_at" timestamp with time zone,
	"last_ok_at" timestamp with time zone,
	"last_error" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"asleep_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watch_sources_id_org_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "watch_sources_kind_check" CHECK ("watch_sources"."kind" IN ('source', 'competitor'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "watch_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"label" text NOT NULL,
	"search_terms" text[] DEFAULT '{}' NOT NULL,
	"search_languages" text[] DEFAULT '{"fr"}' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watch_topics_id_org_unique" UNIQUE("id","organization_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "market_indicator_status" (
	"indicator_key" text PRIMARY KEY NOT NULL,
	"last_fetched_at" timestamp with time zone,
	"last_ok_at" timestamp with time zone,
	"last_error" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "market_observations" (
	"indicator_key" text NOT NULL,
	"period" text NOT NULL,
	"period_start" date NOT NULL,
	"value_text" text NOT NULL,
	"value_num" numeric(18, 6),
	"unit" text,
	"source_name" text NOT NULL,
	"source_url" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_observations_indicator_key_period_pk" PRIMARY KEY("indicator_key","period")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_indicators" (
	"organization_id" uuid NOT NULL,
	"indicator_key" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_indicators_organization_id_indicator_key_pk" PRIMARY KEY("organization_id","indicator_key")
);
--> statement-breakpoint
ALTER TABLE "mail_targets" ALTER COLUMN "editorial_voice" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "mail_targets" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'segment' NOT NULL;
--> statement-breakpoint
ALTER TABLE "mail_targets" ADD COLUMN IF NOT EXISTS "criteria" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "mail_targets" ADD COLUMN IF NOT EXISTS "description" text;
--> statement-breakpoint
ALTER TABLE "mail_targets" ADD COLUMN IF NOT EXISTS "concerns" text;
--> statement-breakpoint
ALTER TABLE "mail_targets" ADD COLUMN IF NOT EXISTS "knowledge_level" text;
--> statement-breakpoint
ALTER TABLE "mail_targets" ADD COLUMN IF NOT EXISTS "interests" text;
--> statement-breakpoint
ALTER TABLE "mail_targets" ADD COLUMN IF NOT EXISTS "avoid" text;
--> statement-breakpoint
ALTER TABLE "mail_targets" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "verified_figures" ADD COLUMN IF NOT EXISTS "source_name" text;
--> statement-breakpoint
ALTER TABLE "verified_figures" ADD COLUMN IF NOT EXISTS "source_url" text;
--> statement-breakpoint
ALTER TABLE "verified_figures" ADD COLUMN IF NOT EXISTS "as_of" text;
--> statement-breakpoint
ALTER TABLE "verified_figures" ADD COLUMN IF NOT EXISTS "as_of_date" date;
--> statement-breakpoint
ALTER TABLE "verified_figures" ADD COLUMN IF NOT EXISTS "indicator_key" text;
--> statement-breakpoint
ALTER TABLE "newsletters" ADD COLUMN IF NOT EXISTS "topics" text[] DEFAULT '{}' NOT NULL;
--> statement-breakpoint
ALTER TABLE "newsletters" ADD COLUMN IF NOT EXISTS "sent_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "newsletters" ADD COLUMN IF NOT EXISTS "sent_marked_by" uuid;
--> statement-breakpoint
ALTER TABLE "newsletters" ADD COLUMN IF NOT EXISTS "audience_snapshot" jsonb;
--> statement-breakpoint
ALTER TABLE "mail_targets" ADD CONSTRAINT "mail_targets_id_org_unique" UNIQUE("id","organization_id");
--> statement-breakpoint
ALTER TABLE "newsletters" ADD CONSTRAINT "newsletters_id_org_unique" UNIQUE("id","organization_id");
--> statement-breakpoint
ALTER TABLE "mail_target_members" ADD CONSTRAINT "mail_target_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mail_target_members" ADD CONSTRAINT "mail_target_members_target_org_fk" FOREIGN KEY ("target_id","organization_id") REFERENCES "public"."mail_targets"("id","organization_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mail_target_members" ADD CONSTRAINT "mail_target_members_contact_org_fk" FOREIGN KEY ("contact_id","organization_id") REFERENCES "public"."contacts"("id","organization_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "newsletter_recipients" ADD CONSTRAINT "newsletter_recipients_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "newsletter_recipients" ADD CONSTRAINT "newsletter_recipients_newsletter_org_fk" FOREIGN KEY ("newsletter_id","organization_id") REFERENCES "public"."newsletters"("id","organization_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "newsletter_recipients" ADD CONSTRAINT "newsletter_recipients_contact_org_fk" FOREIGN KEY ("contact_id","organization_id") REFERENCES "public"."contacts"("id","organization_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "newsletter_sources" ADD CONSTRAINT "newsletter_sources_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "newsletter_sources" ADD CONSTRAINT "newsletter_sources_newsletter_org_fk" FOREIGN KEY ("newsletter_id","organization_id") REFERENCES "public"."newsletters"("id","organization_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "newsletter_sources" ADD CONSTRAINT "newsletter_sources_item_org_fk" FOREIGN KEY ("item_id","organization_id") REFERENCES "public"."watch_items"("id","organization_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "watch_basket_items" ADD CONSTRAINT "watch_basket_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "watch_basket_items" ADD CONSTRAINT "watch_basket_items_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "watch_basket_items" ADD CONSTRAINT "watch_basket_items_item_org_fk" FOREIGN KEY ("item_id","organization_id") REFERENCES "public"."watch_items"("id","organization_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "watch_items" ADD CONSTRAINT "watch_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "watch_items" ADD CONSTRAINT "watch_items_source_org_fk" FOREIGN KEY ("source_id","organization_id") REFERENCES "public"."watch_sources"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "watch_items" ADD CONSTRAINT "watch_items_topic_org_fk" FOREIGN KEY ("topic_id","organization_id") REFERENCES "public"."watch_topics"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "watch_runs" ADD CONSTRAINT "watch_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "watch_sources" ADD CONSTRAINT "watch_sources_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "watch_sources" ADD CONSTRAINT "watch_sources_topic_org_fk" FOREIGN KEY ("topic_id","organization_id") REFERENCES "public"."watch_topics"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "watch_topics" ADD CONSTRAINT "watch_topics_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "organization_indicators" ADD CONSTRAINT "organization_indicators_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mail_target_members_org_contact_idx" ON "mail_target_members" USING btree ("organization_id","contact_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "newsletter_recipients_org_contact_idx" ON "newsletter_recipients" USING btree ("organization_id","contact_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "newsletter_sources_org_item_idx" ON "newsletter_sources" USING btree ("organization_id","item_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "watch_items_org_url_unique" ON "watch_items" USING btree ("organization_id","url_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "watch_items_org_published_idx" ON "watch_items" USING btree ("organization_id","published_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "watch_items_org_topic_idx" ON "watch_items" USING btree ("organization_id","topic_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "watch_items_org_source_idx" ON "watch_items" USING btree ("organization_id","source_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "watch_runs_org_started_idx" ON "watch_runs" USING btree ("organization_id","started_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "watch_sources_org_kind_site_unique" ON "watch_sources" USING btree ("organization_id","kind","site_url");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "watch_topics_org_label_unique" ON "watch_topics" USING btree ("organization_id","label");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_observations_key_start_idx" ON "market_observations" USING btree ("indicator_key","period_start");
--> statement-breakpoint
ALTER TABLE "newsletters" ADD CONSTRAINT "newsletters_sent_marked_by_users_id_fk" FOREIGN KEY ("sent_marked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "verified_figures_org_indicator_unique" ON "verified_figures" USING btree ("organization_id","indicator_key") WHERE "verified_figures"."indicator_key" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "newsletters_org_sent_idx" ON "newsletters" USING btree ("organization_id","sent_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_tag_assignments_org_tag_contact_idx" ON "contact_tag_assignments" USING btree ("organization_id","tag_id","contact_id");
--> statement-breakpoint
ALTER TABLE "mail_targets" ADD CONSTRAINT "mail_targets_kind_check" CHECK ("mail_targets"."kind" IN ('segment', 'static'));
