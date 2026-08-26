-- Marque blanche et internationalisation, étape 1 (docs/module-marque-blanche-i18n.md §3) —
-- schéma validé le 2026-08-26. Rien n'est renommé ni supprimé.
--   organizations        : l'expéditeur des emails (sender_name, sender_email — en Reply-To tant
--                          que le domaine d'expédition n'est pas vérifié), les domaines PRÉVUS sans
--                          être construits (email_domain, custom_domain, et leur vérification),
--                          la langue par défaut de l'interface, la devise (ISO 4217) et le fuseau.
--   users                : la langue d'interface choisie par la personne (NULL = celle de l'organisation).
--   organization_assets  : les images de la marque (logo clair, logo sombre, icône), redimensionnées
--                          dans le navigateur, stockées en base « pour maintenant » (limite d'échelle
--                          notée au §3), servies par une route publique cacheable.
-- La FK d'organization_assets est écrite DANS le CREATE TABLE (drizzle-kit la posait à part en
-- ADD CONSTRAINT, non rejouable) ; la contrainte CHECK sur la devise est posée par un bloc DO
-- qui vérifie son absence : tout le fichier se rejoue après un échec au milieu (pas de
-- transaction en HTTP).
CREATE TABLE IF NOT EXISTS "organization_assets" (
	"organization_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action,
	"kind" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_assets_organization_id_kind_pk" PRIMARY KEY("organization_id","kind"),
	CONSTRAINT "organization_assets_kind_check" CHECK ("organization_assets"."kind" IN ('logo_light', 'logo_dark', 'icon'))
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "sender_name" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "sender_email" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "email_domain" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "email_domain_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "custom_domain" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "custom_domain_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "default_locale" text DEFAULT 'fr' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "currency" text DEFAULT 'EUR' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "timezone" text DEFAULT 'Europe/Paris' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "locale" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_custom_domain_unique" ON "organizations" USING btree ("custom_domain") WHERE "organizations"."custom_domain" IS NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_currency_check') THEN
    ALTER TABLE "organizations" ADD CONSTRAINT "organizations_currency_check" CHECK ("organizations"."currency" ~ '^[A-Z]{3}$');
  END IF;
END $$;
