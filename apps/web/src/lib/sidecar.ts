import "server-only";
import { createHmac } from "node:crypto";
import { env } from "./env";

/**
 * Client for the FastAPI sidecar on the VM. Server-to-server calls use the
 * shared API key; browser uploads/downloads use short-lived signed tokens.
 */

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

function sign(payload: Record<string, unknown>) {
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", env.SIDECAR_URL_SIGNING_KEY).update(body).digest();
  return `${body}.${b64url(sig)}`;
}

/** A URL the browser can open for `ttlSeconds` to view one stored file. */
export function signedGetUrl(key: string, name?: string, ttlSeconds = 300) {
  const token = sign({ op: "get", key, name, exp: Math.floor(Date.now() / 1000) + ttlSeconds });
  return `${env.SIDECAR_URL}/v1/files/get?token=${token}`;
}

/** A URL the browser can POST one file to (multipart field "file"). */
export function signedUploadUrl(key: string, maxBytes = 10 * 1024 * 1024, ttlSeconds = 600) {
  const token = sign({ op: "put", key, max: maxBytes, exp: Math.floor(Date.now() / 1000) + ttlSeconds });
  return `${env.SIDECAR_URL}/v1/files/upload?token=${token}`;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${env.SIDECAR_URL}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${env.SIDECAR_API_KEY}`, "content-type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`sidecar ${path} -> ${res.status} ${await res.text().catch(() => "")}`);
  return res.json() as Promise<T>;
}

export type FileMeta = { key: string; exists: boolean; size?: number; sha256?: string; mime?: string };

export const fileMeta = (key: string) => call<FileMeta>(`/v1/files/meta?key=${encodeURIComponent(key)}`);

export const renderSpecimen = (key: string, spec: unknown) =>
  call<{ key: string; size: number; sha256: string; mime: string }>("/v1/specimen/render", {
    method: "POST",
    body: JSON.stringify({ key, spec }),
  });

export type TamperFinding = { kind: string; detail: string; weight: number; box: [number, number, number, number] | null };

export const tamperScan = (key: string) =>
  call<{ score: number; findings: TamperFinding[]; heatmapKey: string | null; mime: string }>("/v1/tamper/analyze", {
    method: "POST",
    body: JSON.stringify({ key }),
  });

/* ----------------------------------------- simulated bank rails (mock) -- */

export type TermDeposit = {
  type: "TERM_DEPOSIT";
  linkedAccRef: string;
  maskedAccNumber: string;
  profile: { holders: { holder: { name: string }[] } };
  summary: {
    ifsc: string;
    openingDate: string;
    maturityDate: string;
    principalAmount: number;
    maturityAmount: number;
    interestRate: number;
    status: "ACTIVE" | "CLOSED" | "MATURED";
    closedOn: string | null;
    autoRenewal: boolean;
    lien: { marked: boolean; inFavourOf: string | null };
  };
};

export class SidecarError extends Error {
  constructor(public status: number, public detail: unknown) {
    super(`sidecar ${status}`);
  }
}

async function bankCall<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${env.SIDECAR_URL}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.SIDECAR_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new SidecarError(res.status, (json as { detail?: unknown }).detail ?? json);
  return json as T;
}

export const bank = {
  consent: (ifsc: string, accountNo: string) =>
    bankCall<{ consentId: string; status: string; expiresAt: string }>("/v1/bank/aa/consent", { ifsc, accountNo }),
  fetch: (consentId: string) => bankCall<{ sessionId: string; found: boolean; fi?: TermDeposit; fipMessage?: string }>("/v1/bank/aa/fetch", { consentId }),
  nesl: (ifsc: string, instrumentNo: string) =>
    bankCall<{ found: boolean; instrument?: TermDeposit; message?: string }>("/v1/bank/nesl/lookup", { ifsc, instrumentNo }),
  issue: (d: Record<string, unknown>) => bankCall<{ ok: boolean }>("/v1/bank/admin/issue", d),
  recent: async () => {
    const res = await fetch(`${env.SIDECAR_URL}/v1/bank/admin/recent?limit=15`, { headers: { authorization: `Bearer ${env.SIDECAR_API_KEY}` }, cache: "no-store" });
    return (await res.json()) as { total: number; recent: Record<string, string | number | null>[] };
  },
};

export const AA_RAIL = new Set(["SBIN", "HDFC", "ICIC", "UTIB", "KKBK", "BARB", "PUNB", "CNRB", "UBIN"]);
