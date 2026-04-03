"use client";

import { cn } from "@/lib/utils";
import { useAlpacaStore } from "@/store/useAlpacaStore";

export function TradingModeToggle() {
  const tradingMode    = useAlpacaStore((s) => s.tradingMode);
  const setTradingMode = useAlpacaStore((s) => s.setTradingMode);
  const account        = useAlpacaStore((s) => s.account);

  return (
    <div
      className={cn(
        "flex items-center gap-0.5 rounded-lg px-0.5 py-0.5 glass text-xs",
        !account && "opacity-50 pointer-events-none",
      )}
      title={!account ? "Connect Alpaca to switch trading mode" : undefined}
    >
      <button
        onClick={() => setTradingMode("paper")}
        className={cn(
          "px-2.5 py-1 rounded-md font-semibold transition-all",
          tradingMode === "paper"
            ? "bg-yellow-500/20 text-yellow-400"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Paper
      </button>
      {/* Live trading disabled in beta */}
      <button
        disabled
        className="px-2.5 py-1 rounded-md font-semibold text-muted-foreground opacity-40 cursor-not-allowed"
        title="Live trading is not available during beta"
      >
        Live
      </button>
    </div>
  );
}
