/** Who should act next on an instrument, and what they should do. Pure. */
import { addDays, holdCompleteAtMaturity } from "./lanes";

export type NextActionInput = {
  recordStatus: string;
  verificationStatus: string;
  validityStatus: string;
  renewalStatus: string;
  releaseStatus: string;
  maturityDate: string | null;
  openDiscrepancies: number;
  /** Of the open ones, how many a maker has resolved and a checker must close. */
  discrepanciesAwaitingCheck?: number;
  /** A bank letter has been recorded and waits for a second officer. */
  letterAwaitingCheck?: boolean;
  issueDate?: string | null;
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
  if (i.releaseStatus === "approved") return { text: "Record the bank's removal of the lien", role: "maker", due: soon(7) };
  if (["released", "refunded"].includes(i.releaseStatus)) return null;
  const awaitingCheck = i.discrepanciesAwaitingCheck ?? 0;
  if (i.openDiscrepancies > awaitingCheck) return { text: "Resolve the open discrepancy", role: "maker", due: soon(7) };
  if (awaitingCheck > 0) return { text: "Check and close the resolved discrepancy", role: "checker", due: soon(3) };
  if (i.letterAwaitingCheck) return { text: "Confirm the bank's letter", role: "checker", due: soon(3) };
  if (i.recordStatus === "submitted") return { text: "Start scrutiny of the new submission", role: "maker", due: soon(3) };
  if (i.verificationStatus === "unverified") return { text: "Request bank confirmation", role: "maker", due: soon(3) };
  if (i.verificationStatus === "pending_bank") return { text: "Await bank confirmation (follow up if late)", role: "maker", due: soon(7) };
  if (i.verificationStatus === "mismatch") return { text: "Raise a discrepancy on the bank mismatch", role: "maker", due: soon(2) };
  if (i.recordStatus === "under_scrutiny" && ["bank_confirmed", "manual_confirmed"].includes(i.verificationStatus))
    return { text: "Accept the record into the registry", role: "maker", due: soon(3) };
  if (i.recordStatus === "accepted" && ["none", "rejected"].includes(i.releaseStatus) && holdCompleteAtMaturity(i.issueDate, i.maturityDate) && ["matured", "expired", "expiring"].includes(i.validityStatus))
    return { text: "Request release of the security deposit (hold complete)", role: "institution", due: soon(30) };
  if (i.renewalStatus === "overdue") return { text: "Escalate: renewed FDR not received after maturity", role: "checker", due: soon(2) };
  if (i.renewalStatus === "due" && i.maturityDate)
    return { text: "Submit the renewed / replacement FDR", role: "institution", due: i.maturityDate };
  if (i.renewalStatus === "requested") return { text: "Verify the renewed FDR", role: "maker", due: soon(5) };
  if (i.validityStatus === "lien_unknown") return { text: "Confirm the lien is marked to AICTE", role: "maker", due: soon(7) };
  return null;
}
