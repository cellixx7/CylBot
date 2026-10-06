CREATE TABLE "announcement_publications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "guild_id" text NOT NULL,
  "type" text NOT NULL,
  "title" text NOT NULL,
  "content" text NOT NULL,
  "channel_id" text NOT NULL,
  "channel_name" text,
  "community_visible" boolean DEFAULT false NOT NULL,
  "published_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "announcement_publications_guild_created_idx" ON "announcement_publications" USING btree ("guild_id","created_at");
