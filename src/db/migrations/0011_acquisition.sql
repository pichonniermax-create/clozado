CREATE TYPE "public"."acquisition_event_kind" AS ENUM('visit', 'simulation_started', 'simulation_completed');--> statement-breakpoint
ALTER TYPE "public"."contact_source" ADD VALUE 'lead';--> statement-breakpoint
ALTER TYPE "public"."deal_event_type" ADD VALUE 'origin_changed';--> statement-breakpoint
CREATE TABLE "origins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"label" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "origins_id_org_unique" UNIQUE("id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"label" text NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "site_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text DEFAULT 'Site principal' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "site_keys_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "acquisition_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "acquisition_event_kind" NOT NULL,
	"visitor_id" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"page_url" text,
	"referrer" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"simulator" text,
	"origin_id" uuid,
	"origin_raw" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "acquisition_rejections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"detail" text NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contact_id" uuid,
	"api_key_id" uuid,
	"visitor_id" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"simulator" text,
	"page_url" text,
	"referrer" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"origin_id" uuid,
	"origin_raw" text,
	"simulation_started_at" timestamp with time zone,
	"simulation_completed_at" timestamp with time zone,
	"payload" jsonb,
	"matched_existing_contact" boolean DEFAULT false NOT NULL,
	"enriched_fields" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_id_org_unique" UNIQUE("id","organization_id")
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "allowed_domains" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "lead_id" uuid;--> statement-breakpoint
ALTER TABLE "origins" ADD CONSTRAINT "origins_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_keys" ADD CONSTRAINT "site_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acquisition_events" ADD CONSTRAINT "acquisition_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acquisition_events" ADD CONSTRAINT "acquisition_events_origin_org_fk" FOREIGN KEY ("origin_id","organization_id") REFERENCES "public"."origins"("id","organization_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acquisition_rejections" ADD CONSTRAINT "acquisition_rejections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_contact_org_fk" FOREIGN KEY ("contact_id","organization_id") REFERENCES "public"."contacts"("id","organization_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_origin_org_fk" FOREIGN KEY ("origin_id","organization_id") REFERENCES "public"."origins"("id","organization_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "origins_org_label_unique" ON "origins" USING btree ("organization_id","label");--> statement-breakpoint
CREATE INDEX "api_keys_org_idx" ON "api_keys" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "site_keys_org_idx" ON "site_keys" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "acquisition_events_org_visitor_idx" ON "acquisition_events" USING btree ("organization_id","visitor_id","occurred_at");--> statement-breakpoint
CREATE INDEX "acquisition_events_org_kind_occurred_idx" ON "acquisition_events" USING btree ("organization_id","kind","occurred_at");--> statement-breakpoint
CREATE INDEX "acquisition_events_org_origin_idx" ON "acquisition_events" USING btree ("organization_id","origin_id");--> statement-breakpoint
CREATE UNIQUE INDEX "acquisition_rejections_org_reason_detail_unique" ON "acquisition_rejections" USING btree ("organization_id","reason","detail");--> statement-breakpoint
CREATE INDEX "leads_org_received_idx" ON "leads" USING btree ("organization_id","received_at");--> statement-breakpoint
CREATE INDEX "leads_org_contact_idx" ON "leads" USING btree ("organization_id","contact_id");--> statement-breakpoint
CREATE INDEX "leads_org_visitor_idx" ON "leads" USING btree ("organization_id","visitor_id");--> statement-breakpoint
CREATE INDEX "leads_org_origin_idx" ON "leads" USING btree ("organization_id","origin_id");--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_lead_org_fk" FOREIGN KEY ("lead_id","organization_id") REFERENCES "public"."leads"("id","organization_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deals_org_lead_idx" ON "deals" USING btree ("organization_id","lead_id");--> statement-breakpoint
-- Chaque organisation existante reçoit sa première clé de site (rejouable).
INSERT INTO "site_keys" ("organization_id", "key")
SELECT o."id", md5(random()::text || clock_timestamp()::text || o."id"::text)
FROM "organizations" o
WHERE NOT EXISTS (SELECT 1 FROM "site_keys" sk WHERE sk."organization_id" = o."id");
