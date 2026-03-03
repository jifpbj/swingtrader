"use client";

import { useEffect } from "react";
import { useUIStore } from "@/store/useUIStore";

function applyTheme(theme: string) {
  const root = document.documentElement;
  const isDark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.remove("light", "dark");
  root.classList.add(isDark ? "dark" : "light");
  root.style.colorScheme = isDark ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

  // On mount: read localStorage, sync into store, apply to DOM
  useEffect(() => {
    const stored = localStorage.getItem("pa-theme") as typeof theme | null;
    if (stored && stored !== theme) {
      setTheme(stored);
    } else {
      applyTheme(theme);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Whenever theme changes: persist + apply
  useEffect(() => {
    localStorage.setItem("pa-theme", theme);
    applyTheme(theme);
  }, [theme]);

  // For "system" mode: re-apply when OS preference changes
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  return <>{children}</>;
}
