# NidhiKavach build progress (handoff)

Last updated: 7 Nov 2026. Branch `prototype` (pushed). Plan: [`BUILD_PLAN.md`](BUILD_PLAN.md).

## Done

- **P0 foundations**: Next.js 16 app in `apps/web` (landing at `/`, portal at `/app`), Drizzle schema, hash-chained ledger (`ledger_append` / `ledger_verify`), auth + 6 demo roles + role switcher, demo clock, 403/404 pages. Vercel project `nidhikavach` builds `apps/web`, functions in bom1.
- **P1 registry**: deterministic seed (~1,500 institutions, ~8,750 FDRs on 1,498 real IFSC branches, showcase cases), cases list + case page, institution submit with direct signed upload to the sidecar, legacy Excel/CSV import with `gpt-6-luna` column mapping.
- **P2 engine (committed, no UI yet)**:
  - `modules/verify/di.ts`: Azure Document Intelligence F0 (`di-nidhikavach`, East Asia, rg `rg-nidhikavach`), layout + key-value pairs via signed URL; field clean-up.
  - `modules/verify/vision.ts`: `gpt-6.1-terra` reading (A1) and tamper second opinion (A2), `effort: "low"`.
  - `modules/verify/pipeline.ts` `readScan()`: DI ‖ Terra read ‖ (sidecar tamper → Terra opinion), reconcile, save, ledger, recompute. ~13 s.
  - `modules/verify/bank.ts`: NeSL / Account Aggregator (consent → fetch) / bank-letter path (maker records, different checker confirms).
  - `modules/verify/recompute.ts`: matches, trust, lanes, idempotent auto-discrepancies, next action + owner, notifications.
  - `modules/verify/actions.ts`: server actions `readScanAction`, `requestBankAction`, `prepareLetterUpload`, `recordLetterAction`, `confirmLetterAction`, `acceptRecordAction`, `returnRecordAction`, `raiseDiscrepancyAction`, `discrepancyAction(op: ask|respond|resolve|close|reopen)`.
  - `modules/verify/risk.ts`: A9 one-line risk explanation (`gpt-6-luna`).
  - `getCase()` now also returns `observations` (discrepancy threads).
  - Sidecar 0.3.0: `/v1/tamper/analyze` (JPEG ghost + PDF checks, heatmap at `derived/ela-*.jpg`), `/v1/bank/*` mock rails (SQLite `/var/lib/nidhikavach/mockbank.db`), forged specimens pasted after compression.
  - Verified by script: FDR-26-05310 → readers agree 8/8, tamper 2, AA confirms, trust 98. FDR-26-03952 → tamper 69, bank mismatch, trust 41.

## Next (P2 remaining, in order)

1. **Case page UI** (`app/app/cases/[caseNo]/page.tsx`):
   - Client `actions-panel.tsx` by role: maker = read scan (≈13 s, show progress text), ask the bank, record bank letter (amount, maturity, lien + file upload via `prepareLetterUpload`), accept, return (reason), raise discrepancy; checker = confirm bank letter (only if they didn't record it).
   - Discrepancy thread (from `observations` with `discrepancyId`) + inline buttons per status/role via `discrepancyAction`.
   - Scan viewer: box overlay from `tamperFindings.heuristic[].box` / `opinion.observations[].box`, heatmap toggle (sign `tamperFindings.heatmapKey` with `signedGetUrl`), AI verdict + summary, "readers agreed n/8"; show `instrument_fields.note` (reader disagreement) in the three-source table.
   - A9 risk line in a `<Suspense>` card for red/amber cases.
2. **Verification queue** `/app/verification` (enable nav item): tabs for scans to read, awaiting bank, mismatches, letters to confirm (checker).
3. **Bank teller page** `/app/admin/bank` [simulated]: issue a deposit at the mock bank (`bank.issue`), list recent (`bank.recent`). Demo story: bank issued ₹5 L, institution declares ₹50 L, verification catches it.
4. After a submission, kick off `readScan` in the background with `after()` from `next/server`.
5. Tests (reconcile, DI clean-up), typecheck, lint, build, **reseed** (`npm run db:seed -- --reset --full` from `apps/web`; also `ssh freevm 'sudo rm -rf /var/lib/nidhikavach/files/specimen /var/lib/nidhikavach/files/derived'` first if specimen rendering changed), `vercel deploy --prod` from repo root, browser-verify on the live site, commit + push, mark P2 done in BUILD_PLAN/README.

## Working notes

- Run server modules from scripts with `node --conditions=react-server --import tsx --env-file=.env.local <file>.mts` (from `apps/web`).
- Local dev and production share the VM database; reseed before handing over.
- Sidecar deploy: `services/sidecar/deploy/deploy.sh`. Vercel env vars are set from `apps/web/.env.local` with `vercel env add` from the repo root.
- Commits: plain messages, no co-author trailer; push after each commit.
