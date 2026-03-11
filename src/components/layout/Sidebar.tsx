"use client";

import React, { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { useUIStore } from "@/store/useUIStore";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, X, Zap, BarChart2 } from "lucide-react";
import { StrategyQueue } from "@/components/algo/StrategyQueue";
import { DataModeToggle } from "@/components/ui/DataModeToggle";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 480;
const SIDEBAR_DEFAULT = 360; // matches right panel default width

export function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggle    = useUIStore((s) => s.toggleSidebar);

  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const onResizePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    dragStateRef.current = { startX: e.clientX, startWidth: sidebarWidth };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [sidebarWidth]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const ds = dragStateRef.current;
      if (!ds) return;
      const next = ds.startWidth + (e.clientX - ds.startX);
      setSidebarWidth(Math.min(Math.max(next, SIDEBAR_MIN), SIDEBAR_MAX));
    };
    const onUp = () => { dragStateRef.current = null; };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

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

      {/* Wrapper — positions sidebar + drag handle as a unit on desktop */}
      <div
        className={cn(
          "shrink-0 relative",
          // Mobile: not in flow (the aside is fixed)
          "md:flex md:items-stretch",
          collapsed ? "md:w-14" : "",
        )}
        style={!collapsed ? { width: sidebarWidth } : undefined}
      >

      <aside
        className={cn(
          "glass flex flex-col py-4 shrink-0 border-r border-white/5 transition-[transform] duration-300",
          // Mobile: fixed overlay, full height, slides in/out
          "fixed inset-y-0 left-0 w-72 items-stretch z-50",
          collapsed ? "-translate-x-full" : "translate-x-0",
          // Desktop: back in document flow, width driven by parent
          "md:relative md:inset-y-auto md:translate-x-0 md:z-20 md:w-full",
          collapsed ? "md:w-14 md:items-center" : "md:items-stretch",
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

        {/* Portfolio link */}
        <div className={cn(
          "border-t border-white/5 pt-2 mt-2",
          collapsed ? "flex items-center justify-center px-2" : "px-3",
        )}>
          <Link
            href="/portfolio"
            className={cn(
              "flex items-center gap-2 rounded-xl text-[11px] font-semibold text-zinc-500 hover:text-emerald-300 hover:bg-emerald-500/10 transition-all",
              collapsed ? "p-2.5" : "px-3 py-2 w-full",
            )}
            title="Portfolio"
          >
            <BarChart2 className="size-4 shrink-0" />
            {!collapsed && <span>Portfolio</span>}
          </Link>
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

      {/* Drag handle — desktop only, hidden when collapsed */}
      {!collapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          onPointerDown={onResizePointerDown}
          className="hidden md:flex absolute right-0 top-0 bottom-0 w-1.5 -mr-0.5 cursor-col-resize items-stretch justify-center z-30 group"
        >
          <span className="w-px rounded-full bg-white/8 transition-colors group-hover:bg-amber-400/70" />
        </div>
      )}

      </div>{/* end wrapper */}
    </>
  );
}
