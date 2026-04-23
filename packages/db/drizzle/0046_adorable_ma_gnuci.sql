CREATE TYPE "public"."service_agreement_status" AS ENUM('draft', 'published');--> statement-breakpoint
ALTER TYPE "public"."document_type" ADD VALUE 'signed_service_agreement';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"content" text NOT NULL,
	"status" "service_agreement_status" DEFAULT 'draft' NOT NULL,
	"generated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_agreements_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "service_agreements" ADD CONSTRAINT "service_agreements_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "service_agreements" ADD CONSTRAINT "service_agreements_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
