CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'declined', 'expired');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"email" text NOT NULL,
	"invite_token" text NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"invited_by" uuid NOT NULL,
	"message" text,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_invitations_invite_token_unique" UNIQUE("invite_token")
);
--> statement-breakpoint
ALTER TABLE "event_collaborators" DROP CONSTRAINT "unique_event_collaborator";--> statement-breakpoint
ALTER TABLE "event_collaborators" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "event_collaborators" ADD COLUMN "invited_email" text;--> statement-breakpoint
ALTER TABLE "event_collaborators" ADD COLUMN "invite_token" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_invitations" ADD CONSTRAINT "event_invitations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_invitations" ADD CONSTRAINT "event_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "event_collaborators" ADD CONSTRAINT "event_collaborators_invite_token_unique" UNIQUE("invite_token");