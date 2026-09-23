CREATE TYPE "public"."ticket_message_origin" AS ENUM('DISCORD', 'WEB', 'AI', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."ticket_message_author_type" AS ENUM('USER', 'STAFF', 'AI', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."ticket_message_visibility" AS ENUM('PUBLIC', 'INTERNAL', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."ticket_message_delivery_status" AS ENUM('PENDING', 'SENDING', 'SENT', 'FAILED', 'NOT_REQUIRED');--> statement-breakpoint
CREATE TABLE "ticket_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"guild_id" text NOT NULL,
	"author_discord_id" text,
	"author_name" text NOT NULL,
	"author_type" "ticket_message_author_type" NOT NULL,
	"origin" "ticket_message_origin" NOT NULL,
	"visibility" "ticket_message_visibility" DEFAULT 'PUBLIC' NOT NULL,
	"content" text NOT NULL,
	"client_message_id" text,
	"discord_message_id" text,
	"discord_channel_id" text,
	"delivery_status" "ticket_message_delivery_status" DEFAULT 'PENDING' NOT NULL,
	"delivery_attempts" integer DEFAULT 0 NOT NULL,
	"delivery_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	CONSTRAINT "ticket_messages_content_length_check" CHECK (char_length("ticket_messages"."content") between 1 and 2000),
	CONSTRAINT "ticket_messages_delivery_attempts_check" CHECK ("ticket_messages"."delivery_attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticket_messages_ticket_created_idx" ON "ticket_messages" USING btree ("ticket_id","created_at","id");--> statement-breakpoint
CREATE INDEX "ticket_messages_guild_id_idx" ON "ticket_messages" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "ticket_messages_delivery_status_idx" ON "ticket_messages" USING btree ("delivery_status");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_messages_client_id_unique" ON "ticket_messages" USING btree ("ticket_id","client_message_id") WHERE "ticket_messages"."client_message_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_messages_discord_id_unique" ON "ticket_messages" USING btree ("guild_id","discord_message_id") WHERE "ticket_messages"."discord_message_id" is not null;
