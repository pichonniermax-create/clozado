CREATE TYPE "public"."contact_kind" AS ENUM('person', 'company');--> statement-breakpoint
CREATE TYPE "public"."contact_source" AS ENUM('manual', 'import', 'external');--> statement-breakpoint
CREATE TYPE "public"."contact_access_action" AS ENUM('view', 'export', 'delete', 'merge');--> statement-breakpoint
CREATE TYPE "public"."stage_outcome" AS ENUM('won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."task_auto_rule" AS ENUM('share_pending', 'deal_accepted_stale', 'commission_unpaid');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('low', 'normal', 'high');--> statement-breakpoint
CREATE TYPE "public"."task_recur_unit" AS ENUM('day', 'week', 'month', 'year');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('open', 'done');--> statement-breakpoint
CREATE TYPE "public"."activity_type" AS ENUM('call', 'email', 'meeting', 'note');--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "contact_kind" DEFAULT 'person' NOT NULL,
	"name" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"email" text,
	"phone" text,
	"company_name" text,
	"company_id" uuid,
	"job_title" text,
	"city" text,
	"postal_code" text,
	"country" text,
	"birth_date" date,
	"notes" text,
	"owner_id" uuid,
	"source" "contact_source" DEFAULT 'manual' NOT NULL,
	"external_system" text,
	"external_id" text,
	"last_synced_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_id_org_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "contacts_external_pair" CHECK (("contacts"."external_system" IS NULL) = ("contacts"."external_id" IS NULL)),
	CONSTRAINT "contacts_external_source_consistency" CHECK ("contacts"."source" <> 'external' OR "contacts"."external_system" IS NOT NULL),
	CONSTRAINT "contacts_company_fields_consistency" CHECK ("contacts"."kind" = 'person'
        OR ("contacts"."first_name" IS NULL AND "contacts"."last_name" IS NULL AND "contacts"."birth_date" IS NULL
            AND "contacts"."company_id" IS NULL AND "contacts"."company_name" IS NULL AND "contacts"."job_title" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "contact_tag_assignments" (
	"organization_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "contact_tag_assignments_contact_id_tag_id_pk" PRIMARY KEY("contact_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "contact_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"label" text NOT NULL,
	"color" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_tags_id_org_unique" UNIQUE("id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "contact_access_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"user_id" uuid,
	"action" "contact_access_action" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipelines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"label" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pipelines_id_org_unique" UNIQUE("id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "loss_reasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"label" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loss_reasons_id_org_unique" UNIQUE("id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "deal_stage_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"from_status_id" uuid,
	"to_status_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"actor_partner_id" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deal_stage_changes_single_actor" CHECK (NOT ("deal_stage_changes"."actor_user_id" IS NOT NULL AND "deal_stage_changes"."actor_partner_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"due_at" timestamp with time zone,
	"priority" "task_priority" DEFAULT 'normal' NOT NULL,
	"status" "task_status" DEFAULT 'open' NOT NULL,
	"completed_at" timestamp with time zone,
	"assignee_id" uuid,
	"contact_id" uuid,
	"deal_id" uuid,
	"auto_rule" "task_auto_rule",
	"source_share_id" uuid,
	"source_commission_id" uuid,
	"recur_unit" "task_recur_unit",
	"recur_every" integer,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_completed_consistency" CHECK (("tasks"."status" = 'done') = ("tasks"."completed_at" IS NOT NULL)),
	CONSTRAINT "tasks_auto_single_source" CHECK (NOT ("tasks"."source_share_id" IS NOT NULL AND "tasks"."source_commission_id" IS NOT NULL)),
	CONSTRAINT "tasks_auto_source_consistency" CHECK (("tasks"."auto_rule" IS NULL) = ("tasks"."source_share_id" IS NULL AND "tasks"."source_commission_id" IS NULL)),
	CONSTRAINT "tasks_recurrence_pair" CHECK (("tasks"."recur_unit" IS NULL) = ("tasks"."recur_every" IS NULL)),
	CONSTRAINT "tasks_recurrence_needs_due" CHECK ("tasks"."recur_unit" IS NULL OR "tasks"."due_at" IS NOT NULL),
	CONSTRAINT "tasks_recur_every_positive" CHECK ("tasks"."recur_every" IS NULL OR "tasks"."recur_every" >= 1)
);
--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"type" "activity_type" NOT NULL,
	"content" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"contact_id" uuid,
	"deal_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activities_has_subject" CHECK ("activities"."contact_id" IS NOT NULL OR "activities"."deal_id" IS NOT NULL)
);
--> statement-breakpoint
DROP INDEX "deal_statuses_org_slug_unique";--> statement-breakpoint
ALTER TABLE "deal_statuses" ADD COLUMN "pipeline_id" uuid;--> statement-breakpoint
ALTER TABLE "deal_statuses" ADD COLUMN "probability" integer;--> statement-breakpoint
ALTER TABLE "deal_statuses" ADD COLUMN "outcome" "stage_outcome";--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "contact_id" uuid;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "pipeline_id" uuid;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "probability" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "expected_close_date" date;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "loss_reason_id" uuid;--> statement-breakpoint
-- ÉDITÉ À LA MAIN (avec le pourquoi) : rattachement de l'existant avant les
-- contraintes. Un pipeline « Affaires » par organisation, ses statuts
-- actuels deviennent ses étapes, chaque affaire suit son statut. Statements
-- idempotents : neon-http n'a pas de transaction autour des migrations,
-- une reprise après échec partiel doit pouvoir rejouer sans dégât.
INSERT INTO "pipelines" ("organization_id", "label", "position")
SELECT o."id", 'Affaires', 0
FROM "organizations" o
WHERE NOT EXISTS (SELECT 1 FROM "pipelines" p WHERE p."organization_id" = o."id");--> statement-breakpoint
UPDATE "deal_statuses" ds
SET "pipeline_id" = (
  SELECT p."id" FROM "pipelines" p
  WHERE p."organization_id" = ds."organization_id"
  ORDER BY p."position", p."created_at" LIMIT 1
)
WHERE ds."pipeline_id" IS NULL;--> statement-breakpoint
UPDATE "deals" d
SET "pipeline_id" = (SELECT ds."pipeline_id" FROM "deal_statuses" ds WHERE ds."id" = d."status_id")
WHERE d."pipeline_id" IS NULL;--> statement-breakpoint
-- Les slugs 'acceptee'/'perdue' viennent de notre propre seed
-- (buildDefaultPipelineInserts) : on peut leur poser le marqueur de fin
-- sans deviner — les étapes créées à la main par un client restent NULL.
UPDATE "deal_statuses" SET "outcome" = 'won' WHERE "slug" = 'acceptee' AND "outcome" IS NULL;--> statement-breakpoint
UPDATE "deal_statuses" SET "outcome" = 'lost' WHERE "slug" = 'perdue' AND "outcome" IS NULL;--> statement-breakpoint
ALTER TABLE "deal_statuses" ALTER COLUMN "pipeline_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "deals" ALTER COLUMN "pipeline_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "deal_statuses" ADD CONSTRAINT "deal_statuses_id_pipeline_unique" UNIQUE("id","pipeline_id");--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_id_org_unique" UNIQUE("id","organization_id");--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_org_fk" FOREIGN KEY ("company_id","organization_id") REFERENCES "public"."contacts"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_tag_assignments" ADD CONSTRAINT "contact_tag_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_tag_assignments" ADD CONSTRAINT "contact_tag_assignments_contact_org_fk" FOREIGN KEY ("contact_id","organization_id") REFERENCES "public"."contacts"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_tag_assignments" ADD CONSTRAINT "contact_tag_assignments_tag_org_fk" FOREIGN KEY ("tag_id","organization_id") REFERENCES "public"."contact_tags"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_access_log" ADD CONSTRAINT "contact_access_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_access_log" ADD CONSTRAINT "contact_access_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_access_log" ADD CONSTRAINT "contact_access_log_contact_org_fk" FOREIGN KEY ("contact_id","organization_id") REFERENCES "public"."contacts"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loss_reasons" ADD CONSTRAINT "loss_reasons_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_changes" ADD CONSTRAINT "deal_stage_changes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_changes" ADD CONSTRAINT "deal_stage_changes_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_changes" ADD CONSTRAINT "deal_stage_changes_deal_org_fk" FOREIGN KEY ("deal_id","organization_id") REFERENCES "public"."deals"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_changes" ADD CONSTRAINT "deal_stage_changes_from_org_fk" FOREIGN KEY ("from_status_id","organization_id") REFERENCES "public"."deal_statuses"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_changes" ADD CONSTRAINT "deal_stage_changes_to_org_fk" FOREIGN KEY ("to_status_id","organization_id") REFERENCES "public"."deal_statuses"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_changes" ADD CONSTRAINT "deal_stage_changes_actor_partner_org_fk" FOREIGN KEY ("actor_partner_id","organization_id") REFERENCES "public"."partners"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_contact_org_fk" FOREIGN KEY ("contact_id","organization_id") REFERENCES "public"."contacts"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_deal_org_fk" FOREIGN KEY ("deal_id","organization_id") REFERENCES "public"."deals"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_source_share_org_fk" FOREIGN KEY ("source_share_id","organization_id") REFERENCES "public"."deal_shares"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_source_commission_org_fk" FOREIGN KEY ("source_commission_id","organization_id") REFERENCES "public"."commissions"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_contact_org_fk" FOREIGN KEY ("contact_id","organization_id") REFERENCES "public"."contacts"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_deal_org_fk" FOREIGN KEY ("deal_id","organization_id") REFERENCES "public"."deals"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_org_external_unique" ON "contacts" USING btree ("organization_id","external_system","external_id") WHERE "contacts"."external_system" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "contacts_org_name_idx" ON "contacts" USING btree ("organization_id","name") WHERE "contacts"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "contacts_org_owner_idx" ON "contacts" USING btree ("organization_id","owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_tags_org_label_unique" ON "contact_tags" USING btree ("organization_id","label");--> statement-breakpoint
CREATE INDEX "contact_access_log_org_contact_idx" ON "contact_access_log" USING btree ("organization_id","contact_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pipelines_org_label_unique" ON "pipelines" USING btree ("organization_id","label");--> statement-breakpoint
CREATE UNIQUE INDEX "loss_reasons_org_label_unique" ON "loss_reasons" USING btree ("organization_id","label");--> statement-breakpoint
CREATE INDEX "deal_stage_changes_org_deal_idx" ON "deal_stage_changes" USING btree ("organization_id","deal_id","changed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_auto_share_unique" ON "tasks" USING btree ("auto_rule","source_share_id") WHERE "tasks"."source_share_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_auto_commission_unique" ON "tasks" USING btree ("auto_rule","source_commission_id") WHERE "tasks"."source_commission_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "tasks_org_status_due_idx" ON "tasks" USING btree ("organization_id","status","due_at");--> statement-breakpoint
CREATE INDEX "tasks_org_assignee_status_idx" ON "tasks" USING btree ("organization_id","assignee_id","status");--> statement-breakpoint
CREATE INDEX "tasks_org_contact_idx" ON "tasks" USING btree ("organization_id","contact_id");--> statement-breakpoint
CREATE INDEX "tasks_org_deal_idx" ON "tasks" USING btree ("organization_id","deal_id");--> statement-breakpoint
CREATE INDEX "activities_org_contact_idx" ON "activities" USING btree ("organization_id","contact_id","occurred_at");--> statement-breakpoint
CREATE INDEX "activities_org_deal_idx" ON "activities" USING btree ("organization_id","deal_id","occurred_at");--> statement-breakpoint
ALTER TABLE "deal_statuses" ADD CONSTRAINT "deal_statuses_pipeline_org_fk" FOREIGN KEY ("pipeline_id","organization_id") REFERENCES "public"."pipelines"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_pipeline_org_fk" FOREIGN KEY ("pipeline_id","organization_id") REFERENCES "public"."pipelines"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_status_pipeline_fk" FOREIGN KEY ("status_id","pipeline_id") REFERENCES "public"."deal_statuses"("id","pipeline_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_contact_org_fk" FOREIGN KEY ("contact_id","organization_id") REFERENCES "public"."contacts"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_loss_reason_org_fk" FOREIGN KEY ("loss_reason_id","organization_id") REFERENCES "public"."loss_reasons"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deal_statuses_org_pipeline_slug_unique" ON "deal_statuses" USING btree ("organization_id","pipeline_id","slug");--> statement-breakpoint
CREATE INDEX "deals_org_pipeline_status_idx" ON "deals" USING btree ("organization_id","pipeline_id","status_id");--> statement-breakpoint
CREATE INDEX "deals_org_owner_idx" ON "deals" USING btree ("organization_id","owner_id");--> statement-breakpoint
CREATE INDEX "deals_org_close_date_idx" ON "deals" USING btree ("organization_id","expected_close_date");--> statement-breakpoint
CREATE INDEX "deals_org_contact_idx" ON "deals" USING btree ("organization_id","contact_id");--> statement-breakpoint
ALTER TABLE "deal_statuses" ADD CONSTRAINT "deal_statuses_probability_range" CHECK ("deal_statuses"."probability" IS NULL OR ("deal_statuses"."probability" >= 0 AND "deal_statuses"."probability" <= 100));--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_probability_range" CHECK ("deals"."probability" IS NULL OR ("deals"."probability" >= 0 AND "deals"."probability" <= 100));