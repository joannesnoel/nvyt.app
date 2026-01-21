-- Add fee columns to orders
ALTER TABLE "orders" ADD COLUMN "subtotal_amount" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "processing_fee" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "admin_fee" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "total_fees" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint

-- Backfill existing orders: subtotal = total (no fees applied before)
UPDATE "orders" SET "subtotal_amount" = "total_amount" WHERE "subtotal_amount" IS NULL;--> statement-breakpoint

-- Now make subtotal_amount NOT NULL
ALTER TABLE "orders" ALTER COLUMN "subtotal_amount" SET NOT NULL;--> statement-breakpoint

-- Add admin_fee_rate to event_verifications
ALTER TABLE "event_verifications" ADD COLUMN "admin_fee_rate" numeric(5, 4) DEFAULT '0';
