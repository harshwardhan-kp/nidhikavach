import type { Metadata } from "next";
import { PageHeader, Simulated } from "@/components/ui";
import { requirePermission } from "@/lib/auth/session";
import { HandbookChat } from "./handbook-chat";

export const metadata: Metadata = { title: "Ask the handbook" };

const SUGGESTED = [
  "Can a security deposit be released before ten years if the programme closes?",
  "What documents must the institution upload to get its FDR released?",
  "Is there a penalty before release if AICTE closed the institution?",
  "How much security deposit does a new B.Tech programme need?",
  "Which institutions are exempt from the security deposit?",
];

export default async function RulesPage({ searchParams }: PageProps<"/app/rules">) {
  await requirePermission("reports.view");
  const { q, case: caseNo } = await searchParams;
  return (
    <>
      <PageHeader title="ask the" italic="handbook" sub="[a7 · AICTE Approval Process Handbook 2024-27 · answers cite the clause]">
        <Simulated what="paraphrased notes · verify the clause" />
      </PageHeader>
      <HandbookChat initialQuestion={typeof q === "string" ? q : ""} caseNo={typeof caseNo === "string" ? caseNo : null} suggested={SUGGESTED} />
    </>
  );
}
