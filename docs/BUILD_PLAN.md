# NidhiKavach: build plan (pitch prototype)

Status: v2, 7 Nov 2026. Nothing is built yet.
Sources: idea deck (`docs/NidhiKavach_SIH2026_PS26265.pdf`), official SIH26265 problem statement, and a check of our Azure subscription and VM.

**Ground rules (from the team):**
- This is a **working prototype for the pitch**, not a scalable product. Every feature in the deck has to visibly work end to end; internals can be simple, and anything external can be simulated.
- **No new Azure services or VMs without asking.** Reuse the existing VM (`freevm`, India South Central / Hyderabad, always on).
- Portal lives on the **same Vercel site** as the landing page: landing at `/`, portal at `/app`.
- Timeline: 2+ weeks, so all phases are in scope.

---

## 1. The product in one paragraph

An **institution** submits each security deposit / FDR once (form + scan). **Doc-AI** reads the scan, a **bank check** returns what the bank says, and each field is compared across those **three sources** into an explainable **trust score**. Officers work a risk-sorted queue and resolve **discrepancies**. A **lifecycle engine** tracks **five independent status lanes** and fires **T-90/60/30/7 reminders** with escalation. Renewals link to the FDR they replace. **Release/refund** goes **maker -> checker -> authority** (different people, enforced) and ends in an **eSigned release order**. Every action lands in a **hash-chained audit ledger** an auditor can verify.

## 2. PS SIH26265 capabilities -> features

| # | PS capability | What the demo shows | Phase |
|---|---|---|---|
| 1 | Centralised repository | Institution + FDR registry, one record per FDR, renewal chain | P1 |
| 2 | Document management | Upload, view, version, SHA-256 per file | P1 |
| 3 | Verification & discrepancies | Scan extraction, mock bank / AA / NeSL check, 3-source table, trust score, tamper flags, discrepancy register | P2 |
| 4 | Validity & maturity tracking | Validity lane, maturity watch, **demo clock** to fast-forward time | P3 |
| 5 | Renewal & replacement | Renewal flow, linked history timeline | P3 |
| 6 | Release & refund workflow | Request -> maker -> checker -> authority -> eSigned order PDF with QR verify | P4 |
| 7 | Alerts & escalation | Rule-driven reminders + escalation ladder, in-app inbox, email outbox | P3 |
| 8 | Dashboard & reports | KPIs, risk-sorted cases, maturity forecast, region view, CSV/PDF export, plain-language search | P5 |
| 9 | Audit trail & access control | 5 roles + scope, hash-chained ledger, "verify chain" + tamper demo | P0 / P5 |
| 10 | Integration & security | Integration adapters (shown as a status page), encryption, RBAC, OpenAPI doc | P0-P6 |

The PS also wants **measurable improvement** and **six tested scenarios** (new submission, validity tracking, approaching maturity, renewal, discrepancy, authorised release). We ship a metrics page and one scripted Playwright run per scenario, which is also the demo script.

## 3. Real vs simulated (said openly in the UI with `[simulated]` tags)

| Thing | Prototype |
|---|---|
| Bank confirmation | **Mock bank service**: AA-style consent + FI fetch returning ReBIT-shaped term-deposit JSON. Seeded so some FDRs mismatch, some banks "have no API" (manual letter path). |
| e-BG / e-FDR | Mock NeSL lookup in the same service |
| eSign | Server-held Ed25519 key per officer, signature embedded in release-order PDF, QR -> public verify page |
| Doc-AI | **Real**: Azure Document Intelligence + `gpt-6.1-terra` vision dual read (section 7a). Seeded FDRs come with pre-computed extractions; live uploads run both readers. |
| Tamper scan | Real heuristics, advisory: PDF incremental-save / metadata checks, amount-in-words vs figures, error-level analysis on images |
| IFSC validation | **Real** (public razorpay/ifsc dataset bundled) |
| Institutions & FDRs | Synthetic seed: 8 AICTE regions, ~1,200 institutions, ~8,400 instruments, realistic names/IFSCs/dates |
| Login | Email + password for 6 seeded demo users, plus a one-click role switcher for the pitch |
| Email | Rendered into an in-app **outbox** (looks like real emails); no mail service |

