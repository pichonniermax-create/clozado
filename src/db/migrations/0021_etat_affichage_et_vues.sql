-- Lot 1 (2026-09-17) : l'état d'affichage par personne et les vues enregistrées. Rejouable. NON APPLIQUÉE tant que non validée.
CREATE TABLE IF NOT EXISTS "saved_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"owner_user_id" uuid,
	"screen" text NOT NULL,
	"name" text NOT NULL,
	"definition" jsonb NOT NULL,
	"shared" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_views_screen_check" CHECK ("saved_views"."screen" IN ('contacts', 'affaires', 'partenaires', 'taches', 'newsletters', 'emails-recus', 'veille')),
	CONSTRAINT "saved_views_name_length" CHECK (length("saved_views"."name") BETWEEN 1 AND 80),
	CONSTRAINT "saved_views_seeded_are_shared" CHECK ("saved_views"."owner_user_id" IS NOT NULL OR "saved_views"."shared" = true)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_preferences" (
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_user_id_organization_id_key_pk" PRIMARY KEY("user_id","organization_id","key"),
	CONSTRAINT "user_preferences_key_shape" CHECK ("user_preferences"."key" ~ '^[a-z-]+(:[a-z0-9_-]+)?$' AND length("user_preferences"."key") <= 80)
);
--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saved_views_org_screen_idx" ON "saved_views" USING btree ("organization_id","screen");