"use client";

import { useState } from "react";
import Image, { type ImageProps } from "next/image";

const FALLBACK_SRC =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#F4D976" />
          <stop offset="55%" stop-color="#D4AF37" />
          <stop offset="100%" stop-color="#A9791F" />
        </linearGradient>
      </defs>
      <rect width="200" height="200" fill="#000000" />
      <circle cx="100" cy="100" r="92" fill="none" stroke="url(#g)" stroke-width="3" />
      <text x="100" y="122" font-family="Georgia, serif" font-size="88" font-weight="bold" text-anchor="middle" fill="url(#g)">S</text>
    </svg>
  `);

type BrandImageProps = Omit<ImageProps, "onError">;

export default function BrandImage({ src, alt, ...props }: BrandImageProps) {
  const [imgSrc, setImgSrc] = useState(src);

  return (
    <Image
      {...props}
      src={imgSrc}
      alt={alt}
      onError={() => setImgSrc(FALLBACK_SRC)}
    />
  );
}
