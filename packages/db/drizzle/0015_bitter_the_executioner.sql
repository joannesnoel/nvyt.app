CREATE TYPE "public"."event_media_type" AS ENUM('image', 'video');--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "media_type" "event_media_type" DEFAULT 'image' NOT NULL;