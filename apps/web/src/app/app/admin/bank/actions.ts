"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { appendLedger } from "@/lib/ledger";
import { addDays } from "@/lib/rules/lanes";
import { bank, SidecarError } from "@/lib/sidecar";
import { findBranch } from "@/modules/instruments/ifsc";

const schema = z.object({
  ifsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Enter a valid IFSC"),
  accountNo: z.string().trim().regex(/^[0-9A-Z]{6,20}$/i, "6–20 letters or digits"),
  holder: z.string().trim().min(3),
  principal: z.coerce.number().int().min(1000).max(1_000_000_000),
  openingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  years: z.coerce.number().int().min(1).max(15),
  lienHolder: z.string().trim().max(120).optional(),
  autoRenew: z.string().optional(),
});

/** Simulated: a bank branch books a fixed deposit in its own core banking system. */
export async function issueDeposit(fd: FormData) {
  const user = await requirePermission("admin.clock");
  const parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) redirect(`/app/admin/bank?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  const v = parsed.data;
  const branch = await findBranch(v.ifsc);
  if (!branch) redirect(`/app/admin/bank?error=${encodeURIComponent(`${v.ifsc} is not a known branch`)}`);
  const maturityDate = addDays(v.openingDate, Math.round(v.years * 365.25));
  try {
    await bank.issue({
      ifsc: v.ifsc,
      accountNo: v.accountNo.toUpperCase(),
      holder: v.holder,
      principal: v.principal,
      openingDate: v.openingDate,
      maturityDate,
      rate: 7.1,
      lienHolder: v.lienHolder || null,
      autoRenew: v.autoRenew === "on",
      issuedBy: "teller",
    });
  } catch (e) {
    redirect(`/app/admin/bank?error=${encodeURIComponent(e instanceof SidecarError ? JSON.stringify(e.detail).slice(0, 200) : "The mock bank is unreachable")}`);
  }
  await appendLedger({ actor: user, action: "mockbank.deposit_issued", entity: "settings", entityId: "mock_bank", payload: { ifsc: v.ifsc, accountNo: v.accountNo, principal: v.principal } });
  redirect(`/app/admin/bank?issued=${encodeURIComponent(v.accountNo.toUpperCase())}`);
}
