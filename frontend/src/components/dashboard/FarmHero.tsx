"use client";
/**
 * The photograph the Dashboard is arranged around.
 *
 * It is the farm's OWN photo, picked by the same map the landing page uses, so
 * selecting campus shows the campus rig rather than a stock greenhouse or
 * somebody else's pepper field. A hero image that is not of your farm is
 * decoration; one that is, is orientation.
 *
 * The overlay carries only what the photograph itself is for: which farm this
 * is, whether the feed is alive, and which relays are running right now. Air
 * temperature and humidity used to be printed here too and are tiles now — a
 * picture with two numbers repeated directly beneath it was the duplication
 * this layout kept growing back. The mockup this follows had an
 * "80% Good Growth" badge over the crop, which is computer vision this system
 * does not have — a confident number with nothing behind it is worse on a
 * photograph than anywhere else, because it looks like an observation.
 *
 * A farm whose photo is missing gets the cards and no gap: the image is the
 * anchor, not the content.
 */
import { useState } from "react";
import Image from "next/image";
import { MapPin, Wifi, WifiOff } from "lucide-react";

import type { Farm, LatestResponse } from "@/types";

const FARM_PHOTO: Record<string, string> = {
  campus: "/campus/campus-right.jpg",
};
const DEFAULT_PHOTO = "/farm.jpg";

export default function FarmHero({
  farm, latest, isOffline,
}: {
  farm?: Farm;
  latest?: LatestResponse;
  isOffline: boolean;
}) {
  const src = (farm && FARM_PHOTO[farm.id]) ?? DEFAULT_PHOTO;
  // Which source failed, not a boolean: a boolean stays true after the farm
  // changes, so one site with a missing photo would hide every other site's.
  const [failed, setFailed] = useState<string | null>(null);
  const broken = failed === src;

  const running = (latest?.relays ?? []).filter((r) => r.state === "ON");

  return (
    <section className="relative rounded-xl overflow-hidden border border-surface-border bg-surface-card h-full min-h-[22rem] lg:min-h-[34rem]">
      {!broken ? (
        <Image
          src={src}
          alt={farm ? `${farm.display_name}, ${farm.location}` : "Farm"}
          fill
          sizes="(max-width: 1024px) 100vw, 55vw"
          className="object-cover"
          priority
          onError={() => setFailed(src)}
        />
      ) : (
        <div className="absolute inset-0 bg-surface-hover" />
      )}

      {/* Dark only at the edges where text sits, so the photograph is still a
          photograph rather than a textured background. */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-black/35" />

      <div className="relative h-full flex flex-col justify-between p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold text-white leading-tight drop-shadow">
              {farm?.display_name ?? "Farm"}
            </h2>
            {farm?.location && (
              <p className="flex items-center gap-1 text-[12px] text-white/80 mt-0.5 drop-shadow">
                <MapPin size={11} className="shrink-0" />
                {farm.location}
              </p>
            )}
          </div>
          <span
            className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full backdrop-blur-sm ${
              isOffline ? "bg-amber-500/90 text-amber-950" : "bg-emerald-500/90 text-emerald-950"
            }`}
          >
            {isOffline ? <WifiOff size={11} /> : <Wifi size={11} />}
            {isOffline ? "Offline" : "Live"}
          </span>
        </div>

        {/* Air temperature and humidity used to sit here. They are tiles now;
            a photograph restating two numbers printed directly beneath it is
            the duplication this layout keeps trying to grow back. What is left
            is what only the photo can say: which farm, and what is physically
            running in it.

            Named, not counted: "2 running" does not tell you whether the thing
            running is the one you would expect at this hour. */}
        {!isOffline && running.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {running.map((r) => (
              <span
                key={r.key}
                className="text-[11px] px-2 py-0.5 rounded-full bg-white/20 text-white backdrop-blur-sm"
              >
                {r.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
