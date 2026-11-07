import { headers } from "next/headers";
import { Card } from "@/components/ui";
import { tr } from "@/lib/i18n";
import { getLang } from "@/lib/lang";
import { can, distinctActor } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/session";
import { signedGetUrl } from "@/lib/sidecar";
import { formatDateTime } from "@/lib/utils";
import type { CaseDetail } from "@/modules/cases/queries";
import { approvalsOf, checklist, currentRequest } from "@/modules/release/service";
import { ReleasePanel } from "./release-panel";

const STEP_FOR_STATE = { requested: "recommend", recommended: "check", checked: "approve" } as const;
const PERM = { recommend: "release.recommend", check: "release.check", approve: "release.approve" } as const;

/** Loads the release request, its checklist and decision trail, and decides what this user may do. */
export async function ReleaseSection({ c, user }: { c: CaseDetail; user: SessionUser }) {
  const i = c.i;
  const req = await currentRequest(i.id);
  const approvals = req ? await approvalsOf(req.id) : [];
  const list = await checklist(i, req);
  const open = req && ["requested", "recommended", "checked", "approved"].includes(req.state);

  const eligible = can(user.roles, "release.request") && i.recordStatus === "accepted" && ["none", "rejected"].includes(i.releaseStatus) && !["renewed", "replaced"].includes(i.renewalStatus);
  if (!req && !eligible) return null;

  const step = req ? (STEP_FOR_STATE as Record<string, "recommend" | "check" | "approve" | undefined>)[req.state] : undefined;
  const mayStep = !!step && can(user.roles, PERM[step]);
  const actedBefore = !!req && !distinctActor(user.id, [req.requestedBy, ...approvals.map((a) => a.a.actorId)]);
  const orderDoc = req?.orderDocumentId ? c.documents.find((d) => d.id === req.orderDocumentId) : undefined;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="kicker">{tr(await getLang(), "release / refund")}</div>
        <span className="tag">[maker → checker → authority · eSign]</span>
      </div>
      <ReleasePanel
      caseNo={i.caseNo}
      request={
        req
          ? {
              kind: req.kind,
              reason: req.reason,
              state: req.state,
              requestedAt: formatDateTime(req.requestedAt),
              orderNo: req.orderNo,
              orderUrl: orderDoc ? signedGetUrl(orderDoc.fileKey, orderDoc.filename, 1800) : null,
              verifyPath: req.orderNo ? `/verify/${req.id}` : null,
              verifyUrl: req.orderNo ? `${origin}/verify/${req.id}` : null,
            }
          : null
      }
      approvals={approvals.map((a) => ({ step: a.a.step, decision: a.a.decision, name: a.name, designation: a.designation, at: formatDateTime(a.a.createdAt), comment: a.a.comment, signed: !!a.a.signature, keyId: a.a.keyId }))}
      checklist={list}
      action={open && mayStep ? { step: step!, blocked: actedBefore ? "You already acted on this request, so a different officer must take this step." : null } : null}
      canRequest={eligible}
      canRecordLien={req?.state === "approved" && can(user.roles, "release.recommend")}
      canAsk={can(user.roles, "reports.view")}
      />
    </Card>
  );
}
