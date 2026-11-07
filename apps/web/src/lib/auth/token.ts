/**
 * Session token (JWT, HS256) helpers. No server-only import: the proxy uses
 * verifySessionToken to gate /app before any page renders.
 */
import { jwtVerify, SignJWT } from "jose";
import type { Role } from "./roles";

export const SESSION_COOKIE = "nk_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

export type SessionClaims = {
  sub: string;
  name: string;
  roles: Role[];
  institutionId: string | null;
  regionId: number | null;
  demo: boolean;
};

const key = () => new TextEncoder().encode(process.env.SESSION_SECRET);

export async function signSessionToken(claims: SessionClaims) {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("nidhikavach")
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(key());
}

export async function verifySessionToken(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { issuer: "nidhikavach", algorithms: ["HS256"] });
    return payload as unknown as SessionClaims;
  } catch {
    return null;
  }
}
