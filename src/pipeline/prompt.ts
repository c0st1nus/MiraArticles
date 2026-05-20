import type { IngestCandidate } from "../news/types";
import type { Platform } from "./types";

export interface BuildMiraPromptOpts {
  platform: Platform;
  subreddit: string;
}

function langForPlatform(platform: Platform, postLang: "en"): string {
  if (platform === "reddit") return postLang === "en" ? "English" : postLang;
  return postLang === "en" ? "English" : postLang;
}

export function buildMiraPrompt(
  candidate: IngestCandidate,
  opts: BuildMiraPromptOpts,
): string {
  const lang = langForPlatform(opts.platform, candidate.postLang);
  const platformLabel = opts.platform === "reddit" ? "Reddit" : "X";
  const subLabel =
    opts.platform === "reddit" ? `r/${opts.subreddit}` : `@${opts.subreddit}`;

  const lengthHint =
    opts.platform === "reddit"
      ? "150–400 words for Reddit"
      : "up to 240 characters for the main tweet text (+ optional thread)";

  return `You help write a post for ${platformLabel} (${subLabel}).

News:
- Title: ${candidate.title}
- URL: ${candidate.url}
- Summary: ${candidate.summary || "(no summary — use title only, do not invent facts)"}

Requirements:
- Language: ${lang}
- Tone: informative, no clickbait
- ${lengthHint}
- Do not invent facts beyond the summary
- Do NOT add a source link, referral link, or AI disclaimer at the end (the pipeline adds those)

Return only the post text.`;
}
