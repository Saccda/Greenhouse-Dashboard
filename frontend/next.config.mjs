/**
 * Security headers — item 3 of the hardening plan.
 *
 * The Content-Security-Policy shipped report-only first, because a strict
 * policy applied blind would have broken the 3D viewer, the weather map or the
 * charts — and broken them for whoever opened the page next, not for whoever
 * deployed it. It is now enforcing, on the evidence of a reporting pass that
 * collected nothing across thirteen routes.
 *
 * Anything added later that fetches from a new host needs a line here, and
 * will announce itself in the log as "[csp] <directive> blocked <url>".
 */

/**
 * ENFORCING. Switched over after a reporting pass that collected zero
 * violations across thirteen routes — every dashboard page, all five operator
 * tabs, and crucially /historical, whose weather map pulls tiles from three
 * separate hosts and was the likeliest thing to be blocked.
 *
 * Reporting stays switched on alongside enforcement: a violation is now both
 * blocked AND logged, so anything this policy gets wrong in production leaves
 * a line in the log rather than only a broken page.
 *
 * Set back to "Content-Security-Policy-Report-Only" to loosen it again
 * without risk while diagnosing.
 */
const CSP_HEADER_NAME = "Content-Security-Policy";

/**
 * Where the browser is allowed to fetch from. Every entry below is something
 * this app genuinely uses; anything not listed is something an injected script
 * would be stopped from reaching.
 */
/**
 * The API origins the page may talk to.
 *
 * Both the build-time value AND the known production host, deliberately. The
 * CSP is baked at build time from NEXT_PUBLIC_API_URL, which on Vercel comes
 * from the dashboard rather than from a file in the repo. If it were ever
 * unset or wrong for a build, an enforcing policy would allow only
 * http://localhost:5000 and block every API call in production — a total
 * outage caused by a missing environment variable, discovered by users.
 *
 * Naming the real host as well costs nothing: it is where the API already is,
 * so allowing it grants no access that is not already intended, and it means
 * the policy cannot be the thing that breaks a deploy.
 */
const PRODUCTION_API = "https://api.farmos-mechanicalengineering.com";
const API_ORIGINS = [
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000",
  PRODUCTION_API,
].filter((v, i, a) => a.indexOf(v) === i);

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
    ...API_ORIGINS,
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

  // Where violations go. Same origin, so no CORS preflight and no public
  // unauthenticated endpoint on the API. report-uri is deprecated but is what
  // most browsers still honour; report-to is the replacement and is sent
  // alongside via the Reporting-Endpoints header below.
  "report-uri /api/csp-report",
  "report-to csp",
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

          // The modern half of the reporting pair. Browsers that have dropped
          // report-uri use this; those that have not use both, which is
          // harmless — a duplicate report costs a log line.
          { key: "Reporting-Endpoints", value: 'csp="/api/csp-report"' },

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
