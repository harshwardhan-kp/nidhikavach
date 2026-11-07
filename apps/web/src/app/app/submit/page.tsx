import { and, eq, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { LIEN_TEXT } from "@/lib/rules/fields";
import { requirePermission } from "@/lib/auth/session";
import { formatDate } from "@/lib/utils";
import { SubmitForm } from "./submit-form";

export const metadata: Metadata = { title: "Submit an FDR" };

export default async function SubmitPage({ searchParams }: PageProps<"/app/submit">) {
  const user = await requirePermission("instrument.submit");
  const { renews } = await searchParams;
  const instId = user.institutionId!;
  const I = schema.instruments;
  const [mine, renewable] = await Promise.all([
    db.selectDistinct({ programme: I.programme }).from(I).where(eq(I.institutionId, instId)),
    db
      .select({ caseNo: I.caseNo, amountPaise: I.amountPaise, maturityDate: I.maturityDate, programme: I.programme })
      .from(I)
      .where(and(eq(I.institutionId, instId), inArray(I.renewalStatus, ["due", "overdue"]))),
  ]);

  return (
    <>
      <PageHeader title="submit an" italic="fdr" sub={`[${user.institutionName} · one submission per instrument]`} />
      <SubmitForm
        institutionName={user.institutionName ?? ""}
        programmes={mine.map((m) => m.programme)}
        renewable={renewable.map((r) => ({
          caseNo: r.caseNo,
          label: `${r.caseNo} · ${r.programme} · ₹${((r.amountPaise ?? 0) / 100).toLocaleString("en-IN")} · matures ${formatDate(r.maturityDate)}`,
        }))}
        defaultReplaces={typeof renews === "string" ? renews : undefined}
        lienDefault={LIEN_TEXT}
      />
    </>
  );
}
