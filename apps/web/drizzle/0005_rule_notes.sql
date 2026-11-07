-- pgvector is installed on the VM by the superuser; this is a no-op there.
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "rule_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"clause" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"embedding" vector(1536),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
