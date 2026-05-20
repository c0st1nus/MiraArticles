/** Normalize URL for 72h dedup (strip tracking, trailing slash, prefer https). */
export function canonicalUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return raw.trim();
  }

  if (url.protocol === "http:") {
    url.protocol = "https:";
  }

  const stripParams = new Set([
    "utm",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "utm_id",
    "fbclid",
    "gclid",
    "mc_cid",
    "mc_eid",
    "ref",
    "ref_src",
    "ref_url",
  ]);

  const kept = new URLSearchParams();
  url.searchParams.forEach((val, key) => {
    const lower = key.toLowerCase();
    if (!stripParams.has(lower) && !lower.startsWith("utm_")) {
      kept.set(key, val);
    }
  });
  url.search = kept.toString() ? `?${kept.toString()}` : "";

  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }

  url.hash = "";
  return url.toString();
}
