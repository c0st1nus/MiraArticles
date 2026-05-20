import { Elysia } from "elysia";
import { readLastCycleState, runOnce, runSchedulerLoop } from "./scheduler";

const startedAt = Date.now();
const port = Number.parseInt(process.env.PORT ?? "3000", 10);

function checkRunSecret(headers: Headers): boolean {
  const secret = process.env.RUN_CYCLE_SECRET?.trim();
  if (!secret) return true;
  return headers.get("x-run-secret") === secret;
}

const app = new Elysia()
  .get("/", () => ({
    name: "MiraArticles",
    health: "/health",
    runCycle: "POST /run-cycle",
    scheduler: process.env.SCHEDULER_ENABLED === "true",
  }))
  .get("/health", () => {
    const lastCycle = readLastCycleState();
    return {
      status: "ok",
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      lastCycle: lastCycle ?? undefined,
    };
  })
  .post("/run-cycle", async ({ request, set }) => {
    if (!checkRunSecret(request.headers)) {
      set.status = 401;
      return { ok: false, error: "unauthorized" };
    }
    const result = await runOnce();
    set.status = result.ok ? 200 : 500;
    return result;
  })
  .listen(port);

console.log(`MiraArticles listening on http://${app.server?.hostname}:${app.server?.port}`);

if (process.env.SCHEDULER_ENABLED === "true") {
  runSchedulerLoop();
  console.log("Scheduler loop started");
}
