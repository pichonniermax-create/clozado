ALTER TABLE "organizations" ADD COLUMN "share_pending_reminder_days" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "share_pending_urgent_days" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "share_expiring_soon_days" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "deal_accepted_stale_days" integer DEFAULT 5 NOT NULL;