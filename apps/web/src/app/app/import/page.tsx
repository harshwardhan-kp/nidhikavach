import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth/session";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "Legacy import" };

export default async function ImportPage() {
  const user = await requirePermission("instrument.import");
  return (
    <>
      <PageHeader
        title="legacy register"
        italic="import"
        sub={`[${user.regionName ? `${user.regionName} region` : "all regions"} · unknowns are never guessed]`}
      />
      <ImportWizard />
    </>
  );
}
