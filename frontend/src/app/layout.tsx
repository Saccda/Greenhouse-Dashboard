import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/**
 * Fonts, self-hosted.
 *
 * globals.css used to pull these from Google with an @import, which had two
 * problems. It is a render-blocking request to a third party on every cold
 * load, and once the Content-Security-Policy went enforcing it was simply
 * BLOCKED — style-src and font-src both name 'self' — so the whole app
 * silently fell back to system fonts.
 *
 * next/font downloads them at build time and serves them from our own origin,
 * which fixes all of that at once: no third-party request, nothing for the CSP
 * to block, no flash of unstyled text, and no dependency on Google being
 * reachable from wherever this is deployed.
 */
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});
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
    <html lang="en" className={`light ${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        {/* Toggles the theme class rather than assigning className, which
            would wipe the font variable classes next/font puts on <html> and
            leave the whole app on system fonts.

            Pinned to light while the dark option is off. This deliberately
            ignores any stored gh_theme: the preference stays in localStorage
            so it can be honoured again later, but reading it now would strand
            anyone who had chosen dark in a dark interface with no toggle left
            to escape it. The script still runs so theme-color tracks it. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t='light';var e=document.documentElement;e.classList.remove('dark','light');e.classList.add(t);var m=document.querySelector('meta[name=theme-color]');if(m)m.setAttribute('content',t==='dark'?'#001040':'#f2f7f3');})()`,
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
