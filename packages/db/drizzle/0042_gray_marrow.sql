CREATE TYPE "public"."support_conversation_status" AS ENUM('open', 'waiting_on_visitor', 'waiting_on_support', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."support_message_sender_type" AS ENUM('visitor', 'admin', 'organizer', 'system');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "support_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visitor_token" text NOT NULL,
	"user_id" uuid,
	"visitor_name" text NOT NULL,
	"visitor_email" text,
	"event_id" uuid,
	"status" "support_conversation_status" DEFAULT 'open' NOT NULL,
	"assignee_id" uuid,
	"subject" text,
	"last_message_at" timestamp with time zone,
	"last_message_preview" text,
	"unread_by_visitor" integer DEFAULT 0 NOT NULL,
	"unread_by_support" integer DEFAULT 0 NOT NULL,
	"visitor_online" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_conversations_visitor_token_unique" UNIQUE("visitor_token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "support_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_type" "support_message_sender_type" NOT NULL,
	"sender_id" uuid,
	"sender_name" text NOT NULL,
	"content" text,
	"attachments" jsonb,
	"read_by_visitor" boolean DEFAULT false NOT NULL,
	"read_by_support" boolean DEFAULT false NOT NULL,
	"email_notification_sent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "support_conversations" ADD CONSTRAINT "support_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "support_conversations" ADD CONSTRAINT "support_conversations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "support_conversations" ADD CONSTRAINT "support_conversations_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_conversation_id_support_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."support_conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
