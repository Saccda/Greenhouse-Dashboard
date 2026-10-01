import { NextResponse } from "next/server";

/**
 * Collects Content-Security-Policy violation reports.
 *
 * The policy ships report-only, and the plan for enforcing it was "load every
 * page with the console open and see no violations". That relies on somebody
 * watching, remembering, and noticing a line among the noise — and a missed
 * violation means a broken page for whoever opens it next, not for whoever
 * deployed it. This writes them down instead.
 *
 * Deliberately a Next route handler rather than a backend endpoint: the report
 * then goes to the SAME ORIGIN as the page, so there is no CORS preflight to
 * get wrong and no public unauthenticated hole in the API. Browsers send these
 * without credentials, so a backend endpoint would have had to be exempted
 * from auth, which is a worse trade for something only used during a rollout.
 *
 * Output goes to the server log, which in development is the terminal running
 * `npm run dev` and in production is whatever collects stdout.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    // A malformed report is not worth an error response — the browser has
    // nowhere to put one, and a 400 here would just add noise.
    return new NextResponse(null, { status: 204 });
  }

  // Browsers send either the legacy {"csp-report": {...}} shape or the
  // Reporting API's array of {type, body}. Normalise both.
  const reports = Array.isArray(body)
    ? body.map((r) => (r as { body?: unknown }).body ?? r)
    : [(body as { "csp-report"?: unknown })["csp-report"] ?? body];

  for (const r of reports) {
    const v = r as Record<string, unknown>;
    const directive = v["effective-directive"] ?? v["effectiveDirective"] ?? v["violated-directive"] ?? "?";
    const blocked = v["blocked-uri"] ?? v["blockedURL"] ?? "?";
    const doc = v["document-uri"] ?? v["documentURL"] ?? "?";
    // One line per violation, prefixed so it can be grepped out of the log.
    console.warn(`[csp] ${directive} blocked ${blocked}  (on ${doc})`);
  }

  // 204: the browser does not read the response, and returning a body would
  // only cost bandwidth on a report that may fire many times a second.
  return new NextResponse(null, { status: 204 });
}
