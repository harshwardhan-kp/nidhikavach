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
