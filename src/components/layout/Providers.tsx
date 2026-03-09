"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRef, useEffect } from "react";
import { ThemeProvider } from "./ThemeProvider";
import { useAuthStore } from "@/store/useAuthStore";
import { useUIStore } from "@/store/useUIStore";
import { getPopularTickers } from "@/lib/demoPriceCache";

export function Providers({ children }: { children: React.ReactNode }) {
  const initAuth  = useAuthStore(s => s.initAuth);
  const setTicker = useUIStore(s => s.setTicker);

  useEffect(() => {
    const unsubscribe = initAuth();
    return unsubscribe;
  }, [initAuth]);

  // Pick a random ticker from Alpaca's popular list on every page load
  useEffect(() => {
    getPopularTickers().then((tickers) => {
      if (tickers.length > 0) {
        const pick = tickers[Math.floor(Math.random() * tickers.length)];
        setTicker(pick.ticker);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const queryClientRef = useRef<QueryClient | null>(null);
  if (!queryClientRef.current) {
    queryClientRef.current = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 5_000,
          refetchInterval: 10_000,
          retry: 2,
        },
      },
    });
  }

  return (
    <QueryClientProvider client={queryClientRef.current}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
}
