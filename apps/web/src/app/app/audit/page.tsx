import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { Card, PageHeader, Pill } from "@/components/ui";
import { db, schema } from "@/db";
import { can } from "@/lib/auth/roles";
import { requirePermission } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/utils";
import { TamperDemo } from "./tamper-demo";
import { VerifyButton } from "./verify-button";

export const metadata: Metadata = { title: "Audit ledger" };

export default async function AuditPage() {
  const user = await requirePermission("ledger.view");
  const rows = await db
    .select({ entry: schema.auditLedger, actorName: schema.users.name })
    .from(schema.auditLedger)
    .leftJoin(schema.users, eq(schema.users.id, schema.auditLedger.actorId))
    .orderBy(desc(schema.auditLedger.seq))
    .limit(200);

  return (
    <>
      <PageHeader title="audit" italic="ledger" sub="[append-only · sha-256 hash-chained · latest 200 entries]">
        {can(user.roles, "ledger.verify") ? <VerifyButton /> : null}
      </PageHeader>
      {can(user.roles, "ledger.verify") ? (
        <Card className="mb-4 p-5">
          <div className="kicker">tamper test</div>
          <p className="mt-1.5 mb-3 text-[13px] text-txt">Try to change the amount in a past entry and see the two layers that stop it.</p>
          <TamperDemo />
        </Card>
      ) : null}
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-[13px]">
          <thead>
            <tr className="tag border-b border-line text-[11px]">
              <th className="px-4 py-3 font-normal">[#]</th>
              <th className="px-4 py-3 font-normal">[time]</th>
              <th className="px-4 py-3 font-normal">[actor]</th>
              <th className="px-4 py-3 font-normal">[action]</th>
              <th className="px-4 py-3 font-normal">[entity]</th>
              <th className="px-4 py-3 font-normal">[hash · prev]</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-2">
            {rows.map(({ entry, actorName }) => (
              <tr key={entry.seq} className="align-top">
                <td className="px-4 py-2.5 font-mono text-[12px]">{entry.seq}</td>
                <td className="px-4 py-2.5 font-mono text-[12px] whitespace-nowrap text-txt">{formatDateTime(entry.ts)}</td>
                <td className="px-4 py-2.5">
                  <div>{actorName ?? "system"}</div>
                  <div className="tag">{entry.actorRole}</div>
                </td>
                <td className="px-4 py-2.5">
                  <Pill tone={entry.action.includes("failed") ? "red" : "neutral"}>{entry.action}</Pill>
                </td>
                <td className="px-4 py-2.5 font-mono text-[12px] text-txt">
                  {entry.entity}
                  {entry.entityId ? <span className="text-mut"> · {entry.entityId.slice(0, 8)}</span> : null}
                </td>
                <td className="px-4 py-2.5 font-mono text-[11.5px]">
                  <div title={entry.hash}>{entry.hash.slice(0, 16)}…</div>
                  <div className="text-mut" title={entry.prevHash}>
                    ↳ {entry.prevHash.slice(0, 16)}…
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
