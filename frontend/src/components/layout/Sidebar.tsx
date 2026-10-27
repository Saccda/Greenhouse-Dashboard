"use client";
import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BarChart3,
  History,
  Settings,
  Sliders,
  Bell,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  LogIn,
  LogOut,
  Info,
  Sparkles,
  Box,
} from "lucide-react";
import { clsx } from "clsx";
import FullscreenToggle from "./FullscreenToggle";
import { useSettings } from "@/hooks/useSettings";
import { useAuth } from "@/hooks/useAuth";
import { useFarmSelection } from "@/hooks/useFarmSelection";
import { useFullscreen } from "@/hooks/useFullscreen";

const NAV_ITEMS = [
  { href: "/overview",   label: "Overview",   icon: Info            },
  { href: "/dashboard",  label: "Dashboard",  icon: LayoutDashboard },
  { href: "/control",    label: "Control",    icon: Sliders         },
  { href: "/analytics",  label: "Analytics",  icon: BarChart3       },
  { href: "/historical", label: "Historical", icon: History         },
  { href: "/alert-log",  label: "Alert Log",  icon: Bell            },
];

// Entries only some roles may see. Insights holds the Stage 1/2 previews, which
// stay developer-only until they are signed off (ML_METHODOLOGY.md §2.6) — the
// owner should not be shown a nav item leading to work in progress. The backend
// rejects the underlying API calls regardless; hiding the link is courtesy, not
// the lock.
const ROLE_NAV_ITEMS: Record<string, typeof NAV_ITEMS> = {
  developer: [{ href: "/insights", label: "Insights", icon: Sparkles }],
};

// Entries that belong to one site only. Site holds the campus system's photographs,
// video and 3D model: campus is our own development platform, whereas Kampot is
// a working farm someone depends on. Showing a Kampot operator a nav item for a
// page that has nothing for them is just clutter.
const FARM_NAV_ITEMS: Record<string, typeof NAV_ITEMS> = {
  campus: [{ href: "/hmi", label: "Digital 3D Model", icon: Box }],
};

function getInitials(name: string): string {
  return (
    name.trim().split(/\s+/).map(w => w[0] ?? "").join("").toUpperCase().slice(0, 2) || "ME"
  );
}

