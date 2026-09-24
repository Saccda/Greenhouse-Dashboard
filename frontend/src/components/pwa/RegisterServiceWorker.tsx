"use client";
import { useEffect } from "react";

/**
 * Registers the service worker that makes the dashboard installable.
 *
 * Failures are swallowed on purpose: service workers need a secure context, so
 * this is a no-op over plain HTTP on a LAN address, and a console error there
 * would be noise rather than a problem. The dashboard works identically
 * whether or not registration succeeds — the worker only exists so the browser
 * offers the install prompt.
 */
export default function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
