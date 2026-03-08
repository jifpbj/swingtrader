"use client";

import { useUIStore } from "@/store/useUIStore";
import { cn } from "@/lib/utils";
import { FlaskConical } from "lucide-react";

/**
 * Pill toggle that switches between live backend data and local mock data.
 * Compact by default; set `showLabel` to false to show icon only.
 */
export function DemoModeToggle({ showLabel = true }: { showLabel?: boolean }) {
  const demoMode   = useUIStore((s) => s.demoMode);
  const setDemoMode = useUIStore((s) => s.setDemoMode);

  return (
    <button
      onClick={() => setDemoMode(!demoMode)}
      title={demoMode ? "Exit demo mode" : "Enter demo mode (mock data)"}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all select-none",
        demoMode
          ? "bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30"
          : "glass text-muted-foreground hover:text-foreground border border-white/5 hover:border-white/10",
      )}
    >
      <FlaskConical className="size-3.5 shrink-0" />
      {showLabel && <span>Demo</span>}
    </button>
  );
}
