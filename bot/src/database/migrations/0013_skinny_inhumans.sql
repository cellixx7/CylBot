CREATE TABLE "plan_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"plan" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"server_limit" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_subscriptions_plan_check" CHECK ("plan_subscriptions"."plan" in ('PLUS', 'COMMUNITY')),
	CONSTRAINT "plan_subscriptions_status_check" CHECK ("plan_subscriptions"."status" in ('ACTIVE', 'REVOKED')),
	CONSTRAINT "plan_subscriptions_scope_check" CHECK (("plan_subscriptions"."plan" = 'PLUS' and "plan_subscriptions"."server_limit" = 0) or ("plan_subscriptions"."plan" = 'COMMUNITY' and "plan_subscriptions"."server_limit" between 1 and 10000))
);
--> statement-breakpoint
CREATE TABLE "plan_guilds" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"subscription_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plan_guilds" ADD CONSTRAINT "plan_guilds_subscription_id_plan_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."plan_subscriptions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "plan_subscriptions_user_plan_idx" ON "plan_subscriptions" USING btree ("user_id","plan");
--> statement-breakpoint
CREATE INDEX "plan_guilds_subscription_idx" ON "plan_guilds" USING btree ("subscription_id");
