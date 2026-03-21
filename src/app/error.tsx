"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ErrorBoundary]", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-zinc-950 text-zinc-400">
      <div className="text-center max-w-md px-6">
        <h2 className="text-zinc-100 text-lg font-semibold mb-2">
          Something went wrong
        </h2>
        <p className="text-sm leading-relaxed mb-5">
          {error.message || "An unexpected error occurred."}
        </p>
        <button
          onClick={reset}
          className="px-5 py-2 rounded-lg border border-white/10 bg-emerald-500/15 text-emerald-400 font-semibold text-sm hover:bg-emerald-500/25 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
