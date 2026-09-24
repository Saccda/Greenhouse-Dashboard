/**
 * Measure every text colour in the app against the surfaces it can sit on.
 *
 *   node scripts/audit-contrast.mjs            failures only
 *   node scripts/audit-contrast.mjs --all      every class, passing or not
 *
 * Why a script rather than a look. This codebase has two independent traps that
 * the eye cannot catch: slate-* text is REMAPPED per theme by globals.css, and
 * a colour chosen against the dark surface can land anywhere against the light
 * one. Both have bitten — orange-400 readings measured 6.60:1 dark and 2.26:1
 * light, and were shipped that way for months. The only reliable check is
 * arithmetic, and the only way arithmetic gets re-run is if it is a command.
 *
 * WCAG 2.1: 4.5:1 for body text, 3.0:1 for text at 18.66px bold or 24px plain,
 * and for meaningful non-text marks. This reports against 4.5 and notes where
 * 3.0 would be the applicable bar, since it cannot see the rendered font size.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import twColors from "tailwindcss/colors.js";

const SRC = "src";
const AA_NORMAL = 4.5;
const AA_LARGE = 3.0;

// ── colour maths ───────────────────────────────────────────────────────────
const hex = (h) => {
  h = h.replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const lin = (c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
/** Flatten a partially transparent foreground onto its background. */
const over = (fg, bg, a) => fg.map((c, i) => Math.round(a * c + (1 - a) * bg[i]));

// ── theme tokens, read from globals.css so this cannot drift ──────────────
const css = readFileSync(join(SRC, "app/globals.css"), "utf8");
function themeVars(selector) {
  // The dark block is ":root,\n.dark {", the light block is ".light {".
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`theme block ${selector} not found`);
  const body = css.slice(start, css.indexOf("\n}", start));
  const vars = {};
  for (const [, name, value] of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    vars[name.trim()] = value.trim();
  }
  return vars;
}
const THEME = { dark: themeVars(":root,"), light: themeVars(".light {") };

const triple = (v) => v.split(/\s+/).map(Number);
function surfaces(theme) {
  const v = THEME[theme];
  return {
    "surface-base":  triple(v["surface-base"]),
    "surface-card":  triple(v["surface-card"]),
    "surface-hover": triple(v["surface-hover"]),
  };
}

