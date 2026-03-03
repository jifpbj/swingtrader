"use client";

import { useUIStore } from "@/store/useUIStore";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  BarChart2,
  BrainCircuit,
  BookOpen,
  Wallet,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
} from "lucide-react";

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", active: true },
  { icon: BarChart2, label: "Charts" },
  { icon: BrainCircuit, label: "AI Analysis" },
  { icon: TrendingUp, label: "Signals" },
  { icon: BookOpen, label: "Journal" },
  { icon: Wallet, label: "Portfolio" },
];

export function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggle = useUIStore((s) => s.toggleSidebar);

  return (
    <aside
      className={cn(
        "glass flex flex-col items-center py-4 shrink-0 border-r border-white/5 transition-all duration-300 z-20",
        collapsed ? "w-14" : "w-48"
      )}
    >
      <nav className="flex flex-col gap-1 flex-1 w-full px-2">
        {NAV_ITEMS.map(({ icon: Icon, label, active }) => (
          <button
            key={label}
            className={cn(
              "flex items-center gap-3 px-2.5 py-2.5 rounded-xl w-full text-sm font-medium transition-all group",
              active
                ? "bg-emerald-500/15 text-emerald-400"
                : "text-zinc-500 hover:text-zinc-200 hover:bg-white/5"
            )}
          >
            <Icon className={cn("size-5 shrink-0 transition-colors", active ? "text-emerald-400" : "text-zinc-500 group-hover:text-zinc-300")} />
            {!collapsed && <span className="truncate">{label}</span>}
            {!collapsed && active && <span className="ml-auto size-1.5 rounded-full bg-emerald-400 shrink-0" />}
          </button>
        ))}
      </nav>

      <button
        onClick={toggle}
        className="mt-2 mx-2 p-2 rounded-xl text-zinc-500 hover:text-zinc-200 hover:bg-white/5 transition-all self-start"
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
      </button>
    </aside>
  );
}
