# NidhiKavach build progress (handoff)

Last updated: 7 Nov 2026 (P2 done). Branch `prototype` (pushed). Plan: [`BUILD_PLAN.md`](BUILD_PLAN.md).

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

## Next: P3 lifecycle (BUILD_PLAN §2 rows 4, 5, 7; §7 "Lifecycle", "Renewal"; §7a A4, A6)

1. Maturity watch `/app/maturity` and renewals `/app/renewals` pages (enable nav items).
2. Reminder engine: T-90/60/30/15/7 + escalation rows in `reminders`, run on demo-clock moves (hook in `app/admin/actions.ts` `moveClock`) and by a cron route; inbox `notifications` UI.
3. Renewal flow end to end: institution submits renewal (exists), maker verifies, chain closes the old link (`renewed`).
4. A4 case brief and A6 drafted letters/notices (`gpt-6.1-terra` / `gpt-6-luna`).
5. Tests, build, reseed, deploy, browser-verify, commit + push, mark P3 done.

## Working notes

- Run server modules from scripts with `node --conditions=react-server --import tsx --env-file=.env.local <file>.mts` (from `apps/web`).
- Local dev and production share the VM database; reseed before handing over.
- Sidecar deploy: `services/sidecar/deploy/deploy.sh`. Vercel env vars are set from `apps/web/.env.local` with `vercel env add` from the repo root.
- Commits: plain messages, no co-author trailer; push after each commit.
