import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Security & compliance" };

const ROWS: { area: string; what: string; how: string; law: string }[] = [
  { area: "Access control", what: "Six roles, scope on every query (institution sees its own, a regional office its region, HQ all)", how: "lib/auth/roles.ts, modules/cases/scope.ts; 403 page on denial", law: "DPDP Act 2023 s.8(5) reasonable safeguards; CERT-In access-control guidance" },
  { area: "Separation of duties", what: "Maker ≠ checker ≠ authority enforced by user id; a bank letter and a resolved discrepancy each need a second officer", how: "distinctActor() checks in every approval action", law: "Internal-control practice for public funds (maker-checker)" },
  { area: "Audit trail", what: "Append-only, SHA-256 hash-chained ledger; UPDATE/DELETE blocked in the database; anyone with the role can verify the chain", how: "ledger_append / ledger_verify SQL functions, tamper test on /app/audit", law: "IT Act 2000 s.7 (retention of electronic records); CERT-In directions of April 2022 (logs kept 180 days)" },
  { area: "Authentication", what: "argon2id password hashes; httpOnly, SameSite, 8-hour signed session cookie", how: "lib/auth/password.ts, token.ts", law: "CERT-In / GIGW 3.0 authentication guidance" },
  { area: "Documents", what: "Uploads go straight to the document service via short-lived signed URLs; SHA-256 recorded; files private on the VM", how: "sidecar /v1/files with HMAC tokens; documents.sha256", law: "DPDP Act 2023 s.8(5) (reasonable security safeguards)" },
  { area: "Data minimisation", what: "AI gets only what a task needs: plain-language search sends only the question; the bureau briefing only aggregates; public verify page masks the FDR number", how: "modules/assist/*; verify/[id] shows the last 4 digits", law: "DPDP Act 2023 s.4–6 (lawful purpose, notice, only the data needed)" },
  { area: "AI governance", what: "AI advises, officers decide; every call logged with model, input hash and output; each suggestion labelled", how: "ai_calls table; [advisory] tags in the UI", law: "MeitY India AI Governance Guidelines; IndiaAI ‘safe & trusted AI’ pillar" },
  { area: "eSign", what: "Release orders are digitally signed (simulated with Ed25519) and verifiable by anyone via QR", how: "lib/esign.ts; /verify/[id]", law: "IT Act 2000 s.3A and Second Schedule (Aadhaar eSign) in production" },
  { area: "Transport & headers", what: "TLS everywhere (Vercel, Caddy on the VM, Postgres sslmode=require); HSTS, CSP, X-Frame-Options DENY, nosniff", how: "next.config.ts headers; Caddyfile", law: "GIGW 3.0 security; CERT-In technical guidelines" },
  { area: "Hosting in India", what: "Database and documents on an Azure VM in Hyderabad (India South Central); web functions in Mumbai (bom1)", how: "Azure rg-nidhikavach; Vercel region bom1", law: "MeitY cloud empanelment / data localisation preference for government data" },
  { area: "Accessibility", what: "Semantic HTML, labelled controls, keyboard reachable, status announced with role=status", how: "Tailwind + native elements", law: "GIGW 3.0; RPwD Act 2016 s.42 (accessible ICT)" },
];

export default async function SecurityPage() {
  await requireUser();
  return (
    <>
      <PageHeader title="security" italic="& compliance" sub="[how the prototype maps to Indian law and government guidelines · a pitch summary, not legal advice]" />
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-[12.5px]">
          <thead>
            <tr className="tag border-b border-line text-[11px]">
              <th className="px-4 py-3 font-normal">[area]</th>
              <th className="px-3 py-3 font-normal">[what the prototype does]</th>
              <th className="px-3 py-3 font-normal">[where]</th>
              <th className="px-4 py-3 font-normal">[maps to]</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-2 align-top">
            {ROWS.map((r) => (
              <tr key={r.area}>
                <td className="px-4 py-3 font-semibold whitespace-nowrap">{r.area}</td>
                <td className="px-3 py-3">{r.what}</td>
                <td className="px-3 py-3 font-mono text-[11.5px] text-txt">{r.how}</td>
                <td className="px-4 py-3 text-txt">{r.law}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
