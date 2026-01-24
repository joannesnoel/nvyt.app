ALTER TABLE "events" ADD COLUMN "collect_attendee_address" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "collect_attendee_sex" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "attendee_sex_options" jsonb;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "attendee_address" jsonb;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "attendee_sex" text;