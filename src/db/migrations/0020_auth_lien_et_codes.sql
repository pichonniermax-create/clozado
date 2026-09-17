-- Correctif du lien de connexion (2026-09-17) : réglages d'authentification (une ligne) et codes à six chiffres. Rejouable.
CREATE TABLE IF NOT EXISTS "auth_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"link_validity_minutes" integer DEFAULT 60 NOT NULL,
	"session_days" integer DEFAULT 30 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_settings_single_row" CHECK ("auth_settings"."id" = 1),
	CONSTRAINT "auth_settings_link_validity_bounds" CHECK ("auth_settings"."link_validity_minutes" BETWEEN 5 AND 1440),
	CONSTRAINT "auth_settings_session_bounds" CHECK ("auth_settings"."session_days" BETWEEN 1 AND 90)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "login_codes" (
	"email" text PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
INSERT INTO "auth_settings" ("id") VALUES (1) ON CONFLICT DO NOTHING;
