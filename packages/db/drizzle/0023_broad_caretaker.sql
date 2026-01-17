-- First drop the defaults that depend on the enum
ALTER TABLE "public"."events" ALTER COLUMN "font_family" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."events" ALTER COLUMN "body_font_family" DROP DEFAULT;--> statement-breakpoint
-- Convert columns to text
ALTER TABLE "public"."events" ALTER COLUMN "font_family" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "public"."events" ALTER COLUMN "body_font_family" SET DATA TYPE text;--> statement-breakpoint
-- Drop and recreate the enum with new values
DROP TYPE "public"."event_font_family";--> statement-breakpoint
CREATE TYPE "public"."event_font_family" AS ENUM('system', 'oswald', 'bebasnueve', 'anton', 'archivoblack', 'dancingscript', 'greatvibes', 'pacifico', 'sacramento', 'satisfy', 'lobster', 'inter', 'roboto', 'opensans', 'lato', 'montserrat', 'poppins', 'nunito', 'raleway', 'worksans', 'dmsans', 'quicksand', 'playfair', 'merriweather', 'sourceserif', 'librebaskerville', 'crimsontext', 'ebgaramond', 'cormorant');--> statement-breakpoint
-- Convert columns back to enum
ALTER TABLE "public"."events" ALTER COLUMN "font_family" SET DATA TYPE "public"."event_font_family" USING "font_family"::"public"."event_font_family";--> statement-breakpoint
ALTER TABLE "public"."events" ALTER COLUMN "body_font_family" SET DATA TYPE "public"."event_font_family" USING "body_font_family"::"public"."event_font_family";--> statement-breakpoint
-- Restore the defaults
ALTER TABLE "public"."events" ALTER COLUMN "font_family" SET DEFAULT 'system';--> statement-breakpoint
ALTER TABLE "public"."events" ALTER COLUMN "body_font_family" SET DEFAULT 'system';
