-- Chantier « invitations d'espaces » (docs/module-invitations.md) — migration montrée avant application ;
-- appliquée EN LOCAL (base de preuve, docs/module-demo.md §1.5) pour construire, JAMAIS sur la base partagée
-- sans accord. Rien n'est renommé ni supprimé : une table S'AJOUTE.
--   workspace_invitations : les liens de création d'espace générés par le super admin pour une nouvelle
--                           entreprise — le jeton n'est stocké que par son empreinte (recherche) et sous forme
--                           chiffrée (pour recopier le lien) ; usage unique posé de façon atomique (used_at),
--                           expiration, révocation, l'espace créé et qui l'a créé. Clés étrangères en SET NULL :
--                           le journal survit à la disparition du compte auteur ou de l'espace.
-- IF NOT EXISTS sur le CREATE et les INDEX ; les clés étrangères passent par un bloc DO qui vérifie leur
-- absence : tout le fichier se rejoue après un échec au milieu (pas de transaction en HTTP). Les noms sont ceux
-- de l'instantané drizzle-kit (meta/0018_snapshot.json).

CREATE TABLE IF NOT EXISTS "workspace_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"token_encrypted" text NOT NULL,
	"organization_name" text NOT NULL,
	"email" text,
	"locale" text DEFAULT 'fr' NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_by_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"used_at" timestamp with time zone,
	"used_by_email" text,
	"organization_id" uuid,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "workspace_invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "workspace_invitations_used_consistency" CHECK (("workspace_invitations"."used_at" IS NULL AND "workspace_invitations"."used_by_email" IS NULL AND "workspace_invitations"."organization_id" IS NULL) OR ("workspace_invitations"."used_at" IS NOT NULL AND "workspace_invitations"."used_by_email" IS NOT NULL)),
	CONSTRAINT "workspace_invitations_expires_after_creation" CHECK ("workspace_invitations"."expires_at" > "workspace_invitations"."created_at")
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspace_invitations_created_by_users_id_fk') THEN
    ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspace_invitations_organization_id_organizations_id_fk') THEN
    ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_invitations_created_idx" ON "workspace_invitations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_invitations_organization_idx" ON "workspace_invitations" USING btree ("organization_id");
