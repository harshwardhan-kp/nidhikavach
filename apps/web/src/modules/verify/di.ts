import "server-only";
import { env } from "@/lib/env";
import type { DiResult } from "./di-parse";

export { type DiResult, fieldsFromDi, type Reading } from "./di-parse";

/**
 * Azure AI Document Intelligence (prebuilt-layout + key-value pairs).
 * The document is passed by a short-lived signed URL, so no bytes flow
 * through Vercel. F0 tier: first two pages of each document.
 */
const API = "2024-11-30";


export async function analyzeLayout(url: string): Promise<DiResult> {
  if (!env.AZURE_DI_ENDPOINT || !env.AZURE_DI_KEY) throw new Error("Document Intelligence is not configured");
  const start = await fetch(`${env.AZURE_DI_ENDPOINT}/documentintelligence/documentModels/prebuilt-layout:analyze?api-version=${API}&features=keyValuePairs`, {
    method: "POST",
    headers: { "Ocp-Apim-Subscription-Key": env.AZURE_DI_KEY, "content-type": "application/json" },
    body: JSON.stringify({ urlSource: url }),
  });
  if (start.status !== 202) throw new Error(`Document Intelligence ${start.status}: ${(await start.text()).slice(0, 200)}`);
  const op = start.headers.get("operation-location")!;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, i < 3 ? 1200 : 1000));
    const res = await fetch(op, { headers: { "Ocp-Apim-Subscription-Key": env.AZURE_DI_KEY } });
    const j = await res.json();
    if (j.status === "succeeded") return j.analyzeResult as DiResult;
    if (j.status === "failed") throw new Error(`Document Intelligence failed: ${JSON.stringify(j.error).slice(0, 200)}`);
  }
  throw new Error("Document Intelligence timed out");
}
