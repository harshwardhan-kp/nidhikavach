import "server-only";
import { createPrivateKey, createPublicKey, hkdfSync, sign, verify } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "@/lib/env";

/**
 * Simulated eSign: each officer has an Ed25519 key derived from the server
 * secret and their user id, so the private key is never stored. The public key
 * is published in signing_keys; anyone can verify an order with it.
 * (Production: Aadhaar eSign / DSC via a CA-empanelled ESP.)
 */
const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

function privateKeyFor(userId: string) {
  const seed = Buffer.from(hkdfSync("sha256", env.SESSION_SECRET, userId, "nidhikavach-esign-v1", 32));
  return createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]), format: "der", type: "pkcs8" });
}

export const keyIdFor = (userId: string) => `nk-ed25519-${userId.slice(0, 8)}-v1`;

/** Publishes the officer's public key the first time they sign. */
export async function ensureSigningKey(userId: string) {
  const keyId = keyIdFor(userId);
  const [have] = await db.select().from(schema.signingKeys).where(eq(schema.signingKeys.keyId, keyId));
  if (have) return have;
  const publicKey = createPublicKey(privateKeyFor(userId)).export({ type: "spki", format: "pem" }).toString();
  const [row] = await db.insert(schema.signingKeys).values({ keyId, userId, publicKey }).onConflictDoNothing().returning();
  return row ?? (await db.select().from(schema.signingKeys).where(eq(schema.signingKeys.keyId, keyId)))[0];
}

export function signPayload(userId: string, payload: string) {
  return sign(null, Buffer.from(payload), privateKeyFor(userId)).toString("base64");
}

export function verifyPayload(publicKeyPem: string, payload: string, signatureB64: string) {
  try {
    return verify(null, Buffer.from(payload), publicKeyPem, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}
