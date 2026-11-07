/**
 * A7 knowledge base: our own paraphrase of the security-deposit rules in the
 * AICTE Approval Process Handbook 2024-25 to 2026-27 (APH 2024-27), with the
 * clause each comes from. Not the handbook text; officers verify against the
 * clause. The 2026-27 addendum was not reviewed for this prototype.
 */
export type RuleNote = { id: string; clause: string; title: string; body: string };

export const RULE_NOTES: RuleNote[] = [
  {
    id: "aph-1.12-amounts",
    clause: "APH 2024-27 cl. 1.12, Table 1.4",
    title: "Security deposit amounts by programme",
    body: "Engineering and Technology: Rs 15 lakh for a diploma or post-diploma programme, Rs 35 lakh for an undergraduate programme and Rs 15 lakh for a postgraduate diploma or degree. Planning, Applied Arts and Crafts, Design and Hotel Management: Rs 15 lakh at each level. Computer Applications (BCA, MCA) and Management (BBA, MBA): Rs 5 lakh at undergraduate level and Rs 15 lakh at postgraduate level; no diploma level.",
  },
  {
    id: "aph-1.12-double",
    clause: "APH 2024-27 cl. 1.12",
    title: "Double deposit on leased premises",
    body: "The security deposit is doubled when the institution runs on privately leased land or building.",
  },
  {
    id: "aph-1.12-exempt",
    clause: "APH 2024-27 cl. 1.12, 1.12(i), 4.10",
    title: "Who is exempt from the security deposit",
    body: "Government and government-aided institutions are exempt. Existing institutions that have been with their regulatory body for more than five years are exempt. Central, State and Government deemed universities do not pay. Private universities and deemed-to-be universities older than ten years with UGC are exempt; younger ones pay for ten years.",
  },
  {
    id: "aph-1.12-tenure",
    clause: "APH 2024-27 cl. 1.12(iv)",
    title: "Holding period: ten years",
    body: "The security deposit is held for ten years. Release is considered after the ten-year period, or earlier only on closure or merger as provided in clause 6.46.",
  },
  {
    id: "aph-lien",
    clause: "APH 2024-27 cl. 6.46; Affidavit 6",
    title: "In whose name the deposit is held",
    body: "The FDR is created for the maturity period in the joint name of the Secretary of the Trust / Society / Company and AICTE. In this prototype the lien is recorded as 'Member Secretary, AICTE, New Delhi'.",
  },
  {
    id: "aph-extend-forfeit",
    clause: "APH 2024-27 cl. 1.12(iv), 2.25(h), 4.10; Affidavit 3",
    title: "Extension and forfeiture",
    body: "AICTE may extend the term of the deposit case by case, or forfeit it, for violation of norms, conditions or requirements, non-performance, complaints against the institution, or closure following withdrawal of approval. Proceeds of a forfeited deposit are used for refunds to students and others.",
  },
  {
    id: "aph-aff3-interest",
    clause: "APH 2024-27 Affidavit 3",
    title: "Interest on the deposit",
    body: "Interest accrued on the deposit is retained by AICTE for improving the quality of technical education.",
  },
  {
    id: "aph-6.46-docs",
    clause: "APH 2024-27 cl. 6.46(a)",
    title: "Documents for a release request",
    body: "The Trust / Society / Company uploads on the AICTE portal: a request letter for release of the FDR or RTGS deposit; Affidavit 6 with details of the institution, the Trust and the deposit; a copy of the FDR to be released (or the demand draft / online payment proof for RTGS deposits); and a copy of the latest Letter of Approval or Extension of Approval.",
  },
  {
    id: "aph-6.46-clearance",
    clause: "APH 2024-27 cl. 6.46(b)",
    title: "Clearances before release",
    body: "Before release, the institution must be cleared by the Public Grievance Redressal Cell (PGRC), the Vigilance Cell and the other cells and bureaus of AICTE.",
  },
  {
    id: "aph-6.46-noc",
    clause: "APH 2024-27 cl. 6.46(c)",
    title: "NOC for FDR, sanction order for RTGS",
    body: "For an FDR, once all clearances are in, the Approval Bureau issues a No Objection Certificate (NOC) to the institution so the bank can release it. For a deposit made by RTGS, the Council issues a sanction order for the refund.",
  },
  {
    id: "aph-6.46-embezzlement",
    clause: "APH 2024-27 cl. 6.46",
    title: "Financial embezzlement blocks release",
    body: "If a case of financial embezzlement involving government bodies or banks exists against the institution, the security deposit is not released until a NOC is received in that matter.",
  },
  {
    id: "aph-6.46h-closure",
    clause: "APH 2024-27 cl. 6.46(h)",
    title: "Release on progressive closure",
    body: "On progressive closure of the institution or of a programme, the security deposit is released on request, against a certificate from the affiliating university or board that no students are studying, unless it has already matured.",
  },
  {
    id: "aph-6.46i-merger",
    clause: "APH 2024-27 cl. 6.46(i)",
    title: "Release on merger of institutions",
    body: "When institutions merge, the security deposit of the child institution(s) is released on request, against a certificate from the affiliating university or board that no students are studying there.",
  },
  {
    id: "aph-2.21h-penalty10",
    clause: "APH 2024-27 cl. 2.21(h)",
    title: "10% penalty: closed for missing documents",
    body: "Where an institution was closed because it did not submit mandatory documents within the duration of the programme, a penalty of 10% of the security deposit is imposed before the deposit is released.",
  },
  {
    id: "aph-2.21i-penalty50",
    clause: "APH 2024-27 cl. 2.21(i)",
    title: "50% penalty: no EoA application for six years",
    body: "Where AICTE closed an institution because it did not apply on the portal for Extension of Approval in the preceding six years, a penalty of 50% of the security deposit is imposed before release.",
  },
  {
    id: "aph-aff6-conditions",
    clause: "APH 2024-27 Affidavit 6",
    title: "What the institution swears for release",
    body: "In Affidavit 6 the institution declares that: no cognizable action is pending against it; all conditions of the LoA are fulfilled; it runs at its approved permanent site, not a temporary one; it is not in the 'No Admission' category; no inquiry or adverse action is pending or contemplated; no fee-refund case is pending; no complaint of misappropriation or embezzlement is under investigation; and the FDR was not mortgaged or renewed (not applicable to RTGS). If a violation is found later, the Trust must refund the deposit to AICTE.",
  },
  {
    id: "aph-aff3-undertaking",
    clause: "APH 2024-27 Affidavit 3",
    title: "Undertaking when the deposit is made",
    body: "When depositing, the institution undertakes that the amount is placed in AICTE's account for ten years, that AICTE may extend or forfeit it, that the remaining requirements of the regulations and the handbook will be met within one month of approval, and that the land was not mortgaged when the application was filed.",
  },
  {
    id: "nk-renewal",
    clause: "NidhiKavach rule set v1 (prototype policy)",
    title: "Renewal before maturity",
    body: "An FDR that matures before the ten-year hold ends must be renewed or replaced, lien-marked again, before maturity. NidhiKavach reminds the institution 90, 60, 30 and 7 days before maturity; 15 days after maturity without a renewal the case escalates weekly from the institution to the dealing officer, the regional officer and the competent authority.",
  },
  {
    id: "nk-maker-checker",
    clause: "NidhiKavach rule set v1 (prototype policy)",
    title: "Three different officers decide a release",
    body: "A release is recommended by the dealing officer, checked by the regional officer and approved by the competent authority; no person may take two of these steps, nor act on a request they raised. The authority's approval is eSigned and produces a release order with a QR code that anyone can verify.",
  },
  {
    id: "nk-verification",
    clause: "NidhiKavach rule set v1 (prototype policy)",
    title: "Verification before acceptance",
    body: "An FDR is accepted into the registry only after the scan has been read, the issuing bank has confirmed the deposit (over Account Aggregator, NeSL, or a bank letter confirmed by a second officer) and no discrepancy is open.",
  },
];
