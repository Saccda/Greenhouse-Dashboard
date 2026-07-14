import type { Metadata } from "next";
import "./globals.css";
import SidebarAwareLayout from "@/components/layout/SidebarAwareLayout";
import { AuthProvider } from "@/hooks/useAuth";

export const metadata: Metadata = {
  title: "Farm Monitoring Dashboard",
  description: "Mechanical Engineering — Real-time IoT monitoring for pepper farms",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="light">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('gh_theme')||'light';document.documentElement.className=t;})()`,
          }}
        />
      </head>
      <body className="flex h-screen overflow-hidden">
        <AuthProvider>
          <SidebarAwareLayout>
            {children}
          </SidebarAwareLayout>
        </AuthProvider>
      </body>
    </html>
  );
}
