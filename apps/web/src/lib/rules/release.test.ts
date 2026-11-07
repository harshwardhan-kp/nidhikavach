import { describe, expect, it } from "vitest";
import { allMet, blockers, evaluateRelease, holdEnds } from "./release";

const base = { kind: "release" as const, issueDate: "2016-08-18", today: "2026-11-07", verificationStatus: "bank_confirmed", openDiscrepancies: 0, documentsAttached: 1 };

describe("evaluateRelease", () => {
  it("needs the 10-year hold for a plain release", () => {
    expect(holdEnds("2016-08-18")).toBe("2026-08-18");
    expect(blockers(evaluateRelease(base))).toEqual([]);
    expect(blockers(evaluateRelease({ ...base, issueDate: "2020-01-01" })).map((c) => c.key)).toEqual(["hold_or_closure"]);
  });
  it("lets a closure refund through before the hold ends, given the certificate", () => {
    const c = evaluateRelease({ ...base, kind: "refund", issueDate: "2022-01-01" });
    expect(blockers(c)).toEqual([]);
    expect(blockers(evaluateRelease({ ...base, kind: "refund", issueDate: "2022-01-01", documentsAttached: 0 })).map((x) => x.key)).toEqual(["hold_or_closure", "documents"]);
  });
  it("blocks on bank status and open discrepancies", () => {
    const keys = blockers(evaluateRelease({ ...base, verificationStatus: "mismatch", openDiscrepancies: 2 })).map((c) => c.key);
    expect(keys).toEqual(["bank_confirmed", "no_open_discrepancy"]);
  });
  it("is decided only once the officer attests clearances", () => {
    expect(allMet(evaluateRelease(base))).toBe(false);
    expect(allMet(evaluateRelease({ ...base, attested: { cell_clearances: true, no_dues_or_penalty: true } }))).toBe(true);
  });
});

import { pdfSafe } from "@/lib/pdf-text";
describe("pdfSafe", () => {
  it("keeps the order printable in standard PDF fonts", () => {
    expect(pdfSafe("release of the ₹15,00,000 FDR — “approved”")).toBe('release of the Rs. 15,00,000 FDR - "approved"');
    expect(pdfSafe("नमस्ते ok")).toBe("?????? ok");
  });
});
