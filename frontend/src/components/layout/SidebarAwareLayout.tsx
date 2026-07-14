"use client";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";

const NO_SIDEBAR_ROUTES = ["/login", "/register"];

export default function SidebarAwareLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideSidebar = NO_SIDEBAR_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));

  if (hideSidebar) {
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
