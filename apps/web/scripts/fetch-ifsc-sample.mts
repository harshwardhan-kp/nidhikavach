/**
 * Builds src/db/seed/ifsc-sample.json: ~1,500 real bank branches sampled from
 * Razorpay's open IFSC dataset (validated codes) and looked up on
 * ifsc.razorpay.com. Run once; the JSON is committed so seeding is offline.
 *   node scripts/fetch-ifsc-sample.mts
 */
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const IFSC: Record<string, (number | string)[]> = require("ifsc/src/IFSC.json");

// Banks that commonly issue FDRs to institutions, with rough sampling weights.
const BANKS: [string, number][] = [
  ["SBIN", 330], ["PUNB", 120], ["BARB", 120], ["CNRB", 120], ["UBIN", 110], ["BKID", 90],
  ["HDFC", 110], ["ICIC", 90], ["UTIB", 80], ["IOBA", 60], ["UCBA", 50], ["CBIN", 60],
  ["MAHB", 50], ["IDIB", 60], ["PSIB", 20], ["KKBK", 40],
];

let seed = 20261107;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

const codes = new Set<string>();
for (const [bank, n] of BANKS) {
  const list = IFSC[bank];
  if (!list) continue;
  for (let i = 0; i < n; i++) {
    const c = list[Math.floor(rand() * list.length)];
    codes.add(`${bank}0${typeof c === "number" ? String(c).padStart(6, "0") : c}`);
  }
}

type Branch = { ifsc: string; bank: string; bankCode: string; branch: string; city: string; district: string; state: string; address: string };
const out: Branch[] = [];
const queue = [...codes];
let failed = 0;

async function worker() {
  while (queue.length) {
    const code = queue.pop()!;
    try {
      const r = await fetch(`https://ifsc.razorpay.com/${code}`, { headers: { "user-agent": "nidhikavach-seed/0.1" } });
      if (!r.ok) { failed++; continue; }
      const j = await r.json();
      out.push({ ifsc: j.IFSC, bank: j.BANK, bankCode: j.BANKCODE, branch: j.BRANCH, city: j.CITY, district: j.DISTRICT, state: j.STATE, address: j.ADDRESS });
    } catch {
      failed++;
    }
  }
}

await Promise.all(Array.from({ length: 8 }, worker));
out.sort((a, b) => a.ifsc.localeCompare(b.ifsc));
writeFileSync("src/db/seed/ifsc-sample.json", JSON.stringify(out));
const states = new Map<string, number>();
for (const b of out) states.set(b.state, (states.get(b.state) ?? 0) + 1);
console.log(`saved ${out.length} branches (${failed} lookups failed)`);
console.log([...states].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s}:${n}`).join(", "));
