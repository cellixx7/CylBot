CREATE TABLE "user_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"accent" text DEFAULT '#7c5cff' NOT NULL,
	"theme" text DEFAULT 'CLASSIC' NOT NULL,
	"visibility" text DEFAULT 'COMMUNITY' NOT NULL,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_theme_check" CHECK ("user_profiles"."theme" in ('CLASSIC','AURORA','COSMIC')),
	CONSTRAINT "user_profiles_visibility_check" CHECK ("user_profiles"."visibility" in ('PUBLIC','COMMUNITY','PRIVATE')),
	CONSTRAINT "user_profiles_bio_check" CHECK (char_length("user_profiles"."bio") <= 500),
	CONSTRAINT "user_profiles_accent_check" CHECK ("user_profiles"."accent" ~ '^#[0-9a-fA-F]{6}$')
);
--> statement-breakpoint
CREATE TABLE "profile_badges" (
	"user_id" text NOT NULL,
	"badge" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_badges_user_id_badge_pk" PRIMARY KEY("user_id","badge"),
	CONSTRAINT "profile_badges_badge_check" CHECK ("profile_badges"."badge" in ('PARTNER','CREATOR','STAFF'))
);
