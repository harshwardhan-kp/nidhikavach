/**
 * Synthetic dataset generator: institutions, FDR renewal chains, three-source
 * fields, scans (as render specs), verifications, discrepancies and in-flight
 * release requests. Deterministic for a given seed and "today".
 *
 * Everything here is fictional except bank branches, which are real IFSC
 * records from Razorpay's open dataset (ifsc-sample.json).
 */
import { FIELDS, type FieldKey, LIEN_TEXT, matchField } from "../../lib/rules/fields";
import { addDays, daysBetween, renewalLane, validityLane, type RenewalStatus } from "../../lib/rules/lanes";
import { nextAction } from "../../lib/rules/next-action";
import { computeTrust, type FieldInput } from "../../lib/rules/trust";
import type * as S from "../schema";
import branchesJson from "./ifsc-sample.json";
import { makeRng, type Rng } from "./rng";

type Branch = { ifsc: string; bank: string; bankCode: string; branch: string; city: string; district: string; state: string; address: string };
const BRANCHES = branchesJson as Branch[];

export type InstitutionRow = typeof S.institutions.$inferInsert & { id: string };
export type InstrumentRow = typeof S.instruments.$inferInsert & { id: string; caseNo: string };
export type FieldRow = typeof S.instrumentFields.$inferInsert;
export type DocumentRow = typeof S.documents.$inferInsert;
export type VerificationRow = typeof S.verifications.$inferInsert;
export type DiscrepancyRow = typeof S.discrepancies.$inferInsert;
export type ReleaseRow = typeof S.releaseRequests.$inferInsert & { id: string };
export type ApprovalRow = typeof S.approvals.$inferInsert;

export type GenContext = {
  today: string;
  regions: { id: number; code: string; states: string[] }[];
  demoInstitution: InstitutionRow;
  users: { maker: string; checker: string; authority: string; institution: string };
  institutionCount?: number;
};

/** What the (simulated) bank's core banking holds for each deposit. */
export type BankDeposit = {
  ifsc: string; accountNo: string; holder: string; principal: number; openingDate: string; maturityDate: string;
  rate: number; status: "ACTIVE" | "CLOSED" | "MATURED"; closedOn: string | null; lienHolder: string; autoRenew: boolean; product: string;
};

export type Dataset = {
  bankDeposits: BankDeposit[];
  institutions: InstitutionRow[];
  instruments: InstrumentRow[];
  fields: FieldRow[];
  documents: DocumentRow[];
  verifications: VerificationRow[];
  discrepancies: DiscrepancyRow[];
  releases: ReleaseRow[];
  approvals: ApprovalRow[];
};

/* ---------------------------------------------------------------- names -- */

const GEO = [
  "Deccan", "Sahyadri", "Aravalli", "Nilgiri", "Kaveri", "Konkan", "Narmada", "Vindhya", "Satpura", "Godavari",
  "Tapti", "Chambal", "Malwa", "Bundelkhand", "Doaba", "Terai", "Brahmaputra", "Sundarban", "Mahanadi", "Krishna",
  "Tungabhadra", "Coromandel", "Malabar", "Saurashtra", "Vidarbha", "Marathwada", "Khandesh", "Mithila", "Awadh",
  "Kumaon", "Garhwal", "Shivalik", "Kangra", "Canara", "Kongu", "Rayalaseema", "Bastar", "Khasi", "Barak", "Majuli",
  "Chilika", "Palghat", "Nallamala", "Mewar", "Marwar", "Haveli", "Dhauladhar", "Pir Panjal", "Anaimalai", "Cardamom",
] as const;
const STYLE = ["Crest", "Heights", "Valley", "Ridge", "Plains", "Coast", "Gate", "Point", "Grove", "Fields", "Plateau", "Range"] as const;

const KINDS = [
  ["engineering", 45],
  ["polytechnic", 25],
  ["management", 15],
  ["pharmacy", 10],
  ["computer_applications", 3],
  ["architecture", 2],
] as const;
type Kind = (typeof KINDS)[number][0];

const KIND_PHRASE: Record<Kind, readonly string[]> = {
  engineering: ["Institute of Technology", "College of Engineering", "Institute of Engineering & Technology"],
  polytechnic: ["Polytechnic"],
  management: ["Institute of Management", "School of Business"],
  pharmacy: ["College of Pharmacy"],
  computer_applications: ["Institute of Computer Applications"],
  architecture: ["School of Architecture"],
};

