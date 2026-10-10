CREATE TABLE "web_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_name" text NOT NULL,
	"ip_hash" text NOT NULL,
	"language" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "web_sessions_created_idx" ON "web_sessions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "web_sessions_ip_idx" ON "web_sessions" USING btree ("ip_hash","created_at");