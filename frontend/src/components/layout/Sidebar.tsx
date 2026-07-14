"use client";
import { useState } from "react";
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
  Sun,
  Moon,
  LogIn,
  LogOut,
  Users,
} from "lucide-react";
import { clsx } from "clsx";
import { useTheme } from "@/hooks/useTheme";
import { useSettings } from "@/hooks/useSettings";
import { useAuth } from "@/hooks/useAuth";

const NAV_ITEMS = [
  { href: "/dashboard",  label: "Dashboard",  icon: LayoutDashboard },
  { href: "/control",    label: "Control",    icon: Sliders         },
  { href: "/analytics",  label: "Analytics",  icon: BarChart3       },
  { href: "/historical", label: "Historical", icon: History         },
  { href: "/alert-log",  label: "Alert Log",  icon: Bell            },
  { href: "/settings",   label: "Settings",   icon: Settings        },
];

function getInitials(name: string): string {
  return (
    name.trim().split(/\s+/).map(w => w[0] ?? "").join("").toUpperCase().slice(0, 2) || "ME"
  );
}

export default function Sidebar() {
  const pathname  = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { toggle, isDark } = useTheme();
  const { settings } = useSettings();
  const { user, logout } = useAuth();

  const initials = getInitials(user?.username || settings.userName || "ME Team");
  const navItems = user?.role === "owner"
    ? [...NAV_ITEMS, { href: "/users", label: "Users", icon: Users }]
    : NAV_ITEMS;

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

      {/* ── User / Settings footer ───────────────────────────── */}
      {user ? (
        <div className={clsx(
          "flex items-center border-t border-gray-100",
          collapsed ? "justify-center p-3" : "px-3 py-3.5 gap-3",
        )}>
          <Link
            href="/settings"
            title={collapsed ? `${user.username} (${user.role})` : undefined}
            className={clsx(
              "flex items-center gap-3 min-w-0 flex-1 rounded-lg transition-colors duration-150 hover:bg-gray-50",
              collapsed && "justify-center",
            )}
          >
            <div className="w-8 h-8 rounded-full bg-sky-600 flex items-center justify-center shrink-0 text-white font-bold text-[11px]">
              {initials}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-gray-700 truncate leading-none">
                  {user.username}
                </p>
                <p className="text-[10px] text-gray-400 truncate mt-0.5 capitalize">{user.role}</p>
              </div>
            )}
          </Link>
          {!collapsed && (
            <button
              onClick={logout}
              title="Log out"
              className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <LogOut size={15} />
            </button>
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
