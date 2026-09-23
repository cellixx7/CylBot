ALTER TABLE "tickets" DROP CONSTRAINT "tickets_creator_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "tickets" DROP CONSTRAINT "tickets_assigned_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "tickets" DROP CONSTRAINT "tickets_category_id_ticket_categories_id_fk";
--> statement-breakpoint
ALTER TABLE "tickets" ALTER COLUMN "creator_user_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "tickets" ALTER COLUMN "assigned_user_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "tickets" ALTER COLUMN "category_id" SET DATA TYPE text;