const PROGRAMMES: Record<Kind, readonly string[]> = {
  engineering: [
    "B.Tech Computer Engineering", "B.Tech Mechanical Engineering", "B.Tech Civil Engineering", "B.Tech Electrical Engineering",
    "B.Tech Electronics & Telecommunication", "B.Tech Information Technology", "B.Tech AI & Data Science", "M.Tech Structural Engineering",
    "M.Tech Computer Engineering", "MBA",
  ],
  polytechnic: ["Diploma Mechanical Engineering", "Diploma Civil Engineering", "Diploma Electrical Engineering", "Diploma Computer Engineering", "Diploma Electronics Engineering"],
  management: ["MBA", "PGDM", "MBA (Executive)"],
  pharmacy: ["B.Pharm", "D.Pharm", "M.Pharm Pharmaceutics"],
  computer_applications: ["MCA", "BCA"],
  architecture: ["B.Arch", "M.Arch"],
};

const REGION_WEIGHT: Record<string, number> = { NRO: 200, NWRO: 170, WRO: 220, CRO: 110, ERO: 130, SRO: 150, SWRO: 130, SCRO: 90 };

// Banks treated as live on the (simulated) Account Aggregator rail; others confirm by letter.
const AA_LIVE = new Set(["SBIN", "HDFC", "ICIC", "UTIB", "KKBK", "BARB", "PUNB", "CNRB", "UBIN"]);


const title = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());

/* --------------------------------------------------------------- helpers -- */

const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dMonY = (iso: string) => `${iso.slice(8, 10)}-${MON[+iso.slice(5, 7) - 1]}-${iso.slice(0, 4)}`;
const inrGroup = (rupees: number) => rupees.toLocaleString("en-IN");
const addYears = (iso: string, y: number) => `${+iso.slice(0, 4) + y}${iso.slice(4)}`.replace(/-02-29$/, "-02-28");
const at = (iso: string, hour = 11) => new Date(`${iso}T${String(hour).padStart(2, "0")}:00:00+05:30`);

function instrumentNumber(rng: Rng, bankCode: string) {
  const digits = (n: number) => Array.from({ length: n }, () => rng.int(0, 9)).join("");
  switch (bankCode) {
    case "SBIN": return `${rng.int(3, 4)}${digits(10)}`;
    case "HDFC": return `5030${digits(10)}`;
    case "ICIC": return `${rng.int(1, 9)}${digits(11)}`;
    case "BARB": return `${digits(4)}0300${digits(6)}`;
    default: return digits(rng.pick([11, 12, 14]));
  }
}

type Anomaly = "none" | "amount_mismatch" | "premature_closure" | "lien_other" | "no_bank_record" | "low_quality";

type LinkSpec = {
  inst: InstitutionRow;
  programme: string;
  type: "fdr" | "efdr" | "bg";
  branch: Branch;
  rupees: number;
  issueDate: string;
  maturityDate: string;
  autoRenew: boolean;
  replaces: string | null;
  record: string;
  verification: string;
  renewal: RenewalStatus;
  release: string;
  historical: boolean; // closed link in a renewal chain (renewed / replaced / released)
  anomaly: Anomaly;
  hasScan: boolean;
  caseNo?: string;
  releaseStage?: { requestedOn: string; recommendedOn?: string; checkedOn?: string };
  discrepancyStatus?: "open" | "awaiting_institution" | "resolved_pending_check";
};

/* ------------------------------------------------------------- generator -- */

