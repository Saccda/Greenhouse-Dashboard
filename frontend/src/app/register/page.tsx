"use client";
import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * /register now lives inside /login's Sign In / Sign Up toggle.
 * This route stays as a redirect shim so old links/bookmarks keep working.
 */
function RedirectToSignup() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const next = new URLSearchParams(params.toString());
    next.set("mode", "signup");
    router.replace(`/login?${next.toString()}`);
  }, [params, router]);

  return null;
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RedirectToSignup />
    </Suspense>
  );
}
