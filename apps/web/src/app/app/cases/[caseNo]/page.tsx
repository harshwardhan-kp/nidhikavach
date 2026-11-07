import { ArrowLeft, CheckCircle2, ExternalLink, FileWarning } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DaysLeft, LanePill, TrustMeter } from "@/components/case-ui";
import { Card, Pill, Simulated } from "@/components/ui";
import { can } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { today } from "@/lib/clock";
import { FIELD_LABEL, FIELDS, type FieldKey } from "@/lib/rules/fields";
import { daysBetween } from "@/lib/rules/lanes";
import type { TrustResult } from "@/lib/rules/trust";
import { cn, formatDate, formatDateTime, formatPaise } from "@/lib/utils";
import { label, TYPE_LABEL } from "@/modules/cases/labels";
import { getCase } from "@/modules/cases/queries";
import { documentUrl } from "@/modules/documents/view";
import { signedGetUrl, type TamperFinding } from "@/lib/sidecar";
import type { TamperOpinion } from "@/modules/verify/vision";
import { ActionsPanel, type PendingLetter } from "./actions-panel";
import { CaseBrief, DraftPanel } from "./assist";
import { AutoRefresh } from "./auto-refresh";
import { DiscrepancyControls } from "./discrepancy-item";
import { ReleaseSection } from "./release-section";
import { RiskLine, RiskLineSkeleton } from "./risk-line";
import { type ScanBox, ScanViewer } from "./scan-viewer";

// Reading a scan runs Doc-AI and two model calls (~13 s).
export const maxDuration = 60;

type Extraction = {
  fields?: Record<string, { agree: boolean | null }>;
  di?: { error?: string };
  llm?: { error?: string | null; amountInWords?: string; wordsMatchFigures?: boolean; stampPresent?: boolean; signaturePresent?: boolean; notes?: string; isFixedDepositReceipt?: boolean };
  ms?: number;
};
type Findings = { heuristic?: TamperFinding[]; heatmapKey?: string | null; opinion?: TamperOpinion | null };
type DiscOp = "ask" | "respond" | "resolve" | "close" | "reopen";
const VERDICT_TONE = { likely_genuine: "green", suspicious: "amber", likely_altered: "red" } as const;

export async function generateMetadata({ params }: PageProps<"/app/cases/[caseNo]">): Promise<Metadata> {
  const { caseNo } = await params;
  return { title: caseNo };
}

const MATCH_TONE = { match: "green", soft_match: "green", mismatch: "red", missing: "neutral" } as const;
const MATCH_LABEL = { match: "match", soft_match: "match · format", mismatch: "mismatch", missing: "awaiting" } as const;
const SOURCE_LABEL: Record<string, string> = { account_aggregator: "AA", bank_letter: "letter", manual: "manual", "di+llm": "doc-ai" };

function Section({ title, aside, children, className }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("p-5", className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="kicker">{title}</div>
        {aside}
      </div>
      {children}
    </Card>
  );
}

