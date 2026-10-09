ALTER TABLE "bookings" ADD COLUMN "calendly_invitee_uri" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "calendly_event_type_uri" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "offered_slots" jsonb;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "link_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "designers" ADD COLUMN "calendly_event_type_uri" text;--> statement-breakpoint
ALTER TABLE "designers" ADD COLUMN "phone" text;