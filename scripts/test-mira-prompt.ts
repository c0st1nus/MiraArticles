/**
 * Send test prompt to @mira and print parsed draft.
 * Usage: bun run test:mira
 */
import { join } from "path";
import { hasSessionFile } from "../src/mira/config";
import { createMiraClient, sendPromptToMira } from "../src/mira/client";

const root = join(import.meta.dir, "..");
const sessionFile =
  process.env.TELEGRAM_SESSION_FILE ?? join(root, "token/telegram.session");

if (!hasSessionFile() && !process.env.TELEGRAM_SESSION?.trim()) {
  console.error(`No Telegram session at ${sessionFile}`);
  console.error("Run: bun run telegram:login");
  process.exit(1);
}

const testPrompt = `Напиши короткий пост для Reddit r/linux про новость:
Заголовок: Linux 6.14-rc1 released with performance tweaks
URL: https://example.com/linux-6-14
Кратко: Kernel RC with scheduler and networking improvements.
Язык: русский. Без ссылок в конце — их добавит скрипт.`;

console.log("Connecting to Telegram…");
const client = await createMiraClient();

try {
  console.log("Sending test prompt to @mira (may take up to 120s)…");
  const result = await sendPromptToMira(client, testPrompt);
  console.log("\n--- draftText ---\n");
  console.log(result.draftText);
  console.log("\n--- meta ---");
  console.log(`messages: ${result.messageIds.length}, ids: ${result.messageIds.join(", ")}`);
  if (result.buttons?.length) {
    console.log(`inline buttons: ${result.buttons.flat().map((b) => b.text).join(", ")}`);
  }
} finally {
  await client.disconnect();
}
