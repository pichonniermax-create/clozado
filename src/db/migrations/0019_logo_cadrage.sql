-- Correctif cadrage du logo (2026-09-17) : deux sources conservées pour recadrer sans réenvoyer, et le cadre de chaque image dérivée.
-- Rejouable (pas de transaction sur neon-http) : IF EXISTS / IF NOT EXISTS.
ALTER TABLE "organization_assets" DROP CONSTRAINT IF EXISTS "organization_assets_kind_check";--> statement-breakpoint
ALTER TABLE "organization_assets" ADD COLUMN IF NOT EXISTS "crop" jsonb;--> statement-breakpoint
ALTER TABLE "organization_assets" ADD CONSTRAINT "organization_assets_kind_check" CHECK ("organization_assets"."kind" IN ('logo_light', 'logo_dark', 'icon', 'logo_light_source', 'logo_dark_source'));