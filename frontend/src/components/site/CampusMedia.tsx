"use client";
/**
 * CampusMedia — photographs of the PP Campus rig.
 *
 * The rest of the dashboard is numbers. This is the one place that answers
 * "what does the thing actually look like", which matters more than it sounds:
 * a reading of CH2 = ON means little until you have seen the sprinklers it
 * turns on.
 *
 * Campus only, deliberately. It is our own development platform, so its
 * hardware is ours to photograph and document; Kampot is a working farm and its
 * build is not ours to present this way. If a second site ever needs the same
 * treatment, lift PHOTOS/CLIPS into a per-farm registry then — not before.
 */
import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { Expand, X } from "lucide-react";

export interface Photo { src: string; title: string; caption?: string }

const PHOTOS: Photo[] = [
  {
    src: "/campus/campus-front.jpg",
    title: "Front view",
    caption: "The campus rig as installed — controller cabinet, sensor box and spray manifold.",
  },
  {
    src: "/campus/campus-side.jpg",
    title: "Side view",
    caption: "Side elevation showing the frame, piping runs and the tank feeding the spray loop.",
  },
];


export default function CampusMedia() {
  const [lightbox, setLightbox] = useState<Photo | null>(null);

  // Escape closes the lightbox; without it the only way out is the button,
  // which is a poor experience for anyone on a keyboard.
  const onKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") setLightbox(null);
  }, []);
  useEffect(() => {
    if (!lightbox) return;
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, onKey]);

  return (
    <>
      <section className="rounded-2xl border border-surface-border bg-surface-card p-5">
        <h2 className="text-sm font-semibold text-slate-200">The rig</h2>
        <p className="text-xs text-slate-500 mt-1 mb-4">
          Photographs of the installation as built.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PHOTOS.map((p) => (
            <button
              key={p.src}
              type="button"
              onClick={() => setLightbox(p)}
              className="group text-left rounded-xl overflow-hidden ring-1 ring-surface-border bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              <div className="relative aspect-[4/3] bg-black/20">
                <Image
                  src={p.src}
                  alt={p.title}
                  fill
                  sizes="(max-width: 640px) 100vw, 50vw"
                  className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
                <span className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                  <Expand size={13} />
                </span>
              </div>
              <div className="px-4 py-3">
                <p className="text-sm font-medium text-slate-200">{p.title}</p>
                {p.caption && (
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{p.caption}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      </section>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.title}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            aria-label="Close"
            className="absolute top-4 right-4 p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            <X size={18} />
          </button>
          <div className="relative w-full max-w-5xl aspect-[4/3]" onClick={(e) => e.stopPropagation()}>
            <Image
              src={lightbox.src}
              alt={lightbox.title}
              fill
              sizes="100vw"
              className="object-contain"
            />
          </div>
        </div>
      )}
    </>
  );
}
