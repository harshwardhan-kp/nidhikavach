/** Static seed data. Synthetic: no real persons or real deposits. */

// AICTE regional offices (approximate state mapping for the prototype).
export const REGIONS = [
  { code: "NRO", name: "Northern", hqCity: "Kanpur", states: ["Uttar Pradesh", "Uttarakhand", "Bihar", "Jharkhand"] },
  { code: "NWRO", name: "North-Western", hqCity: "Chandigarh", states: ["Punjab", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Chandigarh", "Delhi", "Rajasthan"] },
  { code: "WRO", name: "Western", hqCity: "Mumbai", states: ["Maharashtra", "Goa", "Gujarat"] },
  { code: "CRO", name: "Central", hqCity: "Bhopal", states: ["Madhya Pradesh", "Chhattisgarh"] },
  { code: "ERO", name: "Eastern", hqCity: "Kolkata", states: ["West Bengal", "Odisha", "Assam", "Tripura", "Meghalaya", "Manipur", "Sikkim"] },
  { code: "SRO", name: "Southern", hqCity: "Chennai", states: ["Tamil Nadu", "Puducherry"] },
  { code: "SWRO", name: "South-Western", hqCity: "Bengaluru", states: ["Karnataka", "Kerala"] },
  { code: "SCRO", name: "South-Central", hqCity: "Hyderabad", states: ["Telangana", "Andhra Pradesh"] },
] as const;

/**
 * Rule set v1. Values follow the AICTE Approval Process Handbook 2024-27 as
 * cited in our deck (cl. 1.12 security deposit + 10-year hold, cl. 6.46
 * release). To be re-checked against the handbook text before the demo.
 */
export const RULE_SET_V1 = {
  source: "AICTE Approval Process Handbook 2024-27 (as cited; verify clause text)",
  securityDeposit: {
    maxPerProgrammePaise: 35_00_000_00, // ₹35 lakh
    holdYears: 10,
    clause: "APH 2024-27 cl. 1.12, Table 1.4",
    lienHolder: "Member Secretary, AICTE",
  },
  reminders: {
    maturityOffsetsDays: [90, 60, 30, 7],
    renewalGraceDays: 15,
    verificationSlaDays: 7,
    discrepancySlaDays: 15,
  },
  escalation: {
    ladder: ["institution", "maker", "checker", "authority"],
    stepAfterDays: 7,
  },
  trustScore: {
    weights: { instrumentNo: 20, amount: 20, maturityDate: 15, issueDate: 10, ifsc: 10, depositorName: 10, lienHolder: 10, autoRenew: 5 },
    noBankCap: 70,
    bands: { green: 90, amber: 60 },
  },
  release: {
    clause: "APH 2024-27 cl. 6.46",
    steps: ["recommend", "check", "approve"],
    conditions: [
      { key: "hold_period_complete", label: "Hold period of 10 years completed, or programme closed with approval" },
      { key: "no_pending_dues", label: "No pending dues or penal action against the institution" },
      { key: "bank_confirmed", label: "Instrument confirmed by the issuing bank" },
      { key: "no_open_discrepancy", label: "No open discrepancy on the instrument" },
      { key: "original_returned", label: "Original FDR / discharge voucher on record" },
    ],
  },
} as const;

/** Shared password for the six seeded demo accounts (prototype only; also shown on the login page). */
export const DEMO_PASSWORD = "nidhikavach-demo-2026";

export const DEMO_INSTITUTION = {
  aicteId: "1-2611045671",
  name: "Govt. Polytechnic, Nagpur",
  kind: "polytechnic",
  ownership: "government",
  state: "Maharashtra",
  city: "Nagpur",
  region: "WRO",
} as const;

export const DEMO_USERS = [
  { key: "institution", email: "nodal.gpnagpur@demo.nidhikavach.in", name: "Meera Joshi", designation: "Nodal officer, Govt. Polytechnic, Nagpur", roles: ["institution"], region: "WRO", institution: true },
  { key: "maker", email: "dealing.wro@demo.nidhikavach.in", name: "Rohan Kulkarni", designation: "Assistant Director (dealing officer), Western Regional Office", roles: ["maker"], region: "WRO" },
  { key: "checker", email: "rd.wro@demo.nidhikavach.in", name: "Sunita Iyer", designation: "Regional Officer, Western Regional Office", roles: ["checker"], region: "WRO" },
  { key: "authority", email: "advisor.rb@demo.nidhikavach.in", name: "Dr. Arvind Menon", designation: "Advisor, Regulation Bureau, AICTE HQ", roles: ["authority"], region: null },
  { key: "auditor", email: "audit@demo.nidhikavach.in", name: "Kavita Sharma", designation: "Internal Audit, AICTE", roles: ["auditor"], region: null },
  { key: "admin", email: "admin@demo.nidhikavach.in", name: "System Admin", designation: "NidhiKavach administrator", roles: ["admin"], region: null },
] as const;
