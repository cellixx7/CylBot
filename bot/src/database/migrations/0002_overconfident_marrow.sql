CREATE TABLE "ticket_sequences" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"next_number" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ticket_events" DROP CONSTRAINT "ticket_events_actor_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "ticket_events" ALTER COLUMN "actor_user_id" SET DATA TYPE text;