export function generate(ctx: GenContext, seed = 26265): Dataset {
  const rng = makeRng(seed);
  const today = ctx.today;
  const byState = new Map<string, Branch[]>();
  for (const b of BRANCHES) {
    const k = b.state.toUpperCase();
    if (!byState.has(k)) byState.set(k, []);
    byState.get(k)!.push(b);
  }
  const branchIn = (state: string, city?: string) => {
    const list = byState.get(state.toUpperCase()) ?? BRANCHES;
    if (city) {
      const local = list.filter((b) => b.city?.toUpperCase() === city.toUpperCase());
      if (local.length) return rng.pick(local);
    }
    return rng.pick(list);
  };

  const ds: Dataset = { bankDeposits: [], institutions: [], instruments: [], fields: [], documents: [], verifications: [], discrepancies: [], releases: [], approvals: [] };
  const usedNames = new Set<string>();
  const usedCase = new Set<string>();
  const caseCounters = new Map<string, number>();
  let aicteSerial = 2611000000;

  // ---- institutions
  const target = ctx.institutionCount ?? 1500;
  const totalWeight = Object.values(REGION_WEIGHT).reduce((a, b) => a + b, 0);
  const kindOf = new Map<string, Kind>();
  for (const region of ctx.regions) {
    const n = Math.round((target * (REGION_WEIGHT[region.code] ?? 100)) / totalWeight);
    const states = region.states.filter((s) => byState.has(s.toUpperCase()));
    for (let i = 0; i < n; i++) {
      const state = rng.pick(states.length ? states : region.states);
      const city = title(branchIn(state).city || state);
      const kind = rng.weighted(KINDS);
      let name = "";
      for (let tries = 0; tries < 20 && (!name || usedNames.has(name)); tries++) {
        name = `${rng.pick(GEO)} ${rng.pick(STYLE)} ${rng.pick(KIND_PHRASE[kind])}, ${city}`;
      }
      usedNames.add(name);
      const id = rng.uuid();
      kindOf.set(id, kind);
      ds.institutions.push({
        id,
        aicteId: `1-${aicteSerial++}`,
        name,
        kind,
        ownership: rng.weighted([["private", 70], ["government", 20], ["aided", 10]] as const),
        state,
        city,
        regionId: region.id,
        nodalEmail: null,
      });
    }
  }

  // ---- renewal chains -> link specs
  const links: LinkSpec[] = [];
  const regionCode = new Map(ctx.regions.map((r) => [r.id, r.code]));

  for (const inst of ds.institutions) {
    const kind = kindOf.get(inst.id)!;
    const programmes = [...PROGRAMMES[kind]].sort(() => rng.next() - 0.5).slice(0, rng.int(2, Math.min(6, PROGRAMMES[kind].length)));
    for (const programme of programmes) {
      const branch = branchIn(inst.state, inst.city);
      const rupees = rng.weighted([[500000, 20], [1000000, 35], [1500000, 15], [2500000, 20], [3500000, 10]] as const);
      const type = rng.weighted([["fdr", 85], ["efdr", 10], ["bg", 5]] as const);
      const fresh = rng.chance(0.06);
      let issue = fresh ? addDays(today, -rng.int(2, 60)) : `${rng.int(2014, 2025)}-${String(rng.int(1, 12)).padStart(2, "0")}-${String(rng.int(1, 28)).padStart(2, "0")}`;
      let replaces: string | null = null;
      for (let guard = 0; guard < 15; guard++) {
        const tenure = rng.weighted([[10, 40], [5, 30], [3, 20], [1, 10]] as const);
        const maturity = addYears(issue, tenure);
        const spec: LinkSpec = {
          inst, programme, type, branch, rupees, issueDate: issue, maturityDate: maturity, autoRenew: rng.chance(0.3), replaces,
          record: "accepted", verification: "bank_confirmed", renewal: "not_due", release: "none", historical: false, anomaly: "none", hasScan: true,
        };
        links.push(spec);
        const id = (spec as LinkSpec & { id?: string }).id = rng.uuid();
        const matured = daysBetween(today, maturity) <= 0;
        if (!matured) break;
        const recent = daysBetween(maturity, today) < 730;
        const fate = recent ? rng.weighted([["renew", 92], ["release", 5], ["lapse", 3]] as const) : rng.weighted([["renew", 95], ["release", 5]] as const);
        if (fate === "lapse") break;
        spec.historical = true;
        if (fate === "release") {
          spec.release = rng.chance(0.7) ? "released" : "refunded";
          break;
        }
        spec.renewal = rng.chance(0.85) ? "renewed" : "replaced";
        replaces = id;
        issue = addDays(maturity, rng.int(0, 10));
      }
    }
  }

  // ---- statuses for current links
  for (const l of links) {
    if (l.historical) continue;
    const age = daysBetween(l.issueDate, today);
    if (age <= 45) {
      l.record = rng.weighted([["submitted", 40], ["under_scrutiny", 45], ["draft", 5], ["returned", 10]] as const);
      l.verification = l.record === "under_scrutiny" ? rng.weighted([["unverified", 40], ["pending_bank", 60]] as const) : "unverified";
      l.hasScan = l.record !== "draft" && l.record !== "submitted";
    } else {
      l.verification = rng.weighted([["bank_confirmed", 86], ["manual_confirmed", 6], ["unavailable", 5], ["pending_bank", 3]] as const);
      const r = rng.next();
      if (r < 0.012) l.anomaly = "amount_mismatch";
      else if (r < 0.02) l.anomaly = "premature_closure";
      else if (r < 0.026) l.anomaly = "lien_other";
      else if (r < 0.03) l.anomaly = "no_bank_record";
      else if (r < 0.05) l.anomaly = "low_quality";
      if (l.anomaly === "amount_mismatch" || l.anomaly === "premature_closure") l.verification = "mismatch";
      if (l.anomaly === "no_bank_record") l.verification = "unavailable";
      if (l.anomaly !== "none" && l.anomaly !== "low_quality") {
        l.discrepancyStatus = rng.weighted([["open", 50], ["awaiting_institution", 35], ["resolved_pending_check", 15]] as const);
      }
      if (l.anomaly === "none" && l.verification === "bank_confirmed" && regionCode.get(l.inst.regionId) === "WRO" && rng.chance(0.012)) {
        const stage = rng.weighted([["requested", 40], ["recommended", 30], ["checked", 30]] as const);
        const req = addDays(today, -rng.int(stage === "requested" ? 1 : 4, 9));
        l.release = stage;
        l.releaseStage = {
          requestedOn: req,
          recommendedOn: stage !== "requested" ? addDays(req, rng.int(1, 2)) : undefined,
          checkedOn: stage === "checked" ? addDays(req, rng.int(3, 4)) : undefined,
        };
      }
    }
  }

  // ---- showcase cases for the pitch script (Western region)
  const wro = ctx.regions.find((r) => r.code === "WRO")!;
  const showcaseInst = (name: string, city: string, state: string, kind: Kind): InstitutionRow => {
    const inst: InstitutionRow = { id: rng.uuid(), aicteId: `1-${aicteSerial++}`, name, kind, ownership: "private", state, city, regionId: wro.id, nodalEmail: null };
    ds.institutions.push(inst);
    return inst;
  };
  const demo = ctx.demoInstitution;
  const base = (inst: InstitutionRow, over: Partial<LinkSpec>): LinkSpec => {
    const s: LinkSpec & { id?: string } = {
      inst, programme: "B.Tech Computer Engineering", type: "fdr", branch: branchIn(inst.state, inst.city), rupees: 1000000,
      issueDate: addDays(today, -400), maturityDate: addDays(today, 700), autoRenew: false, replaces: null,
      record: "accepted", verification: "bank_confirmed", renewal: "not_due", release: "none", historical: false, anomaly: "none", hasScan: true,
      ...over,
    };
    s.id = rng.uuid();
    links.push(s);
    return s;
  };
  const sbiNagpur = BRANCHES.find((b) => b.bankCode === "SBIN" && b.state.toUpperCase() === "MAHARASHTRA") ?? branchIn("Maharashtra");
  base(demo, { caseNo: "FDR-26-04187", programme: "Diploma Computer Engineering", branch: sbiNagpur, rupees: 1000000, issueDate: addYears(addDays(today, 45), -3), maturityDate: addDays(today, 45) });
  base(demo, { caseNo: "FDR-21-01022", programme: "Diploma Mechanical Engineering", rupees: 2500000, issueDate: "2021-06-14", maturityDate: "2031-06-14" });
  // Left unread on purpose: the pitch runs Doc-AI, the tamper scan and the bank check on it live.
  base(demo, { caseNo: "FDR-26-05310", programme: "Diploma Electrical Engineering", rupees: 500000, issueDate: addDays(today, -9), maturityDate: addYears(addDays(today, -9), 5), record: "under_scrutiny", verification: "unverified", hasScan: false });

  const pune = showcaseInst("Sahyadri Ridge Institute of Technology, Pune", "Pune", "Maharashtra", "engineering");
  base(pune, { caseNo: "FDR-26-03952", rupees: 2500000, issueDate: addDays(today, -120), maturityDate: addYears(addDays(today, -120), 10), verification: "mismatch", anomaly: "amount_mismatch", discrepancyStatus: "open" });

  const ratnagiri = showcaseInst("Konkan Coast College of Pharmacy, Ratnagiri", "Ratnagiri", "Maharashtra", "pharmacy");
  const oldC = base(ratnagiri, { caseNo: "FDR-23-11820", programme: "B.Pharm", issueDate: addYears(addDays(today, -5), -3), maturityDate: addDays(today, -5), historical: true, renewal: "renewed" }) as LinkSpec & { id: string };
  base(ratnagiri, { caseNo: "FDR-26-05402", programme: "B.Pharm", issueDate: addDays(today, -3), maturityDate: addYears(addDays(today, -3), 3), replaces: oldC.id, record: "submitted", verification: "unverified", hasScan: false });

  const surat = showcaseInst("Tapti River Institute of Management, Surat", "Surat", "Gujarat", "management");
  base(surat, { caseNo: "FDR-25-08861", programme: "MBA", rupees: 1500000, issueDate: addDays(today, -300), maturityDate: addYears(addDays(today, -300), 5), anomaly: "lien_other", discrepancyStatus: "awaiting_institution" });

  const kolhapur = showcaseInst("Malwa Plateau College of Engineering, Kolhapur", "Kolhapur", "Maharashtra", "engineering");
  base(kolhapur, {
    caseNo: "FDR-16-07734", programme: "B.Tech Civil Engineering", rupees: 500000, issueDate: "2016-08-18", maturityDate: "2026-08-18",
    release: "checked", releaseStage: { requestedOn: addDays(today, -10), recommendedOn: addDays(today, -8), checkedOn: addDays(today, -4) },
  });

  const jalgaon = showcaseInst("Vindhya Range Engineering College, Jalgaon", "Jalgaon", "Maharashtra", "engineering");
  base(jalgaon, { caseNo: "FDR-26-05811", rupees: 1000000, issueDate: addDays(today, -70), maturityDate: addYears(addDays(today, -70), 10), verification: "unavailable", anomaly: "no_bank_record", discrepancyStatus: "open" });

  // ---- materialise rows
  const sortedLinks = [...links].sort((a, b) => a.issueDate.localeCompare(b.issueDate));
  for (const l of sortedLinks) if (l.caseNo) usedCase.add(l.caseNo);

  for (const l of sortedLinks) {
    const id = (l as LinkSpec & { id: string }).id;
    const submitted = addDays(l.issueDate, rng.int(2, 15));
    const submittedOn = daysBetween(submitted, today) < 0 ? today : submitted;
    if (!l.caseNo) {
      const yy = submittedOn.slice(2, 4);
      let n = caseCounters.get(yy) ?? 0;
      let no = "";
      do no = `FDR-${yy}-${String(++n).padStart(5, "0")}`;
      while (usedCase.has(no));
      caseCounters.set(yy, n);
      usedCase.add(no);
      l.caseNo = no;
    }

    const bankDeclared = l.branch.bank;
    const instrumentNo = instrumentNumber(rng, l.branch.bankCode);
    const lienOther = `Principal, ${l.inst.name}`;

    // What the bank says (null when it has not answered / has no record).
    const bankKnown = ["bank_confirmed", "mismatch", "manual_confirmed"].includes(l.verification) || (l.historical && l.verification !== "unavailable");
    let bankAmount = l.rupees;
    let bankMaturity = l.maturityDate;
    if (l.anomaly === "amount_mismatch") bankAmount = Math.round(l.rupees / 10);
    if (l.anomaly === "premature_closure") bankMaturity = addDays(l.issueDate, rng.int(200, 500));

    const declared: Record<FieldKey, string> = {
      instrumentNo,
      amount: String(l.rupees),
      issueDate: l.issueDate,
      maturityDate: l.maturityDate,
      ifsc: l.branch.ifsc,
      depositorName: l.inst.name,
      lienHolder: LIEN_TEXT,
      autoRenew: l.autoRenew ? "Yes" : "No",
    };
    // How the scan prints each value varies by bank and template, like real receipts.
    const fmt = { amount: rng.chance(0.5), date: rng.chance(0.5), name: rng.chance(0.5) };
    const scan: Record<FieldKey, string> | null = l.hasScan
      ? {
          instrumentNo,
          amount: fmt.amount ? `${inrGroup(l.rupees)}.00` : String(l.rupees),
          issueDate: fmt.date ? dmy(l.issueDate) : l.issueDate,
          maturityDate: fmt.date ? dMonY(l.maturityDate) : l.maturityDate,
          ifsc: l.branch.ifsc,
          depositorName: fmt.name ? l.inst.name.toUpperCase() : l.inst.name,
          lienHolder: l.anomaly === "lien_other" ? lienOther.toUpperCase() : rng.chance(0.5) ? LIEN_TEXT : "MEMBER SECRETARY, AICTE, NEW DELHI",
          autoRenew: rng.chance(0.5) ? (l.autoRenew ? "Yes" : "No") : l.autoRenew ? "Auto renewal" : "No auto renewal",
        }
      : null;
    const bank: Record<FieldKey, string> | null = bankKnown
      ? {
          instrumentNo,
          amount: rng.chance(0.6) && bankAmount === l.rupees ? String(l.rupees) : `${bankAmount}.00`,
          issueDate: l.issueDate,
          maturityDate: bankMaturity,
          ifsc: l.branch.ifsc,
          depositorName: rng.chance(0.6) ? l.inst.name : l.inst.name.replace(/[.,&]/g, "").replace(/\s+/g, " "),
          lienHolder: l.anomaly === "lien_other" ? lienOther : rng.chance(0.6) ? LIEN_TEXT : "Member Secretary AICTE",
          autoRenew: rng.chance(0.6) ? (l.autoRenew ? "Yes" : "No") : l.autoRenew ? "true" : "false",
        }
      : null;

    const lowConf = l.anomaly === "low_quality";
    const inputs: Partial<Record<FieldKey, FieldInput>> = {};
    for (const f of FIELDS) {
      const conf = scan ? (lowConf ? 0.45 + rng.next() * 0.13 : 0.86 + rng.next() * 0.13) : null;
      inputs[f.key] = { declared: declared[f.key], scan: scan?.[f.key] ?? null, bank: bank?.[f.key] ?? null, scanConfidence: conf };
      ds.fields.push({
        instrumentId: id,
        field: f.key,
        declaredValue: declared[f.key],
        scanValue: scan?.[f.key] ?? null,
        scanConfidence: conf === null ? null : Math.round(conf * 100) / 100,
        scanSource: scan ? "di+llm" : null,
        bankValue: bank?.[f.key] ?? null,
        bankSource: bank ? (l.verification === "manual_confirmed" ? "manual" : AA_LIVE.has(l.branch.bankCode) ? "account_aggregator" : "bank_letter") : null,
        match: matchField(f.key, inputs[f.key]!),
      });
    }

    const tamperScore = !l.hasScan ? null : l.anomaly === "no_bank_record" ? rng.int(68, 88) : l.anomaly === "amount_mismatch" ? rng.int(55, 78) : rng.int(2, 14);
    const trust = computeTrust(inputs, { tamperScore });

    const validity = l.historical
      ? "matured"
      : validityLane({ maturityDate: l.maturityDate, today, lienIsAicte: l.anomaly === "lien_other" ? false : true });
    const renewal = l.historical ? l.renewal : renewalLane({ current: l.renewal, release: l.release as never, maturityDate: l.maturityDate, today });
    const openDisc = l.discrepancyStatus ? 1 : 0;
    const na = l.historical ? null : nextAction({
      recordStatus: l.record, verificationStatus: l.verification, validityStatus: validity, renewalStatus: renewal,
      releaseStatus: l.release, maturityDate: l.maturityDate, openDiscrepancies: openDisc,
      discrepanciesAwaitingCheck: l.discrepancyStatus === "resolved_pending_check" ? 1 : 0, today,
    });
    const isWro = regionCode.get(l.inst.regionId) === "WRO";
    const owner = !na ? null
      : na.role === "authority" ? ctx.users.authority
      : !isWro ? null
      : na.role === "maker" ? ctx.users.maker
      : na.role === "checker" ? ctx.users.checker
      : l.inst.id === demo.id ? ctx.users.institution : null;

    ds.instruments.push({
      id,
      caseNo: l.caseNo,
      institutionId: l.inst.id,
      programme: l.programme,
      type: l.type,
      instrumentNo,
      bankName: bankDeclared,
      ifsc: l.branch.ifsc,
      branch: title(l.branch.branch),
      amountPaise: l.rupees * 100,
      issueDate: l.issueDate,
      maturityDate: l.maturityDate,
      depositorName: l.inst.name,
      lienHolder: LIEN_TEXT,
      autoRenew: l.autoRenew,
      recordStatus: l.record as never,
      verificationStatus: l.verification as never,
      validityStatus: validity,
      renewalStatus: renewal,
      releaseStatus: l.release as never,
      trustScore: trust.score,
      riskBand: trust.band,
      trustBreakdown: trust,
      replacesInstrumentId: l.replaces,
      ruleSetVersion: 1,
      ownerUserId: owner,
      nextAction: na?.text ?? null,
      nextActionDue: na?.due ?? null,
      submittedBy: l.inst.id === demo.id ? ctx.users.institution : null,
      submittedAt: l.record === "draft" ? null : at(submittedOn, rng.int(10, 17)),
      updatedAt: at(submittedOn, 18),
    });

    if (l.record !== "draft") {
      const variant = l.anomaly === "no_bank_record" || l.anomaly === "amount_mismatch" ? "forged" : l.anomaly === "low_quality" ? "low_quality" : l.anomaly === "lien_other" ? "lien_other" : "clean";
      ds.documents.push({
        instrumentId: id,
        kind: l.replaces ? "renewal_scan" : "fdr_scan",
        fileKey: `specimen/${l.caseNo}.jpg`,
        filename: `${l.caseNo}_scan.jpg`,
        mime: "image/jpeg",
        sizeBytes: 0,
        sha256: "",
        uploadedBy: l.inst.id === demo.id ? ctx.users.institution : null,
        uploadedAt: at(submittedOn, 12),
        extractionStatus: l.hasScan ? "done" : "pending",
        tamperStatus: l.hasScan ? "done" : "pending",
        tamperScore,
        tamperFindings: tamperScore && tamperScore >= 30 ? [{ kind: "ela", detail: "Inconsistent compression around the amount field" }] : [],
        synthetic: true,
        specimen: {
          variant,
          caseNo: l.caseNo,
          bank: bankDeclared,
          branch: title(l.branch.branch),
          branchAddress: l.branch.address,
          ifsc: l.branch.ifsc,
          instrumentNo,
          depositor: l.inst.name,
          amountRupees: l.rupees,
          // A forged scan shows the declared amount pasted over the real one the bank knows.
          originalAmountRupees: variant === "forged" ? bankAmount : l.rupees,
          issueDate: l.issueDate,
          maturityDate: l.maturityDate,
          lien: l.anomaly === "lien_other" ? lienOther : LIEN_TEXT,
          autoRenew: l.autoRenew,
          tenureYears: Math.round(daysBetween(l.issueDate, l.maturityDate) / 365),
        },
      });
    }

    if (l.anomaly !== "no_bank_record") {
      ds.bankDeposits.push({
        ifsc: l.branch.ifsc,
        accountNo: instrumentNo,
        holder: l.inst.name,
        principal: bankAmount,
        openingDate: l.issueDate,
        maturityDate: l.maturityDate,
        rate: Math.round((6.25 + rng.next() * 1.25) * 100) / 100,
        status: l.anomaly === "premature_closure" ? "CLOSED" : l.historical ? "MATURED" : "ACTIVE",
        closedOn: l.anomaly === "premature_closure" ? bankMaturity : null,
        lienHolder: l.anomaly === "lien_other" ? lienOther : LIEN_TEXT,
        autoRenew: l.autoRenew,
        product: l.type === "efdr" ? "EFDR" : l.type === "bg" ? "BG" : "FD",
      });
    }

    if (["bank_confirmed", "mismatch", "unavailable", "manual_confirmed", "pending_bank"].includes(l.verification) || l.historical) {
      const aa = AA_LIVE.has(l.branch.bankCode);
      const method = l.verification === "manual_confirmed" ? "manual" : aa ? "account_aggregator" : "bank_letter";
      const req = addDays(submittedOn, rng.int(1, 4));
      const done = l.verification !== "pending_bank";
      ds.verifications.push({
        instrumentId: id,
        method,
        consentId: method === "account_aggregator" ? `CNS-${rng.uuid().slice(0, 13).toUpperCase()}` : null,
        status: done ? "done" : "running",
        result: done ? (l.verification as never) : null,
        request: { fipId: `${l.branch.bankCode}-FIP`, ifsc: l.branch.ifsc, instrumentNo },
        response: !done ? null : bank
          ? { found: true, type: "TERM_DEPOSIT", principalAmount: bankAmount, openingDate: l.issueDate, maturityDate: bankMaturity, lienMarkedTo: bank.lienHolder, status: l.anomaly === "premature_closure" ? "CLOSED" : "ACTIVE" }
          : { found: false, message: "No term deposit with this number at the branch" },
        requestedBy: isWro ? ctx.users.maker : null,
        confirmedBy: method !== "account_aggregator" && done && isWro ? ctx.users.checker : null,
        requestedAt: at(req),
        completedAt: done ? at(addDays(req, aa ? 0 : rng.int(2, 6)), 15) : null,
      });
    }

    if (l.discrepancyStatus) {
      const raised = addDays(submittedOn, rng.int(3, 12));
      const d = {
        amount_mismatch: { kind: "field_mismatch", field: "amount", severity: "critical", title: "Bank confirms a different amount", detail: `Declared ₹${inrGroup(l.rupees)}; the bank confirms ₹${inrGroup(bankAmount)}. The scan shows the declared amount, so the scan itself may be altered.` },
        premature_closure: { kind: "field_mismatch", field: "maturityDate", severity: "critical", title: "Bank reports the FDR closed before maturity", detail: `Declared maturity ${dmy(l.maturityDate)}; the bank shows the deposit closed on ${dmy(bankMaturity)}.` },
        lien_other: { kind: "lien_missing", field: "lienHolder", severity: "high", title: "Lien is not marked in favour of AICTE", detail: `The scan and the bank show the lien in favour of "${lienOther}".` },
        no_bank_record: { kind: "bank_no_record", field: "instrumentNo", severity: "critical", title: "Bank has no record of this FDR", detail: `The issuing branch (${l.branch.ifsc}) reports no term deposit numbered ${instrumentNo}. Tamper scan also flagged the document.` },
      }[l.anomaly as "amount_mismatch"];
      if (d) {
        ds.discrepancies.push({
          instrumentId: id,
          ...d,
          severity: d.severity as never,
          status: l.discrepancyStatus,
          autoRaised: true,
          raisedBy: null,
          raisedAt: at(raised, 10),
          dueAt: at(addDays(raised, 15), 17),
        });
      }
    }

    if (l.releaseStage) {
      const rid = rng.uuid();
      ds.releases.push({
        id: rid,
        instrumentId: id,
        kind: "release",
        reason: "Programme closed with AICTE approval; hold period complete.",
        state: l.release as never,
        requestedBy: l.inst.id === demo.id ? ctx.users.institution : null,
        requestedAt: at(l.releaseStage.requestedOn),
      });
      if (l.releaseStage.recommendedOn)
        ds.approvals.push({ releaseRequestId: rid, step: "recommend", actorId: ctx.users.maker, decision: "approve", comment: "Conditions met; bank confirms the deposit is unencumbered.", createdAt: at(l.releaseStage.recommendedOn, 12) });
      if (l.releaseStage.checkedOn)
        ds.approvals.push({ releaseRequestId: rid, step: "check", actorId: ctx.users.checker, decision: "approve", comment: "Checked against APH cl. 6.46. Forwarded for decision.", createdAt: at(l.releaseStage.checkedOn, 15) });
    }
  }

  // Every institution has a nodal-officer mailbox (synthetic) for the email outbox.
  for (const inst of ds.institutions) inst.nodalEmail ??= `nodal.${inst.aicteId.slice(2)}@inst.demo.nidhikavach.in`;
  return ds;
}
