ALTER TYPE "public"."ticket_status" ADD VALUE 'CONCLUDED';--> statement-breakpoint
ALTER TYPE "public"."ticket_event_type" ADD VALUE 'TICKET_CONCLUDED';--> statement-breakpoint
ALTER TYPE "public"."ticket_event_type" ADD VALUE 'TICKET_TOOL';--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD COLUMN "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL;