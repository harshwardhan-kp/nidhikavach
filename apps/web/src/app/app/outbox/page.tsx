import { Mail } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader, Simulated } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/utils";
import { outbox } from "@/modules/messages/queries";

export const metadata: Metadata = { title: "Email outbox" };

export default async function OutboxPage() {
  const user = await requireUser();
  const items = await outbox(user);
  return (
    <>
      <PageHeader title="email" italic="outbox" sub="[every email the portal would send · nothing leaves the prototype]">
        <Simulated what="no real email is sent" />
      </PageHeader>
      <Card className="divide-y divide-line-2">
        {items.map(({ n, sender, caseNo }) => (
          <details key={n.id} className="group px-5 py-3.5">
            <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-3 gap-y-1">
              <Mail size={14} className="shrink-0 translate-y-0.5 text-mut" />
              <span className="text-[13.5px] font-semibold">{n.subject}</span>
              <span className="tag ml-auto shrink-0">{formatDateTime(n.createdAt)}</span>
              <span className="tag w-full pl-6">
                to {n.toAddress} · from {sender ?? "NidhiKavach (automatic)"}
                {caseNo ? (
                  <>
                    {" · "}
                    <Link href={`/app/cases/${caseNo}`} className="hover:text-ink hover:underline">
                      {caseNo}
                    </Link>
                  </>
                ) : null}
              </span>
            </summary>
            <pre className="mt-2 ml-6 font-sans text-[13px] whitespace-pre-wrap text-txt">{n.body}</pre>
          </details>
        ))}
        {!items.length ? <p className="px-5 py-10 text-center text-[13px] text-txt">No emails yet.</p> : null}
      </Card>
    </>
  );
}
