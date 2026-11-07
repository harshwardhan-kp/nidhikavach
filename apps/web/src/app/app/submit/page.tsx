import { and, eq, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { LIEN_TEXT } from "@/lib/rules/fields";
import { requirePermission } from "@/lib/auth/session";
import { formatDate } from "@/lib/utils";
import { tr } from "@/lib/i18n";
import { getLang } from "@/lib/lang";
import { SubmitForm } from "./submit-form";

// The submission kicks off the scan read with after(), which runs within this budget.
export const maxDuration = 60;

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

  const lang = await getLang();
  const keys = ["instrument details", "programme", "instrument type", "fdr / receipt number", "amount (₹)", "date of deposit", "maturity date", "ifsc of issuing branch", "depositor (as on the receipt)", "lien marked in favour of", "Must be AICTE for a security deposit", "fdr scan", "renewal or replacement?", "No, this is a new deposit", "Linking a renewal keeps one history for the deposit and stops its reminders.", "[sent straight to the encrypted document store]", "[uploading scan…]", "[submitting…]", "[submit for verification]", "[after you submit, the dealing officer is notified and the scan is read by doc-ai]", "No branch found for this IFSC."];

  return (
    <>
      <PageHeader title={tr(lang, "submit an")} italic={tr(lang, "fdr")} sub={`[${user.institutionName} · one submission per instrument]`} />
      <SubmitForm
        institutionName={user.institutionName ?? ""}
        programmes={mine.map((m) => m.programme)}
        renewable={renewable.map((r) => ({
          caseNo: r.caseNo,
          label: `${r.caseNo} · ${r.programme} · ₹${((r.amountPaise ?? 0) / 100).toLocaleString("en-IN")} · matures ${formatDate(r.maturityDate)}`,
        }))}
        defaultReplaces={typeof renews === "string" ? renews : undefined}
        lienDefault={LIEN_TEXT}
        t={Object.fromEntries(keys.map((k) => [k, tr(lang, k)]))}
      />
    </>
  );
}
