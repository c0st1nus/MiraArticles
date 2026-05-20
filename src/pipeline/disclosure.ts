import { loadSubredditsConfig } from "../config/load";

export interface DisclosureContext {
  sourceUrl: string;
  subreddit: string;
  platform: "reddit" | "x";
  postLang?: "en";
}

export function shouldIncludeRefLink(subreddit: string): boolean {
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
    const lines = [
      "---",
      "Partially prepared with Mira (AI assistant on Telegram).",
    ];
    if (includeRef) {
      lines.push(`Try: ${ref}`);
      lines.push(
        "The Mira link above is a referral link; I may receive a bonus if you sign up.",
      );
    }
    return lines.join("\n");
  }
  const lines = [
    "---",
    "Частично подготовлено с помощью Mira (AI-ассистент в Telegram).",
  ];
  if (includeRef) {
    lines.push(`Попробовать: ${ref}`);
    lines.push(
      "Ссылка на Mira — реферальная; я могу получить бонус при регистрации.",
    );
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
