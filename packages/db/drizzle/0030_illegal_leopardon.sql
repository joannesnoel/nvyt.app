CREATE TYPE "public"."price_tier_type" AS ENUM('time', 'quantity', 'hybrid');--> statement-breakpoint
ALTER TABLE "ticket_price_tiers" ALTER COLUMN "start_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_price_tiers" ALTER COLUMN "end_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_price_tiers" ADD COLUMN "tier_type" "price_tier_type" DEFAULT 'time' NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_price_tiers" ADD COLUMN "quantity_limit" integer;--> statement-breakpoint
ALTER TABLE "ticket_price_tiers" ADD COLUMN "quantity_sold" integer DEFAULT 0 NOT NULL;