CREATE TABLE "signatories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"job_title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"persona" text,
	"audience_label" text,
	"editorial_voice" text NOT NULL,
	"accent_color" text,
	"default_signatory_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verified_figures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"label" text NOT NULL,
	"value" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cta_preset_targets" (
	"cta_preset_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	CONSTRAINT "cta_preset_targets_cta_preset_id_target_id_pk" PRIMARY KEY("cta_preset_id","target_id")
);
--> statement-breakpoint
CREATE TABLE "cta_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"label" text NOT NULL,
	"url" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"newsletter_id" uuid NOT NULL,
	"type" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text DEFAULT 'Sans titre' NOT NULL,
	"target_id" uuid NOT NULL,
	"subject" text,
	"preheader" text,
	"brief" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "logo_lockup_text" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "secondary_color" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "ink_color" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "background_color" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "heading_font_family" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "heading_font_fallback" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "body_font_fallback" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "border_radius" integer;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "tagline" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "tone_of_voice" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "editorial_guidelines" text;--> statement-breakpoint
ALTER TABLE "signatories" ADD CONSTRAINT "signatories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_targets" ADD CONSTRAINT "mail_targets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_targets" ADD CONSTRAINT "mail_targets_default_signatory_id_signatories_id_fk" FOREIGN KEY ("default_signatory_id") REFERENCES "public"."signatories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verified_figures" ADD CONSTRAINT "verified_figures_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cta_preset_targets" ADD CONSTRAINT "cta_preset_targets_cta_preset_id_cta_presets_id_fk" FOREIGN KEY ("cta_preset_id") REFERENCES "public"."cta_presets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cta_preset_targets" ADD CONSTRAINT "cta_preset_targets_target_id_mail_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."mail_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cta_presets" ADD CONSTRAINT "cta_presets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter_blocks" ADD CONSTRAINT "newsletter_blocks_newsletter_id_newsletters_id_fk" FOREIGN KEY ("newsletter_id") REFERENCES "public"."newsletters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletters" ADD CONSTRAINT "newsletters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletters" ADD CONSTRAINT "newsletters_target_id_mail_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."mail_targets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletters" ADD CONSTRAINT "newsletters_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mail_targets_org_slug_unique" ON "mail_targets" USING btree ("organization_id","slug");