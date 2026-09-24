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
  Camera,
} from "lucide-react";
import { clsx } from "clsx";
import FullscreenToggle from "./FullscreenToggle";
import { useSettings } from "@/hooks/useSettings";
import { useAuth } from "@/hooks/useAuth";
import { useFarmSelection } from "@/hooks/useFarmSelection";

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

// Entries that belong to one site only. Site holds the campus rig's photographs,
// video and 3D model: campus is our own development platform, whereas Kampot is
// a working farm someone depends on. Showing a Kampot operator a nav item for a
// page that has nothing for them is just clutter.
const FARM_NAV_ITEMS: Record<string, typeof NAV_ITEMS> = {
  campus: [{ href: "/site", label: "Site", icon: Camera }],
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
  const { farm } = useFarmSelection();

  const initials = getInitials(user?.username || settings.userName || "ME Team");

  useEffect(() => { setMenuOpen(false); }, [pathname, collapsed]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <aside
      className={clsx(
        "relative flex flex-col shrink-0 min-h-screen",
        "bg-surface-card border-r border-surface-border",
        "transition-all duration-300 ease-in-out",
        collapsed ? "w-[68px]" : "w-56",
      )}
    >

      {/* ── Logo — click to go home ───────────────────────────── */}
      <Link
        href="/"
        aria-label="Go to home"
        className={clsx(
          "group flex items-center justify-center border-b border-surface-border",
          collapsed ? "py-4" : "py-5",
        )}
      >
        <Image
          src="/me-logo.png"
          alt="Home"
          width={48}
          height={48}
          className="object-contain transition-transform duration-200 group-hover:scale-110"
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
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={clsx(
                "flex items-center rounded-xl transition-all duration-150",
                collapsed ? "justify-center p-3" : "gap-3 px-4 py-2.5",
                active
                  ? "bg-sky-700 text-white font-semibold shadow-md shadow-sky-500/20"
                  : "text-slate-400 font-medium hover:bg-surface-hover hover:text-slate-100",
              )}
            >
              <Icon size={20} className="shrink-0" />
              {!collapsed && <span className="text-[15px]">{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* ── Full screen ───────────────────────────── */}
      <div className="pb-3 px-3">
        <FullscreenToggle collapsed={collapsed} />
      </div>

      {/* ── Collapse toggle ──────────────────────────────────── */}
      <button
        onClick={() => setCollapsed(c => !c)}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className={clsx(
          "absolute -right-3 top-[78px] z-10",
          "flex items-center justify-center w-6 h-6 rounded-full",
          "bg-surface-card border border-surface-border text-slate-400",
          "hover:bg-surface-hover hover:text-slate-200",
          "shadow-sm transition-colors duration-150",
        )}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

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

    </aside>
  );
}