/** Resolve one text-* class to an RGB triple in the given theme, or null. */
function resolveText(cls, theme) {
  const v = THEME[theme];
  let m;
  if ((m = cls.match(/^text-\[color:var\(--([\w-]+)\)\]$/))) {
    const raw = v[m[1]];
    return raw ? (raw.startsWith("#") ? hex(raw) : triple(raw)) : null;
  }
  if (cls === "text-white") return [255, 255, 255];
  if (cls === "text-black") return [0, 0, 0];
  if ((m = cls.match(/^text-\[(#[0-9a-fA-F]{3,6})\]$/))) return hex(m[1]);
  if ((m = cls.match(/^text-(slate)-(\d{3})$/))) {
    // globals.css remaps slate-* per theme; the raw Tailwind slate is never used.
    const t = v[`t${m[2]}`];
    return t ? triple(t) : null;
  }
  if ((m = cls.match(/^text-([a-z]+)-(\d{2,3})$/))) {
    const fam = twColors[m[1]];
    return fam && fam[m[2]] ? hex(fam[m[2]]) : null;
  }
  return null;
}

// ── scan: pair each text colour with the background declared beside it ────
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const NON_COLOUR = /^text-(xs|sm|base|lg|xl|\d?xl|left|right|center|justify|wrap|nowrap|balance|pretty|ellipsis|clip|transparent|current|inherit)$/;
const TEXT_RE = /\btext-(?:\[[^\]]+\]|[a-z]+-\d{2,3}|white|black)(?:\/\d{1,3})?/g;
const BG_RE   = /\bbg-(?:\[[^\]]+\]|[a-z]+(?:-[a-z]+)?(?:-\d{2,3})?|white|black)(?:\/\d{1,3})?/g;

/** Resolve a bg-* class to RGB, compositing any alpha over `under`. */
function resolveBg(cls, theme, under) {
  const [base, alphaStr] = cls.split("/");
  const alpha = alphaStr ? Number(alphaStr) / 100 : 1;
  const v = THEME[theme];
  let rgb = null, m;
  if ((m = base.match(/^bg-surface(?:-([a-z]+))?$/))) {
    const key = `surface-${m[1] || "base"}`;
    if (v[key]) rgb = triple(v[key]);
  } else if (base === "bg-white") rgb = [255, 255, 255];
  else if (base === "bg-black") rgb = [0, 0, 0];
  else if ((m = base.match(/^bg-([a-z]+)-(\d{2,3})$/))) {
    const fam = twColors[m[1]];
    if (fam && fam[m[2]]) rgb = hex(fam[m[2]]);
  }
  if (!rgb) return null;
  return alpha < 1 ? over(rgb, under, alpha) : rgb;
}

/**
 * Class contexts. A className is one string literal, so a text colour and the
 * background it sits on almost always appear together in the same literal —
 * "bg-amber-500/10 text-amber-400" is the pattern this codebase uses for every
 * tinted callout. Pairing inside the literal is what stops the audit from
 * reporting those as failures against a surface they never touch.
 */
const findings = new Map();   // key -> {cls, bgLabel, theme, ratio, files:Set, assumed}
function record(cls, bgLabel, bgOf, files, assumed) {
  let worst = { ratio: Infinity };
  for (const theme of ["dark", "light"]) {
    const [base, alphaStr] = cls.split("/");
    const alpha = alphaStr ? Number(alphaStr) / 100 : 1;
    const bg = bgOf(theme);
    if (!bg) continue;
    const fg0 = resolveText(base, theme);
    if (!fg0) continue;
    const fg = alpha < 1 ? over(fg0, bg, alpha) : fg0;
    const ratio = contrast(fg, bg);
    if (ratio < worst.ratio) worst = { ratio, theme };
  }
  if (worst.ratio === Infinity) return;
  const key = `${cls}|${bgLabel}`;
  const prev = findings.get(key);
  if (prev) { for (const f of files) prev.files.add(f); return; }
  findings.set(key, { cls, bgLabel, ...worst, files: new Set(files), assumed });
}

for (const file of walk(SRC)) {
  const src = readFileSync(file, "utf8");
  const rel = relative(SRC, file).split(String.fromCharCode(92)).join("/");
  // Every quoted string and template chunk is a candidate class list.
  for (const [literal] of src.matchAll(/"[^"\n]*"|`[^`]*`/g)) {
    const texts = [...literal.matchAll(TEXT_RE)].map((m) => m[0]).filter((c) => !NON_COLOUR.test(c));
    if (!texts.length) continue;
    const bgs = [...literal.matchAll(BG_RE)].map((m) => m[0])
      .filter((c) => resolveBg(c, "dark", [0, 0, 0]));
    for (const cls of texts) {
      if (bgs.length) {
        for (const bg of bgs) {
          record(cls, bg, (theme) => resolveBg(bg, theme, surfaces(theme)["surface-card"]), [rel], false);
        }
      } else {
        // No background beside it: it inherits a container. surface-card is by
        // far the most common one, so that is the assumption, flagged as such.
        record(cls, "surface-card*", (theme) => surfaces(theme)["surface-card"], [rel], true);
      }
    }
  }
}

// ── report ─────────────────────────────────────────────────────────────────
const showAll = process.argv.includes("--all");
const rows = [...findings.values()].sort((a, b) => a.ratio - b.ratio);
const failing = rows.filter((r) => r.ratio < AA_NORMAL);
const print = showAll ? rows : failing;

console.log(`${rows.length} text-on-background pairs across ${walk(SRC).length} files.`);
console.log(`Ratio is the WORSE of the two themes. * = background assumed, not declared beside the text.\n`);
console.log("  ratio  bar   text                        on background            theme  used in");
for (const r of print) {
  const bar = r.ratio >= AA_NORMAL ? "AA " : r.ratio >= AA_LARGE ? "lg " : "FAIL";
  const files = [...r.files].slice(0, 2).join(", ") + (r.files.size > 2 ? ` +${r.files.size - 2}` : "");
  console.log(`  ${r.ratio.toFixed(2).padStart(5)}  ${bar}  ${r.cls.padEnd(26)} ${r.bgLabel.padEnd(24)} ${r.theme.padEnd(6)} ${files}`);
}
console.log(`\n${failing.length} of ${rows.length} pairs fall below ${AA_NORMAL}:1 in at least one theme.`);
console.log(`"lg" clears ${AA_LARGE}:1 — enough for large or bold text and for icons, not for body copy.`);
