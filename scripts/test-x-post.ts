/**
 * One-off test: POST /2/tweets via OAuth 1.0a (token/x_token.json).
 * Usage: bun run scripts/test-x-post.ts ["optional tweet text"]
 */
import { readFileSync } from "fs";
import { join } from "path";
import OAuth from "oauth-1.0a";
import crypto from "crypto";

const root = join(import.meta.dir, "..");
const creds = JSON.parse(
  readFileSync(join(root, "token/x_token.json"), "utf8"),
) as {
  consumer_key: string;
  consumer_key_secret: string;
  access_token: string;
  access_token_secret: string;
};

const text =
  process.argv[2] ??
  `MiraArticles API test ${new Date().toISOString().slice(0, 16)} (delete me)`;

const oauth = new OAuth({
  consumer: {
    key: creds.consumer_key,
    secret: creds.consumer_key_secret,
  },
  signature_method: "HMAC-SHA1",
  hash_function(base, key) {
    return crypto.createHmac("sha1", key).update(base).digest("base64");
  },
});

const url = "https://api.twitter.com/2/tweets";
const method = "POST";
const auth = oauth.authorize(
  { url, method },
  { key: creds.access_token, secret: creds.access_token_secret },
);
const header = oauth.toHeader(auth);

const res = await fetch(url, {
  method,
  headers: {
    ...header,
    "Content-Type": "application/json",
  } as HeadersInit,
  body: JSON.stringify({ text }),
});

const body = await res.json();
if (!res.ok) {
  console.error("POST /2/tweets failed", res.status, body);
  process.exit(1);
}

console.log("OK", JSON.stringify(body, null, 2));
