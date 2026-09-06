"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi";
import { NotesProvider } from "@/components/Notes";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false } } }));

  useEffect(() => {
    // Option d'accessibilité « noms typographiés » (DA §11) et thème
    try {
      const typo = localStorage.getItem("spot:typo-names");
      if (typo === "1") document.documentElement.dataset.typoNames = "1";
      // Daylight is the default everywhere; the dusk theme is an explicit choice in settings.
      const theme = localStorage.getItem("spot:theme");
      document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
    } catch {}
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <NotesProvider>{children}</NotesProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
