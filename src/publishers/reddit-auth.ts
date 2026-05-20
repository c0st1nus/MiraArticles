import { existsSync, readFileSync } from "fs";
import { join } from "path";

const projectRoot = join(import.meta.dir, "../..");

export interface RedditCredentials {
  clientId: string;
  refreshToken: string;
  accessToken?: string;
  userAgent: string;
}

interface DevvitBundle {
  refreshToken: string;
  accessToken?: string;
  expiresAt?: number;
}

function loadDevvitBundle(filePath: string): DevvitBundle {
  const raw = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
  // Devvit token file: { token: "<base64 JSON>", ... }
  if (typeof raw.token === "string") {
    const decoded = Buffer.from(raw.token, "base64").toString("utf8");
    return JSON.parse(decoded) as DevvitBundle;
  }
  // Fallback: plain JSON with refreshToken
  if (typeof raw.refreshToken === "string") {
    return raw as unknown as DevvitBundle;
  }
  throw new Error(`Unrecognised reddit token file format at ${filePath}`);
}

export function loadCredentials(): RedditCredentials {
  const clientId =
    process.env.REDDIT_CLIENT_ID ?? "Bep8X2RRjuoyuxkKsKxFuQ";
  const userAgent =
    process.env.REDDIT_USER_AGENT ?? "MiraArticles/1.0 (by /u/c0s1nu7)";

  // Prefer explicit env override
  if (process.env.REDDIT_REFRESH_TOKEN) {
    return { clientId, refreshToken: process.env.REDDIT_REFRESH_TOKEN, userAgent };
  }

  const tokenFile =
    process.env.REDDIT_TOKEN_FILE ??
    join(projectRoot, "token", "reddit_token.json");

  const resolvedPath = tokenFile.startsWith("/")
    ? tokenFile
    : join(projectRoot, tokenFile);

  if (!existsSync(resolvedPath)) {
    throw new Error(
      `Reddit token file not found: ${resolvedPath}. Set REDDIT_REFRESH_TOKEN or REDDIT_TOKEN_FILE.`,
    );
  }

  const bundle = loadDevvitBundle(resolvedPath);
  return {
    clientId,
    refreshToken: bundle.refreshToken,
    accessToken: bundle.accessToken,
    userAgent,
  };
}

export interface AccessTokenResult {
  accessToken: string;
  expiresIn: number;
}

/**
 * Fetch a fresh access token from Reddit using the refresh token.
 * Uses Basic auth with empty secret (Devvit/installed-app OAuth flow).
 */
export async function refreshAccessToken(
  creds: RedditCredentials,
  fetchFn: typeof fetch = fetch,
): Promise<AccessTokenResult> {
  const basicAuth = Buffer.from(`${creds.clientId}:`).toString("base64");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: creds.refreshToken,
  });

  const resp = await fetchFn("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "User-Agent": creds.userAgent,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Reddit token refresh failed (${resp.status}): ${text}`);
  }

  const json = (await resp.json()) as Record<string, unknown>;

  if (typeof json.access_token !== "string") {
    throw new Error(`Reddit token refresh: unexpected response: ${JSON.stringify(json)}`);
  }

  return {
    accessToken: json.access_token,
    expiresIn: typeof json.expires_in === "number" ? json.expires_in : 3600,
  };
}
