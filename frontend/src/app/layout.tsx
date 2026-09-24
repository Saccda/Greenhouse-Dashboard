import type { Metadata, Viewport } from "next";
import "./globals.css";
import SidebarAwareLayout from "@/components/layout/SidebarAwareLayout";
import RegisterServiceWorker from "@/components/pwa/RegisterServiceWorker";
import { AuthProvider } from "@/hooks/useAuth";

export const metadata: Metadata = {
  title: "Farm Monitoring Dashboard",
  description: "Mechanical Engineering — Real-time IoT monitoring for pepper farms",
  // Tells iOS to drop Safari's chrome once added to the home screen. Android
  // and desktop read the equivalent from manifest.ts instead.
  //
  // No `icons` field here on purpose. Next emits <link rel="icon"> from
  // src/app/icon.png and <link rel="apple-touch-icon"> from
  // src/app/apple-icon.png by file convention, but declaring metadata.icons
  // REPLACES that whole set instead of adding to it — an `apple` entry alone
  // removed the favicon from every tab.
  appleWebApp: { capable: true, title: "FarmOS", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  // The window title bar colour in an installed app. The LIGHT value, because
  // that is what the app boots into; the script in <head> rewrites it to the
  // dark surface when the saved theme is dark, so the title bar does not sit
  // pale above a dark blue dashboard.
  themeColor: "#f2f7f3",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="light">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('gh_theme')||'light';document.documentElement.className=t;var m=document.querySelector('meta[name=theme-color]');if(m)m.setAttribute('content',t==='dark'?'#001040':'#f2f7f3');})()`,
          }}
        />
      </head>
      <body className="flex h-screen overflow-hidden">
        <AuthProvider>
          <SidebarAwareLayout>
            {children}
          </SidebarAwareLayout>
        </AuthProvider>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
