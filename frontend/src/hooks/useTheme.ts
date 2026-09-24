"use client";

type Theme = "dark" | "light";

const STORAGE_KEY = "gh_theme";

/**
 * Theme access — currently PINNED TO LIGHT.
 *
 * The dark theme is switched off, not deleted. Everything it needs is still
 * here: the `.dark` variable block in globals.css, the `isDark` branches in
 * the landing page and the weather widget, and this hook's shape. Re-enabling
 * it means restoring the stored-value read below and putting the toggle back
 * in the sidebar — roughly the diff that turned it off.
 *
 * Deleting it instead would mean unpicking `isDark ?` ternaries across three
 * components and a hundred-odd lines of CSS, then writing them again from
 * scratch later. "For now" does not justify that.
 *
 * The stored preference is deliberately NOT cleared. Anyone who had chosen
 * dark keeps that choice recorded, and gets it back if the toggle returns.
 * But it is no longer read at startup: with the toggle gone, honouring a saved
 * "dark" would strand those users in a dark interface with no way out of it.
 */
export function useTheme() {
  return {
    theme: "light" as Theme,
    isDark: false,
    /** No-op while the theme is pinned; kept so callers need no changes. */
    toggle: () => {},
    STORAGE_KEY,
  };
}
