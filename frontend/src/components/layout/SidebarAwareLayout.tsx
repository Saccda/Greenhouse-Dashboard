"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import { useAuth } from "@/hooks/useAuth";

// The only routes reachable without a signed-in account. Everything else —
// including the landing page and the Overview page — requires signing up
// first; once signed in, every page is viewable, but write actions (setpoint
// control, saving settings) stay gated behind owner/developer approval.
const PUBLIC_ROUTES = ["/login", "/register"];

// Routes that take the whole window, with no sidebar.
//
// An HMI is read from across a room, often on a panel that is only ever
// showing this one screen. Navigation chrome is dead pixels there: it competes
// with the process graphic for the area that matters and it is not what anyone
// is standing in front of the screen to use. The page carries its own way back
// in the top bar, so the sidebar is not the only exit.
const FULL_BLEED_ROUTES = ["/hmi"];

export default function SidebarAwareLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();

  const isPublic = PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
  const isFullBleed = FULL_BLEED_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
  const needsAuth = !isPublic && !loading && !user;

  useEffect(() => {
    if (needsAuth) router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
  }, [needsAuth, pathname, router]);

  if (isPublic) {
    return <div className="flex-1 flex flex-col min-w-0 overflow-hidden">{children}</div>;
  }

  if (loading || !user) {
    // The full-bleed check comes FIRST here too. Without it a full-screen
    // route flashed the sidebar for as long as the auth check took, then threw
    // it away — a visible jump on the one screen that is meant to be a fixed
    // panel.
    const body = (
      <div className="flex-1 flex items-center justify-center min-w-0 overflow-hidden text-sm text-slate-500">
        {loading ? "Loading…" : "Redirecting to sign in…"}
      </div>
    );
    return isFullBleed ? body : <><Sidebar />{body}</>;
  }

  // Full-bleed routes still require auth — they just render without the
  // sidebar once past it.
  if (isFullBleed) {
    return <div className="flex-1 flex flex-col min-w-0 overflow-hidden">{children}</div>;
  }

  return (
    <>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
      </div>
    </>
  );
}
