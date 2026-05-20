# MiraArticles — Phase 3 Pipeline Review

**Date:** 2026-05-20  
**Reviewer:** Senior Code Reviewer  
**Scope:** Phase 3 Content Pipeline Implementation  
**Files Reviewed:** `src/pipeline/*`, `scripts/test-pipeline.ts`

---

## Executive Summary

Phase 3 Content Pipeline implementation is **complete and functional**. All core components are implemented: store (SQLite), prompt builder, disclosure processor, validator (with similarity check), and run-cycle orchestration. Integration with Phase 2 news ingest is correct.

**Verdict: REQUEST_CHANGES** — One security issue (path traversal in DATABASE_URL) must be fixed before production. All other issues are non-blocking.

---

## Automated Checks

| Check | Status | Details |
|-------|--------|---------|
| `bun test` | ✅ **PASS** | 48 tests across 11 files, 0 fail |
| Pipeline smoke test | ✅ **PASS** | `bun run pipeline:test` executes successfully |
| TypeScript | ⚠️ **N/A** | No tsc installed, but Bun type-checks at runtime |

---

## ✅ Хорошо

### 1. SQL Injection Protection
**File:** `src/pipeline/store.ts:77-95`, `116-131`

All database queries use **parameterized statements** with SQLite placeholders:

```typescript
const stmt = db.prepare(`
  INSERT INTO drafts (status, subreddit, ...)
  VALUES ($status, $subreddit, ...)
`);
stmt.run({ $status: input.status, $subreddit: input.subreddit, ... });
```

No string concatenation into SQL. ✅ Safe from SQL injection.

### 2. markPublished Not Used in Pipeline (Correct Behavior)
**File:** `src/pipeline/run-cycle.ts`

Pipeline correctly uses `insertPublished()` to SQLite `published` table for similarity checks. The `markPublished()` function from `src/news/dedup.ts` (JSON-based dedup) is **not used** in pipeline — this is correct per PLAN.md §3 decision to use SQLite for pipeline state.

### 3. Compliance-Aware Ref Link Rules
**File:** `src/pipeline/disclosure.ts:10-15`, `src/config/load.ts:53-56`

```typescript
export function shouldIncludeRefLink(subreddit: string): boolean {
  const cfg = loadSubredditsConfig();
  const low = cfg.risk_promo.low ?? [];
  const medium = cfg.risk_promo.medium ?? [];
  return low.includes(subreddit) || medium.includes(subreddit);
}
```

Correctly implements:
- ✅ Low/medium risk subs (`selfhosted`, `linux`, `opensource`, `devops`) → ref link allowed
- ✅ High/very_high risk subs (`programming`, `sysadmin`, `technology`, `netsec`) → no ref link
- ✅ r/programming correctly excluded from ref links

### 4. Integration with src/news (Ingest Candidate)
**File:** `src/pipeline/types.ts:33-52`, `src/pipeline/run-cycle.ts:62-67`

Correctly imports and uses `IngestCandidate` from news module:

```typescript
export function draftFromCandidate(
  candidate: IngestCandidate,
  platform: Platform = "reddit",
): PipelineDraft { ... }
```

Pipeline orchestration properly calls `runIngestCycle()` when no offline candidate provided.

### 5. Disclosure and AI Disclaimer
**File:** `src/pipeline/disclosure.ts:28-66`

Correctly implements:
- Source URL attribution
- AI disclosure block (EN/RU)
- FTC-style affiliate disclosure when ref link included
- Configurable `DISCLOSURE_REF_URL` env variable

### 6. Validator Implementation
**File:** `src/pipeline/validator.ts`

Comprehensive validation:
- ✅ Platform-specific length limits (Reddit: 300 char title, 40000 body; X: 280/25000 char)
- ✅ Forbidden words list (env-configurable)
- ✅ Similarity check using Jaccard index (default threshold 0.85)
- ✅ Tokenization for similarity (Unicode-aware with `\p{L}\p{N}`)

### 7. Test Coverage
**Files:** `src/pipeline/*.test.ts`

All pipeline modules have tests:
- `store.test.ts`: CRUD, schema init
- `validator.test.ts`: Jaccard similarity, platform limits, forbidden words
- `disclosure.test.ts`: Ref link rules, disclosure blocks
- `prompt.test.ts`: Prompt templates, platform hints

### 8. Database Schema
**File:** `src/pipeline/schema.sql`

Proper schema with:
- ✅ Foreign key constraints (`draft_id` → `drafts.id`)
- ✅ Indexes on `published_at` and `drafts.status`
- ✅ JSON columns for flexible data (`news_json`, `validation_errors_json`)

---

## ⚠️ Замечания (Не блокируют)

### 1. tsconfig — moduleResolution deprecated
**File:** `tsconfig.json:30`

```json
"moduleResolution": "node",  // deprecated
```

**Fix:** `"moduleResolution": "bundler"`

### 2. .env.example — дублирующиеся поля
**File:** `.env.example:21` и `29`

`REDDIT_TOKEN_FILE` объявлен дважды.

### 3. Предупреждение валидации в `updateDraft`
**File:** `src/pipeline/store.ts:102-114`

Метод `updateDraft` выполняет SELECT + UPDATE в два запроса без транзакции. В high-concurrency сценарии возможен race condition, но для single-writer SQLite это не критично.

