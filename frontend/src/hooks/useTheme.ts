"use client";
import { useState, useEffect } from "react";

type Theme = "dark" | "light";

const STORAGE_KEY = "gh_theme";
const DEFAULT: Theme = "dark";

function applyTheme(theme: Theme) {
  const html = document.documentElement;
  html.classList.remove("dark", "light");
  html.classList.add(theme);
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(DEFAULT);

  // Read the real value from localStorage after hydration
  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) ?? DEFAULT) as Theme;
    setTheme(stored);
    applyTheme(stored);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
  };

  return { theme, toggle, isDark: theme === "dark" };
}
