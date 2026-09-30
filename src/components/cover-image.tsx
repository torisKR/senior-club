"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";

import { getCategoryCoverImage, resolveCoverImage } from "@/lib/cover-image";

type CoverImageProps = Omit<ImageProps, "src" | "alt" | "onError"> & {
  image?: string | null;
  category?: string | null;
  alt: string;
};

/** Public photos can fail independently of a valid API response. */
export function CoverImage({ image, category, alt, ...props }: CoverImageProps) {
  const source = resolveCoverImage(image, category);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const isReference = !image?.trim() || failedSource === source;
  const src = isReference ? getCategoryCoverImage(category) : source;
  return (
    <>
      <Image {...props} src={src} alt={isReference ? "시니어클럽 공용 주제 참고 이미지" : alt} unoptimized={src.startsWith("https://")} onError={() => setFailedSource(source)} />
      {isReference ? <span className="absolute bottom-3 right-3 rounded-lg bg-white/95 px-3 py-1 text-sm font-bold text-[var(--ink)]">주제 참고 이미지</span> : null}
    </>
  );
}