export default async function CasePage({ params, searchParams }: PageProps<"/app/cases/[caseNo]">) {
  const user = await requireUser();
  const { caseNo } = await params;
  const { submitted } = await searchParams;
  const c = await getCase(user, decodeURIComponent(caseNo));
  if (!c) notFound();
  const todayIso = await today();
  const i = c.i;
  const days = i.maturityDate ? daysBetween(todayIso, i.maturityDate) : null;
  const trust = i.trustBreakdown as TrustResult | null;
  const fieldMap = new Map(c.fields.map((f) => [f.field as FieldKey, f]));
  const docs = await Promise.all(c.documents.map(documentUrl));

  const lanes = [
    ["record", i.recordStatus],
    ["verification", i.verificationStatus],
    ["validity", i.validityStatus],
    ["renewal", i.renewalStatus],
    ["release", i.releaseStatus],
  ] as const;

  const canRenew = can(user.roles, "renewal.request") && ["due", "overdue"].includes(i.renewalStatus);
  const isInstitution = user.roles.includes("institution") && !can(user.roles, "instrument.view_scope");

  // Latest scan, its reading and its tamper findings.
  const scan = [...docs].reverse().find((d) => d.doc.kind === "fdr_scan" || d.doc.kind === "renewal_scan");
  const ex = (scan?.doc.extraction ?? null) as Extraction | null;
  const tf = (scan?.doc.tamperFindings ?? null) as Findings | null;
  const heatmapUrl = tf?.heatmapKey ? signedGetUrl(tf.heatmapKey, "heatmap.jpg") : null;
  const boxes: ScanBox[] = [
    ...(tf?.heuristic ?? []).filter((f) => f.box).map((f) => ({ box: f.box!, label: "compression", source: "measured" as const })),
    ...(tf?.opinion?.observations ?? [])
      .filter((o) => o.box?.length === 4 && o.severity !== "low")
      .map((o) => ({ box: o.box as [number, number, number, number], label: o.area.toLowerCase(), source: "model" as const })),
  ];
  const agreed = ex?.fields ? Object.values(ex.fields).filter((f) => f.agree).length : null;
  // Seeded history marks old scans as read without keeping the full reading.
  const hasReading = scan?.doc.extractionStatus === "done" && !!ex?.fields;

  // Bank letter path: a letter waiting for a checker, or a request that still needs one.
  const letterRows = c.verifications.filter(({ v }) => v.method === "bank_letter" && v.status === "running");
  const letterRow = letterRows.find(({ v }) => (v.response as { letter?: unknown } | null)?.letter);
  const letter = letterRow ? ((letterRow.v.response as { letter: Record<string, string> }).letter) : null;
  const letterDoc = letterRow ? docs.find((d) => d.doc.id === (letterRow.v.request as { documentId?: string } | null)?.documentId) : undefined;
  const pendingLetter: PendingLetter | null =
    letterRow && letter
      ? {
          id: letterRow.v.id,
          recordedBy: letterRow.requestedBy,
          recordedByMe: letterRow.v.requestedBy === user.id,
          amount: letter.amount,
          maturityDate: letter.maturityDate,
          lienHolder: letter.lienHolder,
          documentUrl: letterDoc && "url" in letterDoc ? letterDoc.url : null,
        }
      : null;
  const declared = Object.fromEntries(c.fields.map((f) => [f.field, f.declaredValue ?? ""]));

  const perms = {
    scrutinise: can(user.roles, "instrument.scrutinise"),
    request: can(user.roles, "verification.request"),
    confirm: can(user.roles, "verification.confirm"),
    raise: can(user.roles, "discrepancy.raise"),
  };
  function opsFor(status: string): DiscOp[] {
    const ops: DiscOp[] = [];
    const live = ["open", "awaiting_institution"].includes(status);
    if (perms.raise && status === "open") ops.push("ask");
    if (can(user.roles, "discrepancy.respond") && live) ops.push("respond");
    if (perms.raise && live) ops.push("resolve");
    if (can(user.roles, "discrepancy.close") && status === "resolved_pending_check") ops.push("close", "reopen");
    if (can(user.roles, "discrepancy.close") && status === "closed") ops.push("reopen");
    return ops;
  }
  const thread = (id: string) => c.observations.filter(({ o }) => o.discrepancyId === id && (!isInstitution || o.sharedWithInstitution));
  const openTitles = c.discrepancies.filter((d) => !["closed", "dismissed"].includes(d.status)).map((d) => d.title);

  // Keep the page live while the scan is read in the background (right after a submission).
  const reading = scan?.doc.extractionStatus === "running" || (!!submitted && !hasReading && scan?.doc.extractionStatus === "pending");

  return (
    <div className="flex flex-col gap-4">
      {reading ? <AutoRefresh /> : null}
      {submitted ? (
        <div role="status" className="flex items-center gap-2 rounded-[12px] border border-green/40 bg-green-soft px-4 py-3 text-[13px]">
          <CheckCircle2 size={16} className="text-green" />
          <span>
            Submitted as <b className="font-mono">{i.caseNo}</b>. The dealing officer has been notified.{" "}
            {hasReading ? "Doc-AI and gpt-6.1-terra have read the scan." : "Doc-AI and gpt-6.1-terra are reading the scan now…"}
          </span>
        </div>
      ) : null}
      {canRenew ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-amber/40 bg-amber-soft px-4 py-3 text-[13px]">
          <span>This deposit matures on {formatDate(i.maturityDate)}. Submit the renewed or replacement FDR to keep the security deposit valid.</span>
          <Link href={`/app/submit?renews=${i.caseNo}`} className="rounded-[9px] bg-ink-2 px-3 py-1.5 font-mono text-[12px] text-white hover:opacity-85">
            [submit renewal]
          </Link>
        </div>
      ) : null}
      <div>
        <Link href="/app/cases" className="tag inline-flex items-center gap-1 text-[12px] hover:text-ink">
          <ArrowLeft size={12} /> [cases]
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="font-serif text-[40px] leading-none tracking-[-0.5px]">{i.caseNo}</h1>
            <p className="mt-2 text-[15px]">{c.inst.name}</p>
            <p className="tag mt-1 text-[12px]">
              [{TYPE_LABEL[i.type]} · {i.programme} · {c.region.name} region · AICTE id {c.inst.aicteId}]
            </p>
          </div>
          <div className="flex items-end gap-8">
            <div>
              <div className="tag">[amount]</div>
              <div className="mt-1 text-[26px] font-semibold tracking-[-0.5px]">{formatPaise(i.amountPaise)}</div>
            </div>
            <TrustMeter score={i.trustScore} band={i.riskBand} size="lg" />
          </div>
        </div>
      </div>

      <Card className="grid grid-cols-2 gap-px overflow-hidden bg-line-2 sm:grid-cols-5">
        {lanes.map(([lane, value]) => (
          <div key={lane} className="bg-card px-4 py-3">
            <div className="tag">[{lane}]</div>
            <LanePill value={value} className="mt-1.5" />
          </div>
        ))}
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.65fr_1fr]">
        <div className="flex min-w-0 flex-col gap-4">
          <Section title="three-source check" aside={<span className="tag">[declared · scan · bank]</span>}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-[12.5px]">
                <thead>
                  <tr className="tag border-b border-line text-[11px]">
                    <th className="py-2 pr-3 font-normal">[field]</th>
                    <th className="py-2 pr-3 font-normal">[declared by institution]</th>
                    <th className="py-2 pr-3 font-normal">[read from scan]</th>
                    <th className="py-2 pr-3 font-normal">[confirmed by bank]</th>
                    <th className="py-2 font-normal">[result]</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-2">
                  {FIELDS.map((f) => {
                    const row = fieldMap.get(f.key);
                    const m = (row?.match ?? "missing") as keyof typeof MATCH_TONE;
                    return (
                      <tr key={f.key} className={cn("align-top", m === "mismatch" && "bg-red-soft/40")}>
                        <td className="py-2 pr-3 font-semibold">{f.label}</td>
                        <td className="py-2 pr-3 font-mono">{row?.declaredValue ?? "—"}</td>
                        <td className="py-2 pr-3 font-mono">
                          {row?.scanValue ?? <span className="text-mut">—</span>}
                          {row?.scanConfidence != null ? (
                            <span className={cn("tag ml-1.5", row.scanConfidence < 0.6 && "text-amber")}>{Math.round(row.scanConfidence * 100)}%</span>
                          ) : null}
                          {row?.note ? <div className="mt-0.5 font-sans text-[11.5px] text-amber">{row.note}</div> : null}
                        </td>
                        <td className="py-2 pr-3 font-mono">
                          {row?.bankValue ?? <span className="text-mut">—</span>}
                          {row?.bankSource ? <span className="tag ml-1.5">{SOURCE_LABEL[row.bankSource] ?? row.bankSource}</span> : null}
                        </td>
                        <td className="py-2">
                          <Pill tone={MATCH_TONE[m]}>{MATCH_LABEL[m]}</Pill>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {trust ? (
              <details className="mt-4 rounded-[10px] border border-line-2 bg-panel px-4 py-3">
                <summary className="cursor-pointer font-mono text-[12px] text-txt">
                  why {trust.score ?? "unscored"}? {trust.capped ? "(capped until the bank confirms)" : ""}
                </summary>
                <ul className="mt-3 flex flex-col gap-1.5 text-[12.5px]">
                  {trust.lines.map((l) => (
                    <li key={l.field} className="flex justify-between gap-4">
                      <span>
                        {FIELD_LABEL[l.field]} <span className="text-txt">— {l.reason}</span>
                      </span>
                      <span className="font-mono">
                        {l.points}/{l.max}
                      </span>
                    </li>
                  ))}
                  {trust.penalties.map((p) => (
                    <li key={p.reason} className="flex justify-between gap-4 text-red">
                      <span>{p.reason}</span>
                      <span className="font-mono">−{p.points}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </Section>

          {scan ? (
            <Section
              title="scan"
              aside={
                <span className="flex items-center gap-2">
                  {scan.doc.synthetic ? <Simulated what="synthetic scan" /> : null}
                  {scan.doc.tamperScore != null ? <Pill tone={scan.doc.tamperScore >= 50 ? "red" : scan.doc.tamperScore >= 30 ? "amber" : "green"}>tamper {scan.doc.tamperScore}/100</Pill> : null}
                </span>
              }
            >
              <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
                {"url" in scan ? (
                  <ScanViewer url={scan.url} heatmapUrl={heatmapUrl} boxes={boxes} alt={`FDR scan for ${i.caseNo}`} />
                ) : (
                  <div className="flex items-center gap-2 rounded-[10px] border border-dashed border-line p-4 text-[12px] text-txt">
                    <FileWarning size={14} /> could not load the scan
                  </div>
                )}
                <div className="flex flex-col gap-3 text-[13px]">
                  {hasReading && ex ? (
                    <>
                      <div>
                        <div className="tag">[two readers]</div>
                        <p className="mt-1">
                          <b>{agreed}/8</b> fields read the same by Azure Document Intelligence and gpt-6.1-terra
                          {ex.ms ? <span className="tag"> · {(ex.ms / 1000).toFixed(1)} s</span> : null}
                        </p>
                        {ex.di?.error ? <p className="mt-1 text-[12px] text-amber">Doc-AI was unavailable; the model read it alone.</p> : null}
                        {ex.llm?.amountInWords ? (
                          <p className="mt-1 text-[12px] text-txt">
                            in words: “{ex.llm.amountInWords}”{" "}
                            {ex.llm.wordsMatchFigures === false ? <b className="text-red">does not match the figures</b> : <span className="text-green">matches the figures</span>}
                          </p>
                        ) : null}
                        {ex.llm ? (
                          <p className="tag mt-1">
                            [stamp {ex.llm.stampPresent ? "seen" : "not seen"} · signature {ex.llm.signaturePresent ? "seen" : "not seen"}]
                          </p>
                        ) : null}
                      </div>
                      <div>
                        <div className="tag">[tamper check]</div>
                        {(tf?.heuristic ?? []).filter((f) => f.weight > 0).length ? (
                          <ul className="mt-1 flex flex-col gap-1">
                            {(tf?.heuristic ?? [])
                              .filter((f) => f.weight > 0)
                              .map((f) => (
                                <li key={f.kind} className="text-[12.5px]">
                                  <span className="font-mono text-red">measured</span> {f.detail}
                                </li>
                              ))}
                          </ul>
                        ) : (
                          <p className="mt-1 text-[12.5px] text-txt">No region was compressed separately from the rest of the page.</p>
                        )}
                        {tf?.opinion ? (
                          <div className="mt-2 rounded-[9px] border border-line-2 bg-panel px-3 py-2">
                            <div className="flex items-center gap-2">
                              <Pill tone={VERDICT_TONE[tf.opinion.verdict]}>{label(tf.opinion.verdict)}</Pill>
                              <span className="tag">gpt-6.1-terra second opinion · advisory</span>
                            </div>
                            <p className="mt-1.5 text-[12.5px]">{tf.opinion.summary}</p>
                          </div>
                        ) : null}
                      </div>
                    </>
                  ) : reading ? (
                    <p className="text-txt">Doc-AI and gpt-6.1-terra are reading the scan… (about 15 seconds)</p>
                  ) : scan.doc.extractionStatus === "failed" ? (
                    <p className="text-txt">The last read failed. Read it again from the actions panel.</p>
                  ) : scan.doc.extractionStatus === "done" ? (
                    <p className="text-txt">Checked at intake; the detailed reading was not kept for this older record. Read it again to see both readers and the tamper check.</p>
                  ) : (
                    <p className="text-txt">Not read yet. A dealing officer can run Doc-AI and the model on it from the actions panel.</p>
                  )}
                </div>
              </div>
            </Section>
          ) : null}

          <Section title="discrepancies" aside={<span className="tag">[{c.openDiscrepancies} open]</span>}>
            {c.discrepancies.length ? (
              <ul className="flex flex-col divide-y divide-line-2">
                {c.discrepancies.map((d) => (
                  <li key={d.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone={d.severity === "critical" ? "red" : d.severity === "high" ? "amber" : "neutral"}>{d.severity}</Pill>
                      <span className="font-semibold">{d.title}</span>
                      <Pill tone={d.status === "closed" ? "green" : "neutral"}>{label(d.status)}</Pill>
                      {d.autoRaised ? <span className="tag">[auto-raised]</span> : null}
                    </div>
                    {d.detail ? <p className="mt-1.5 text-[13px] text-txt">{d.detail}</p> : null}
                    <p className="tag mt-1">
                      raised {formatDateTime(d.raisedAt)} · due {formatDate(d.dueAt?.toISOString().slice(0, 10))}
                    </p>
                    {thread(d.id).length ? (
                      <ol className="mt-2 flex flex-col gap-1.5 border-l-2 border-line-2 pl-3">
                        {thread(d.id).map(({ o, author }) => (
                          <li key={o.id} className="text-[12.5px]">
                            <span className="font-semibold">{author}</span> <span className="tag">{formatDateTime(o.createdAt)}</span>
                            <p className="text-txt">{o.body}</p>
                          </li>
                        ))}
                      </ol>
                    ) : null}
                    <DiscrepancyControls caseNo={i.caseNo} id={d.id} ops={opsFor(d.status)} resolvedByMe={d.resolvedBy === user.id} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-txt">No discrepancies on this instrument.</p>
            )}
          </Section>

          <Section title="bank verification" aside={<Simulated what="mock bank / AA" />}>
            {c.verifications.length ? (
              <ul className="flex flex-col divide-y divide-line-2">
                {c.verifications.map(({ v, requestedBy }) => {
                  const resp = v.response as { found?: boolean; principalAmount?: number; maturityDate?: string; status?: string; message?: string; note?: string; letter?: Record<string, string> } | null;
                  const line = !resp
                    ? null
                    : resp.letter
                      ? `letter: amount ₹${Number(resp.letter.amount).toLocaleString("en-IN")} · matures ${formatDate(resp.letter.maturityDate)} · lien to ${resp.letter.lienHolder}${v.confirmedBy ? "" : " · awaiting a checker"}`
                      : resp.note
                        ? resp.note
                        : resp.found === false
                          ? resp.message
                          : resp.principalAmount != null
                            ? `bank: principal ₹${resp.principalAmount.toLocaleString("en-IN")} · matures ${formatDate(resp.maturityDate)} · ${resp.status?.toLowerCase()}`
                            : null;
                  return (
                    <li key={v.id} className="py-3 text-[13px] first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill tone="dark">{label(v.method)}</Pill>
                        {v.result ? <LanePill value={v.result} /> : <Pill tone="amber">{label(v.status)}</Pill>}
                        {v.consentId ? <span className="tag">consent {v.consentId}</span> : null}
                      </div>
                      {line ? <p className="mt-1.5 font-mono text-[12px] text-txt">{line}</p> : null}
                      <p className="tag mt-1">
                        requested {formatDateTime(v.requestedAt)}
                        {requestedBy ? ` by ${requestedBy}` : ""}
                        {v.completedAt ? ` · answered ${formatDateTime(v.completedAt)}` : " · awaiting bank"}
                      </p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-[13px] text-txt">Not sent to the bank yet.</p>
            )}
          </Section>

          <ReleaseSection c={c} user={user} />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {can(user.roles, "reports.view") ? (
            <Section title="case brief" aside={<span className="tag">[a4 · cited]</span>}>
              <CaseBrief caseNo={i.caseNo} />
            </Section>
          ) : null}
          {trust && (i.riskBand === "red" || i.riskBand === "amber") ? (
            <Section title="why this case needs attention" aside={<span className="tag">[gpt-6-luna · from the record]</span>} className={i.riskBand === "red" ? "border-red/40" : "border-amber/40"}>
              <Suspense fallback={<RiskLineSkeleton />}>
                <RiskLine
                  caseNo={i.caseNo}
                  trust={trust}
                  discrepancies={openTitles}
                  lanes={Object.fromEntries(lanes)}
                  tamperScore={scan?.doc.tamperScore ?? null}
                />
              </Suspense>
            </Section>
          ) : null}

          <Section title="next action">
            {i.nextAction ? (
              <>
                <p className="text-[15px] font-semibold">{i.nextAction}</p>
                <p className="tag mt-1.5 text-[12px]">
                  [{c.owner?.name ?? "unassigned"} · due {formatDate(i.nextActionDue)}]
                </p>
              </>
            ) : (
              <p className="text-[13px] text-txt">Nothing pending on this instrument.</p>
            )}
          </Section>

          {!isInstitution && !["released", "refunded"].includes(i.releaseStatus) && !["renewed", "replaced"].includes(i.renewalStatus) ? (
            <Section title="actions" aside={<span className="tag">[{user.roles.join(" · ")}]</span>}>
              <ActionsPanel
                caseNo={i.caseNo}
                can={perms}
                hasScan={!!scan}
                scanRead={hasReading}
                scanChecked={scan?.doc.extractionStatus === "done"}
                scanRunning={scan?.doc.extractionStatus === "running"}
                recordStatus={i.recordStatus}
                verificationStatus={i.verificationStatus}
                openDiscrepancies={c.openDiscrepancies}
                letterNeeded={letterRows.length > 0 && !letterRow}
                pendingLetter={pendingLetter}
                declared={{ amount: declared.amount ?? "", maturityDate: declared.maturityDate ?? "", lienHolder: declared.lienHolder ?? "" }}
              />
            </Section>
          ) : null}

          {perms.scrutinise || perms.confirm || can(user.roles, "release.approve") ? (
            <Section title="draft a letter" aside={<span className="tag">[a6 · en / hi]</span>}>
              <DraftPanel
                caseNo={i.caseNo}
                suggested={i.renewalStatus === "overdue" ? "escalation_note" : c.openDiscrepancies ? "discrepancy_letter" : "bank_request"}
              />
            </Section>
          ) : null}

          <Section title="instrument">
            <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-2 text-[13px]">
              <dt className="tag">[bank]</dt>
              <dd>{i.bankName}</dd>
              <dt className="tag">[branch]</dt>
              <dd>
                {i.branch} · <span className="font-mono">{i.ifsc}</span>
                {c.branch ? <div className="tag mt-0.5 normal-case">{c.branch.address}</div> : null}
              </dd>
              <dt className="tag">[fdr no.]</dt>
              <dd className="font-mono">{i.instrumentNo}</dd>
              <dt className="tag">[issued]</dt>
              <dd>{formatDate(i.issueDate)}</dd>
              <dt className="tag">[matures]</dt>
              <dd>
                {formatDate(i.maturityDate)} <DaysLeft days={days} />
              </dd>
              <dt className="tag">[lien]</dt>
              <dd>{i.lienHolder}</dd>
              <dt className="tag">[auto-renew]</dt>
              <dd>{i.autoRenew ? "yes" : "no"}</dd>
              <dt className="tag">[submitted]</dt>
              <dd>{formatDateTime(i.submittedAt)}</dd>
              <dt className="tag">[rules]</dt>
              <dd>rule set v{i.ruleSetVersion ?? 1}</dd>
            </dl>
          </Section>

          <Section title="documents" aside={<span className="tag">[{c.documents.length}]</span>}>
            {docs.length ? (
              <div className="flex flex-col gap-3">
                {docs.map((d) => (
                  <div key={d.doc.id}>
                    {d.doc.id === scan?.doc.id ? null : "url" in d ? (
                      <a href={d.url} target="_blank" rel="noreferrer" className="group block overflow-hidden rounded-[10px] border border-line">
                        {d.doc.mime.startsWith("image/") ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={d.url} alt={`${label(d.doc.kind)} for ${i.caseNo}`} className="block w-full" loading="lazy" />
                        ) : (
                          <div className="p-6 text-center font-mono text-[12px]">open PDF</div>
                        )}
                      </a>
                    ) : (
                      <div className="flex items-center gap-2 rounded-[10px] border border-dashed border-line p-4 text-[12px] text-txt">
                        <FileWarning size={14} /> could not load the file
                      </div>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px]">
                      <Pill>{label(d.doc.kind)}</Pill>
                      {d.doc.synthetic ? <Simulated what="synthetic scan" /> : null}
                      {d.doc.tamperScore != null ? (
                        <Pill tone={d.doc.tamperScore >= 30 ? "red" : "green"}>tamper {d.doc.tamperScore}/100</Pill>
                      ) : null}
                      {"url" in d ? (
                        <a href={d.url} target="_blank" rel="noreferrer" className="tag inline-flex items-center gap-1 hover:text-ink">
                          open <ExternalLink size={11} />
                        </a>
                      ) : null}
                    </div>
                    {d.doc.sha256 ? <div className="tag mt-1 truncate">sha-256 {d.doc.sha256}</div> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-txt">No documents uploaded yet.</p>
            )}
          </Section>

          {c.chain.length > 1 ? (
            <Section title="renewal history">
              <ol className="flex flex-col gap-2">
                {c.chain.map((link) => (
                  <li key={link.case_no} className={cn("rounded-[10px] border px-3 py-2", link.case_no === i.caseNo ? "border-ink" : "border-line-2")}>
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/app/cases/${link.case_no}`} className="font-mono text-[12px] font-semibold hover:underline">
                        {link.case_no}
                      </Link>
                      <LanePill value={link.release_status !== "none" ? link.release_status : link.renewal_status} />
                    </div>
                    <div className="tag mt-0.5">
                      {formatDate(link.issue_date)} → {formatDate(link.maturity_date)}
                    </div>
                  </li>
                ))}
              </ol>
            </Section>
          ) : null}

          <Section title="audit trail" aside={<span className="tag">[hash-chained]</span>}>
            <ol className="flex flex-col gap-2.5">
              {c.ledger.map(({ e, actor }) => (
                <li key={e.seq} id={`ledger-${e.seq}`} className="scroll-mt-24 border-l-2 border-line pl-3 target:border-red target:bg-red-soft/40">
                  <div className="text-[12.5px]">
                    <span className="font-mono">{e.action}</span> <span className="text-txt">by {actor ?? e.actorRole ?? "system"}</span>
                  </div>
                  <div className="tag">
                    #{e.seq} · {formatDateTime(e.ts)} · {e.hash.slice(0, 12)}…
                  </div>
                </li>
              ))}
            </ol>
          </Section>
        </div>
      </div>
    </div>
  );
}
