# NidhiKavach · pitch demo script

About 10 minutes, live on https://nidhikavach.vercel.app. Every step below is also an automated Playwright run in `apps/web/e2e/` (one file per PS scenario), so the flow is known to work.

## Before you start

- The data must be fresh: run `npm run db:reseed` from the repo root (about 10 minutes) after any rehearsal; the showcase cases below are single-use.
- Open https://nidhikavach.vercel.app/login. Each demo account is one click; the role switcher in the top bar changes role without signing out.
- Keep the demo clock at "real date" (Admin → reset) before the pitch starts.
- AI steps take a few seconds each (scan reading ~10-15 s). Say what is happening while it runs.

## Showcase cases

| Case | Story |
|---|---|
| FDR-26-03952 | Forged amount: ₹25 lakh pasted onto a ₹2.5 lakh receipt. Tamper scan flags it, the bank disagrees |
| FDR-26-05811 | The bank has no record of this FDR |
| FDR-26-04187 | Matures in about six weeks: reminders as the clock moves |
| FDR-23-11820 → FDR-26-05402 | Renewal submitted, waiting to be verified |
| FDR-16-03310 | Demo institution, 10-year hold complete: request release live |
| FDR-16-07734 | Release already recommended and checked, waiting for the authority |
| FDR-25-08861 | Lien marked to someone other than AICTE |

## 1 · New submission (scenario 1)

1. **System admin** → Admin → *open the teller*. Book a deposit of ₹5,00,000 (note the FDR number). *"This is the bank's own record."*
2. **Institution** → *submit an FDR*: same FDR number, but declare ₹50,00,000, IFSC `SBIN0000305`, attach a scan. Submit.
3. The case opens and refreshes itself: *"Azure Document Intelligence and gpt-6.1-terra read the scan independently: n/8 fields agree."*
4. **Dealing officer** → same case → *ask the bank to confirm*. Account Aggregator answers in seconds: ₹5 lakh. A critical discrepancy is raised automatically, the trust score drops to red.

## 2 · Validity tracking (scenario 2)

1. **System admin** → Admin → *+30 days*. *"One pass re-derives every deposit's five lanes and sends what has fallen due."*
2. *maturity watch*: deposits move into the 7 / 30 / 60 / 90-day windows. Open FDR-26-04187: validity *expiring*.

## 3 · Approaching maturity (scenario 3)

1. **Institution** → inbox (bell): *"FDR-26-04187: FDR matures in 30 days (T-30)"*.
2. *email outbox*: the same notice addressed to the institution's nodal officer. *"Nothing leaves the prototype; in production this is NIC mail."*
3. Admin → *reset to real date* (reminders that had not happened yet are withdrawn).

## 4 · Renewal (scenario 4)

1. *renewals* → *renewal submitted*: FDR-23-11820 → FDR-26-05402.
2. **Dealing officer** → FDR-26-05402: *read scan*, *ask the bank*, *accept record*. *"FDR-23-11820 is now closed as renewed; the chain continues."*

## 5 · Discrepancy (scenario 5)

1. **Dealing officer** → FDR-26-03952: *read scan*. Show the red box on the amount and the compression heatmap: *"the amount was compressed separately from the rest of the page"*. The model's second opinion agrees, and it is labelled advisory.
2. *brief me on this case* (A4): a cited history in five lines.
3. *draft a letter* → letter to the institution → **हिन्दी** → *draft it* → edit → *send to outbox*.
4. On the amount discrepancy: *mark resolved* with a note. **Regional officer** → same case → *close as checker*. *"The officer who resolved it cannot close it."*

## 6 · Authorised release (scenario 6)

1. **Institution** → FDR-16-03310 → *request release / refund*: reason + dossier PDF. The clause 6.46 checklist is green except the two clearances the dealing officer attests.
2. **Dealing officer** → tick the two attestations → *draft remarks* (AI, cites clauses) → *recommend*.
3. **Regional officer** → *check and forward*.
4. **Competent authority** → *approve and eSign the order*. Open the PDF: decision trail, signature, QR.
5. Scan the QR (or *public verify page*): *Genuine and unchanged* — signature valid, matches the registry, PDF hash matches the ledger. No login needed.
6. Optional: the authority can also finish FDR-16-07734, which was waiting for them.

## Oversight and trust (as time allows)

- **Competent authority** overview: region table + the AI weekly bureau briefing.
- Top bar ask: *"bank mismatches above 20 lakh"* → editable filter chips (only the question goes to the model).
- On any case, *ask this case* (A5): *"Can this deposit be released?"*. It reads through read-only tools and shows which ones.
- *ask the handbook* (A7): *"Is there a penalty before release if AICTE closed the institution?"*. It cites clause 2.21(h) and (i).
- *reports*: export the discrepancy ageing report as PDF.
- **Auditor** → *audit ledger* → *verify chain*, then *try to alter a past entry*: the database refuses, and the hash would not match anyway.
- *metrics*: the six scenarios, before vs measured.
- *integrations*: what is real, what is simulated, what replaces it in production.

## Reset after the demo

```bash
npm run db:reseed
```
