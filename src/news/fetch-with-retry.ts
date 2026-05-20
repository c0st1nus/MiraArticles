export const FETCH_TIMEOUT_MS = 15_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(err: unknown): boolean {
  if (err instanceof Error) {
    if (err.name === "AbortError") return true;
    const msg = err.message.toLowerCase();
    return (
      msg.includes("unable to connect") ||
      msg.includes("connection refused") ||
      msg.includes("connection reset") ||
      msg.includes("network") ||
      msg.includes("fetch failed") ||
      msg.includes("econnrefused") ||
      msg.includes("enotfound") ||
      msg.includes("etimedout")
    );
  }
  return false;
}

export async function fetchWithRetry(
  url: string,
  init: Omit<RequestInit, "signal">,
  options?: { maxAttempts?: number; delayMs?: number; timeoutMs?: number },
): Promise<Response> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const delayMs = options?.delayMs ?? 1000;
  const timeoutMs = options?.timeoutMs ?? FETCH_TIMEOUT_MS;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { ...init, signal: controller.signal });

      if (res.status === 429 && attempt < maxAttempts) {
        await sleep(delayMs);
        continue;
      }

      return res;
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts && isRetryableError(err)) {
        await sleep(delayMs);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new Error("fetchWithRetry: exhausted attempts");
}
