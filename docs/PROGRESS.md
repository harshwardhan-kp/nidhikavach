# NidhiKavach build progress (handoff)

Last updated: 8 Nov 2026 (all phases done). Branch `prototype` (pushed). Plan: [`BUILD_PLAN.md`](BUILD_PLAN.md).

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

- **P4 release** (done 7 Nov):
  - Checklist `lib/rules/release.ts` (paraphrasing APH 2024-27 cl. 1.12(iv), 6.46(a)-(c), (h)-(i), 2.21(h)-(i), Affidavit 6): hold complete (or closure/merger certificate for a refund), bank confirmed, no open discrepancy, dossier uploaded, plus two officer attestations (cell clearances [simulated], no dues/penalty). A FDR whose 10-year hold ends at maturity is not chased for renewal; its next action is "request release".
  - Flow `modules/release/actions.ts`: institution requests with a dossier upload → maker recommends (attests; A6 remarks via `remarksAction`) → checker checks → authority approves and eSigns → maker records the bank's lien removal [simulated] → released/refunded. Reject at any step with a reason. Separation of duties by user id (requester and every earlier approver are excluded).
  - eSign `lib/esign.ts`: Ed25519 per officer, private key derived from SESSION_SECRET + user id (never stored), public key in `signing_keys`. Order PDF `modules/release/order-pdf.ts` (pdf-lib + QR, `pdfSafe` for WinAnsi), stored on the sidecar at `orders/<requestId>.pdf`, SHA-256 on the ledger. Public `/verify/[requestId]` checks signature, registry match and file hash (no login).
  - `/app/releases` board (to recommend / check / decide / awaiting bank / closed). Case page release section `release-section.tsx` + `release-panel.tsx`.
  - A7 `/app/rules`: 20 paraphrased, clause-referenced notes (`db/seed/rule-notes.ts`) embedded with text-embedding-3-small into `rule_notes` (pgvector); `gpt-6.1-terra` answers only from retrieved notes (+ case facts and checklist when opened from a case), with verdict, citations and checks. The 2026-27 addendum was not reviewed (Firecrawl credits ran out).
  - Seed: showcase FDR-16-03310 (demo institution, hold complete 12 days ago) for the live request; FDR-16-07734 waits at the authority. `npm run db:reseed` = seed + `db:assets` (shared synthetic dossier, write-once on the sidecar) + `db:rules` + `db:lifecycle --silent`.

- **P5 oversight** (done 7 Nov):
  - Overview (HQ roles): region table (`modules/oversight/queries.ts`) and A10 weekly bureau briefing (`modules/assist/briefing.ts`, gpt-6.1-terra, aggregates only, cached by facts so it changes with data and the demo clock).
  - Reports `/app/reports`: registry, maturing in 90 days, renewals overdue, discrepancy ageing, releases; scoped SQL in `modules/oversight/reports.ts`; export route `/app/reports/[id]/export?format=csv|pdf` (pdf-lib landscape table), each export on the ledger.
  - A3 search: `components/ask-bar.tsx` in the top bar → `askSearchAction` (gpt-6-luna, allow-listed schema in `modules/assist/search.ts`) → `/app/cases?...&ask=` with removable chips (`cases/ask-chips.tsx`). New case filters: `within`, `maturedAgo`, `minLakh`.
  - A5 ask-this-case: `runWithTools` in `lib/ai/client.ts` (Responses API function calling, logged to ai_calls) + 8 read-only tools bound to one case (`modules/assist/ask-case.ts`); chat panel `cases/[caseNo]/ask-case.tsx`.
  - Audit: tamper test (`audit/tamper-demo.tsx`): the DB refuses the UPDATE and the recomputed hash differs.
  - Metrics `/app/metrics`: six PS scenarios, written manual baseline vs live measurements (`modules/oversight/metrics.ts`); live bank timings come from ledger pairs so seeded rows do not skew them.
  - Seed: open discrepancies on old FDRs are now recent (9-36 days), not dated to submission.

- **P6 demo polish** (done 8 Nov):
  - Playwright (`apps/web/e2e/`, `playwright.config.ts`): the six PS scenarios, run in order, all passing against the dev server (3.3 min); videos in `apps/web/test-results/`. They change data: reseed afterwards.
  - Hindi toggle (`lib/i18n.ts`, cookie `nk_lang`, `components/lang-toggle.tsx`): navigation, sign-in, institution submit form, case page sections.
  - `/app/integrations` (live checks of every dependency, real vs simulated, production replacement) and `/app/security` (controls mapped to DPDP 2023, IT Act, CERT-In, GIGW; a pitch summary, not legal advice). Content-Security-Policy added.
  - README rewritten; `docs/DEMO.md` pitch script with the showcase cases.
  - Seed: specimen scans keyed by content hash (the sidecar is write-once and seeded dates move daily; same-name keys served stale images).

## Possible next steps

- Landing page and deck still describe the plan, not the built prototype: refresh screenshots and claims.
- Hold period counts from the current FDR's issue date, not the first FDR in a renewal chain.
- The handbook notes cover APH 2024-27; the 2026-27 addendum was not reviewed.
- Lien text is "Member Secretary, AICTE, New Delhi"; the handbook describes a joint holding with the Trust's Secretary.

## Working notes

- Run server modules from scripts with `node --conditions=react-server --import tsx --env-file=.env.local <file>.mts` (from `apps/web`).
- Local dev and production share the VM database; reseed before handing over.
- Sidecar deploy: `services/sidecar/deploy/deploy.sh`. Vercel env vars are set from `apps/web/.env.local` with `vercel env add` from the repo root.
- Commits: plain messages, no co-author trailer; push after each commit.
