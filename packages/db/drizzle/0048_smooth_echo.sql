ALTER TABLE "orders" ADD COLUMN "refunded_amount" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refunded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refund_reason" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refunded_by" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "paymongo_refund_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "paypal_refund_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orders" ADD CONSTRAINT "orders_refunded_by_users_id_fk" FOREIGN KEY ("refunded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
