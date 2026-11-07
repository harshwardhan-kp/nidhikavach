"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-fetches the page every few seconds while background work (the automatic scan read) is running. */
export function AutoRefresh({ every = 4000, maxTries = 12 }: { every?: number; maxTries?: number }) {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const t = setInterval(() => {
      n += 1;
      router.refresh();
      if (n >= maxTries) clearInterval(t);
    }, every);
    return () => clearInterval(t);
  }, [router, every, maxTries]);
  return null;
}
