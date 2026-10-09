CREATE TYPE "public"."enquiry_status" AS ENUM('OPEN', 'QUALIFIED', 'QUALIFIED_WITH_NOTE', 'DECLINED', 'ESCALATED', 'NEEDS_REVIEW', 'CLAIMED', 'BOOKED', 'CONSULTATION_HELD', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."intent" AS ENUM('NEW_ENQUIRY', 'EXISTING_CLIENT', 'OUT_OF_SCOPE', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('telegram', 'email', 'sms', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('hot_lead', 'urgent_escalation', 'pricing_breach', 'sla_realert', 'sla_escalation', 'no_webhook_alert', 'daily_digest', 'scheduling_link');--> statement-breakpoint
CREATE TYPE "public"."outcome" AS ENUM('QUALIFIED', 'QUALIFIED_WITH_NOTE', 'DECLINED', 'ESCALATED', 'NEEDS_REVIEW');--> statement-breakpoint
CREATE TYPE "public"."owner_type" AS ENUM('designer', 'nikhil', 'system');--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enquiry_id" uuid NOT NULL,
	"designer_id" uuid,
	"calendly_event_uri" text,
	"scheduling_link" text,
	"slot_start" timestamp with time zone,
	"slot_end" timestamp with time zone,
	"site_visit_requested" boolean,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "callers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"name" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vaani_call_id" text NOT NULL,
	"caller_id" uuid,
	"enquiry_id" uuid,
	"from_number" text,
	"ring_started_at" timestamp with time zone,
	"answered_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"duration_sec" integer,
	"in_hours" boolean,
	"raw_transcript" jsonb,
	"transcript_text" text,
	"recording_url" text,
	"language" text,
	"knowledge_version" text NOT NULL,
	"pricing_breach" boolean DEFAULT false NOT NULL,
	"pricing_breach_hits" jsonb,
	"processing_status" text DEFAULT 'received' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_id" uuid,
	"vendor" text NOT NULL,
	"unit" text NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"unit_cost_inr" numeric(14, 6) NOT NULL,
	"total_inr" numeric(14, 4) NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dead_letters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"external_id" text,
	"payload" jsonb,
	"error" text NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "designers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"telegram_chat_id" text,
	"calendly_user" text,
	"email" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"caller_id" uuid,
	"channel" text DEFAULT 'phone' NOT NULL,
	"status" "enquiry_status" DEFAULT 'OPEN' NOT NULL,
	"intent" "intent",
	"decline_reason" text,
	"owner_type" "owner_type",
	"owner_designer_id" uuid,
	"assigned_designer_id" uuid,
	"caller_name" text,
	"phone_confirmed" boolean,
	"locality" text,
	"property_type" text,
	"bhk" text,
	"carpet_area_sqft" integer,
	"scope" text,
	"current_state" text,
	"timeline_text" text,
	"timeline_weeks" integer,
	"ownership" text,
	"decision_maker_status" text,
	"referral_source" text,
	"language" text,
	"site_visit_requested" boolean,
	"existing_designer_name" text,
	"project_location" text,
	"issue" text,
	"first_call_at" timestamp with time zone,
	"last_call_at" timestamp with time zone,
	"scored_at" timestamp with time zone,
	"brief_sent_at" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	"booked_at" timestamp with time zone,
	"consultation_held_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"brief_rating" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enquiry_id" uuid,
	"call_id" uuid,
	"channel" "notification_channel" NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"recipient" text NOT NULL,
	"recipient_designer_id" uuid,
	"payload" jsonb,
	"external_message_id" text,
	"sent_at" timestamp with time zone,
	"delivered" boolean DEFAULT false NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by_designer_id" uuid,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qualification_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enquiry_id" uuid,
	"call_id" uuid,
	"model" text NOT NULL,
	"knowledge_version" text NOT NULL,
	"intent" "intent" NOT NULL,
	"criteria" jsonb NOT NULL,
	"outcome" "outcome" NOT NULL,
	"score" integer NOT NULL,
	"summary_3_lines" text NOT NULL,
	"brief_for_designer" text NOT NULL,
	"open_questions" jsonb NOT NULL,
	"caller_sentiment" text,
	"frustration_flag" boolean DEFAULT false NOT NULL,
	"raw_json" jsonb NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"attempts" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"external_id" text,
	"signature_valid" boolean NOT NULL,
	"duplicate" boolean DEFAULT false NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_enquiry_id_enquiries_id_fk" FOREIGN KEY ("enquiry_id") REFERENCES "public"."enquiries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_designer_id_designers_id_fk" FOREIGN KEY ("designer_id") REFERENCES "public"."designers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_caller_id_callers_id_fk" FOREIGN KEY ("caller_id") REFERENCES "public"."callers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_enquiry_id_enquiries_id_fk" FOREIGN KEY ("enquiry_id") REFERENCES "public"."enquiries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_events" ADD CONSTRAINT "cost_events_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_caller_id_callers_id_fk" FOREIGN KEY ("caller_id") REFERENCES "public"."callers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_owner_designer_id_designers_id_fk" FOREIGN KEY ("owner_designer_id") REFERENCES "public"."designers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_assigned_designer_id_designers_id_fk" FOREIGN KEY ("assigned_designer_id") REFERENCES "public"."designers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_enquiry_id_enquiries_id_fk" FOREIGN KEY ("enquiry_id") REFERENCES "public"."enquiries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_designer_id_designers_id_fk" FOREIGN KEY ("recipient_designer_id") REFERENCES "public"."designers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_claimed_by_designer_id_designers_id_fk" FOREIGN KEY ("claimed_by_designer_id") REFERENCES "public"."designers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_results" ADD CONSTRAINT "qualification_results_enquiry_id_enquiries_id_fk" FOREIGN KEY ("enquiry_id") REFERENCES "public"."enquiries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_results" ADD CONSTRAINT "qualification_results_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "callers_phone_uq" ON "callers" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "calls_vaani_call_id_uq" ON "calls" USING btree ("vaani_call_id");--> statement-breakpoint
CREATE INDEX "calls_enquiry_idx" ON "calls" USING btree ("enquiry_id");--> statement-breakpoint
CREATE INDEX "calls_from_number_ended_idx" ON "calls" USING btree ("from_number","ended_at");--> statement-breakpoint
CREATE INDEX "cost_events_occurred_idx" ON "cost_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "enquiries_status_idx" ON "enquiries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "enquiries_caller_idx" ON "enquiries" USING btree ("caller_id");--> statement-breakpoint
CREATE INDEX "enquiries_first_call_idx" ON "enquiries" USING btree ("first_call_at");--> statement-breakpoint
CREATE INDEX "notifications_enquiry_idx" ON "notifications" USING btree ("enquiry_id");--> statement-breakpoint
CREATE INDEX "qr_enquiry_idx" ON "qualification_results" USING btree ("enquiry_id");--> statement-breakpoint
CREATE INDEX "webhook_receipts_source_received_idx" ON "webhook_receipts" USING btree ("source","received_at");