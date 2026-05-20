import { afterEach, describe, expect, test } from "bun:test";
import {
  closeDatabase,
  insertDraft,
  insertPublished,
  listRecentPublishedBodies,
  openDatabase,
  resolveDatabasePath,
} from "./store";

afterEach(() => {
  closeDatabase();
});

describe("pipeline store", () => {
  test("resolveDatabasePath rejects paths outside project root", () => {
    const safe = resolveDatabasePath("file:/etc/passwd");
    expect(safe).toEndWith("data/miraarticles.db");
    expect(safe).not.toBe("/etc/passwd");

    const traversal = resolveDatabasePath("file:../../../etc/passwd");
    expect(traversal).toBe(safe);
  });

  test("resolveDatabasePath resolves relative file URLs under project root", () => {
    const path = resolveDatabasePath("file:./data/miraarticles.db");
    expect(path).toEndWith("data/miraarticles.db");
    expect(path).not.toContain("/etc/");
  });

  test("initSchema and CRUD basics", () => {
    const db = openDatabase(":memory:");
    const draftId = insertDraft(db, {
      status: "validated",
      subreddit: "linux",
      platform: "reddit",
      news: { title: "T", url: "https://x.test", score: 1 },
      body: "First published body unique words alpha",
    });
    insertPublished(db, {
      draftId,
      subreddit: "linux",
      platform: "reddit",
      body: "First published body unique words alpha",
      canonicalUrl: "https://x.test",
    });
    const recent = listRecentPublishedBodies(db, 72);
    expect(recent).toHaveLength(1);
    expect(recent[0]).toContain("unique words");
  });
});
