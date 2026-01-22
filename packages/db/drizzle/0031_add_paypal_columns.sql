-- Add PayPal integration columns to orders table
ALTER TABLE "orders" ADD COLUMN "paypal_order_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "paypal_capture_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_provider" text DEFAULT 'paymongo';--> statement-breakpoint

-- Update existing rows to have 'paymongo' as the default payment provider
UPDATE "orders" SET "payment_provider" = 'paymongo' WHERE "payment_provider" IS NULL;
