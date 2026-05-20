import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import type { PipelineDraft } from "./types";

const projectRoot = join(import.meta.dir, "../..");
const defaultDatabasePath = join(projectRoot, "data", "miraarticles.db");

function isUnderProjectRoot(resolvedPath: string): boolean {
  const root = resolve(projectRoot);
  const path = resolve(resolvedPath);
  return path === root || path.startsWith(`${root}/`);
}

export function resolveDatabasePath(
  databaseUrl = process.env.DATABASE_URL ?? "file:./data/miraarticles.db",
): string {
  if (!databaseUrl.startsWith("file:")) {
    return defaultDatabasePath;
  }
  const filePath = databaseUrl.slice(5).trim();
  if (!filePath) {
    return defaultDatabasePath;
  }
  const candidate = filePath.startsWith("/")
    ? resolve(filePath)
    : resolve(join(projectRoot, filePath));
  return isUnderProjectRoot(candidate) ? candidate : defaultDatabasePath;
}

function schemaSql(): string {
  return readFileSync(join(import.meta.dir, "schema.sql"), "utf8");
}

let dbSingleton: Database | null = null;

export function openDatabase(path?: string): Database {
  const dbPath = path ?? resolveDatabasePath();
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const db = new Database(dbPath);
  initSchema(db);
  return db;
}

export function getDatabase(): Database {
  if (!dbSingleton) {
    dbSingleton = openDatabase();
  }
  return dbSingleton;
}

export function resetDatabase(path?: string): Database {
  closeDatabase();
  dbSingleton = openDatabase(path ?? resolveDatabasePath());
  return dbSingleton;
}

export function initSchema(db: Database): void {
  db.exec(schemaSql());
}

export interface DraftRow {
  id: number;
  created_at: string;
  status: string;
  subreddit: string;
  platform: string;
  news_json: string;
  mira_raw: string | null;
  body: string | null;
  reddit_title: string | null;
  validation_errors_json: string | null;
}

export interface InsertDraftInput {
  status: string;
  subreddit: string;
  platform: string;
  news: Record<string, unknown>;
  miraRaw?: string;
  body?: string;
  redditTitle?: string;
  validationErrors?: string[];
}

export function insertDraft(db: Database, input: InsertDraftInput): number {
  const stmt = db.prepare(`
    INSERT INTO drafts (status, subreddit, platform, news_json, mira_raw, body, reddit_title, validation_errors_json)
    VALUES ($status, $subreddit, $platform, $news_json, $mira_raw, $body, $reddit_title, $validation_errors_json)
  `);
  const result = stmt.run({
    $status: input.status,
    $subreddit: input.subreddit,
    $platform: input.platform,
    $news_json: JSON.stringify(input.news),
    $mira_raw: input.miraRaw ?? null,
    $body: input.body ?? null,
    $reddit_title: input.redditTitle ?? null,
    $validation_errors_json: input.validationErrors
      ? JSON.stringify(input.validationErrors)
      : null,
  });
  return Number(result.lastInsertRowid);
}

export function updateDraft(
  db: Database,
  id: number,
  patch: Partial<InsertDraftInput>,
): void {
  const row = db.prepare("SELECT * FROM drafts WHERE id = ?").get(id) as DraftRow | null;
  if (!row) throw new Error(`draft ${id} not found`);

  const status = patch.status ?? row.status;
  const miraRaw = patch.miraRaw !== undefined ? patch.miraRaw : row.mira_raw;
  const body = patch.body !== undefined ? patch.body : row.body;
  const redditTitle = patch.redditTitle !== undefined ? patch.redditTitle : row.reddit_title;
  const validationErrors =
    patch.validationErrors !== undefined
      ? patch.validationErrors
      : row.validation_errors_json
        ? (JSON.parse(row.validation_errors_json) as string[])
        : undefined;

  db.prepare(`
    UPDATE drafts SET
      status = $status,
      mira_raw = $mira_raw,
      body = $body,
      reddit_title = $reddit_title,
      validation_errors_json = $validation_errors_json
    WHERE id = $id
  `).run({
    $id: id,
    $status: status,
    $mira_raw: miraRaw ?? null,
    $body: body ?? null,
    $reddit_title: redditTitle ?? null,
    $validation_errors_json: validationErrors ? JSON.stringify(validationErrors) : null,
  });
}

