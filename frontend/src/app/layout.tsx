import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

/**
 * Fonts, self-hosted FROM THE REPO.
 *
 * globals.css used to pull these from Google with an @import, which the
 * enforcing Content-Security-Policy then blocked. next/font/google fixed that
 * by downloading them at build time -- and introduced a subtler failure.
 *
 * next/font names each font's CSS class after a hash of the CSS Google
 * returns. Vercel's build cache let two halves of one build disagree about
 * that response: the prerendered HTML put class __variable_176161 on <html>,
 * while the stylesheet and the browser bundle used __variable_8b3a0b
 * (production, 11 Nov 2026). No rule defined --font-sans for the class the
 * page actually had, so `font-family: var(--font-sans), ...` was invalid as a
 * whole and EVERY page fell back to the browser's default serif.
 *
 * Shipping the files makes the hash a function of bytes in this repo, the
 * same in every layer and on every build, with no network fetch at build time.
 * Both are the Latin subsets Google served (variable fonts, so one file covers
 * every weight). SIL Open Font License, which permits redistribution.
 */
const inter = localFont({
  src: "./fonts/inter-latin.woff2",
  weight: "400 700",
  variable: "--font-sans",
  display: "swap",
});
const jetbrainsMono = localFont({
  src: "./fonts/jetbrains-mono-latin.woff2",
  weight: "400 600",
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
