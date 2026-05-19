import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  normalizeApiHash,
  validateTelegramApiCredentials,
} from "./credentials";

const projectRoot = join(import.meta.dir, "../..");

export interface TelegramConfig {
  apiId: number;
  apiHash: string;
  sessionString: string;
  tokenFile: string;
  sessionFile: string;
}

export function resolveTelegramPaths(): { tokenFile: string; sessionFile: string } {
  return {
    tokenFile:
      process.env.TELEGRAM_TOKEN_FILE ?? join(projectRoot, "token/telegram.json"),
    sessionFile:
      process.env.TELEGRAM_SESSION_FILE ??
      join(projectRoot, "token/telegram.session"),
  };
}

export function hasSessionFile(): boolean {
  const { sessionFile } = resolveTelegramPaths();
  return existsSync(sessionFile) && readFileSync(sessionFile, "utf8").trim().length > 0;
}

function nonEmptyEnv(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

function apiIdFromJson(json: Record<string, unknown>): number | undefined {
  const raw = json.api_id ?? json.apiId;
  if (raw === undefined || raw === null) return undefined;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function apiHashFromJson(json: Record<string, unknown>): string | undefined {
  const raw = json.api_hash ?? json.apiHash;
  if (typeof raw !== "string") return undefined;
  const h = raw.trim();
  return h || undefined;
}

export function loadTelegramConfig(): TelegramConfig {
  const { tokenFile, sessionFile } = resolveTelegramPaths();

  const envIdStr = nonEmptyEnv("TELEGRAM_API_ID");
  let apiId: number | undefined = envIdStr
    ? Number.parseInt(envIdStr, 10)
    : undefined;
  if (apiId !== undefined && (!Number.isFinite(apiId) || apiId <= 0)) {
    apiId = undefined;
  }
  let apiHash: string | undefined = nonEmptyEnv("TELEGRAM_API_HASH");

  if (existsSync(tokenFile)) {
    const raw = JSON.parse(readFileSync(tokenFile, "utf8")) as Record<
      string,
      unknown
    >;
    apiId ??= apiIdFromJson(raw);
    apiHash ??= apiHashFromJson(raw);
  }

  let sessionString = process.env.TELEGRAM_SESSION?.trim();
  if (!sessionString && existsSync(sessionFile)) {
    sessionString = readFileSync(sessionFile, "utf8").trim();
  }

  if (!apiId || !apiHash) {
    throw new Error(
      "Missing Telegram api_id/api_hash (token/telegram.json or TELEGRAM_API_ID/TELEGRAM_API_HASH). " +
        "Empty TELEGRAM_API_ID or TELEGRAM_API_HASH in .env override the JSON file.",
    );
  }
  apiHash = normalizeApiHash(apiHash);
  validateTelegramApiCredentials(apiId, apiHash);

  if (!sessionString) {
    throw new Error(
      "Missing Telegram session (token/telegram.session or TELEGRAM_SESSION). Run: bun run telegram:login",
    );
  }

  return { apiId, apiHash, sessionString, tokenFile, sessionFile };
}
