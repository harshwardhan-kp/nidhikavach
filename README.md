# NidhiKavach

**Every deposit, released right.** A secure AICTE portal that follows each security deposit and Fixed Deposit Receipt (FDR) from upload to discharge: bank-confirmed, deadline-aware and fully auditable.

Smart India Hackathon 2026 · Problem Statement **SIH26265** (AICTE Regulation Bureau, *Streamline of Security Deposit / FDR Portal*) · Theme: Smart Automation · Team **AIT_G_SPARK**, Army Institute of Technology, Pune.

> Status: **working prototype, phase 0 of 6 done** (foundations: portal shell, five roles, hash-chained audit ledger, demo clock). Build plan: [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md).

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
npm run db:seed          # add -- --reset to wipe and reseed
npm run dev              # http://localhost:3000
```

Demo accounts (one per role) are listed on the sign-in page.

## Links

- Live site: https://nidhikavach.vercel.app
- Demo video folder: https://drive.google.com/drive/folders/1j3dU2e2X0FqaFsvp0iVqWVg2KX_jNwlF?usp=sharing
