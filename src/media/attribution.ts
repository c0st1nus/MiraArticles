import type { UnsplashPhoto } from "./unsplash";

/** Markdown credit line per Unsplash attribution guidelines. */
export function formatUnsplashCredit(photo: UnsplashPhoto): string {
  const name = photo.user.name;
  const profile = photo.user.links.html;
  const page = photo.links.html;

  return `Photo by [${name}](${profile}) on [Unsplash](${page})`;
}
