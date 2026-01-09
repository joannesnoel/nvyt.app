DO $$ BEGIN
  CREATE TYPE "public"."registration_mode" AS ENUM('rsvp', 'tickets', 'open');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "registration_mode" "registration_mode" DEFAULT 'rsvp' NOT NULL;
