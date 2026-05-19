/** Telegram API credentials from https://my.telegram.org/apps */

export function normalizeApiHash(raw: string): string {
  return raw.trim();
}

export function isValidApiHash(hash: string): boolean {
  return /^[0-9a-f]{32}$/i.test(normalizeApiHash(hash));
}

export function validateTelegramApiCredentials(
  apiId: number,
  apiHash: string,
): void {
  if (!Number.isFinite(apiId) || apiId <= 0) {
    throw new Error(
      `Invalid api_id (${apiId}). Use the numeric App api_id from https://my.telegram.org/apps`,
    );
  }
  const hash = normalizeApiHash(apiHash);
  if (!isValidApiHash(hash)) {
    throw new Error(
      `Invalid api_hash: expected exactly 32 hexadecimal characters, got ${hash.length}. ` +
        "Re-copy api_hash from https://my.telegram.org/apps (no spaces or quotes).",
    );
  }
}

export const TELEGRAM_APPS_URL = "https://my.telegram.org/apps";
