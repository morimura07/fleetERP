"use client";
import { useEffect, useState } from "react";
import { Moon, Leaf } from "lucide-react";

type Theme = "dark" | "green";

/**
 * Toggle between the default dark theme and the green/white theme.
 * Persists to localStorage; the class is applied pre-paint in the root layout.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("green");

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("green") ? "green" : "dark");
  }, []);

  function toggle() {
    const next: Theme = theme === "green" ? "dark" : "green";
    setTheme(next);
    const c = document.documentElement.classList;
    c.remove("dark", "green");
    c.add(next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label={theme === "green" ? "Switch to dark theme" : "Switch to green theme"}
      title={theme === "green" ? "Switch to dark theme" : "Switch to green theme"}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {theme === "green" ? <Leaf className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
