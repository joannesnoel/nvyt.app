CREATE TYPE "public"."requirement_type" AS ENUM('checkbox', 'yes_no');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"type" "requirement_type" NOT NULL,
	"text" text NOT NULL,
	"description" text,
	"required_answer" boolean,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "requirement_responses" jsonb;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_requirements" ADD CONSTRAINT "event_requirements_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
