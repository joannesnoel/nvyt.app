CREATE TYPE "public"."event_theme" AS ENUM('light', 'dark');--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "theme" "event_theme";