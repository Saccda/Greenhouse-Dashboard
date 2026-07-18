import Image from "next/image";
import type { ReactNode } from "react";
import pkg from "../../../package.json";

/**
 * Full-bleed split-screen shell shared by the sign-in/sign-up experience.
 * Logo + form on the left; a real photo of the deployed hardware on the
 * right, not stock illustration. The showcase panel is a fixed dark
 * treatment regardless of light/dark theme, same as most product auth pages.
 */
export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-surface-base">
      <div className="w-full lg:w-[540px] xl:w-[600px] shrink-0 flex flex-col overflow-y-auto">
        <div className="px-10 sm:px-14 pt-10 flex flex-col items-center text-center">
          <div className="flex items-center gap-5">
            <Image src="/me-logo.png" alt="FarmOS" width={64} height={64} className="object-contain shrink-0" />
            <div className="w-px h-12 bg-surface-border shrink-0" />
            <div className="flex items-center gap-4">
              <Image
                src="/soge_logo.png" alt="SOGE — Solar Green Energy Cambodia"
                width={2000} height={749}
                className="h-16 w-auto object-contain shrink-0"
              />
              <Image
                src="/FairsFarmLogo.png" alt="Fair Farms — Organic Spices"
                width={368} height={357}
                className="h-16 w-auto object-contain shrink-0 auth-mono-logo"
              />
            </div>
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mt-3">
            In partnership with Solar Green Energy Cambodia &amp; Fair Farms
          </p>
        </div>

        <div className="flex-1 flex flex-col justify-center px-10 sm:px-14 py-10">
          {children}
        </div>

        <div className="px-10 sm:px-14 pb-6 shrink-0">
          <p className="text-[11px] text-slate-500 font-mono-num">FarmOS v{pkg.version}</p>
        </div>
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
      </div>
    </div>
  );
}
