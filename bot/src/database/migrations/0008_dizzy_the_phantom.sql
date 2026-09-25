ALTER TABLE "ticket_ai_configs" ADD COLUMN "inactivity_timeout_seconds" integer DEFAULT 900 NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_ai_ticket_states" ADD COLUMN "follow_up_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ticket_ai_ticket_states" ADD COLUMN "awaiting_closure_confirmation" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_ai_ticket_states" ADD COLUMN "handoff_reason" text;--> statement-breakpoint
ALTER TABLE "ticket_ai_configs" ADD CONSTRAINT "ticket_ai_inactivity_timeout_check" CHECK ("ticket_ai_configs"."inactivity_timeout_seconds" between 5 and 86400);