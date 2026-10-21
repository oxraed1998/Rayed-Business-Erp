"use client";
import { useState } from "react";

/** Remote listing photo that removes itself if the provider no longer serves it. */
export function SafeImg(props: React.ImgHTMLAttributes<HTMLImageElement>) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  return <img referrerPolicy="no-referrer" {...props} onError={() => setFailed(true)} />;
}
