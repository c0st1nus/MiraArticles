import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { Api } from "telegram";
import { NewMessage, type NewMessageEvent } from "telegram/events";
import { FloodWaitError } from "telegram/errors";
import type { EntityLike } from "telegram/define";
import { loadTelegramConfig } from "./config";
import {
  mergeStreamingMessages,
  parseMiraMessage,
  type MiraInlineButton,
  type ParsedMiraMessage,
} from "./parser";

export interface MiraPromptOptions {
  /** Idle gap (ms) with no new bot messages before treating stream as complete. */
  idleMs?: number;
  /** Max wait for any bot response (ms). */
  totalTimeoutMs?: number;
  /** Backup poll interval for getMessages (ms); default matches idleMs. */
  pollIntervalMs?: number;
  botUsername?: string;
}

export interface MiraPromptResult {
  draftText: string;
  messages: ParsedMiraMessage[];
  buttons?: MiraInlineButton[][];
  messageIds: number[];
}

const DEFAULT_IDLE_MS = 2500;
const DEFAULT_TOTAL_TIMEOUT_MS = 180_000;
/** Backup poll via getMessages; keep ≥ idleMs to avoid GetHistory FLOOD_WAIT. */
const DEFAULT_POLL_INTERVAL_MS = 2500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getBotUsername(): string {
  const name = (process.env.MIRA_BOT_USERNAME ?? "mira").replace(/^@/, "");
  return name;
}

export async function withFloodRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof FloodWaitError) {
      const seconds = err.seconds ?? 1;
      await sleep(seconds * 1000);
      return await fn();
    }
    throw err;
  }
}

async function ensureConnected(client: TelegramClient): Promise<void> {
  if (!client.connected) {
    await client.connect();
  }
  if (!(await client.checkAuthorization())) {
    throw new Error(
      "Telegram session not authorized. Run: bun run telegram:login",
    );
  }
}

export async function createMiraClient(): Promise<TelegramClient> {
  const cfg = loadTelegramConfig();
  const client = new TelegramClient(
    new StringSession(cfg.sessionString),
    cfg.apiId,
    cfg.apiHash,
    { connectionRetries: 5 },
  );
  await withFloodRetry(() => ensureConnected(client));
  return client;
}

/**
 * Resolve @bot by username. GramJS getEntity() uses parseUsername() which
 * rejects 4-character names (e.g. "mira"); MTProto ResolveUsername still works.
 */
export async function resolveBotUser(
  client: TelegramClient,
  username: string,
): Promise<Api.User> {
  const u = username.replace(/^@/, "").toLowerCase();

  for (const candidate of [u, `@${u}`, `https://t.me/${u}`]) {
    try {
      const entity = await withFloodRetry(() => client.getEntity(candidate));
      if (entity instanceof Api.User) return entity;
    } catch {
      // try next
    }
  }

  const result = await withFloodRetry(() =>
    client.invoke(new Api.contacts.ResolveUsername({ username: u })),
  );

  if (result.peer instanceof Api.PeerUser) {
    const userId = result.peer.userId;
    const user = result.users.find(
      (x) => x instanceof Api.User && x.id.equals(userId),
    );
    if (user instanceof Api.User) return user;
  }

  throw new Error(
    `Cannot resolve bot @${u}. Open https://t.me/${u} in Telegram, send /start once, ` +
      "then retry. If the bot has another username, set MIRA_BOT_USERNAME.",
  );
}

interface BotIncomingMessage {
  id: number;
  out?: boolean;
  message?: string;
  replyMarkup?: unknown;
  senderId?: { toString(): string };
}

