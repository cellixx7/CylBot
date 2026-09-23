CREATE TYPE "public"."ticket_status" AS ENUM('OPEN', 'CLAIMED', 'CLOSED', 'REOPENED');--> statement-breakpoint
CREATE TYPE "public"."ticket_event_type" AS ENUM('TICKET_CREATED', 'TICKET_CLAIMED', 'TICKET_CLOSED', 'TICKET_REOPENED');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discord_user_id" text NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"setup_id" text,
	"mode" text,
	"panel_channel_id" text,
	"log_channel_id" text,
	"active_category_id" text,
	"public_category_id" text,
	"panel_message_id" text,
	"support_role_ids" text[] DEFAULT '{}' NOT NULL,
	"ready" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"emoji" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_number" integer NOT NULL,
	"guild_id" text NOT NULL,
	"guild_name" text,
	"channel_id" text,
	"creator_user_id" uuid,
	"creator_name" text,
	"assigned_user_id" uuid,
	"assigned_name" text,
	"category_id" uuid,
	"category_key" text,
	"category_name" text,
	"subject" text NOT NULL,
	"description" text NOT NULL,
	"status" "ticket_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"close_reason" text,
	"resolution_summary" text,
	"reopen_count" integer DEFAULT 0 NOT NULL,
	"log_channel_id" text,
	"support_role_ids" text[] DEFAULT '{}' NOT NULL,
	"initial_message_id" text,
	"opening_log_id" text,
	"initialized" boolean DEFAULT false NOT NULL,
	"reopened_by" text,
	"reopened_by_name" text,
	"reopened_at" timestamp with time zone,
	"archives" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"closing" jsonb,
	"reopening" jsonb,
	"created_by_cycle" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"type" "ticket_event_type" NOT NULL,
	"actor_user_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_creator_user_id_users_id_fk" FOREIGN KEY ("creator_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_category_id_ticket_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."ticket_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_discord_user_id_unique" ON "users" USING btree ("discord_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_configs_guild_id_unique" ON "ticket_configs" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "ticket_categories_guild_id_idx" ON "ticket_categories" USING btree ("guild_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_categories_guild_key_unique" ON "ticket_categories" USING btree ("guild_id","key");--> statement-breakpoint
CREATE INDEX "tickets_guild_id_idx" ON "tickets" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "tickets_channel_id_idx" ON "tickets" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "tickets_creator_user_id_idx" ON "tickets" USING btree ("creator_user_id");--> statement-breakpoint
CREATE INDEX "tickets_status_idx" ON "tickets" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_guild_public_number_unique" ON "tickets" USING btree ("guild_id","public_number");--> statement-breakpoint
CREATE INDEX "ticket_events_ticket_id_idx" ON "ticket_events" USING btree ("ticket_id");