# NidhiKavach build progress (handoff)

Last updated: 7 Nov 2026 (P3 done). Branch `prototype` (pushed). Plan: [`BUILD_PLAN.md`](BUILD_PLAN.md).

## Done

- **P0 foundations**: Next.js 16 app in `apps/web` (landing at `/`, portal at `/app`), Drizzle schema, hash-chained ledger (`ledger_append` / `ledger_verify`), auth + 6 demo roles + role switcher, demo clock, 403/404 pages. Vercel project `nidhikavach` builds `apps/web`, functions in bom1.
- **P1 registry**: deterministic seed (~1,500 institutions, ~8,750 FDRs on 1,498 real IFSC branches, showcase cases), cases list + case page, institution submit with direct signed upload to the sidecar, legacy Excel/CSV import with `gpt-6-luna` column mapping.
- **P2 verify** (done 7 Nov):
  - Engine: `modules/verify/` (Doc-AI `di.ts` + pure parsing `di-parse.ts`, `vision.ts` A1/A2, `reconcile.ts`, `pipeline.ts` `readScan()`, `bank.ts` NeSL / AA / letter, `recompute.ts`, `risk.ts` A9, `queue.ts`). Server actions in `modules/verify/actions.ts`.
  - Case page: actions panel by role (`actions-panel.tsx`: read scan with progress text, ask the bank, record letter with upload, checker confirms, accept, return, raise), discrepancy threads with per-status buttons (`discrepancy-item.tsx`), scan viewer with measured (red) and model (amber dashed) boxes plus heatmap toggle (`scan-viewer.tsx`), A9 risk line streamed in `<Suspense>` (`risk-line.tsx`), reader-disagreement notes in the three-source table.
  - `/app/verification` queue: scans to read, awaiting bank, letters to confirm, mismatches, discrepancies to close.
  - `/app/admin/bank` mock bank teller: book a deposit the AA / NeSL rails then answer from. Demo story: book ₹5 L, institution declares ₹50 L, the bank check catches it.
  - Submissions are read automatically with `after()`; the case page auto-refreshes until the case is scored (~8–15 s).
  - Fixes found in browser testing: Doc-AI no longer takes the maturity value as the principal (falls back to amount in words); reader disagreements are settled by the declaration/bank when one backs a reading; next action routes resolved discrepancies and recorded letters to the checker and prompts "accept" once the bank confirms.
  - Sidecar 0.3.0: `/v1/tamper/analyze` (JPEG ghost + PDF checks, heatmap at `derived/ela-*.jpg`), `/v1/bank/*` mock rails (SQLite `/var/lib/nidhikavach/mockbank.db`), forged specimens pasted after compression.

- **P3 lifecycle** (done 7 Nov):
  - `modules/lifecycle/run.ts` `runLifecycle(today, actor, {reason, notify})`: one pass over live FDRs (~2–3 s for 5k): validity/renewal lanes, next action + owner (bulk update), reminders from `lib/rules/reminders.ts` (T-90/60/30/7 to the institution by inbox + email, officers get T-30/T-7; after maturity + 15 days grace an escalation ladder institution → maker → checker → authority, one step a week). On a big clock jump only the most urgent new reminder per FDR is sent; going back in time deletes future reminders and their messages (`notifications.reminder_id` cascade). Batch ledger writes via `jsonb_to_recordset` + `ledger_append`.
  - Runs on every demo-clock move (`app/admin/actions.ts`) and daily via Vercel Cron (`apps/web/vercel.json`, 18:30 UTC, `/api/cron/lifecycle`, `CRON_SECRET`). After a reseed, `npm run db:lifecycle -- --silent` records already-due reminders without messages (`npm run db:reseed` does both).
  - Pages: `/app/maturity` (buckets 7/30/60/90 days, grace, past grace, last reminder), `/app/renewals` (due, submitted, overdue with escalation level, renewed), `/app/inbox` (+ bell and sidebar badge), `/app/outbox` (simulated email).
  - Renewal: accepting a renewal FDR closes the link it replaces (`renewed` if same IFSC, else `replaced`), notifies the institution. Acceptance now also needs the scan read.
  - A4 case brief (`modules/assist/brief.ts`, gpt-6.1-terra): 4–5 cited lines + what blocks the case; citations jump to the audit-trail entry. A6 drafts (`modules/assist/draft.ts`): letter to institution / bank request / escalation note, English or Hindi, officer edits then sends to the outbox; ledger `letter.sent`.
  - Seed: every institution has a synthetic nodal mailbox; FDR-23-11820 is `requested` until FDR-26-05402 is accepted; FDR-26-03952 and FDR-26-05811 start under scrutiny.

## Next: P4 release (BUILD_PLAN §2, §7 "Release", §7a A6 remarks, A7)

1. Release / refund request by the institution with reason; auto-checklist from `RULE_SET_V1.release.conditions`.
2. Three-person approval (maker recommends, checker checks, authority approves), separation of duties by user id; showcase FDR-16-07734 waits at the authority.
3. eSign (simulated, `signing_keys`), release-order PDF with QR to a public verify page.
4. A7 APH rules assistant (handbook chunks + embeddings in pgvector, answers with clause citations) and release-order remarks via A6.
5. Tests, build, reseed (`npm run db:reseed`), deploy, browser-verify, commit + push, mark P4 done.

## Working notes

- Run server modules from scripts with `node --conditions=react-server --import tsx --env-file=.env.local <file>.mts` (from `apps/web`).
- Local dev and production share the VM database; reseed before handing over.
- Sidecar deploy: `services/sidecar/deploy/deploy.sh`. Vercel env vars are set from `apps/web/.env.local` with `vercel env add` from the repo root.
- Commits: plain messages, no co-author trailer; push after each commit.
