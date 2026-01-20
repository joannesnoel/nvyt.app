CREATE TYPE "public"."registration_field_type" AS ENUM('text', 'email', 'phone', 'textarea', 'select', 'radio', 'checkbox', 'date', 'number', 'url');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_registration_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"label" text NOT NULL,
	"field_type" "registration_field_type" NOT NULL,
	"placeholder" text,
	"help_text" text,
	"is_required" boolean DEFAULT true NOT NULL,
	"options" jsonb,
	"validation" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "registration_data" jsonb;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "registration_completed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "registration_completed_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ticket_registration_fields" ADD CONSTRAINT "ticket_registration_fields_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
