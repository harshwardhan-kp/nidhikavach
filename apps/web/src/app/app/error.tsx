"use client";

import { Button, Card } from "@/components/ui";

export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card className="max-w-[560px] p-6">
      <div className="kicker">something went wrong</div>
      <p className="mt-3 text-[14px] text-txt">The page failed to load. Try again.</p>
      {error.digest ? <p className="tag mt-2">[ref {error.digest}]</p> : null}
      <Button className="mt-4" onClick={reset}>
        [try again]
      </Button>
    </Card>
  );
}
