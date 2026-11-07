/**
 * Writes public/samples/legacy-register-western.xlsx (+ .csv): a deliberately
 * messy legacy FDR register for the import demo, built from seeded Western
 * region institutions and real IFSC branches.
 *   node --env-file=.env.local scripts/make-sample-register.mts
 */
import ExcelJS from "exceljs";
import { writeFileSync } from "node:fs";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { ssl: "require", max: 1 });
const insts = await sql<{ name: string; aicte_id: string; state: string }[]>`
  select i.name, i.aicte_id, i.state from institutions i join regions r on r.id = i.region_id
  where r.code = 'WRO' and i.name not like 'Deccan Plateau%' order by i.aicte_id limit 18 offset 40`;
const branches = await sql<{ ifsc: string; bank: string; branch: string }[]>`
  select ifsc, bank, branch from ifsc_branches where state in ('MAHARASHTRA','GUJARAT','GOA') order by ifsc limit 40`;
const [dup] = await sql<{ instrument_no: string; ifsc: string; name: string }[]>`
  select i.instrument_no, i.ifsc, inst.name from instruments i join institutions inst on inst.id = i.institution_id
  join regions r on r.id = inst.region_id where r.code = 'WRO' and i.ifsc is not null order by i.case_no limit 1`;
await sql.end();

const abbreviate = (n: string) =>
  n.replace("Institute", "Inst.").replace("Technology", "Tech.").replace("Engineering", "Engg.").replace("College", "Coll.").replace("Management", "Mgmt.").replace("Polytechnic", "Poly.");
const pad = (n: number) => String(n).padStart(2, "0");
let seed = 7;
const r = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];

const headers = ["Sr No", "Name of Instt.", "AICTE Ref", "Course", "FD No", "Amt (Rs)", "Dt of Deposit", "Mat. Dt", "Bank / Branch", "IFSC Code", "In favour of", "Remarks"];
const rows: (string | number | Date)[][] = [];
const amountFmt = [(v: number) => `${v / 100000} lakh`, (v: number) => v.toLocaleString("en-IN"), (v: number) => `${v}/-`, (v: number) => `Rs. ${v.toLocaleString("en-IN")}`];
const lienFmt = ["Member Secy, AICTE", "MS AICTE New Delhi", "Member Secretary, AICTE, New Delhi", "M.S., AICTE"];
const courses = ["B.E. Comp", "Dip. Mech", "MBA", "B.Pharm", "B.Tech Civil", "Dip. Electrical"];

insts.forEach((inst, k) => {
  const year = 2017 + Math.floor(r() * 7);
  const m = 1 + Math.floor(r() * 12);
  const d = 1 + Math.floor(r() * 27);
  const tenure = pick([3, 5, 10]);
  const amount = pick([500000, 1000000, 1500000, 2500000]);
  const b = branches[k % branches.length];
  const dateStyle = k % 4;
  const fmt = (y: number) =>
    dateStyle === 0 ? `${pad(d)}.${pad(m)}.${y}` : dateStyle === 1 ? `${pad(d)}/${pad(m)}/${y}` : dateStyle === 2 ? `${d} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m - 1]} ${y}` : new Date(Date.UTC(y, m - 1, d));
  rows.push([
    k + 1,
    k % 3 === 0 ? inst.name : abbreviate(inst.name),
    k % 2 === 0 ? inst.aicte_id : "",
    pick(courses),
    String(Math.floor(1e10 + r() * 9e10)),
    amountFmt[k % amountFmt.length](amount),
    fmt(year),
    fmt(year + tenure),
    `${b.bank.replace("State Bank of India", "SBI")}, ${b.branch}`,
    k === 4 || k === 11 ? "" : k === 7 ? b.ifsc.toLowerCase() : b.ifsc,
    k === 9 || k === 15 ? "" : pick(lienFmt),
    k === 4 ? "IFSC not noted in file" : k === 13 ? "Renewed copy awaited" : "",
  ]);
});
// Rows that must be rejected.
rows.push([rows.length + 1, "Shree Ganesh Inst. of Tech., Dhule", "", "B.E. Mech", "77120455810", "10 lakh", "01.04.2019", "01.04.2024", "SBI, Dhule", "SBIN0000466", "Member Secy, AICTE", "Instt. not traced"]);
rows.push([rows.length + 1, abbreviate(insts[2].name), "", "MBA", "88012345671", "5,00,000", "15/08/2023", "15/08/2020", "SBI", branches[2].ifsc, "MS AICTE New Delhi", "Dates as per file"]);
if (dup) rows.push([rows.length + 1, dup.name, "", "B.Tech", dup.instrument_no, "10,00,000", "01.01.2020", "01.01.2030", "", dup.ifsc, "Member Secy, AICTE", "Entered twice?"]);

const wb = new ExcelJS.Workbook();
wb.creator = "NidhiKavach sample (synthetic)";
const ws = wb.addWorksheet("FDR Register 2017-24");
ws.addRow(headers).font = { bold: true };
for (const row of rows) ws.addRow(row);
ws.columns.forEach((c, i) => (c.width = [6, 46, 14, 14, 16, 16, 14, 14, 30, 14, 26, 24][i]));
await wb.xlsx.writeFile("public/samples/legacy-register-western.xlsx");
const csv = [headers, ...rows.map((row) => row.map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v))))]
  .map((row) => row.map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(","))
  .join("\n");
writeFileSync("public/samples/legacy-register-western.csv", csv);
console.log(`wrote ${rows.length} rows`);
