CREATE TABLE "ifsc_branches" (
	"ifsc" text PRIMARY KEY NOT NULL,
	"bank" text NOT NULL,
	"bank_code" text NOT NULL,
	"branch" text NOT NULL,
	"city" text,
	"district" text,
	"state" text,
	"address" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "specimen" jsonb;