import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { env } from "@/lib/env";
import { bank } from "@/lib/sidecar";

export type Check = { name: string; kind: "real" | "simulated" | "hybrid"; production: string; ok: boolean | null; detail: string };

const timed = async <T>(fn: () => Promise<T>) => {
  const t0 = Date.now();
  try {
    return { value: await fn(), ms: Date.now() - t0, error: null as string | null };
  } catch (e) {
    return { value: null, ms: Date.now() - t0, error: e instanceof Error ? e.message.slice(0, 120) : "failed" };
  }
};

/** Live status of everything the portal depends on, checked on page load. */
export async function healthChecks(): Promise<Check[]> {
  const [pg, side, mock, ai, di, cron, keys] = await Promise.all([
    timed(() => db.execute<{ v: string; ext: string }>(sql`select current_setting('server_version') as v, (select string_agg(extname || ' ' || extversion, ', ' order by extname) from pg_extension where extname in ('vector','pgcrypto','pg_trgm')) as ext`)),
    timed(async () => {
      const r = await fetch(`${env.SIDECAR_URL}/health`, { cache: "no-store" });
      return (await r.json()) as { version?: string; status?: string };
    }),
    timed(() => bank.recent()),
    timed(() => db.execute<{ model: string; n: number; ok: number; last: Date | null }>(sql`select model, count(*)::int as n, count(*) filter (where error is null)::int as ok, max(created_at) as last from ai_calls where created_at > now() - interval '7 days' group by model order by model`)),
    timed(() => db.execute<{ n: number; failed: number }>(sql`select count(*)::int as n, count(*) filter (where extraction->'di' ? 'error')::int as failed from documents where extraction ? 'di'`)),
    timed(() => db.execute<{ ts: Date | null; payload: { ms?: number; instruments?: number } | null }>(sql`select ts, payload from audit_ledger where action = 'lifecycle.run' and payload->>'reason' = 'daily cron' order by seq desc limit 1`)),
    timed(() => db.execute<{ n: number }>(sql`select count(*)::int as n from signing_keys`)),
  ]);
  const aiRows = ai.value ? [...ai.value] : [];
  const cronRow = cron.value?.[0];
  return [
    { name: "PostgreSQL on the Azure VM", kind: "real", production: "NIC / MeghRaj managed PostgreSQL", ok: !pg.error, detail: pg.error ?? `v${pg.value?.[0]?.v} · ${pg.value?.[0]?.ext} · ${pg.ms} ms over TLS` },
    { name: "Document sidecar (files, tamper scan)", kind: "real", production: "Same service on NIC cloud, object storage", ok: !side.error, detail: side.error ?? `v${side.value?.version ?? "?"} · ${side.ms} ms · signed, expiring URLs` },
    { name: "Azure Document Intelligence (A1)", kind: "real", production: "On-prem OCR (PaddleOCR) behind the same interface", ok: env.AZURE_DI_ENDPOINT ? (di.value?.[0] ? di.value[0].n === 0 || di.value[0].failed < di.value[0].n : null) : false, detail: env.AZURE_DI_ENDPOINT ? `prebuilt-layout · ${di.value?.[0]?.n ?? 0} scans read, ${di.value?.[0]?.failed ?? 0} failed` : "not configured" },
    { name: "OpenAI (gpt-6.1-terra, gpt-6-luna, embeddings)", kind: "real", production: "On-prem models (Ollama) behind the same ai/ interface", ok: env.OPENAI_API_KEY ? (aiRows.length ? aiRows.every((r) => r.ok > 0) : null) : false, detail: aiRows.length ? aiRows.map((r) => `${r.model}: ${r.ok}/${r.n} ok`).join(" · ") + " (7 days)" : "no calls in 7 days" },
    { name: "Account Aggregator / NeSL bank rails", kind: "simulated", production: "Sahamati AA (FIU licence via RBI-regulated FIP banks); NeSL e-BG / e-FDR API", ok: !mock.error, detail: mock.error ?? `mock core banking: ${mock.value?.total.toLocaleString("en-IN")} deposits · ReBIT-shaped term-deposit JSON` },
    { name: "eSign (release orders)", kind: "simulated", production: "Aadhaar eSign / DSC via a CA-empanelled ESP (IT Act 2000 s.3A)", ok: !keys.error, detail: keys.error ?? `Ed25519 per officer · ${keys.value?.[0]?.n ?? 0} public keys published · public QR verify page` },
    { name: "Email", kind: "simulated", production: "NIC SMTP / Sandes for officers and institutions", ok: true, detail: "rendered into the in-app outbox; nothing is sent" },
    { name: "Daily lifecycle cron", kind: "real", production: "Same, on the hosting platform's scheduler", ok: cron.error ? false : cronRow ? true : null, detail: cron.error ?? (cronRow?.ts ? `last daily run ${cronRow.ts.toISOString().slice(0, 16).replace("T", " ")} UTC · ${cronRow.payload?.instruments ?? "?"} FDRs in ${cronRow.payload?.ms ?? "?"} ms` : "runs at 00:00 IST; no daily run since the last reseed") },
    { name: "IFSC directory", kind: "hybrid", production: "RBI IFSC master, refreshed monthly", ok: true, detail: "1,498 real branches bundled from the public razorpay/ifsc dataset; live lookup by API" },
  ];
}
