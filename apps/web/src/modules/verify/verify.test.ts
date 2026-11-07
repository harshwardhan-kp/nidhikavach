import { describe, expect, it } from "vitest";
import { fieldsFromDi, wordsToRupees } from "./di-parse";
import { reconcile } from "./reconcile";

describe("wordsToRupees", () => {
  it("reads Indian numbering", () => {
    expect(wordsToRupees("Five Lakh")).toBe(500_000);
    expect(wordsToRupees("Twenty Five Lakh")).toBe(2_500_000);
    expect(wordsToRupees("One Crore Twenty Lakh Fifty Thousand")).toBe(12_050_000);
    expect(wordsToRupees("Two Hundred and Fifty")).toBe(250);
  });
  it("gives up on unknown words", () => {
    expect(wordsToRupees("Five Bananas")).toBeNull();
  });
});

describe("fieldsFromDi", () => {
  const kv = (key: string, value: string) => ({ key: { content: key }, value: { content: value }, confidence: 0.99 });

  it("never reads the maturity value as the principal", () => {
    const r = fieldsFromDi({
      content: "PRINCIPAL AMOUNT\nDepositor\nX\nRupees Five Lakh Only\nMaturity Value\nRs. 10,31,747.00\n",
      keyValuePairs: [kv("Maturity Value", "Rs. 10,31,747.00")],
    });
    expect(r.amount?.value).toBe("500000");
  });

  it("prefers the figure next to PRINCIPAL AMOUNT", () => {
    const r = fieldsFromDi({ content: "PRINCIPAL AMOUNT\nRs. 25,00,000.00\nMaturity Value\nRs. 51,00,000.00", keyValuePairs: [] });
    expect(r.amount?.value).toBe("Rs. 25,00,000.00");
  });

  it("fixes an IFSC read with the letter O and keeps the last date of a merged cell", () => {
    const r = fieldsFromDi({
      content: "",
      keyValuePairs: [kv("IFSC", "SBIN O000305"), kv("IFSC Code", "x"), kv("Due Date of Maturity", "10/07/2026 10/07/2036")],
    });
    expect(r.maturityDate?.value).toBe("10/07/2036");
    expect(r.issueDate).toBeUndefined();
  });
});

describe("reconcile", () => {
  it("raises confidence when both readers agree, flags disagreement", () => {
    const out = reconcile(
      { amount: { value: "Rs. 5,00,000.00", confidence: 0.9 }, ifsc: { value: "SBIN0000305", confidence: 0.8 } },
      { fields: { amount: { value: "500000", confidence: 0.9 }, ifsc: { value: "HDFC0000001", confidence: 0.95 } } },
    );
    expect(out.amount.agree).toBe(true);
    expect(out.amount.confidence).toBeGreaterThan(0.9);
    expect(out.ifsc.agree).toBe(false);
    expect(out.ifsc.value).toBe("HDFC0000001");
    expect(out.ifsc.confidence).toBe(0.4);
    expect(out.depositorName.value).toBeNull();
  });

  it("on disagreement keeps the reading an independent source backs", () => {
    const out = reconcile(
      { depositorName: { value: "Bastar Ridge Institute, 5NO0 G000", confidence: 0.9 } },
      { fields: { depositorName: { value: "Bastar Ridge Institute, North Goa", confidence: 0.8 } } },
      { depositorName: ["Bastar Ridge Institute, North Goa", null] },
    );
    expect(out.depositorName.value).toBe("Bastar Ridge Institute, North Goa");
    expect(out.depositorName.agree).toBe(false);
    expect(out.depositorName.confidence).toBe(0.6);
  });
});
