"use client";

import { Sun, Moon, Monitor } from "lucide-react";
import { useUIStore, type Theme } from "@/store/useUIStore";
import { cn } from "@/lib/utils";

const OPTIONS: { value: Theme; icon: React.ReactNode; label: string }[] = [
  { value: "light", icon: <Sun className="size-3.5" />, label: "Light" },
  { value: "dark",  icon: <Moon className="size-3.5" />, label: "Dark" },
  { value: "system", icon: <Monitor className="size-3.5" />, label: "System" },
];

export function ThemeToggle() {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

  return (
    <div
      className="flex items-center gap-0.5 glass rounded-xl px-1 py-1"
      aria-label="Theme selector"
    >
      {OPTIONS.map(({ value, icon, label }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          title={label}
          aria-pressed={theme === value}
          className={cn(
            "p-1.5 rounded-lg transition-all",
            theme === value
              ? "bg-emerald-500/20 text-emerald-400"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}
