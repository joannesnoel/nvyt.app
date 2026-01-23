ALTER TABLE "users" ADD COLUMN "birthdate" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "attendee_user_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tickets" ADD CONSTRAINT "tickets_attendee_user_id_users_id_fk" FOREIGN KEY ("attendee_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