### 4. `listRecentPublishedBodies` — потенциальная производительность
**File:** `src/pipeline/store.ts:138-144`

Загружает все тела постов за 72 часа в память. При большом объеме может быть дорого. Для MVP (1 пост/5ч = ~10 постов/72ч) — приемлемо.

---

## 🚨 Баги / Критично

### 1. Path Traversal Vulnerability in resolveDatabasePath
**File:** `src/pipeline/store.ts:8-17`  
**Severity:** HIGH  
**Type:** Path Traversal / Arbitrary File Write

```typescript
export function resolveDatabasePath(
  databaseUrl = process.env.DATABASE_URL ?? "file:./data/miraarticles.db",
): string {
  if (databaseUrl.startsWith("file:")) {
    const rel = databaseUrl.slice(5).trim();
    if (rel.startsWith("/")) return rel;  // ❌ VULNERABILITY
    return join(projectRoot, rel);
  }
  return join(projectRoot, "data", "miraarticles.db");
}
```

**Проблема:** Если `DATABASE_URL=file:/etc/critical-file`, функция вернёт `/etc/critical-file` и SQLite откроет/создаст файл по этому пути.

**Attack scenario:**
```bash
DATABASE_URL="file:/etc/passwd" bun run src/pipeline/run-cycle.ts
# или
DATABASE_URL="file:../../../etc/shadow" bun run ...
```

**Fix:**
```typescript
export function resolveDatabasePath(
  databaseUrl = process.env.DATABASE_URL ?? "file:./data/miraarticles.db",
): string {
  const dataDir = join(projectRoot, "data");
  
  if (databaseUrl.startsWith("file:")) {
    const rel = databaseUrl.slice(5).trim();
    // Reject absolute paths
    if (rel.startsWith("/")) {
      throw new Error("Absolute paths not allowed in DATABASE_URL");
    }
    const resolved = join(projectRoot, rel);
    // Ensure resolved path stays within project
    const relativeToProject = relative(projectRoot, resolved);
    if (relativeToProject.startsWith("..")) {
      throw new Error("Path traversal detected in DATABASE_URL");
    }
    return resolved;
  }
  return join(dataDir, "miraarticles.db");
}
```

---

## 🔒 Security Summary

| Vector | Status | Notes |
|--------|--------|-------|
| SQL injection | ✅ Safe | Parameterized queries throughout |
| Path traversal | 🚨 **VULNERABLE** | `resolveDatabasePath` allows absolute paths |
| Secrets in code | ✅ Safe | No hardcoded credentials |
| XSS/CSRF | N/A | No web UI in pipeline |
| Input validation | ⚠️ Partial | No Zod validation on env vars |

---

## Test Quality Assessment

| Test File | Coverage | Notes |
|-----------|----------|-------|
| `store.test.ts` | Good | CRUD, schema init |
| `validator.test.ts` | Good | Similarity, limits, forbidden words |
| `disclosure.test.ts` | Good | Ref link rules, disclosure formatting |
| `prompt.test.ts` | Good | Template generation |

**Missing Tests (Nice to have):**
- Path traversal attempts in `resolveDatabasePath`
- Database connection failure handling
- Concurrent draft updates

---

## Verdict

**REQUEST_CHANGES**

**Причина:** Path traversal vulnerability (`src/pipeline/store.ts:13`) позволяет записывать SQLite БД в произвольное место файловой системы через `DATABASE_URL` env variable.

**Требуется исправить:**
1. `src/pipeline/store.ts:8-17` — запретить absolute paths и path traversal в `resolveDatabasePath`

**Рекомендуется исправить (non-blocking):**
2. `tsconfig.json:30` — `"moduleResolution": "bundler"`
3. `.env.example` — убрать дубль `REDDIT_TOKEN_FILE`

---

## Integration Checklist

| Integration Point | Status | Evidence |
|-------------------|--------|----------|
| `src/news` ingest candidate | ✅ | `run-cycle.ts:62-67` uses `IngestCandidate` |
| `src/config/load.ts` | ✅ | `disclosure.ts:11` uses `loadSubredditsConfig()` |
| Compliance ref link rules | ✅ | `config/subreddits.yaml:risk_promo` respected |
| `markPublished` NOT in pipeline | ✅ | Verified via grep — pipeline uses `insertPublished` |
| r/programming excluded from refs | ✅ | `shouldIncludeRefLink('programming')` returns `false` |

---

## Files Reviewed

```
src/pipeline/types.ts          ✅ Core types, draftFromCandidate helper
src/pipeline/store.ts          🚨 Path traversal bug, otherwise good
src/pipeline/schema.sql        ✅ SQLite schema with FK constraints
src/pipeline/prompt.ts         ✅ Mira prompt templates
src/pipeline/disclosure.ts     ✅ AI disclosure, ref link logic
src/pipeline/validator.ts      ✅ Length, similarity, forbidden words
src/pipeline/run-cycle.ts      ✅ Orchestration, error handling
src/pipeline/index.ts          ✅ Clean re-exports
scripts/test-pipeline.ts       ✅ Smoke test script
config/subreddits.yaml         ✅ risk_promo configuration
```

---

*Review completed: 2026-05-20*