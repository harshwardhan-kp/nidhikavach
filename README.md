# NidhiKavach

**Every deposit, released right.** A secure AICTE portal that follows each security deposit and Fixed Deposit Receipt (FDR) from upload to discharge: bank-confirmed, deadline-aware and fully auditable.

Smart India Hackathon 2026 · Problem Statement **SIH26265** (AICTE Regulation Bureau, *Streamline of Security Deposit / FDR Portal*) · Theme: Smart Automation · Team **AIT_G_SPARK**, Army Institute of Technology, Pune.

> Status: **working prototype, phases 0–5 of 6 done**: portal shell, five roles, hash-chained audit ledger, demo clock, ~8,700 synthetic FDRs on real bank branches, cases list and case page with the three-source check, institution FDR submission with direct scan upload, AI-assisted legacy register import, and verification: every scan read by Azure Document Intelligence and gpt-6.1-terra side by side, a JPEG-ghost tamper check with an AI second opinion, simulated bank confirmation over Account Aggregator / NeSL / bank letter (maker + checker), auto-raised discrepancies with threads, a verification queue and a mock bank teller; and the lifecycle: a daily pass (and every demo-clock move) re-derives validity and renewal, sends T-90/60/30/7 reminders and a weekly escalation ladder to inboxes and a simulated email outbox, a maturity watch and renewals board, renewal chains that close when the new FDR is accepted, an AI case brief with citations and AI-drafted letters in English and Hindi; and release: an institution requests release or refund with its dossier, a clause 6.46 checklist is evaluated from the record, three different officers recommend, check and approve, the approval is eSigned (simulated, Ed25519) into a release-order PDF whose QR opens a public verify page, and an AI handbook assistant answers rule questions with clause citations; and oversight: a region table and an AI weekly bureau briefing on the overview, five reports with CSV/PDF export, plain-language search in the top bar, an "ask this case" chat that reads through read-only tools, a tamper test on the audit ledger and a metrics page measuring the six PS scenarios live. Build plan: [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md).

## The idea

- **Three-source truth.** Every FDR field is checked three ways: what the institution declared, what the uploaded scan shows (Doc-AI), and what the bank confirms. The results roll into one explainable trust score.
- **Five independent status lanes** (record, validity, renewal, release, verification), so maturity is never confused with release authority.
- **Maker ≠ checker**, enforced by user identity, with eSigned release decisions.
- **Hash-chained audit ledger**, so every change is tamper-evident.
- **T-90 / 60 / 30 / 7 reminders** with escalation, so no maturity goes unwatched.

## Planned stack

Next.js · React · TypeScript · Tailwind CSS · NestJS · Temporal · FastAPI · PostgreSQL · Redis · MinIO · OpenSearch · PaddleOCR · PyTorch · OpenCV · Ollama · Keycloak · Vault · NGINX · Docker · Kubernetes · Prometheus · Grafana · OpenTelemetry

## In this repo

| Path | What it is |
|---|---|
| `apps/web` | Next.js 16 app: landing page at `/`, portal at `/app` (deployed on Vercel, functions in Mumbai) |
| `apps/web/src/db` | Drizzle schema, migrations (`apps/web/drizzle`), seed |
| `services/sidecar` | FastAPI sidecar on the team VM: document AI, mock bank gateway, file storage |
| `docs/BUILD_PLAN.md` | What we are building, phase by phase |
| `apps/web/public/docs/NidhiKavach_SIH2026_PS26265.pdf` | SIH idea deck |
| `apps/web/public/assets/nidhikavach_film.mp4` | 76-second concept film |

## Run it locally

```bash
npm install
cp apps/web/.env.example apps/web/.env.local   # fill in the values
npm run db:migrate
npm run db:seed -- --full  # add --reset to wipe and regenerate (~90 s)
npm run dev              # http://localhost:3000
```

Demo accounts (one per role) are listed on the sign-in page.

## Links

- Live site: https://nidhikavach.vercel.app
- Demo video folder: https://drive.google.com/drive/folders/1j3dU2e2X0FqaFsvp0iVqWVg2KX_jNwlF?usp=sharing
