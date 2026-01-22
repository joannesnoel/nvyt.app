ALTER TABLE "orders" ADD COLUMN "paypal_order_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "paypal_capture_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_provider" text DEFAULT 'paymongo';