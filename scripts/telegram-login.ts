/**
 * Interactive GramJS login → StringSession in token/telegram.session
 * Usage: bun run telegram:login
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import * as readline from "readline";
import {
  TELEGRAM_APPS_URL,
  normalizeApiHash,
  validateTelegramApiCredentials,
} from "../src/mira/credentials";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";

const root = join(import.meta.dir, "..");
const tokenFile =
  process.env.TELEGRAM_TOKEN_FILE ?? join(root, "token/telegram.json");
const sessionFile =
  process.env.TELEGRAM_SESSION_FILE ?? join(root, "token/telegram.session");

function ask(prompt: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
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

function loadApiCredentials(): { apiId: number; apiHash: string } {
  const envIdStr = nonEmptyEnv("TELEGRAM_API_ID");
  let apiId = envIdStr ? Number.parseInt(envIdStr, 10) : undefined;
  if (apiId !== undefined && (!Number.isFinite(apiId) || apiId <= 0)) {
    apiId = undefined;
  }
  let apiHash = nonEmptyEnv("TELEGRAM_API_HASH");

  if (existsSync(tokenFile)) {
    const json = JSON.parse(readFileSync(tokenFile, "utf8")) as Record<
      string,
      unknown
    >;
    apiId ??= apiIdFromJson(json);
    apiHash ??= apiHashFromJson(json);
  }

  if (!apiId || !apiHash) {
    console.error(
      "Missing api_id/api_hash. Set token/telegram.json or TELEGRAM_API_ID / TELEGRAM_API_HASH.",
    );
    console.error(
      "  Hint: empty TELEGRAM_API_ID or TELEGRAM_API_HASH in .env override the JSON file; remove them or set real values.",
    );
    console.error(`  Create an app: ${TELEGRAM_APPS_URL}`);
    process.exit(1);
  }

  apiHash = normalizeApiHash(apiHash);
  try {
    validateTelegramApiCredentials(apiId, apiHash);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    console.error(`  Fix ${tokenFile} or env, then retry.`);
    process.exit(1);
  }

  return { apiId, apiHash };
}

const { apiId, apiHash } = loadApiCredentials();

let existingSession = "";
if (existsSync(sessionFile)) {
  existingSession = readFileSync(sessionFile, "utf8").trim();
}

const client = new TelegramClient(
  new StringSession(existingSession),
  apiId,
  apiHash,
  { connectionRetries: 5 },
);

await client.start({
  phoneNumber: async () => await ask("Phone number (international, e.g. +1...): "),
  phoneCode: async () => await ask("Login code from Telegram: "),
  password: async () => await ask("2FA password (leave empty if none): "),
  onError: (err) => console.error("Login error:", err.message ?? err),
});

const sessionString = client.session.save() as unknown as string;
mkdirSync(join(root, "token"), { recursive: true });
writeFileSync(sessionFile, `${sessionString}\n`, { utf8: "utf8", mode: 0o600 });

console.log("Telegram session saved.");
console.log(`  Session file: ${sessionFile}`);
console.log("  (api credentials unchanged; secrets are not printed.)");

await client.disconnect();
process.exit(0);
