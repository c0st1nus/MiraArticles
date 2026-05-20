export interface PublishResult {
  ok: boolean;
  postId?: string;
  url?: string;
  error?: string;
  skipped?: boolean;
}

export interface RedditSubmitInput {
  sr: string;
  title: string;
  text: string;
  kind?: "self";
  flairId?: string;
  flairText?: string;
}

export interface XTweetInput {
  text: string;
}

/** Minimal publisher interface — extended in phase 7 */
export interface Publisher {
  publish(input: RedditSubmitInput): Promise<PublishResult>;
}