export function getDraft(db: Database, id: number): DraftRow | null {
  return db.prepare("SELECT * FROM drafts WHERE id = ?").get(id) as DraftRow | null;
}

export function listRecentPublishedBodies(db: Database, withinHours = 72): string[] {
  const cutoff = new Date(Date.now() - withinHours * 60 * 60 * 1000).toISOString();
  const rows = db
    .prepare("SELECT body FROM published WHERE published_at >= ? ORDER BY published_at DESC")
    .all(cutoff) as Array<{ body: string }>;
  return rows.map((r) => r.body);
}

export function insertPublished(
  db: Database,
  input: {
    draftId?: number;
    subreddit: string;
    platform: string;
    body: string;
    canonicalUrl?: string;
  },
): number {
  const result = db
    .prepare(`
      INSERT INTO published (draft_id, subreddit, platform, body, canonical_url)
      VALUES ($draft_id, $subreddit, $platform, $body, $canonical_url)
    `)
    .run({
      $draft_id: input.draftId ?? null,
      $subreddit: input.subreddit,
      $platform: input.platform,
      $body: input.body,
      $canonical_url: input.canonicalUrl ?? null,
    });
  return Number(result.lastInsertRowid);
}

export function logError(
  db: Database,
  stage: string,
  message: string,
  context?: Record<string, unknown>,
): number {
  const result = db
    .prepare(`
      INSERT INTO errors (stage, message, context_json)
      VALUES ($stage, $message, $context_json)
    `)
    .run({
      $stage: stage,
      $message: message,
      $context_json: context ? JSON.stringify(context) : null,
    });
  return Number(result.lastInsertRowid);
}

export function draftRowToPipelineDraft(row: DraftRow): PipelineDraft {
  const news = JSON.parse(row.news_json) as Record<string, unknown>;
  const errors = row.validation_errors_json
    ? (JSON.parse(row.validation_errors_json) as string[])
    : [];
  return {
    id: row.id,
    createdAt: row.created_at,
    title: String(news.title ?? ""),
    url: String(news.url ?? ""),
    summary: String(news.summary ?? ""),
    publishedAt: new Date(String(news.publishedAt ?? Date.now())),
    source: String(news.source ?? ""),
    tags: Array.isArray(news.tags) ? (news.tags as string[]) : [],
    score: Number(news.score ?? 0),
    subreddit: row.subreddit,
    postLang: "en",
    tier: news.tier as string | undefined,
    miraRawText: row.mira_raw ?? undefined,
    body: row.body ?? undefined,
    redditTitle: row.reddit_title ?? undefined,
    platform: row.platform as PipelineDraft["platform"],
    status: row.status as PipelineDraft["status"],
    errors,
  };
}

export function newsSnapshotFromDraft(draft: PipelineDraft): Record<string, unknown> {
  return {
    title: draft.title,
    url: draft.url,
    summary: draft.summary,
    publishedAt: draft.publishedAt.toISOString(),
    source: draft.source,
    tags: draft.tags,
    score: draft.score,
    tier: draft.tier,
    postLang: draft.postLang,
  };
}

export function updateDraftStatus(
  db: Database,
  id: number,
  status: string,
): void {
  db.prepare("UPDATE drafts SET status = $status WHERE id = $id").run({
    $id: id,
    $status: status,
  });
}

/** Close singleton (tests). */
export function closeDatabase(): void {
  if (dbSingleton) {
    dbSingleton.close();
    dbSingleton = null;
  }
}
