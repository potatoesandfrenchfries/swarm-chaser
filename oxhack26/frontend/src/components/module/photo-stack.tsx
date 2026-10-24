"use client";

import Image from "next/image";

/**
 * Two polaroid-style frames, the back one tilted. On hover the front frame
 * scales and rotates slightly (CSS only). Without `src` it renders grey
 * placeholder frames so the layout is visible before you have photos.
 */
export function PhotoStack({ src, alt }: { src?: string; alt: string }) {
  const photo = (
    <div className="relative aspect-[4/3] w-full overflow-hidden bg-foreground/10">
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(min-width: 1024px) 560px, 100vw"
          className="object-cover"
        />
      ) : (
        <div className="label flex h-full items-center justify-center text-muted-foreground">
          [PHOTO]
        </div>
      )}
    </div>
  );

  return (
    <figure className="group relative w-full max-w-[560px]">
      <div className="absolute inset-0 z-0 translate-x-4 translate-y-2 -rotate-[5deg] bg-foreground/15 p-2 pb-12 transition-transform duration-300 group-hover:-rotate-[8deg] group-hover:scale-[1.02]">
        {photo}
      </div>
      <div className="relative z-10 bg-muted p-2 pb-12 transition-transform duration-300 group-hover:rotate-2 group-hover:scale-105">
        {photo}
      </div>
    </figure>
  );
}