## 4. Architecture (lean)

```
 Browser
    |
    v
 Vercel  ── apps/web: Next.js 16 (App Router) · React · TS · Tailwind · shadcn/ui
            landing page at /, portal at /app
            server actions + route handlers = the API (OpenAPI doc generated from zod)
            Drizzle ORM · Vercel Cron (daily lifecycle run)
    |                                   |
    | Postgres (TLS)                    | HTTPS
    v                                   v
 freevm (existing, Hyderabad) ─────────────────────────────────────────────
   PostgreSQL 16 (Ubuntu package, tuned for ~150 MB)      data, jobs, audit ledger
   services/sidecar: FastAPI (one process, ~120 MB)
       /docai     OCR + field mapping + tamper heuristics
       /bank      mock AA consent + FI fetch, mock NeSL
       /files     document storage on disk, signed short-lived URLs
   Caddy (already running) imports ONE new site file -> sidecar at nidhikavach.172-198-62-117.sslip.io, auto-TLS
```

Why this shape:
- **One deployable app** (Next.js) instead of Next.js + NestJS. The deck's NestJS/Temporal/Keycloak/etc. stay the "production architecture" slide; the prototype implements the same modules inside Next.js with clean folders (`registry, documents, verify, lifecycle, release, reports, audit`).
- **Python only where Python is needed** (OCR, image forensics) plus the mock bank, which should look like an external system anyway.
- The VM has 887 MB RAM + 4 GB swap and already runs a VPN (Caddy, wstunnel). Native Postgres + one FastAPI process fits; Docker would not be worth the RAM. Existing Caddy sites are left untouched; I add one site block and back up the Caddyfile first.

### Deck stack -> prototype

| Deck | Prototype |
|---|---|
| Next.js, React, TS, Tailwind, shadcn/ui | same |
| NestJS, Node | Next.js route handlers / server actions (same module boundaries) |
| FastAPI, Python, OpenCV | same (sidecar) |
| PostgreSQL | same, on the VM |
| Temporal, Redis | Postgres tables + Vercel Cron + "run now" on demo-clock change |
| MinIO | disk on the VM behind signed URLs |
| OpenSearch | Postgres full-text + `pg_trgm` |
| PaddleOCR / Ollama / Hugging Face | Azure Document Intelligence + OpenAI models (section 7a), same `ai/` interface |
| Keycloak, Vault | app auth (argon2 + signed session cookie), secrets in Vercel env |
| Docker, K8s, NGINX, Prometheus, Grafana | not used; Caddy on the VM; Vercel logs |
| GitHub Actions, Playwright, pytest, OpenAPI | same |

## 5. Repo layout

```
nidhikavach/
  apps/web/                Next.js (landing moves to app/(marketing), portal under app/app)
    src/modules/           registry, documents, verify, lifecycle, release, reports, audit, auth
    src/db/                Drizzle schema, migrations, seed
    src/lib/rules/         lanes, trust score, reminder rules (pure TS, unit-tested)
  services/sidecar/        FastAPI: docai, bank, files
  e2e/                     Playwright: the six PS scenarios
  scripts/                 seed generator, synthetic FDR scan generator, VM setup script
  docs/                    this plan, demo script, API doc
  assets/, index.html      current landing (folded into apps/web in P0)
```

