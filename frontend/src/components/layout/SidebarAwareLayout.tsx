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

export default function SidebarAwareLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();

  const isPublic = PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
  const needsAuth = !isPublic && !loading && !user;

  useEffect(() => {
    if (needsAuth) router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
  }, [needsAuth, pathname, router]);

  if (isPublic) {
    return <div className="flex-1 flex flex-col min-w-0 overflow-hidden">{children}</div>;
  }

  if (loading || !user) {
    return (
      <>
        <Sidebar />
        <div className="flex-1 flex items-center justify-center min-w-0 overflow-hidden text-sm text-slate-500">
          {loading ? "Loading…" : "Redirecting to sign in…"}
        </div>
      </>
    );
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
