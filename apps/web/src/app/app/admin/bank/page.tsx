import { randomInt } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { Button, Card, PageHeader, Simulated } from "@/components/ui";
import { requirePermission } from "@/lib/auth/session";
import { today } from "@/lib/clock";
import { formatDate } from "@/lib/utils";
import { DEMO_INSTITUTION } from "@/db/seed/data";
import { bank } from "@/lib/sidecar";
import { issueDeposit } from "./actions";

export const metadata: Metadata = { title: "Mock bank" };

const input = "w-full rounded-[10px] border border-line bg-white px-3 py-2 text-[13.5px] outline-none focus:border-ink";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="tag text-[11.5px]">[{label}]</span>
      {children}
    </label>
  );
}

export default async function MockBankPage({ searchParams }: PageProps<"/app/admin/bank">) {
  await requirePermission("admin.clock");
  const { issued, error } = await searchParams;
  const [todayIso, recent] = await Promise.all([today(), bank.recent().catch(() => null)]);
  const accountNo = String(randomInt(10 ** 10, 10 ** 11));
  const just = recent?.recent.find((r) => r.account_no === issued);

  return (
    <>
      <PageHeader title="mock bank" italic="teller" sub="[a branch's core banking system, simulated on the VM]">
        <Link href="/app/admin" className="tag text-[12px] hover:text-ink">
          ← [admin]
        </Link>
      </PageHeader>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,520px)_1fr]">
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <span className="kicker">book a fixed deposit</span>
            <Simulated what="mock bank" />
          </div>
          <p className="mt-2 text-[13px] text-txt">
            Whatever is booked here is what the bank will say when NidhiKavach asks over Account Aggregator or NeSL. Book ₹5 lakh, then sign in as the institution and declare ₹50 lakh: verification catches it.
          </p>
          {error ? (
            <p role="alert" className="mt-3 rounded-[9px] bg-red-soft px-3 py-2 text-[12.5px] text-red">
              {String(error)}
            </p>
          ) : null}
          {just ? (
            <div role="status" className="mt-3 rounded-[9px] border border-green/40 bg-green-soft px-3 py-2 text-[12.5px]">
              Booked FDR <b className="font-mono">{String(just.account_no)}</b> at <span className="font-mono">{String(just.ifsc)}</span> for ₹
              {Number(just.principal).toLocaleString("en-IN")}, maturing {formatDate(String(just.maturity_date))}. The institution can now submit it.
            </div>
          ) : null}
          <form action={issueDeposit} className="mt-4 grid grid-cols-2 gap-3">
            <Field label="branch ifsc">
              <input name="ifsc" defaultValue="SBIN0000305" className={`${input} font-mono uppercase`} required />
            </Field>
            <Field label="fdr / account no.">
              <input name="accountNo" defaultValue={accountNo} className={`${input} font-mono`} required />
            </Field>
            <div className="col-span-2">
              <Field label="depositor">
                <input name="holder" defaultValue={DEMO_INSTITUTION.name} className={input} required />
              </Field>
            </div>
            <Field label="principal, ₹">
              <input name="principal" type="number" defaultValue={500000} min={1000} step={1000} className={`${input} font-mono`} required />
            </Field>
            <Field label="tenure, years">
              <input name="years" type="number" defaultValue={5} min={1} max={15} className={`${input} font-mono`} required />
            </Field>
            <Field label="opened on">
              <input name="openingDate" type="date" defaultValue={todayIso} className={input} required />
            </Field>
            <Field label="lien marked to">
              <input name="lienHolder" defaultValue="Member Secretary, AICTE, New Delhi" className={input} />
            </Field>
            <label className="col-span-2 flex items-center gap-2 text-[13px]">
              <input type="checkbox" name="autoRenew" /> auto-renew on maturity
            </label>
            <div className="col-span-2">
              <Button type="submit">[book deposit]</Button>
            </div>
          </form>
        </Card>

        <Card className="overflow-x-auto p-5">
          <div className="flex items-center justify-between">
            <span className="kicker">booked at the teller</span>
            <span className="tag">[{recent ? `${recent.total.toLocaleString("en-IN")} deposits in the mock bank` : "mock bank unreachable"}]</span>
          </div>
          {recent?.recent.length ? (
            <table className="mt-3 w-full min-w-[560px] text-left text-[12.5px]">
              <thead>
                <tr className="tag border-b border-line text-[11px]">
                  <th className="py-2 pr-3 font-normal">[fdr no.]</th>
                  <th className="py-2 pr-3 font-normal">[ifsc]</th>
                  <th className="py-2 pr-3 font-normal">[depositor]</th>
                  <th className="py-2 pr-3 text-right font-normal">[principal]</th>
                  <th className="py-2 font-normal">[matures]</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-2">
                {recent.recent.map((r) => (
                  <tr key={`${r.ifsc}-${r.account_no}`}>
                    <td className="py-2 pr-3 font-mono">{String(r.account_no)}</td>
                    <td className="py-2 pr-3 font-mono">{String(r.ifsc)}</td>
                    <td className="max-w-[220px] truncate py-2 pr-3">{String(r.holder)}</td>
                    <td className="py-2 pr-3 text-right font-mono">₹{Number(r.principal).toLocaleString("en-IN")}</td>
                    <td className="py-2">{formatDate(String(r.maturity_date))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-3 text-[13px] text-txt">Nothing booked at the teller yet. The {recent?.total.toLocaleString("en-IN") ?? ""} seeded deposits mirror the registry.</p>
          )}
        </Card>
      </div>
    </>
  );
}
