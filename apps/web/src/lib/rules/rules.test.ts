import { describe, expect, it } from "vitest";
import { compare, matchField, normaliseAmount, normaliseDate } from "./fields";
import { addDays, renewalLane, validityLane } from "./lanes";
import { computeTrust } from "./trust";

const perfect = {
  instrumentNo: { declared: "SBIN2611004521", scan: "SBIN2611004521", bank: "SBIN2611004521" },
  amount: { declared: "1000000", scan: "10,00,000", bank: "1000000" },
  issueDate: { declared: "2024-03-12", scan: "12/03/2024", bank: "2024-03-12" },
  maturityDate: { declared: "2027-03-12", scan: "12-Mar-2027", bank: "2027-03-12" },
  ifsc: { declared: "SBIN0001234", scan: "SBIN0001234", bank: "SBIN0001234" },
  depositorName: { declared: "Govt. Polytechnic, Nagpur", scan: "GOVT POLYTECHNIC NAGPUR", bank: "Govt Polytechnic Nagpur" },
  lienHolder: { declared: "Member Secretary, AICTE", scan: "Member Secretary AICTE", bank: "Member Secretary, AICTE" },
  autoRenew: { declared: "no", scan: "No", bank: "false" },
};

describe("normalisers", () => {
  it("reads Indian date spellings", () => {
    expect(normaliseDate("12/03/2024")).toBe("2024-03-12");
    expect(normaliseDate("12-Mar-2027")).toBe("2027-03-12");
    expect(normaliseDate("1st January 2026")).toBe("2026-01-01");
  });
  it("reads amounts with lakh grouping and units", () => {
    expect(normaliseAmount("₹10,00,000.00")).toBe(1_000_000);
    expect(normaliseAmount("10 lakh")).toBe(1_000_000);
    expect(normaliseAmount("Rs. 35,00,000/-")).toBe(3_500_000);
  });
  it("treats separators and leading zeros in FDR numbers as formatting", () => {
    expect(compare("instrumentNo", "0045-2211", "452211")).toBe("soft_match");
    expect(compare("instrumentNo", "452211", "452217")).toBe("mismatch");
  });
  it("needs two sources to compare", () => {
    expect(matchField("amount", { declared: "100" })).toBe("missing");
  });
});

describe("trust score", () => {
  it("gives a bank-confirmed record a green score", () => {
    const t = computeTrust(perfect);
    expect(t.band).toBe("green");
    expect(t.score).toBeGreaterThanOrEqual(90);
  });

  it("caps a record the bank has not confirmed", () => {
    const noBank = Object.fromEntries(Object.entries(perfect).map(([k, v]) => [k, { ...v, bank: null }]));
    const t = computeTrust(noBank);
    expect(t.capped || (t.score ?? 0) <= 70).toBe(true);
    expect(t.score).toBeLessThanOrEqual(70);
  });

  it("goes red when the bank disagrees on the amount", () => {
    const t = computeTrust({ ...perfect, amount: { declared: "1000000", scan: "1000000", bank: "100000" } });
    expect(t.band).not.toBe("green");
    expect(t.penalties.some((p) => p.reason.includes("Amount"))).toBe(true);
  });

  it("penalises a lien that is not in favour of AICTE", () => {
    const t = computeTrust({ ...perfect, lienHolder: { declared: "Member Secretary, AICTE", scan: "Principal, GP Nagpur", bank: "Principal, GP Nagpur" } });
    expect(t.penalties.some((p) => p.reason.includes("Lien"))).toBe(true);
    expect(t.band).toBe("red");
  });

  it("leaves a fresh declaration unscored", () => {
    const t = computeTrust({ amount: { declared: "1000000" } });
    expect(t.band).toBe("unscored");
    expect(t.score).toBeNull();
  });

  it("subtracts for a tamper flag", () => {
    expect(computeTrust(perfect, { tamperScore: 80 }).score!).toBeLessThan(computeTrust(perfect).score!);
  });
});

describe("lanes", () => {
  const today = "2026-11-07";
  it("moves through valid -> expiring -> matured -> expired", () => {
    expect(validityLane({ maturityDate: addDays(today, 200), today, lienIsAicte: true })).toBe("valid");
    expect(validityLane({ maturityDate: addDays(today, 60), today, lienIsAicte: true })).toBe("expiring");
    expect(validityLane({ maturityDate: addDays(today, -3), today, lienIsAicte: true })).toBe("matured");
    expect(validityLane({ maturityDate: addDays(today, -40), today, lienIsAicte: true })).toBe("expired");
  });
  it("flags an unknown lien while the deposit is live", () => {
    expect(validityLane({ maturityDate: addDays(today, 200), today, lienIsAicte: null })).toBe("lien_unknown");
  });
  it("makes renewal due inside 90 days and overdue after grace", () => {
    const base = { current: "not_due" as const, release: "none" as const, today };
    expect(renewalLane({ ...base, maturityDate: addDays(today, 30) })).toBe("due");
    expect(renewalLane({ ...base, maturityDate: addDays(today, -30) })).toBe("overdue");
    expect(renewalLane({ ...base, current: "renewed", maturityDate: addDays(today, -30) })).toBe("renewed");
  });
  it("never makes a released deposit due for renewal", () => {
    expect(renewalLane({ current: "not_due", release: "released", maturityDate: addDays(today, 10), today })).toBe("not_due");
  });
});
