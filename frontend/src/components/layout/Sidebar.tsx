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
  Sun,
  Moon,
  LogIn,
  LogOut,
  Info,
  Gauge,
} from "lucide-react";
import { clsx } from "clsx";
import { useTheme } from "@/hooks/useTheme";
import { useSettings } from "@/hooks/useSettings";
import { useAuth } from "@/hooks/useAuth";

const NAV_ITEMS = [
  { href: "/overview",   label: "Overview",   icon: Info            },
  { href: "/dashboard",  label: "Dashboard",  icon: LayoutDashboard },
  { href: "/control",    label: "Control",    icon: Sliders         },
  { href: "/analytics",  label: "Analytics",  icon: BarChart3       },
  { href: "/historical", label: "Historical", icon: History         },
  { href: "/alert-log",  label: "Alert Log",  icon: Bell            },
];

// Campus is a dedicated control interface, not a farm-monitoring dashboard —
// SCADA is its *only* page (see useFarmSelection.ts, which also redirects
// any other page to /scada while campus is selected).
const SCADA_ITEM = { href: "/scada", label: "SCADA", icon: Gauge };

function getInitials(name: string): string {
  return (
    name.trim().split(/\s+/).map(w => w[0] ?? "").join("").toUpperCase().slice(0, 2) || "ME"
  );
}

export default function Sidebar() {
  const pathname  = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen]   = useState(false);
  const { toggle, isDark } = useTheme();
  const { settings } = useSettings();
  const { user, logout } = useAuth();

  const initials = getInitials(user?.username || settings.userName || "ME Team");
  const navItems = settings.defaultFarm === "campus" ? [SCADA_ITEM] : NAV_ITEMS;

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
        "bg-white border-r border-gray-100",
        "transition-all duration-300 ease-in-out",
        collapsed ? "w-[68px]" : "w-56",
      )}
    >

      {/* ── Logo — click to go home ───────────────────────────── */}
      <Link
        href="/"
        aria-label="Go to home"
        className={clsx(
          "group flex items-center justify-center border-b border-gray-100",
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
        {navItems.map(({ href, label, icon: Icon }) => {
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
                  ? "bg-sky-600 text-white font-semibold shadow-md shadow-sky-200"
                  : "text-gray-500 font-medium hover:bg-gray-100 hover:text-gray-800",
              )}
            >
              <Icon size={20} className="shrink-0" />
              {!collapsed && <span className="text-[15px]">{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* ── Theme toggle ─────────────────────────────────────── */}
      <div className="pb-3 px-3">
        <button
          onClick={toggle}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          title={isDark ? "Light Mode" : "Dark Mode"}
          className={clsx(
            "flex items-center w-full rounded-xl font-medium transition-all duration-150",
            collapsed ? "justify-center p-3" : "gap-3 px-4 py-2.5",
            "text-gray-500 hover:bg-gray-100 hover:text-gray-800",
          )}
        >
          {isDark
            ? <Sun  size={18} className="shrink-0 text-amber-500" />
            : <Moon size={18} className="shrink-0 text-indigo-500" />}
          {!collapsed && <span className="text-[13px]">{isDark ? "Light Mode" : "Dark Mode"}</span>}
        </button>
      </div>

      {/* ── Collapse toggle ──────────────────────────────────── */}
      <button
        onClick={() => setCollapsed(c => !c)}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className={clsx(
          "absolute -right-3 top-[78px] z-10",
          "flex items-center justify-center w-6 h-6 rounded-full",
          "bg-white border border-gray-200 text-gray-400",
          "hover:bg-gray-50 hover:text-gray-700",
          "shadow-sm transition-colors duration-150",
        )}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      {/* ── Account menu ─────────────────────────────────────── */}
      {user ? (
        <div className="relative border-t border-gray-100">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            title={collapsed ? `${user.username} (${user.role})` : undefined}
            aria-expanded={menuOpen}
            className={clsx(
              "flex items-center w-full transition-colors duration-150 hover:bg-gray-50",
              collapsed ? "justify-center p-3" : "px-3 py-3.5 gap-3",
            )}
          >
            <div className="w-8 h-8 rounded-full bg-sky-600 flex items-center justify-center shrink-0 text-white font-bold text-[11px]">
              {initials}
            </div>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1 text-left">
                  <p className="text-xs font-semibold text-gray-700 truncate leading-none">
                    {user.username}
                  </p>
                  <p className="text-[10px] text-gray-400 truncate mt-0.5 capitalize">{user.role}</p>
                </div>
                <ChevronUp
                  size={13}
                  className={clsx(
                    "shrink-0 text-gray-300 transition-transform duration-150",
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
                  "absolute z-50 bg-white border border-gray-200 rounded-xl shadow-xl py-1.5 overflow-hidden",
                  collapsed ? "left-full ml-2 bottom-0 w-48" : "left-3 right-3 bottom-[calc(100%+6px)]",
                )}
              >
                <Link
                  href="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                >
                  <Settings size={15} className="shrink-0 text-gray-400" />
                  Settings
                </Link>
                <div className="h-px bg-gray-100 my-1" />
                <button
                  onClick={() => { setMenuOpen(false); logout(); }}
                  className="flex items-center w-full text-left gap-2.5 px-3.5 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
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
            "flex items-center gap-3 border-t border-gray-100 transition-all duration-150 hover:bg-gray-50",
            collapsed ? "justify-center p-3" : "px-3 py-3.5",
          )}
        >
          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center shrink-0 text-gray-500">
            <LogIn size={15} />
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-gray-700 truncate leading-none">Log in</p>
              <p className="text-[10px] text-gray-400 truncate mt-0.5">Owner / developer access</p>
            </div>
          )}
        </Link>
      )}

    </aside>
  );
}
