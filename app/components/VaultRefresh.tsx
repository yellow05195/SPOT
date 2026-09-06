"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Refreshes the ledger every 30 s. */
export function VaultRefresh() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}
