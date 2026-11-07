import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { renderSpecimen, signedGetUrl } from "@/lib/sidecar";

type Doc = typeof schema.documents.$inferSelect;

/** Makes sure a document's file exists (rendering synthetic seed scans on first view) and returns a 5-minute link. */
export async function documentUrl(doc: Doc): Promise<{ url: string; doc: Doc } | { error: string; doc: Doc }> {
  try {
    if (doc.synthetic && doc.specimen && !doc.sha256) {
      const meta = await renderSpecimen(doc.fileKey, doc.specimen);
      await db.update(schema.documents).set({ sha256: meta.sha256, sizeBytes: meta.size }).where(eq(schema.documents.id, doc.id));
      doc = { ...doc, sha256: meta.sha256, sizeBytes: meta.size };
    }
    return { url: signedGetUrl(doc.fileKey, doc.filename), doc };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "document unavailable", doc };
  }
}
