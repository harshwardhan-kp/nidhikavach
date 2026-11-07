/** Who should act next on an instrument, and what they should do. Pure. */
import { addDays } from "./lanes";

export type NextActionInput = {
  recordStatus: string;
  verificationStatus: string;
  validityStatus: string;
  renewalStatus: string;
  releaseStatus: string;
  maturityDate: string | null;
  openDiscrepancies: number;
  today: string;
};

export type NextAction = { text: string; role: "institution" | "maker" | "checker" | "authority"; due: string } | null;

export function nextAction(i: NextActionInput): NextAction {
  const soon = (d: number) => addDays(i.today, d);
  if (i.recordStatus === "draft") return { text: "Complete and submit the declaration", role: "institution", due: soon(7) };
  if (i.recordStatus === "returned") return { text: "Correct and resubmit the declaration", role: "institution", due: soon(7) };
  if (i.releaseStatus === "requested") return { text: "Scrutinise the release request and recommend", role: "maker", due: soon(5) };
  if (i.releaseStatus === "recommended") return { text: "Check the release recommendation", role: "checker", due: soon(3) };
  if (i.releaseStatus === "checked") return { text: "Decide the release and eSign the order", role: "authority", due: soon(3) };
  if (["approved", "released", "refunded"].includes(i.releaseStatus)) return null;
  if (i.openDiscrepancies > 0) return { text: "Resolve the open discrepancy", role: "maker", due: soon(7) };
  if (i.recordStatus === "submitted") return { text: "Start scrutiny of the new submission", role: "maker", due: soon(3) };
  if (i.verificationStatus === "unverified") return { text: "Request bank confirmation", role: "maker", due: soon(3) };
  if (i.verificationStatus === "pending_bank") return { text: "Await bank confirmation (follow up if late)", role: "maker", due: soon(7) };
  if (i.verificationStatus === "mismatch") return { text: "Raise a discrepancy on the bank mismatch", role: "maker", due: soon(2) };
  if (i.renewalStatus === "overdue") return { text: "Escalate: renewed FDR not received after maturity", role: "checker", due: soon(2) };
  if (i.renewalStatus === "due" && i.maturityDate)
    return { text: "Submit the renewed / replacement FDR", role: "institution", due: i.maturityDate };
  if (i.renewalStatus === "requested") return { text: "Verify the renewed FDR", role: "maker", due: soon(5) };
  if (i.validityStatus === "lien_unknown") return { text: "Confirm the lien is marked to AICTE", role: "maker", due: soon(7) };
  return null;
}
