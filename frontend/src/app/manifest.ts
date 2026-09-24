import type { MetadataRoute } from "next";

/**
 * Web app manifest — what turns the dashboard into an installable app.
 *
 * With this present and served over HTTPS, Chrome and Edge offer "Install"
 * in the address bar. Installing gives the dashboard its own window with no
 * URL bar, no tab strip and its own taskbar entry, which is the "feels like
 * installed software" part. The Windows taskbar is still visible in that
 * window; hiding that needs true fullscreen, which is a user gesture away
 * via the control in the sidebar.
 *
 * display "standalone" rather than "fullscreen": a manifest asking for
 * fullscreen gets it permanently, with no window chrome and no obvious way
 * back, which is right for a wall-mounted panel and wrong for the laptop
 * someone also reads email on. Standalone plus an explicit fullscreen toggle
 * leaves the choice with whoever is looking at it.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Farm Monitoring Dashboard",
    short_name: "FarmOS",
    description:
      "Real-time IoT monitoring and control for the Kampot, Kep and PP Campus greenhouse sites.",
    // Not "/" — that is the public landing page. An installed app should open
    // on the thing you installed it for.
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    // Lets Windows/Chrome draw the app's own content up into the title bar
    // where supported, and fall back cleanly where it is not.
    display_override: ["window-controls-overlay", "standalone"],
    orientation: "any",
    // The splash screen shown while the app window opens. Matched to the LIGHT
    // theme because that is what the app boots into (see layout.tsx); the theme
    // script then updates the live theme-color meta to match the saved choice.
    background_color: "#f2f7f3",
    theme_color: "#f2f7f3",
    categories: ["productivity", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android and Windows crop icons to a circle or squircle. A separate
      // maskable icon keeps the logo inside the safe zone instead of letting
      // the crop eat its edges.
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
