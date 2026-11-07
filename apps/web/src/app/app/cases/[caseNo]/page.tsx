import { ArrowLeft, CheckCircle2, ExternalLink, FileWarning } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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

  return (
    <div className="flex flex-col gap-4">
      {submitted ? (
        <div role="status" className="flex items-center gap-2 rounded-[12px] border border-green/40 bg-green-soft px-4 py-3 text-[13px]">
          <CheckCircle2 size={16} className="text-green" />
          <span>
            Submitted as <b className="font-mono">{i.caseNo}</b>. The dealing officer has been notified; the scan goes to Doc-AI next.
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
                  const resp = v.response as { found?: boolean; principalAmount?: number; maturityDate?: string; status?: string; message?: string } | null;
                  return (
                    <li key={v.id} className="py-3 text-[13px] first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill tone="dark">{label(v.method)}</Pill>
                        {v.result ? <LanePill value={v.result} /> : <Pill tone="amber">{label(v.status)}</Pill>}
                        {v.consentId ? <span className="tag">consent {v.consentId}</span> : null}
                      </div>
                      {resp ? (
                        <p className="mt-1.5 font-mono text-[12px] text-txt">
                          {resp.found === false
                            ? resp.message
                            : `bank: principal ₹${resp.principalAmount?.toLocaleString("en-IN")} · matures ${formatDate(resp.maturityDate)} · ${resp.status?.toLowerCase()}`}
                        </p>
                      ) : null}
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

          {c.releases.length ? (
            <Section title="release / refund">
              {c.releases.map((r) => (
                <div key={r.id} className="text-[13px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone="dark">{r.kind}</Pill>
                    <LanePill value={r.state} />
                    <span className="tag">requested {formatDateTime(r.requestedAt)}</span>
                  </div>
                  <p className="mt-1.5 text-txt">{r.reason}</p>
                  <ol className="mt-3 grid gap-2 sm:grid-cols-3">
                    {(["recommend", "check", "approve"] as const).map((step) => {
                      const a = c.approvals.find((x) => x.a.releaseRequestId === r.id && x.a.step === step);
                      return (
                        <li key={step} className={cn("rounded-[10px] border px-3 py-2.5", a ? "border-green/40 bg-green-soft/40" : "border-dashed border-line")}>
                          <div className="tag">[{step === "recommend" ? "maker" : step === "check" ? "checker" : "authority"}]</div>
                          <div className="mt-1 font-semibold">{step}</div>
                          {a ? (
                            <>
                              <div className="text-[12px]">{a.actor}</div>
                              <div className="tag">{formatDateTime(a.a.createdAt)}</div>
                            </>
                          ) : (
                            <div className="tag">pending</div>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ))}
            </Section>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
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
                    {"url" in d ? (
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
                <li key={e.seq} className="border-l-2 border-line pl-3">
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
