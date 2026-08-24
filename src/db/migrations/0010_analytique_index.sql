CREATE INDEX "contacts_org_created_idx" ON "contacts" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "deals_org_created_idx" ON "deals" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "deal_shares_org_partner_sent_idx" ON "deal_shares" USING btree ("organization_id","partner_id","sent_at");--> statement-breakpoint
CREATE INDEX "deal_shares_org_status_idx" ON "deal_shares" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "commissions_org_state_idx" ON "commissions" USING btree ("organization_id","state");--> statement-breakpoint
CREATE INDEX "deal_events_org_created_idx" ON "deal_events" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "deal_events_org_share_type_idx" ON "deal_events" USING btree ("organization_id","share_id","type");--> statement-breakpoint
CREATE INDEX "deal_stage_changes_org_to_status_changed_idx" ON "deal_stage_changes" USING btree ("organization_id","to_status_id","changed_at");--> statement-breakpoint
CREATE INDEX "tasks_org_status_completed_idx" ON "tasks" USING btree ("organization_id","status","completed_at");