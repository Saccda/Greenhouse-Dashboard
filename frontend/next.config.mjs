/**
 * Security headers — item 3 of the hardening plan.
 *
 * The Content-Security-Policy ships as REPORT-ONLY on purpose. A strict CSP
 * applied blind to this app would break the 3D viewer, the weather map or the
 * charts, and it would break them for whoever opened the page next rather than
 * for whoever deployed it. Report-only sends violations to the console while
 * changing nothing, so the policy can be corrected against real page loads and
 * then switched to enforcing by renaming one header.
 *
 * To enforce it later: change CSP_HEADER_NAME to "Content-Security-Policy".
 * Do that only after loading every page — Overview, Dashboard, Control,
 * Analytics, Historical, Alert Log, Insights, the operator view and its five
 * tabs — with the console open and seeing no violations.
 */

/** Flip to "Content-Security-Policy" to enforce. */
const CSP_HEADER_NAME = "Content-Security-Policy-Report-Only";

/**
 * Where the browser is allowed to fetch from. Every entry below is something
 * this app genuinely uses; anything not listed is something an injected script
 * would be stopped from reaching.
 */
const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

const CSP = [
  "default-src 'self'",

  // 'unsafe-inline' is required, not laziness: Next injects inline bootstrap
  // and hydration scripts, and layout.tsx carries the theme script that has to
  // run before first paint to avoid a flash. Removing it needs a nonce issued
  // per request from middleware, which is worth doing but is its own change.
  //
  // 'wasm-unsafe-eval' is for the Draco decoder the 3D model is compressed
  // with. Without it the model silently fails to load.
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'`,

  // Tailwind emits a stylesheet, but Leaflet and the charts set inline styles.
  "style-src 'self' 'unsafe-inline'",

  // data: for inlined icons, blob: for anything the 3D canvas or a CSV export
  // hands back, plus the map tile hosts.
  [
    "img-src 'self' data: blob:",
    "https://*.basemaps.cartocdn.com",
    "https://tilecache.rainviewer.com",
    "https://tile.openweathermap.org",
  ].join(" "),

  // The API, and the three weather services the dashboard reads directly.
  [
    "connect-src 'self'",
    API_ORIGIN,
    "https://api.open-meteo.com",
    "https://api.rainviewer.com",
  ].join(" "),

  "font-src 'self' data:",
  "media-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",

  // Clickjacking. SameSite=Lax already stops a cross-site frame from carrying
  // the session cookie, so an embedded copy would be logged out — this is
  // defence in depth, and it is the modern spelling of X-Frame-Options.
  "frame-ancestors 'none'",

  // Stops a plain-HTTP subresource downgrading a secure page.
  "upgrade-insecure-requests",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: CSP_HEADER_NAME, value: CSP },

          // Two years, with preload eligibility. Only meaningful over HTTPS,
          // and harmless over the plain-HTTP LAN address since browsers ignore
          // it there.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },

          // Stops the browser second-guessing a Content-Type, which is how a
          // user-supplied file becomes a script.
          { key: "X-Content-Type-Options", value: "nosniff" },

          // Kept alongside frame-ancestors for browsers that predate CSP 2.
          { key: "X-Frame-Options", value: "DENY" },

          // Send the full URL within our own site, only the origin to others,
          // and nothing at all when leaving HTTPS for HTTP. Farm names and
          // query parameters stay out of other people's logs.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

          // This app asks for none of these. Declaring that means an injected
          // script cannot ask either.
          {
            key: "Permissions-Policy",
            value: [
              "camera=()",
              "microphone=()",
              "geolocation=()",
              "payment=()",
              "usb=()",
              "interest-cohort=()",
              // fullscreen=(self) and not (): the operator view's full-screen
              // control is the whole point of the wall-panel mode.
              "fullscreen=(self)",
            ].join(", "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