async function waitForBotMessages(
  client: TelegramClient,
  peer: EntityLike,
  botEntity: Api.User,
  afterMessageId: number,
  options: Required<
    Pick<MiraPromptOptions, "idleMs" | "totalTimeoutMs" | "pollIntervalMs">
  >,
): Promise<BotIncomingMessage[]> {
  const { idleMs, totalTimeoutMs, pollIntervalMs } = options;
  const botId = botEntity.id.toString();
  const collected = new Map<number, BotIncomingMessage>();
  let lastActivityAt = Date.now();
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearInterval(pollTimer);
      client.removeEventHandler(handler);
      if (err) {
        reject(err);
        return;
      }
      const ordered = [...collected.values()].sort((a, b) => a.id - b.id);
      resolve(ordered);
    };

    const considerDone = () => {
      const elapsed = Date.now() - startedAt;
      const idleFor = Date.now() - lastActivityAt;
      if (collected.size > 0 && idleFor >= idleMs) {
        finish();
        return;
      }
      if (elapsed >= totalTimeoutMs) {
        if (collected.size > 0) {
          finish();
        } else {
          finish(new Error(`No response from @${getBotUsername()} within ${totalTimeoutMs}ms`));
        }
      }
    };

    const acceptMessage = (msg: BotIncomingMessage) => {
      if (msg.out) return;
      if (msg.id <= afterMessageId) return;
      if (!msg.message && !msg.replyMarkup) return;

      const senderMatches =
        msg.senderId != null && msg.senderId.toString() === botId;
      if (!senderMatches) return;

      if (!collected.has(msg.id)) {
        collected.set(msg.id, msg);
        lastActivityAt = Date.now();
      }
    };

    const handler = async (event: NewMessageEvent) => {
      try {
        if (!client.connected) {
          await client.connect();
        }
        acceptMessage(event.message);
      } catch {
        // ignore handler errors; poll loop still runs
      }
    };

    client.addEventHandler(
      handler,
      new NewMessage({ fromUsers: [botEntity.id] }),
    );

    const pollTimer = setInterval(async () => {
      try {
        if (!client.connected) {
          await client.connect();
        }
        const batch = await client.getMessages(peer, {
          minId: afterMessageId,
          limit: 50,
        });
        for (const msg of batch) {
          acceptMessage(msg as BotIncomingMessage);
        }
        considerDone();
      } catch (err) {
        if (!settled) {
          finish(err instanceof Error ? err : new Error(String(err)));
        }
      }
    }, pollIntervalMs);
  });
}

function pollIntervalFromEnv(idleMs: number): number {
  const raw = process.env.MIRA_POLL_INTERVAL_MS?.trim();
  if (raw) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n >= idleMs) return n;
  }
  return Math.max(idleMs, DEFAULT_POLL_INTERVAL_MS);
}

function totalTimeoutFromEnv(): number {
  const raw = process.env.MIRA_RESPONSE_TIMEOUT_MS?.trim();
  if (raw) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_TOTAL_TIMEOUT_MS;
}

export async function sendPromptToMira(
  client: TelegramClient,
  prompt: string,
  options: MiraPromptOptions = {},
): Promise<MiraPromptResult> {
  const idleMs = options.idleMs ?? DEFAULT_IDLE_MS;
  const totalTimeoutMs = options.totalTimeoutMs ?? totalTimeoutFromEnv();
  const pollIntervalMs =
    options.pollIntervalMs ?? pollIntervalFromEnv(idleMs);
  const botUsername = (options.botUsername ?? getBotUsername()).replace(/^@/, "");

  await ensureConnected(client);

  const botEntity = await resolveBotUser(client, botUsername);
  const peer: EntityLike = botEntity;

  const sent = await withFloodRetry(() =>
    client.sendMessage(peer, { message: prompt }),
  );
  const afterId = sent.id;

  const rawMessages = await waitForBotMessages(client, peer, botEntity, afterId, {
    idleMs,
    totalTimeoutMs,
    pollIntervalMs,
  });

  const messages = rawMessages.map((m) => parseMiraMessage(m));
  const draftText = mergeStreamingMessages(messages);
  const lastWithButtons = [...messages].reverse().find((m) => m.buttons?.length);
  const messageIds = messages.map((m) => m.messageId);

  return {
    draftText,
    messages,
    buttons: lastWithButtons?.buttons,
    messageIds,
  };
}
