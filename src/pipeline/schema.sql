CREATE TABLE IF NOT EXISTS drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL,
  subreddit TEXT NOT NULL,
  platform TEXT NOT NULL,
  news_json TEXT NOT NULL,
  mira_raw TEXT,
  body TEXT,
  reddit_title TEXT,
  validation_errors_json TEXT
);

CREATE TABLE IF NOT EXISTS published (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  draft_id INTEGER,
  subreddit TEXT NOT NULL,
  platform TEXT NOT NULL,
  body TEXT NOT NULL,
  canonical_url TEXT,
  published_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (draft_id) REFERENCES drafts(id)
);

CREATE TABLE IF NOT EXISTS errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  stage TEXT NOT NULL,
  message TEXT NOT NULL,
  context_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_published_at ON published(published_at);
CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status);
