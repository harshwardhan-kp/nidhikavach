-- Extensions (already installed by the VM setup as superuser; these are no-ops then).
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgcrypto;--> statement-breakpoint
CREATE TYPE "public"."approval_step" AS ENUM('recommend', 'check', 'approve');--> statement-breakpoint
CREATE TYPE "public"."decision" AS ENUM('approve', 'return', 'reject');--> statement-breakpoint
CREATE TYPE "public"."discrepancy_status" AS ENUM('open', 'awaiting_institution', 'resolved_pending_check', 'closed', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."document_kind" AS ENUM('fdr_scan', 'bank_letter', 'renewal_scan', 'release_order', 'supporting');--> statement-breakpoint
CREATE TYPE "public"."field_match" AS ENUM('match', 'soft_match', 'mismatch', 'missing');--> statement-breakpoint
CREATE TYPE "public"."instrument_type" AS ENUM('fdr', 'efdr', 'bg', 'ebg', 'dd');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('inbox', 'email');--> statement-breakpoint
CREATE TYPE "public"."processing_status" AS ENUM('pending', 'running', 'done', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."record_status" AS ENUM('draft', 'submitted', 'under_scrutiny', 'accepted', 'returned', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."release_kind" AS ENUM('release', 'refund', 'discharge');--> statement-breakpoint
CREATE TYPE "public"."release_status" AS ENUM('none', 'requested', 'recommended', 'checked', 'approved', 'released', 'refunded', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."renewal_status" AS ENUM('not_due', 'due', 'requested', 'renewed', 'replaced', 'overdue');--> statement-breakpoint
CREATE TYPE "public"."risk_band" AS ENUM('green', 'amber', 'red', 'unscored');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('institution', 'maker', 'checker', 'authority', 'auditor', 'admin');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."validity_status" AS ENUM('valid', 'expiring', 'matured', 'expired', 'lien_unknown');--> statement-breakpoint
CREATE TYPE "public"."verification_method" AS ENUM('account_aggregator', 'nesl', 'bank_letter', 'manual');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('unverified', 'pending_bank', 'bank_confirmed', 'mismatch', 'unavailable', 'manual_confirmed');--> statement-breakpoint
CREATE TABLE "ai_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feature" text NOT NULL,
	"model" text NOT NULL,
	"input_hash" text NOT NULL,
	"output" jsonb,
	"input_tokens" integer,
	"output_tokens" integer,
	"latency_ms" integer,
	"cached" boolean DEFAULT false NOT NULL,
	"error" text,
	"actor_id" uuid,
	"instrument_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_request_id" uuid NOT NULL,
	"step" "approval_step" NOT NULL,
	"actor_id" uuid NOT NULL,
	"decision" "decision" NOT NULL,
	"comment" text,
	"signed_payload" text,
	"signature" text,
	"key_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_ledger" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"actor_id" uuid,
	"actor_role" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"prev_hash" text NOT NULL,
	"hash" text NOT NULL,
	CONSTRAINT "audit_ledger_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
CREATE TABLE "discrepancies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"field" text,
	"severity" "severity" NOT NULL,
	"status" "discrepancy_status" DEFAULT 'open' NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"auto_raised" boolean DEFAULT false NOT NULL,
	"raised_by" uuid,
	"raised_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone,
	"resolved_by" uuid,
	"resolution" text,
	"closed_by" uuid,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"kind" "document_kind" NOT NULL,
	"file_key" text NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"uploaded_by" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"extraction_status" "processing_status" DEFAULT 'pending' NOT NULL,
	"extraction" jsonb,
	"tamper_status" "processing_status" DEFAULT 'pending' NOT NULL,
	"tamper_score" integer,
	"tamper_findings" jsonb,
	"synthetic" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "institutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"aicte_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"ownership" text NOT NULL,
	"state" text NOT NULL,
	"city" text NOT NULL,
	"region_id" integer NOT NULL,
	"nodal_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institutions_aicte_id_unique" UNIQUE("aicte_id")
);
--> statement-breakpoint
CREATE TABLE "instrument_fields" (
	"instrument_id" uuid NOT NULL,
	"field" text NOT NULL,
	"declared_value" text,
	"scan_value" text,
	"scan_confidence" real,
	"scan_source" text,
	"bank_value" text,
	"bank_source" text,
	"match" "field_match" DEFAULT 'missing' NOT NULL,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instrument_fields_instrument_id_field_pk" PRIMARY KEY("instrument_id","field")
);
--> statement-breakpoint
CREATE TABLE "instruments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_no" text NOT NULL,
	"institution_id" uuid NOT NULL,
	"programme" text NOT NULL,
	"purpose" text DEFAULT 'security_deposit' NOT NULL,
	"type" "instrument_type" DEFAULT 'fdr' NOT NULL,
	"instrument_no" text,
	"bank_name" text,
	"ifsc" text,
	"branch" text,
	"amount_paise" bigint,
	"issue_date" date,
	"maturity_date" date,
	"depositor_name" text,
	"lien_holder" text,
	"auto_renew" boolean,
	"record_status" "record_status" DEFAULT 'draft' NOT NULL,
	"verification_status" "verification_status" DEFAULT 'unverified' NOT NULL,
	"validity_status" "validity_status" DEFAULT 'valid' NOT NULL,
	"renewal_status" "renewal_status" DEFAULT 'not_due' NOT NULL,
	"release_status" "release_status" DEFAULT 'none' NOT NULL,
	"trust_score" integer,
	"risk_band" "risk_band" DEFAULT 'unscored' NOT NULL,
	"trust_breakdown" jsonb,
	"replaces_instrument_id" uuid,
	"rule_set_version" integer,
	"owner_user_id" uuid,
	"next_action" text,
	"next_action_due" date,
	"submitted_by" uuid,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "instruments_case_no_unique" UNIQUE("case_no")
);
--> statement-breakpoint
CREATE TABLE "ledger_anchors" (
	"id" serial PRIMARY KEY NOT NULL,
	"seq" bigint NOT NULL,
	"hash" text NOT NULL,
	"location" text NOT NULL,
	"anchored_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"user_id" uuid,
	"institution_id" uuid,
	"instrument_id" uuid,
	"to_address" text,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"link" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"discrepancy_id" uuid,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"shared_with_institution" boolean DEFAULT false NOT NULL,
	"ai_drafted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"hq_city" text NOT NULL,
	"states" text[] DEFAULT '{}'::text[] NOT NULL,
	CONSTRAINT "regions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "release_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"kind" "release_kind" NOT NULL,
	"reason" text NOT NULL,
	"conditions" jsonb,
	"state" "release_status" DEFAULT 'requested' NOT NULL,
	"requested_by" uuid NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"order_no" text,
	"order_document_id" uuid,
	"order_hash" text,
	CONSTRAINT "release_requests_order_no_unique" UNIQUE("order_no")
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"offset_days" integer,
	"due_on" date NOT NULL,
	"escalation_level" integer DEFAULT 0 NOT NULL,
	"rule_set_version" integer,
	"fired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rule_sets" (
	"id" serial PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"effective_from" date NOT NULL,
	"body" jsonb NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rule_sets_version_unique" UNIQUE("version")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signing_keys" (
	"key_id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"public_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role" "role" NOT NULL,
	CONSTRAINT "user_roles_user_id_role_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"designation" text NOT NULL,
	"password_hash" text NOT NULL,
	"institution_id" uuid,
	"region_id" integer,
	"is_demo" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"method" "verification_method" NOT NULL,
	"consent_id" text,
	"status" "processing_status" DEFAULT 'pending' NOT NULL,
	"result" "verification_status",
	"request" jsonb,
	"response" jsonb,
	"requested_by" uuid,
	"confirmed_by" uuid,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_release_request_id_release_requests_id_fk" FOREIGN KEY ("release_request_id") REFERENCES "public"."release_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discrepancies" ADD CONSTRAINT "discrepancies_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discrepancies" ADD CONSTRAINT "discrepancies_raised_by_users_id_fk" FOREIGN KEY ("raised_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discrepancies" ADD CONSTRAINT "discrepancies_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discrepancies" ADD CONSTRAINT "discrepancies_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instrument_fields" ADD CONSTRAINT "instrument_fields_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instruments" ADD CONSTRAINT "instruments_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instruments" ADD CONSTRAINT "instruments_replaces_instrument_id_instruments_id_fk" FOREIGN KEY ("replaces_instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instruments" ADD CONSTRAINT "instruments_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instruments" ADD CONSTRAINT "instruments_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_discrepancy_id_discrepancies_id_fk" FOREIGN KEY ("discrepancy_id") REFERENCES "public"."discrepancies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_requests" ADD CONSTRAINT "release_requests_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_requests" ADD CONSTRAINT "release_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_requests" ADD CONSTRAINT "release_requests_order_document_id_documents_id_fk" FOREIGN KEY ("order_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_sets" ADD CONSTRAINT "rule_sets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signing_keys" ADD CONSTRAINT "signing_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_calls_cache_idx" ON "ai_calls" USING btree ("feature","model","input_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "approvals_request_step_idx" ON "approvals" USING btree ("release_request_id","step");--> statement-breakpoint
CREATE INDEX "audit_ledger_entity_idx" ON "audit_ledger" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "discrepancies_instrument_idx" ON "discrepancies" USING btree ("instrument_id");--> statement-breakpoint
CREATE INDEX "discrepancies_status_idx" ON "discrepancies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "documents_instrument_idx" ON "documents" USING btree ("instrument_id");--> statement-breakpoint
CREATE INDEX "institutions_region_idx" ON "institutions" USING btree ("region_id");--> statement-breakpoint
CREATE INDEX "institutions_name_trgm_idx" ON "institutions" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "instruments_institution_idx" ON "instruments" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "instruments_maturity_idx" ON "instruments" USING btree ("maturity_date");--> statement-breakpoint
CREATE INDEX "instruments_lanes_idx" ON "instruments" USING btree ("record_status","verification_status","validity_status");--> statement-breakpoint
CREATE INDEX "instruments_risk_idx" ON "instruments" USING btree ("risk_band","trust_score");--> statement-breakpoint
CREATE INDEX "instruments_owner_idx" ON "instruments" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "instruments_no_trgm_idx" ON "instruments" USING gin ("instrument_no" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "observations_instrument_idx" ON "observations" USING btree ("instrument_id");--> statement-breakpoint
CREATE INDEX "release_requests_instrument_idx" ON "release_requests" USING btree ("instrument_id");--> statement-breakpoint
CREATE INDEX "reminders_due_idx" ON "reminders" USING btree ("due_on");--> statement-breakpoint
CREATE UNIQUE INDEX "reminders_unique_idx" ON "reminders" USING btree ("instrument_id","kind","offset_days","escalation_level");--> statement-breakpoint
CREATE INDEX "verifications_instrument_idx" ON "verifications" USING btree ("instrument_id");