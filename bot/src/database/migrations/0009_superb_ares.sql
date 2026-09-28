CREATE TABLE "announcement_categories" (
	"guild_id" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"image" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcement_categories_pk" PRIMARY KEY("guild_id","id")
);
--> statement-breakpoint
DROP INDEX "ticket_messages_ticket_created_idx";--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD COLUMN "cycle" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "announcement_categories_guild_id_idx" ON "announcement_categories" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "ticket_messages_ticket_created_idx" ON "ticket_messages" USING btree ("ticket_id","cycle","created_at","id");--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_cycle_check" CHECK ("ticket_messages"."cycle" >= 0);