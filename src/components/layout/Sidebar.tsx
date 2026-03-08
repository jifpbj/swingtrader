"use client";

import { useUIStore } from "@/store/useUIStore";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, X, Zap } from "lucide-react";
import { StrategyQueue } from "@/components/algo/StrategyQueue";
import { DataModeToggle } from "@/components/ui/DataModeToggle";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggle    = useUIStore((s) => s.toggleSidebar);

  return (
    <>
      {/* Backdrop — mobile only, closes drawer on tap */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/60 md:hidden transition-opacity duration-300",
          collapsed ? "opacity-0 pointer-events-none" : "opacity-100",
        )}
        onClick={toggle}
        aria-hidden="true"
      />

      <aside
        className={cn(
          "glass flex flex-col py-4 shrink-0 border-r border-white/5 transition-all duration-300",
          // Mobile: fixed overlay, full height, slides in/out
          "fixed inset-y-0 left-0 w-72 items-stretch z-50",
          collapsed ? "-translate-x-full" : "translate-x-0",
          // Desktop: back in document flow
          "md:relative md:inset-y-auto md:translate-x-0 md:z-20",
          collapsed ? "md:w-14 md:items-center" : "md:w-56 md:items-stretch",
        )}
      >
        {/* Header */}
        {!collapsed && (
          <div className="flex items-center gap-2 px-4 pb-3 border-b border-white/5">
            <Zap className="size-3.5 text-amber-400 shrink-0 fill-amber-400" />
            <span className="text-[11px] font-semibold text-zinc-300 uppercase tracking-widest">
              Active Strategies
            </span>
            {/* Close button: X on mobile, ChevronLeft on desktop */}
            <button
              onClick={toggle}
              className="ml-auto p-1 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/5 transition-all"
              aria-label="Close sidebar"
            >
              <X className="size-4 md:hidden" />
              <ChevronLeft className="size-4 hidden md:block" />
            </button>
          </div>
        )}

        {/* Data mode + Theme — mobile only, at top below header */}
        {!collapsed && (
          <div className="px-4 py-3 border-b border-white/5 md:hidden space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-500 uppercase tracking-widest font-semibold">
                Data Mode
              </span>
              <DataModeToggle />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-500 uppercase tracking-widest font-semibold">
                Theme
              </span>
              <ThemeToggle />
            </div>
          </div>
        )}

        {/* Strategy queue */}
        <div className={cn("flex-1 overflow-y-auto", collapsed ? "hidden" : "px-3 pt-3")}>
          <StrategyQueue />
        </div>

        {/* Collapse toggle: desktop only */}
        <button
          onClick={toggle}
          className="mt-2 mx-2 p-2 rounded-xl text-zinc-500 hover:text-zinc-200 hover:bg-white/5 transition-all self-start hidden md:flex"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
        </button>
      </aside>
    </>
  );
}
