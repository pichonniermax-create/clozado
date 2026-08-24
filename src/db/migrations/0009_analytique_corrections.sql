-- Module analytique, étape 2 — corrections 2, 3, 4 et 5 de l'audit
-- (docs/module-analytique.md §2). Rejouable : chaque rattrapage est
-- idempotent (neon-http n'entoure pas la migration d'une transaction).
-- Règle : une date se RECONSTRUIT depuis une observation journalisée, ou
-- reste NULL — jamais une valeur plausible (updated_at) à sa place.

-- 2. Chaîne des renvois de lien : le nouveau partage pointe celui qu'il remplace.
ALTER TABLE "deal_shares" ADD COLUMN "replaces_share_id" uuid;--> statement-breakpoint
ALTER TABLE "deal_shares" ADD CONSTRAINT "deal_shares_replaces_org_fk" FOREIGN KEY ("replaces_share_id","organization_id") REFERENCES "public"."deal_shares"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- 3. Commissions : horodatages dédiés de la confirmation et du règlement.
ALTER TABLE "commissions" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "commissions" ADD COLUMN "settled_at" timestamp with time zone;--> statement-breakpoint
-- Rattrapage depuis le journal : la PREMIÈRE confirmation et le PREMIER
-- règlement journalisés pour le partage de la commission. Les deux libellés
-- sont les seuls jamais écrits par le produit (commissions.ts, inchangés
-- depuis leur introduction — vérifié dans l'historique git) ; en base,
-- aucun autre libellé n'existe pour ce type d'événement.
-- Une commission confirmée/réglée sans événement garde NULL : date inconnue.
UPDATE "commissions" c
SET "confirmed_at" = e.first_at
FROM (
  SELECT "share_id", min("created_at") AS first_at
  FROM "deal_events"
  WHERE "type" = 'commission_updated' AND "message" = 'Commission confirmée.'
  GROUP BY "share_id"
) e
WHERE e."share_id" = c."share_id"
  AND c."state" IN ('confirmee', 'reglee')
  AND c."confirmed_at" IS NULL;--> statement-breakpoint
UPDATE "commissions" c
SET "settled_at" = e.first_at
FROM (
  SELECT "share_id", min("created_at") AS first_at
  FROM "deal_events"
  WHERE "type" = 'commission_updated' AND "message" = 'Commission marquée réglée.'
  GROUP BY "share_id"
) e
WHERE e."share_id" = c."share_id"
  AND c."state" = 'reglee'
  AND c."settled_at" IS NULL;--> statement-breakpoint
-- Cohérence des dates avec l'état SANS exiger leur présence : une prévue n'a
-- aucune date, une confirmée n'a pas de règlement, un règlement ne précède
-- jamais sa confirmation. Les trois états sont ceux de l'enum
-- commission_state (prevue, confirmee, reglee — aucune autre valeur) ; en
-- ajouter un passera par une migration qui revisitera cette contrainte.
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_state_dates_consistency" CHECK ((("commissions"."state" = 'prevue' AND "commissions"."confirmed_at" IS NULL AND "commissions"."settled_at" IS NULL)
        OR ("commissions"."state" = 'confirmee' AND "commissions"."settled_at" IS NULL)
        OR "commissions"."state" = 'reglee')
        AND ("commissions"."confirmed_at" IS NULL OR "commissions"."settled_at" IS NULL OR "commissions"."settled_at" >= "commissions"."confirmed_at"));--> statement-breakpoint

-- 4. Motif de perte historisé sur le passage d'étape, et marqueur de
-- reconstruction pour distinguer une observation d'un rattrapage.
ALTER TABLE "deal_stage_changes" ADD COLUMN "loss_reason_id" uuid;--> statement-breakpoint
ALTER TABLE "deal_stage_changes" ADD COLUMN "reconstructed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "deal_stage_changes" ADD CONSTRAINT "deal_stage_changes_loss_reason_org_fk" FOREIGN KEY ("loss_reason_id","organization_id") REFERENCES "public"."loss_reasons"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Rattrapage : une affaire ACTUELLEMENT dans une étape perdue porte son
-- motif courant ; on le reporte sur son dernier passage vers cette étape,
-- marqué reconstruit (le motif a pu être choisi après le passage). Les
-- pertes passées dont l'affaire est ressortie n'ont plus de motif nulle
-- part : NULL, assumé.
UPDATE "deal_stage_changes" s
SET "loss_reason_id" = d."loss_reason_id", "reconstructed" = true
FROM "deals" d
JOIN "deal_statuses" st ON st."id" = d."status_id"
WHERE s."deal_id" = d."id"
  AND s."to_status_id" = d."status_id"
  AND st."outcome" = 'lost'
  AND d."loss_reason_id" IS NOT NULL
  AND s."loss_reason_id" IS NULL
  AND s."changed_at" = (
    SELECT max(s2."changed_at") FROM "deal_stage_changes" s2
    WHERE s2."deal_id" = d."id" AND s2."to_status_id" = d."status_id"
  );--> statement-breakpoint

-- 5. Affaires d'avant l'étape 4 sans ligne d'étape initiale : une entrée
-- « from NULL → étape courante » à la date de création, attribuée au
-- créateur, MARQUÉE reconstruite (l'historique intermédiaire est perdu).
INSERT INTO "deal_stage_changes" ("organization_id", "deal_id", "from_status_id", "to_status_id", "actor_user_id", "changed_at", "reconstructed")
SELECT d."organization_id", d."id", NULL, d."status_id", d."created_by", d."created_at", true
FROM "deals" d
WHERE NOT EXISTS (
  SELECT 1 FROM "deal_stage_changes" s WHERE s."deal_id" = d."id" AND s."from_status_id" IS NULL
);
