import type { TierName } from "../config/load";

export interface NewsItem {
  title: string;
  url: string;
  summary: string;
  publishedAt: Date;
  source: string;
  tags: string[];
  tier?: TierName;
  /** Reddit post language for Mira prompt (phase 3). */
  postLang: "en";
}

export interface ScoredItem extends NewsItem {
  score: number;
}

export interface IngestCandidate extends ScoredItem {
  subreddit: string;
}

export interface IngestResult {
  items: ScoredItem[];
  candidate: IngestCandidate | null;
  fetchedCount: number;
  errors: string[];
}
