import Image from "next/image";
import type { ReactNode } from "react";

/**
 * Split-screen shell shared by /login and /register. Form on the left,
 * a real photo of the deployed hardware on the right — not stock
 * illustration. The showcase panel is a fixed dark treatment regardless
 * of light/dark theme, same as most product auth pages.
 */
export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-surface-base">
      <div className="w-full lg:w-[420px] xl:w-[460px] shrink-0 flex flex-col overflow-y-auto">
        {children}
      </div>

      <div className="hidden lg:block relative flex-1">
        <Image
          src="/Login-image.jpg"
          alt="FarmOS hardware installed at a pepper farm in Kampot, Cambodia"
          fill
          priority
          sizes="(min-width: 1024px) 60vw, 0px"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#001040]/50 via-transparent to-[#001040]/80" />

        <div className="absolute top-8 left-8 flex items-center gap-3">
          <Image src="/me-logo.png" alt="" width={40} height={40} className="object-contain" />
          <span className="text-white font-semibold text-lg [text-shadow:0_1px_8px_rgba(0,0,0,0.5)]">
            FarmOS
          </span>
        </div>

        <div className="absolute bottom-10 left-8 right-8">
          <p className="text-white text-2xl font-semibold leading-snug max-w-md [text-shadow:0_1px_8px_rgba(0,0,0,0.5)]">
            Live monitoring and control for your pepper farms
          </p>
          <p className="text-white/70 text-sm mt-2 [text-shadow:0_1px_8px_rgba(0,0,0,0.5)]">
            Kampot &amp; Kep, Cambodia
          </p>
        </div>
      </div>
    </div>
  );
}
