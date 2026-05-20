import { existsSync, readFileSync } from "fs";
import { join } from "path";

const projectRoot = join(import.meta.dir, "../..");

export interface XCredentials {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

interface XTokenFile {
  consumer_key: string;
  consumer_key_secret: string;
  access_token: string;
  access_token_secret: string;
}

function fromTokenFile(filePath: string): XCredentials {
  const raw = JSON.parse(readFileSync(filePath, "utf8")) as XTokenFile;
  if (
    !raw.consumer_key ||
    !raw.consumer_key_secret ||
    !raw.access_token ||
    !raw.access_token_secret
  ) {
    throw new Error(
      `X token file at ${filePath} is missing required fields (consumer_key, consumer_key_secret, access_token, access_token_secret).`,
    );
  }
  return {
    apiKey: raw.consumer_key,
    apiSecret: raw.consumer_key_secret,
    accessToken: raw.access_token,
    accessTokenSecret: raw.access_token_secret,
  };
}

/**
 * Load X API credentials from env vars or token file.
 * Throws if credentials are missing — call only when posting (not when skipped).
 */
export function loadXCredentials(): XCredentials {
  const apiKey = process.env.X_API_KEY;
  const apiSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;

  if (apiKey && apiSecret && accessToken && accessTokenSecret) {
    return { apiKey, apiSecret, accessToken, accessTokenSecret };
  }

  const tokenFile =
    process.env.X_TOKEN_FILE ?? join(projectRoot, "token", "x_token.json");

  const resolvedPath = tokenFile.startsWith("/")
    ? tokenFile
    : join(projectRoot, tokenFile);

  if (!existsSync(resolvedPath)) {
    throw new Error(
      `X token file not found: ${resolvedPath}. Set X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET or X_TOKEN_FILE.`,
    );
  }

  return fromTokenFile(resolvedPath);
}
