import { redirect } from "next/navigation";

/**
 * /site — kept only to forward to the operator view.
 *
 * This page used to hold the 3D viewer behind an ordinary dashboard frame.
 * The viewer is now the operator view's landing page, which is a better home
 * for it: full width, no sidebar, and the alarm strip and state values
 * already on screen around it.
 *
 * The route stays as a redirect rather than being deleted so that anything
 * already pointing here — a bookmark, a link in a document, a browser's
 * autocomplete — still arrives somewhere sensible instead of a 404.
 */
export default function SiteRedirect() {
  redirect("/hmi");
}