export default function Sidebar() {
  const pathname  = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen]   = useState(false);
  const { settings } = useSettings();
  const { user, logout } = useAuth();
  const { farm, farms } = useFarmSelection();
  const { isFullscreen } = useFullscreen();

  // Collapsing normally leaves a strip of icons, which is right at a desk: the
  // destinations stay one click away. Fullscreen is a different intent — it is
  // chosen to put one screen in front of people and nothing else — so there
  // collapsing takes the sidebar away entirely. The toggle stays on screen, so
  // this is never a door that locks behind you, and leaving fullscreen brings
  // the icons back on its own.
  const hidden = isFullscreen && collapsed;

  // The Dashboard children mirror the dashboard cards exactly, read from the
  // same farm registry, so Kampot is never offered a Soil page for probes it
  // does not have. Ambient and Water are on every farm: every site reports
  // temperature and humidity, and every site uses water whether it is metered
  // or estimated from runtime.
  const thisFarm = farms.find((f) => f.id === farm);
  const sectionChildren = [
    { href: "/dashboard/ambient", label: "Ambient" },
    { href: "/dashboard/water",   label: "Water" },
    ...((thisFarm?.soil_probes?.length ?? 0) > 0
      ? [{ href: "/dashboard/soil", label: "Soil" }] : []),
    ...((thisFarm?.energy?.length ?? 0) > 0
      ? [{ href: "/dashboard/energy", label: "Energy" }] : []),
  ];

  // Opens itself when you are already on one of its pages, so arriving from a
  // dashboard card does not leave the sidebar disagreeing with the content.
  const onSection = pathname.startsWith("/dashboard/");
  const [sectionsOpen, setSectionsOpen] = useState(onSection);
  useEffect(() => { if (onSection) setSectionsOpen(true); }, [onSection]);

  const initials = getInitials(user?.username || settings.userName || "ME Team");

  useEffect(() => { setMenuOpen(false); }, [pathname, collapsed]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <>
    <aside
      className={clsx(
        "relative flex flex-col shrink-0 min-h-screen",
        "bg-surface-card transition-all duration-300 ease-in-out",
        // overflow-hidden only while hidden: the account menu opens to the
        // RIGHT of the collapsed rail, and making it permanent would cut the
        // menu off at the sidebar's edge.
        hidden
          ? "w-0 overflow-hidden"
          : clsx("border-r border-surface-border", collapsed ? "w-[68px]" : "w-56"),
      )}
    >
      {/* Not rendered at all when hidden, rather than hidden with CSS: content
          clipped to zero width is still in the tab order, and tabbing into a
          sidebar nobody can see is worse than the sidebar being gone. */}
      {!hidden && (
      <>

      {/* ── Logo — click to go home ───────────────────────────────
          No bottom border. This rule used to sit at 88px while the header's
          sits at 56px, and two horizontal lines meeting the content area at
          different heights read as a mistake all the way across the top of
          the screen. Matching them would have meant shrinking the logo into a
          56px bar, so the line goes instead: the logo needs no underline to
          be legible as a logo, and one line across the header is cleaner than
          two that agree. */}
      <Link
        href="/"
        aria-label="Go to home"
        className={clsx(
          "group flex items-center justify-center shrink-0",
          collapsed ? "py-4" : "py-5",
        )}
      >
        {/* 56px open, 44px collapsed. The collapsed rail is only 68px wide,
            so a logo much larger than this sits a couple of pixels from each
            edge and reads as overflowing rather than as a logo. */}
        <Image
          src="/me-logo.png"
          alt="Home"
          width={64}
          height={64}
          className={clsx(
            "w-auto object-contain transition-all duration-200 group-hover:scale-110",
            collapsed ? "h-11" : "h-14",
          )}
          priority
        />
      </Link>

      {/* ── Navigation ───────────────────────────────────────── */}
      <nav className="flex-1 py-4 flex flex-col gap-1 px-3">
        {[
          ...NAV_ITEMS,
          ...(FARM_NAV_ITEMS[farm] ?? []),
          ...(ROLE_NAV_ITEMS[user?.role ?? ""] ?? []),
        ].map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          // Dashboard carries the section pages. They had no sidebar entry at
          // all before this — the only way in was clicking a card, so anyone
          // who landed on one had no way back to its siblings.
          const expandable = href === "/dashboard" && !collapsed && sectionChildren.length > 0;

          return (
            <div key={href}>
              <div className="flex items-stretch">
                <Link
                  href={href}
                  title={collapsed ? label : undefined}
                  className={clsx(
                    "flex items-center flex-1 min-w-0 transition-all duration-150",
                    collapsed ? "justify-center p-3 rounded-xl" : "gap-3 px-4 py-2.5",
                    expandable ? "rounded-l-xl" : "rounded-xl",
                    active
                      ? "bg-sky-700 text-white font-semibold shadow-md shadow-sky-500/20"
                      : "text-slate-400 font-medium hover:bg-surface-hover hover:text-slate-100",
                  )}
                >
                  <Icon size={20} className="shrink-0" />
                  {!collapsed && <span className="text-[15px] truncate">{label}</span>}
                </Link>

                {/* A separate control, not part of the link: opening the list
                    and going to the page are different intentions, and one
                    target doing both means you cannot do either deliberately. */}
                {expandable && (
                  <button
                    onClick={() => setSectionsOpen((o) => !o)}
                    aria-label={sectionsOpen ? "Hide sections" : "Show sections"}
                    aria-expanded={sectionsOpen}
                    className={clsx(
                      "px-2 rounded-r-xl transition-colors",
                      active
                        ? "bg-sky-700 text-white"
                        : "text-slate-500 hover:bg-surface-hover hover:text-slate-200",
                    )}
                  >
                    <ChevronUp
                      size={15}
                      className={clsx("transition-transform duration-150", !sectionsOpen && "rotate-180")}
                    />
                  </button>
                )}
              </div>

              {expandable && sectionsOpen && (
                <div className="mt-0.5 ml-[26px] pl-3 border-l border-surface-border flex flex-col">
                  {sectionChildren.map((c) => {
                    const childActive = pathname === c.href;
                    return (
                      <Link
                        key={c.href}
                        href={c.href}
                        className={clsx(
                          "text-[13px] rounded-lg px-3 py-1.5 transition-colors",
                          childActive
                            ? "text-sky-400 font-semibold bg-sky-500/10"
                            : "text-slate-500 hover:text-slate-200 hover:bg-surface-hover",
                        )}
                      >
                        {c.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* ── Full screen ───────────────────────────── */}
      <div className="pb-3 px-3">
        <FullscreenToggle collapsed={collapsed} />
      </div>

      {/* ── Account menu ─────────────────────────────────────── */}
      {user ? (
        <div className="relative border-t border-surface-border">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            title={collapsed ? `${user.username} (${user.role})` : undefined}
            aria-expanded={menuOpen}
            className={clsx(
              "flex items-center w-full transition-colors duration-150 hover:bg-surface-hover",
              collapsed ? "justify-center p-3" : "px-3 py-3.5 gap-3",
            )}
          >
            <div className="w-8 h-8 rounded-full bg-sky-700 flex items-center justify-center shrink-0 text-white font-bold text-[11px]">
              {initials}
            </div>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1 text-left">
                  <p className="text-xs font-semibold text-slate-200 truncate leading-none">
                    {user.username}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate mt-0.5 capitalize">{user.role}</p>
                </div>
                <ChevronUp
                  size={13}
                  className={clsx(
                    "shrink-0 text-slate-400 transition-transform duration-150",
                    !menuOpen && "rotate-180",
                  )}
                />
              </>
            )}
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div
                className={clsx(
                  "absolute z-50 bg-surface-card border border-surface-border rounded-xl shadow-xl py-1.5 overflow-hidden",
                  collapsed ? "left-full ml-2 bottom-0 w-48" : "left-3 right-3 bottom-[calc(100%+6px)]",
                )}
              >
                <Link
                  href="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-slate-300 hover:bg-surface-hover hover:text-slate-100 transition-colors"
                >
                  <Settings size={15} className="shrink-0 text-slate-400" />
                  Settings
                </Link>
                <div className="h-px bg-surface-border my-1" />
                <button
                  onClick={() => { setMenuOpen(false); logout(); }}
                  className="flex items-center w-full text-left gap-2.5 px-3.5 py-2.5 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
                >
                  <LogOut size={15} className="shrink-0" />
                  Log out
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <Link
          href="/login"
          title={collapsed ? "Log in" : undefined}
          className={clsx(
            "flex items-center gap-3 border-t border-surface-border transition-all duration-150 hover:bg-surface-hover",
            collapsed ? "justify-center p-3" : "px-3 py-3.5",
          )}
        >
          <div className="w-8 h-8 rounded-full bg-surface-border flex items-center justify-center shrink-0 text-slate-400">
            <LogIn size={15} />
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-200 truncate leading-none">Log in</p>
              <p className="text-[10px] text-slate-400 truncate mt-0.5">Owner / developer access</p>
            </div>
          )}
        </Link>
      )}

      </>
      )}
    </aside>

    {/* ── Collapse toggle ──────────────────────────────────────────
        Fixed to the viewport rather than pinned to the sidebar's edge,
        because the sidebar can now be zero pixels wide: anchored to that edge
        the button would sit half off the left of the screen, which is the one
        state it absolutely has to be usable in. The left offset tracks the
        width by hand instead, and transitions with it. */}
    <button
      onClick={() => setCollapsed(c => !c)}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      title={hidden ? "Show sidebar" : undefined}
      className={clsx(
        "fixed top-[78px] z-50",
        "flex items-center justify-center w-6 h-6 rounded-full",
        "bg-surface-card border border-surface-border text-slate-400",
        "hover:bg-surface-hover hover:text-slate-200",
        "transition-all duration-300 ease-in-out",
        // Sidebar is 224px / 68px / 0px wide; the button straddles that edge,
        // except when there is no edge left to straddle.
        hidden ? "left-3 shadow-md" : collapsed ? "left-[56px] shadow-sm" : "left-[212px] shadow-sm",
      )}
    >
      {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
    </button>
    </>
  );
}


