CREATE TABLE "ticket_ai_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"autonomy_level" integer DEFAULT 0 NOT NULL,
	"assistant_name" text DEFAULT 'CylBot' NOT NULL,
	"tone" text DEFAULT 'cordial' NOT NULL,
	"language" text DEFAULT 'pt-BR' NOT NULL,
	"server_context" text DEFAULT '' NOT NULL,
	"support_instructions" text DEFAULT '' NOT NULL,
	"capabilities" text[] DEFAULT '{"reply","ask_clarifying_question","summarize","request_human","suggest_close"}' NOT NULL,
	"human_escalation_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_ai_configs_guild_id_unique" UNIQUE("guild_id"),
	CONSTRAINT "ticket_ai_autonomy_level_check" CHECK ("ticket_ai_configs"."autonomy_level" between 0 and 3)
);
--> statement-breakpoint
CREATE TABLE "ticket_ai_ticket_states" (
	"ticket_id" uuid PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"escalated_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"last_message_id" text,
	"lease_id" uuid,
	"lease_expires_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_ai_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"guild_id" text NOT NULL,
	"trigger" text NOT NULL,
	"model" text,
	"action_proposed" text,
	"action_executed" text,
	"confidence_percent" integer,
	"required_human" boolean DEFAULT false NOT NULL,
	"status" text NOT NULL,
	"reason" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ticket_ai_ticket_states" ADD CONSTRAINT "ticket_ai_ticket_states_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_ai_runs" ADD CONSTRAINT "ticket_ai_runs_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticket_ai_states_guild_idx" ON "ticket_ai_ticket_states" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "ticket_ai_runs_ticket_idx" ON "ticket_ai_runs" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "ticket_ai_runs_guild_idx" ON "ticket_ai_runs" USING btree ("guild_id","created_at");