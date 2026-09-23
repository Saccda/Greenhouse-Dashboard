import { NextResponse, type NextRequest } from "next/server";

// Mirrors SidebarAwareLayout.tsx's PUBLIC_ROUTES — keep both in sync.
// This is the fast, server-side first line of defense (redirects before any
// page ships); it only checks that the session cookie is present, not that
// it's valid. Real enforcement always happens on the backend, on every API
// call, regardless of what this middleware does.
const PUBLIC_ROUTES = ["/login", "/register"];
const SESSION_COOKIE = "gh_session";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
  if (isPublic || request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("redirect", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next internals and static files under /public.
  // Static assets are excluded by extension, plus /draco/ and /models/ by path.
  // The 3D viewer fetches the model and the Draco decoder itself, and routing
  // those through an auth redirect makes them fail in a way that looks like a
  // broken model rather than a redirect. The decoder's glue file is plain .js,
  // which is why the directory is named rather than the extension — excluding
  // all .js would be far broader than needed.
  matcher: [
    "/((?!_next/static|_next/image|draco|models|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp4|mov|glb|gltf|wasm)$).*)",
  ],
};
