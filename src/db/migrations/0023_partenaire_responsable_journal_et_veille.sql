-- Lot 3 (2026-09-18) : le conseiller qui tient la relation avec un confrère,
-- le journal d'un confrère, et la règle « sans apport depuis N jours ».
-- REJOUABLE (le migrateur neon-http n'ouvre aucune transaction : un échec au
-- milieu doit pouvoir être relancé sans dégât).
-- NON APPLIQUÉE tant qu'elle n'est pas validée.

-- La quatrième règle de tâche automatique. « IF NOT EXISTS » rend l'ajout
-- rejouable ; la valeur est utilisable dès l'instruction suivante parce que le
-- migrateur n'enveloppe rien dans une transaction (Postgres l'interdirait sinon).
ALTER TYPE "public"."task_auto_rule" ADD VALUE IF NOT EXISTS 'partner_stale';--> statement-breakpoint

-- Les colonnes.
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "partner_stale_days" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "source_partner_id" uuid;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "partner_id" uuid;--> statement-breakpoint

-- Les clés. Celles qui désignent un confrère portent l'ORGANISATION : une tâche
-- ou un échange ne peut pas viser le confrère d'un autre espace, et c'est la base
-- qui le garantit. `owner_id` est une clé simple vers `users`, comme
-- `contacts.owner_id` : `users` n'a pas d'unicité sur (id, organization_id).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partners_owner_id_users_id_fk') THEN
    ALTER TABLE "partners" ADD CONSTRAINT "partners_owner_id_users_id_fk"
      FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_partner_org_fk') THEN
    ALTER TABLE "tasks" ADD CONSTRAINT "tasks_partner_org_fk"
      FOREIGN KEY ("source_partner_id","organization_id") REFERENCES "public"."partners"("id","organization_id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activities_partner_org_fk') THEN
    ALTER TABLE "activities" ADD CONSTRAINT "activities_partner_org_fk"
      FOREIGN KEY ("partner_id","organization_id") REFERENCES "public"."partners"("id","organization_id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint

-- Les index. « Les confrères dont je tiens la relation », le journal d'un
-- confrère, et l'unicité de la tâche « endormi » : UNE seule tâche OUVERTE par
-- confrère. L'achever dit « je l'ai rappelé » ; s'il se rendort, la règle peut
-- reparler — à la différence des deux autres sources, qui désignent un événement
-- unique et ne renaissent jamais.
CREATE INDEX IF NOT EXISTS "partners_org_owner_idx" ON "partners" USING btree ("organization_id","owner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activities_org_partner_idx" ON "activities" USING btree ("organization_id","partner_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tasks_auto_partner_open_unique" ON "tasks" USING btree ("auto_rule","source_partner_id")
  WHERE "tasks"."source_partner_id" IS NOT NULL AND "tasks"."status" = 'open';--> statement-breakpoint

-- Les contraintes de cohérence. Trois d'entre elles sont RÉÉCRITES : Postgres ne
-- sait pas modifier une contrainte CHECK, il faut la retirer et la reposer. La
-- table reste sans elle le temps de deux instructions — quelques millisecondes,
-- sur des règles qu'aucune écriture concurrente ne peut violer ici (les nouvelles
-- colonnes sont vides).
ALTER TABLE "organizations" DROP CONSTRAINT IF EXISTS "organizations_partner_stale_days_check";--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_partner_stale_days_check"
  CHECK ("organizations"."partner_stale_days" >= 7 AND "organizations"."partner_stale_days" <= 730);--> statement-breakpoint

-- Une tâche générée a UNE source, jamais deux — trois sources possibles désormais.
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_auto_single_source";--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_auto_single_source" CHECK (
  (CASE WHEN "tasks"."source_share_id" IS NOT NULL THEN 1 ELSE 0 END
 + CASE WHEN "tasks"."source_commission_id" IS NOT NULL THEN 1 ELSE 0 END
 + CASE WHEN "tasks"."source_partner_id" IS NOT NULL THEN 1 ELSE 0 END) <= 1);--> statement-breakpoint

-- Générée ⇔ reliée à sa source (partage, commission, ou confrère).
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_auto_source_consistency";--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_auto_source_consistency" CHECK (
  ("tasks"."auto_rule" IS NULL) = ("tasks"."source_share_id" IS NULL
    AND "tasks"."source_commission_id" IS NULL
    AND "tasks"."source_partner_id" IS NULL));--> statement-breakpoint

-- Une interaction sans sujet n'existe pas : un contact, une affaire, ou un confrère.
ALTER TABLE "activities" DROP CONSTRAINT IF EXISTS "activities_has_subject";--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_has_subject" CHECK (
  "activities"."contact_id" IS NOT NULL OR "activities"."deal_id" IS NOT NULL OR "activities"."partner_id" IS NOT NULL);
