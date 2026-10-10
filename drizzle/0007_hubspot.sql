ALTER TABLE "enquiries" ADD COLUMN "hubspot_contact_id" text;--> statement-breakpoint
ALTER TABLE "enquiries" ADD COLUMN "hubspot_deal_id" text;--> statement-breakpoint
ALTER TABLE "enquiries" ADD COLUMN "hubspot_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "enquiries" ADD COLUMN "hubspot_error" text;