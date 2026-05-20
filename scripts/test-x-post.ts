/**
 * One-off test: POST /2/tweets via OAuth 1.0a.
 * Usage: bun run test:x ["optional tweet text"]
 *        bun run x:test
 */
import { postTweet } from "../src/publishers/x";

const text =
  process.argv[2] ??
  `MiraArticles API test ${new Date().toISOString().slice(0, 16)} (delete me)`;

const result = await postTweet(text);

if (!result.ok) {
  console.error("POST /2/tweets failed", result.error);
  process.exit(1);
}

console.log("OK", JSON.stringify({ postId: result.postId, url: result.url }, null, 2));
