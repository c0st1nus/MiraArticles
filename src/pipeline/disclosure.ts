import { loadSubredditsConfig } from "../config/load";

export interface DisclosureContext {
  sourceUrl: string;
  subreddit: string;
  platform: "reddit" | "x";
  postLang?: "en";
}

export function shouldIncludeRefLink(subreddit: string): boolean {
  if (process.env.DISCLOSURE_ALWAYS_REF === "true") {
    return true;
  }
  const cfg = loadSubredditsConfig();
  const low = cfg.risk_promo.low ?? [];
  const medium = cfg.risk_promo.medium ?? [];
  return low.includes(subreddit) || medium.includes(subreddit);
}

function refUrl(): string {
  return (
    process.env.DISCLOSURE_REF_URL?.trim() ||
    "https://t.me/mira?start=ref_1239398217"
  );
}

function sourceLine(url: string, en: boolean): string {
  return en ? `Source: ${url}` : `Источник: ${url}`;
}

function aiDisclaimerBlock(en: boolean, includeRef: boolean): string {
  const ref = refUrl();
  if (en) {
    const lines = ["---", "*Disclosure:* AI-assisted post (drafted with Mira on Telegram)."];
    if (includeRef) {
      lines.push(`Mira (referral): ${ref}`);
      lines.push("*Referral link* — I may receive a bonus if you sign up.");
    }
    return lines.join("\n");
  }
  const lines = [
    "---",
    "*Дисклеймер:* пост с AI-assist (черновик через Mira в Telegram).",
  ];
  if (includeRef) {
    lines.push(`Mira (реф.): ${ref}`);
    lines.push("*Реферальная ссылка* — возможен бонус при регистрации.");
  }
  return lines.join("\n");
}

export function applyDisclosure(body: string, ctx: DisclosureContext): string {
  const trimmed = body.trim();
  const en = ctx.postLang === "en";
  const includeRef = shouldIncludeRefLink(ctx.subreddit);
  const footer = [
    sourceLine(ctx.sourceUrl, en),
    aiDisclaimerBlock(en, includeRef),
  ].join("\n\n");
  if (!trimmed) return footer;
  return `${trimmed}\n\n${footer}`;
}
