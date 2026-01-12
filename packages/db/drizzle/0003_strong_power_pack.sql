CREATE TABLE IF NOT EXISTS "event_collaborators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"can_edit" boolean DEFAULT false NOT NULL,
	"can_publish" boolean DEFAULT false NOT NULL,
	"can_manage_tickets" boolean DEFAULT false NOT NULL,
	"can_check_in" boolean DEFAULT false NOT NULL,
	"can_manage_attendees" boolean DEFAULT false NOT NULL,
	"can_view_analytics" boolean DEFAULT true NOT NULL,
	"invited_by" uuid NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unique_event_collaborator" UNIQUE("event_id","user_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_collaborators" ADD CONSTRAINT "event_collaborators_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_collaborators" ADD CONSTRAINT "event_collaborators_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_collaborators" ADD CONSTRAINT "event_collaborators_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
