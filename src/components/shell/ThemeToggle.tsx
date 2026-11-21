"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-8 w-8 rounded-md bg-surface-muted" />;
  }

  const isDark =
    resolvedTheme === "dark" ||
    (typeof document !== "undefined" && document.documentElement.classList.contains("dark"));

  const toggleTheme = () => {
    const nextTheme = isDark ? "light" : "dark";
    setTheme(nextTheme);
    try {
      localStorage.setItem("theme", nextTheme);
      if (nextTheme === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
      const meta = document.querySelector('meta[name="color-scheme"]');
      if (meta) {
        meta.setAttribute("content", nextTheme);
      }
    } catch {
      // ignore
    }
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary"
      title={`Switch to ${isDark ? "Light" : "Dark"} mode`}
      aria-label="Toggle theme"
    >
      {isDark ? <Sun className="h-4 w-4 text-warning" /> : <Moon className="h-4 w-4 text-brand" />}
    </button>
  );
}
