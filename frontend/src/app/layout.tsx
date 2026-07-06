import type { Metadata } from "next";
import "./globals.css";
import SidebarAwareLayout from "@/components/layout/SidebarAwareLayout";

export const metadata: Metadata = {
  title: "ME Greenhouse Monitor",
  description: "Mechanical Engineering — Real-time IoT monitoring for pepper farms",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('gh_theme')||'dark';document.documentElement.className=t;})()`,
          }}
        />
      </head>
      <body className="flex h-screen overflow-hidden">
        <SidebarAwareLayout>
          {children}
        </SidebarAwareLayout>
      </body>
    </html>
  );
}
