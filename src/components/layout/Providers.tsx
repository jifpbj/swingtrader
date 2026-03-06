"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRef, useEffect } from "react";
import { ThemeProvider } from "./ThemeProvider";
import { useAuthStore } from "@/store/useAuthStore";

export function Providers({ children }: { children: React.ReactNode }) {
  const initAuth = useAuthStore(s => s.initAuth);

  useEffect(() => {
    const unsubscribe = initAuth();
    return unsubscribe;
  }, [initAuth]);

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
