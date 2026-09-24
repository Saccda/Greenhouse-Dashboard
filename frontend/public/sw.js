/**
 * Minimal service worker — registered only to satisfy installability.
 *
 * DELIBERATELY DOES NO CACHING. Chrome wants a fetch handler present before it
 * will offer to install a site, and this provides one that does nothing but
 * let the request through.
 *
 * Caching would be actively harmful here. This dashboard's whole contract is
 * that a reading you can see is a reading that is current — the API returns
 * UNKNOWN rather than a last-known value once a feed goes stale, and the 3D
 * twin lights nothing rather than showing yesterday's relay state. A cache
 * that served yesterday's dashboard shell against today's dead sensor feed
 * would break exactly the guarantee the rest of the system works to keep.
 *
 * If offline support is ever wanted, it should cache the shell only and show
 * an explicit "offline, last loaded HH:MM" banner — never silently serve old
 * readings.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  // No respondWith: the browser handles the request normally.
});
