-- Lot 2 (2026-09-18) : l'origine et l'apporteur d'un contact, et les dates
-- d'attribution. REJOUABLE (le migrateur neon-http n'enveloppe rien dans une
-- transaction : un échec au milieu doit pouvoir être relancé sans dégât).
-- NON APPLIQUÉE tant qu'elle n'est pas validée.
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "owner_assigned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "origin_id" uuid;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "partner_id" uuid;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "partner_attributed_at" timestamp with time zone;--> statement-breakpoint
-- Postgres ne connaît pas « ADD CONSTRAINT IF NOT EXISTS » : on regarde d'abord.
-- Les deux clés portent l'ORGANISATION : une fiche ne peut désigner ni l'origine
-- ni le confrère d'un autre espace. `set null` parce qu'un libellé d'origine
-- reste supprimable — la fiche perd son étiquette, elle ne disparaît pas.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contacts_origin_org_fk') THEN
    ALTER TABLE "contacts" ADD CONSTRAINT "contacts_origin_org_fk"
      FOREIGN KEY ("origin_id","organization_id") REFERENCES "public"."origins"("id","organization_id")
      ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contacts_partner_org_fk') THEN
    ALTER TABLE "contacts" ADD CONSTRAINT "contacts_partner_org_fk"
      FOREIGN KEY ("partner_id","organization_id") REFERENCES "public"."partners"("id","organization_id")
      ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
-- Lot 3 : « les contacts apportés par ce confrère, dans cette période », et l'analytique des origines par fiche.
CREATE INDEX IF NOT EXISTS "contacts_org_partner_idx" ON "contacts" USING btree ("organization_id","partner_id","partner_attributed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_org_origin_idx" ON "contacts" USING btree ("organization_id","origin_id");--> statement-breakpoint
-- Rattrapage idempotent : les fiches déjà attribuées datent leur attribution de
-- leur création. C'est la seule date honnête dont on dispose — aucune trace du
-- moment où un conseiller a été posé n'existait avant ce lot.
UPDATE "contacts" SET "owner_assigned_at" = "created_at"
  WHERE "owner_id" IS NOT NULL AND "owner_assigned_at" IS NULL;
