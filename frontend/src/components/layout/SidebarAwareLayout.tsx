"use client";
import Sidebar from "./Sidebar";

export default function SidebarAwareLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
      </div>
    </>
  );
}
