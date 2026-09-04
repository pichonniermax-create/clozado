-- Chantier démo, sous-étape 2 (docs/module-demo.md §1.1 et §4) — migration montrée avant application ;
-- appliquée EN LOCAL (base de preuve, §1.5) pour construire, JAMAIS sur la base partagée sans accord.
-- Rien n'est renommé ni supprimé : deux colonnes et une table S'AJOUTENT, plus un déclencheur.
--   organizations : is_demo (LA marque de l'organisation de démonstration ; une seule à la fois — index unique
--                   partiel), demo_public_enabled (l'interrupteur de la démo publique ; le CHECK exige is_demo :
--                   la base refuse de rendre publique une organisation qui n'est pas une démo).
--   demo_resets   : le journal des créations et réinitialisations — SANS clé étrangère vers organizations :
--                   la réinitialisation supprime la ligne de l'organisation (cascade) et le journal y survit.
--   organizations_delete_guard (D1) : la base refuse la suppression d'une organisation qui n'est ni marquée
--                   démo, ni une fixture jetable (slug commençant par « _ », convention des scripts de preuve).
--                   Une organisation réelle ne se supprime plus par un DELETE malencontreux.
-- IF NOT EXISTS sur les CREATE, les ADD COLUMN et les INDEX ; la contrainte ajoutée à une table existante passe
-- par un bloc DO qui vérifie son absence ; CREATE OR REPLACE sur la fonction, DROP IF EXISTS avant le trigger :
-- tout le fichier se rejoue après un échec au milieu (pas de transaction en HTTP). Les noms sont ceux de
-- l'instantané drizzle-kit (meta/0017_snapshot.json).

-- ---------------------------------------------------------------------------------------------------------
-- Colonnes ajoutées à organizations
-- ---------------------------------------------------------------------------------------------------------
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "is_demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "demo_public_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_demo_public_requires_demo') THEN
    ALTER TABLE "organizations" ADD CONSTRAINT "organizations_demo_public_requires_demo"
      CHECK (NOT "organizations"."demo_public_enabled" OR "organizations"."is_demo");
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_single_demo" ON "organizations" USING btree ("is_demo") WHERE "organizations"."is_demo";--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------------------
-- Le journal des réinitialisations (FK dans le CREATE TABLE)
-- ---------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "demo_resets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"organization_slug" text NOT NULL,
	"requested_by" uuid,
	"requested_by_email" text,
	"kind" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"error" text,
	"deleted" jsonb,
	"created" jsonb,
	CONSTRAINT "demo_resets_kind_check" CHECK ("demo_resets"."kind" IN ('seed', 'reset')),
	CONSTRAINT "demo_resets_status_check" CHECK ("demo_resets"."status" IN ('running', 'done', 'failed')),
	CONSTRAINT "demo_resets_finished_consistency" CHECK (("demo_resets"."status" = 'running') = ("demo_resets"."finished_at" IS NULL)),
	CONSTRAINT "demo_resets_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "demo_resets_started_idx" ON "demo_resets" USING btree ("started_at");--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------------------
-- D1 — le garde-fou de suppression, en base (hors drizzle-kit, posé ici comme le déclencheur de 0016)
-- ---------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION organizations_delete_guard() RETURNS trigger AS $$
BEGIN
  IF NOT OLD.is_demo AND OLD.slug NOT LIKE '\_%' THEN
    RAISE EXCEPTION 'organizations: seule une organisation de démo (ou une fixture « _… ») peut être supprimée (%, %)', OLD.id, OLD.slug
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS organizations_delete_guard ON "organizations";
--> statement-breakpoint
CREATE TRIGGER organizations_delete_guard BEFORE DELETE ON "organizations" FOR EACH ROW EXECUTE FUNCTION organizations_delete_guard();