Package manager: npm workspaces (pnpm isn't installed; npm is fine).

## 6. Domain model

### Roles

| Role | Seeded demo user | Can | Cannot |
|---|---|---|---|
| `institution` | nodal officer, Govt. Polytechnic Nagpur | submit FDRs, upload, request renewal/release, answer discrepancies | see others, approve |
| `maker` | dealing officer, Western region | scrutinise, request bank check, raise discrepancies, recommend release | approve own work |
| `checker` | regional officer, Western region | approve/return maker actions, close discrepancies | check items they made |
| `authority` | Regulation Bureau head | final release decision + eSign | sign items they made/checked |
| `auditor` | internal audit | read all, verify ledger, export | write |
| `admin` | system | users, rule sets, **demo clock** | release decisions |

Maker != checker is enforced **by user id on each step**, not just by role.

### Five status lanes

| Lane | Values |
|---|---|
| record | draft -> submitted -> under_scrutiny -> accepted / returned / rejected |
| verification | unverified -> pending_bank -> bank_confirmed / mismatch / unavailable / manual_confirmed |
| validity | valid -> expiring (<=90d) -> matured -> expired; lien_unknown |
| renewal | not_due -> due -> requested -> renewed / replaced; overdue |
| release | none -> requested -> recommended -> checked -> approved (eSigned) -> released / refunded; rejected |

### Tables

`regions, institutions, users, user_roles, instruments, instrument_fields (declared / ocr / bank per field + match), documents, verifications, discrepancies, observations, release_requests, approvals (actor, decision, signature), rule_sets (versioned JSON), reminders, notifications (inbox + outbox), audit_ledger, ledger_anchors, settings (demo_clock)`. Money in paise (`bigint`), times `timestamptz`, shown in IST. Case ids `FDR-26-04187`.

### Trust score

Fields compared: FDR no., amount, issue date, maturity date, IFSC/bank, depositor, lien holder (must be AICTE), auto-renew. Each field is `match / soft-match / mismatch / missing` across declared, scan and bank. Weighted 0-100, bank agreement weighs most, no bank confirmation caps at 70, tamper findings subtract. Bands: >=90 green, 60-89 amber, <60 red. The UI shows the breakdown, not just the number.

### Audit ledger

`hash = sha256(prev_hash || canonical_json(entry))`, inserted through one DB function under an advisory lock; a trigger blocks UPDATE/DELETE. The head hash is also written daily to `ledger_anchors`, and copied to a file on the VM, outside the DB. The auditor's "Verify chain" walks it and pinpoints the first broken link; an admin-only "simulate tampering" button edits a row on a scratch copy so the pitch can show detection live.

### Rules

`rule_sets` hold versioned JSON: deposit amounts, 10-year hold (APH cl. 1.12, as cited in the deck), reminder offsets 90/60/30/7, escalation ladder + SLAs, release conditions checklist (APH cl. 6.46). Each case records the rule version it used. Clause values get a final check against the APH text before the demo.

## 7. Modules

- **Registry (P1)**: institution and case search, filters on every lane, case page tabs: summary, 3-source fields, documents, verification, discrepancies, timeline, ledger. CSV import for legacy records (unknowns stay unknown).
- **Documents (P1)**: upload to sidecar via signed URL, sha256 + magic-byte check, PDF/image viewer, versions.
- **Doc-AI + tamper (P2)**: extraction of FDR no., amount (figures + words), dates, IFSC, depositor, lien clause; confidence per field; tamper findings list + heatmap.
- **Bank check (P2)**: "Request bank confirmation" -> consent -> fetch -> mapped into bank column; banks without API fall back to letter upload + maker-checker.
- **Discrepancies (P2)**: auto-raised from mismatches, tamper flags, missing docs; threaded with the institution; closing needs a checker.
- **Lifecycle (P3)**: daily cron + on demo-clock change recompute lanes and reminders; escalation institution -> maker -> checker -> authority; inbox + email outbox.
- **Renewal (P3)**: submit renewed/replacement FDR against the old one, same scan + verify, history becomes one chain.
- **Release (P4)**: request with reason, auto-checklist from rules, three-person approval, eSign, release-order PDF + QR verify page.
- **Dashboard + reports (P5)**: the overview from the deck mock (KPIs, cases needing action, maturity forecast), region view, five reports with CSV/PDF export.
- **Plain-language search (P5)**: "FDRs maturing in 60 days, not renewed" -> filter chips -> results. See D3.
- **Metrics page (P5)**: before/after on the six scenarios vs a written manual baseline.

## 7a. AI layer (OpenAI, top models, advisory only)

Principle from the deck: **AI advises, humans decide.** Every AI output is shown as a labelled suggestion with its reasoning, needs a human to accept it, and is logged to the audit ledger (model, input hash, output). No Pro / reasoning-mode-pro models and no flagship-priced models: the GPT-6 tiers beat gpt-5.5 at a fraction of the price.

| Model | Price (in / out per 1M) | Used for |
|---|---|---|
| `gpt-6.1-terra` | $1 / $5 | quality calls: vision extraction, tamper second opinion, case briefs, drafting, rules Q&A, weekly briefing |
| `gpt-6-luna` | $0.10 / $0.50 | fast calls: plain-language search, column mapping, risk one-liners, notification wording |
| `text-embedding-3-small` | $0.02 | APH handbook + case notes search (pgvector on the VM Postgres) |
| `gpt-realtime-2-mini` class | - | stretch only: voice "ask" |

Not used: `gpt-5.5` ($5 / $30), `gpt-6-astra`, `gpt-6.1-sol` and every `*-pro`. If Terra's extraction quality on our test scans disappoints in P2, the fallback is `gpt-6.1-sol` ($2 / $10) for that one feature, after asking.

All calls go through one `ai/` module using the Responses API with **strict JSON schemas** (zod -> JSON Schema), timeouts, retries, and a recorded-response cache so the live demo never waits on, or breaks because of, the network. Model names live in one config file.

| # | Feature | What it does | Phase |
|---|---|---|---|
| A1 | **Dual-read Doc-AI** | Azure Document Intelligence (OCR + layout) and `gpt-6.1-terra` vision both read every scan into the same schema: FDR no., amount in figures and in words, dates, IFSC, depositor, lien clause, stamp/signature present, handwritten edits. Where the two readers disagree, confidence drops and the field is flagged. | P2 |
| A2 | **Tamper second opinion** | `gpt-6.1-terra` vision looks at the scan plus the heuristic findings (ELA heatmap, PDF metadata) and explains in plain words what looks altered and where, with box coordinates drawn on the viewer. | P2 |
| A3 | **Plain-language search** | `gpt-6-luna` turns "FDRs maturing in 60 days, not renewed, Western region" into editable filter chips (allow-listed fields only, no records sent). | P5 |
| A4 | **Case brief** | One click on any case: a 5-line summary of its history, what is blocking it, the next action and owner, each line citing the ledger entry or document it came from. | P3 |
| A5 | **Ask this case** | Chat panel on the case page; the model can only call read-only tools (`getCase`, `getLedger`, `getDocuments`, `getRules`). | P5 |
| A6 | **Drafting** | Discrepancy letter to the institution, bank verification request, escalation note, release-order remarks, in English and Hindi. Officer edits, then sends to the outbox. | P3-P4 |
| A7 | **APH rules assistant** | The AICTE Approval Process Handbook is chunked and embedded; officers ask "can this deposit be released?" and get an answer with clause citations. Also pre-checks the release conditions checklist and explains any unmet condition. | P4 |
| A8 | **Messy legacy import** | Uploads an old Excel register; `gpt-6-luna` maps its columns to our schema and normalises dates/amounts; anything uncertain stays `unknown` for a human to fill. | P1 |
| A9 | **Risk explanation** | For each red/amber case, a one-line "why this is risky" built from trust-score factors and history. | P2 |
| A10 | **Bureau briefing** | Dashboard card: a weekly brief for the Regulation Bureau head (what matures, what is stuck, which regions slip), regenerated on demo-clock change. | P5 |

Data note for the judges: prototype data is synthetic, so sending scans to OpenAI is fine here. The production slide keeps the deck's answer: the same `ai/` interface pointed at on-prem models (Ollama / PaddleOCR) on NIC cloud.

Synthetic FDR scans for the seed and the tamper demo are rendered from our own **generic templates** (clean, edited amount, wrong lien holder, overwritten date, phone photo) and watermarked `SPECIMEN · SYNTHETIC`. We don't generate look-alikes of real banks' documents.

## 8. Security (proportionate to a prototype, but visible)

argon2 passwords, httpOnly SameSite cookies, scope checks on every query, zod validation on every input, Postgres over TLS with a strong password, file uploads through short-lived signed URLs, private files on the VM, masked account numbers, strict CSP headers, no secrets in the browser. A short "security & compliance" page in the app maps these to DPDP 2023, IT Act (eSign), CERT-In and GIGW for the judges.

## 9. Design

Same system as the landing page and the deck mock: `#EEEEEE` background, `#1C1C1C` ink, `#E73A3A` accent; Schibsted Grotesk (UI), Geist Mono (ids, `[bracket]` labels), Instrument Serif (titles). Fonts already in `assets/`. Left nav: overview, cases, verification, maturity watch, renewals, releases, reports, audit ledger. Top bar: plain-language ask box + role switcher.

## 10. Testing

Vitest for lanes, trust score, rules, maker != checker. pytest for field mapping + tamper heuristics on synthetic scans. Playwright for the six PS scenarios (run against the deployed site, recorded for the demo video).

## 11. Build order

| Phase | Done when | Est. |
|---|---|---|
| **P0 Foundations** ✅ done 7 Nov | Next.js monorepo with landing folded in, design tokens, Drizzle schema, auth + roles + role switcher, ledger writer; Postgres + sidecar + Caddy block on the VM; Vercel deploy of `/` and `/app` | 1.5 d |
| **P1 Registry + docs** ✅ done 7 Nov | seeded data, institution submits FDR + scan, officer case list + case page | 1.5 d |
| **P2 Verify** ✅ done 7 Nov | dual-read extraction (A1), tamper flags + AI second opinion (A2), mock bank, 3-source table, trust score, risk lines (A9), discrepancies | 2.5 d |
| **P3 Lifecycle** ✅ done 7 Nov | lanes engine, rules, reminders + escalation, inbox/outbox, renewal, demo clock, case brief (A4), drafting (A6) | 2 d |
| **P4 Release** ✅ done 7 Nov | 3-step approval, eSign, release order PDF, QR verify, APH rules assistant (A7) | 1.5 d |
| **P5 Oversight** ✅ done 7 Nov | dashboard, reports + export, plain-language search (A3), ask-this-case (A5), bureau briefing (A10), ledger verifier, metrics page | 2 d |
| **P6 Demo polish** | six Playwright scenarios, demo script, Hindi toggle on key screens, README, landing/deck refresh | 1 d |

About 12 working days. A8 (legacy import) lands in P1; voice ask is a stretch goal after P6.

## 12. Decisions (agreed 7 Nov 2026)

- **D1. Database:** native Postgres 16 (Ubuntu's package, + pgvector) on `freevm`; open TCP 5432 on `freevmNSG` (TLS required, `scram-sha-256`, strong password, only the `nidhikavach` DB/user reachable remotely).
- **D2. OCR:** Azure AI Document Intelligence **F0** (free tier) in East Asia, resource group `rg-nidhikavach`, profile `~/.azure-profiles/account2`. Called from the sidecar. Tesseract kept as fallback if the quota runs out.
- **D3. Plain-language search:** the team's own **OpenAI API key**, already exported as `OPENAI_API_KEY` in the developer's `~/.zshrc`. It's piped from that variable into Vercel (`vercel env add`) and a gitignored `.env.local`, never typed out or committed. The model returns a JSON filter validated against an allow-list; only the question and the field list are sent, never records.

Azure changes, in full: one resource group, one Document Intelligence F0 resource, one NSG rule. Nothing else without asking.
