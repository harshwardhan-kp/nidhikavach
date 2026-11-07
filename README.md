# NidhiKavach

**Every deposit, released right.** A secure AICTE portal that follows each security deposit and Fixed Deposit Receipt (FDR) from upload to discharge: bank-confirmed, deadline-aware and fully auditable.

Smart India Hackathon 2026 · Problem Statement **SIH26265** (AICTE Regulation Bureau, *Streamline of Security Deposit / FDR Portal*) · Theme: Smart Automation · Team **AIT_G_SPARK**, Army Institute of Technology, Pune.

**Live:** https://nidhikavach.vercel.app (landing) · https://nidhikavach.vercel.app/app (portal; one-click demo accounts on the sign-in page) · **Demo script:** [`docs/DEMO.md`](docs/DEMO.md)

> Status: working pitch prototype, all six build phases done. Data is synthetic; bank rails, eSign and email are simulated and labelled `[simulated]` in the UI. Build plan and history: [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md), [`docs/PROGRESS.md`](docs/PROGRESS.md).

## What it does

| PS capability | In the prototype |
|---|---|
| Submission & registry | Institutions submit an FDR with its scan (uploaded straight to the document store); ~8,650 synthetic FDRs on 1,498 real bank branches; legacy Excel/CSV import with AI column mapping |
| Verification | Every scan read by **Azure Document Intelligence and gpt-6.1-terra side by side**; a JPEG-ghost **tamper scan** with an AI second opinion; the bank asked over **Account Aggregator / NeSL** (simulated) or a bank letter confirmed by a second officer; a **three-source check** (declared · scan · bank) rolled into an explainable **trust score** |
| Discrepancies | Raised automatically from mismatches and tamper flags, threaded with the institution, closed only by a second officer |
| Validity, maturity, renewal | Five independent lanes (record, verification, validity, renewal, release); a daily lifecycle pass (and every demo-clock move) sends **T-90/60/30/7 reminders** and a weekly **escalation ladder**; renewal chains close when the new FDR is accepted |
| Release / refund | Clause 6.46 checklist from the record; **maker → checker → authority** with separation of duties by user id; **eSigned** release order PDF with a QR to a public verify page |
| Oversight | Region view, AI weekly bureau briefing, five reports with CSV/PDF export, metrics on the six PS scenarios |
| Audit & security | Append-only **hash-chained ledger** with a verifier and a tamper test; scoped roles; CSP and security headers; a security & compliance page and a live integrations page |
| AI assistance (advises, never decides) | A1 dual read · A2 tamper opinion · A3 plain-language search · A4 case brief · A5 ask-this-case (read-only tools) · A6 letters in English/Hindi · A7 handbook assistant (pgvector) · A8 import mapping · A9 risk line · A10 bureau briefing |
| Language | English / हिन्दी toggle on navigation, sign-in, the institution's submit form and the case page |

## Real vs simulated

| Real | Simulated (labelled in the UI) |
|---|---|
| Azure Document Intelligence, OpenAI models, tamper heuristics, IFSC data, Postgres + pgvector, the ledger, every workflow and permission | Bank rails (mock core banking with AA / NeSL-shaped responses), eSign (Ed25519 per officer), email (in-app outbox), cell clearances, synthetic institutions and FDRs |

## As built

| Piece | Where |
|---|---|
| `apps/web` | Next.js 16 (App Router, server actions), Tailwind 4, Drizzle ORM; landing at `/`, portal at `/app`; Vercel, functions in Mumbai (bom1); daily cron |
| PostgreSQL 16 + pgvector | Azure VM in Hyderabad (India South Central), TLS only |
| `services/sidecar` | FastAPI on the same VM behind Caddy: signed file storage, specimen scans, tamper analysis, mock bank |
| AI | Azure Document Intelligence (F0), `gpt-6.1-terra` (quality), `gpt-6-luna` (fast), `text-embedding-3-small`; every call logged in `ai_calls` |

Production path (from the deck): the same interfaces on NIC / MeghRaj cloud with on-prem OCR and models (PaddleOCR, Ollama), Sahamati Account Aggregator and NeSL integrations, Aadhaar eSign, Keycloak, and object storage.

## In this repo

| Path | What it is |
|---|---|
| `apps/web/src/app` | Pages and route handlers (`/app/*` portal, `/verify/[id]` public order check, `/api/cron/lifecycle`) |
| `apps/web/src/modules` | Domain logic: cases, verify, lifecycle, release, assist (AI), oversight, messages |
| `apps/web/src/lib/rules` | Pure, unit-tested rules: lanes, trust score, reminders, release checklist, next action |
| `apps/web/src/db` | Drizzle schema, migrations (`apps/web/drizzle`), deterministic seed, handbook notes |
| `apps/web/e2e` | Playwright: the six PS scenarios (also the demo script) |
| `services/sidecar` | FastAPI sidecar and its deploy script |
| `docs/` | Build plan, progress log, demo script |
| `apps/web/public/docs/NidhiKavach_SIH2026_PS26265.pdf` | SIH idea deck |
| `apps/web/public/assets/nidhikavach_film.mp4` | 76-second concept film |

## Run it locally

```bash
npm install
cp apps/web/.env.example apps/web/.env.local   # fill in the values
npm run db:migrate
npm run db:reseed               # wipe + seed + dossier + handbook index + lifecycle (~10 min)
npm run dev                     # http://localhost:3000
```

Tests:

```bash
npm test                        # unit tests (rules, parsing, reconcile)
E2E_BASE_URL=http://localhost:3000 npm run e2e   # six PS scenarios in a real browser; changes data, so reseed afterwards
```

## Links

- Live site: https://nidhikavach.vercel.app
- Demo video folder: https://drive.google.com/drive/folders/1j3dU2e2X0FqaFsvp0iVqWVg2KX_jNwlF?usp=sharing
