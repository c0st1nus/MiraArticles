import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { projectDataDir } from "../config/load";
import { runFullCycle, type RunFullCycleOpts, type RunFullCycleResult } from "./orchestrator";

export interface LastCycleState {
  lastSuccessAt?: string;
  lastRunAt: string;
  lastError?: string;
}

const TICK_MS = 60_000;

function statePath(): string {
  return join(projectDataDir(), "last_cycle.json");
}

export function getIntervalMs(): number {
  const hours = Number.parseFloat(process.env.CRON_INTERVAL_HOURS ?? "5");
  if (!Number.isFinite(hours) || hours <= 0) {
    return 5 * 60 * 60 * 1000;
  }
  return hours * 60 * 60 * 1000;
}

export function readLastCycleState(): LastCycleState | null {
  const path = statePath();
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as LastCycleState;
  } catch {
    return null;
  }
}

export function writeLastCycleState(state: LastCycleState): void {
  const path = statePath();
  const dir = projectDataDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function shouldRunNow(now = Date.now()): boolean {
  const state = readLastCycleState();
  if (!state?.lastSuccessAt) return true;
  const last = Date.parse(state.lastSuccessAt);
  if (!Number.isFinite(last)) return true;
  return now >= last + getIntervalMs();
}

function recordRun(result: RunFullCycleResult, err?: string): void {
  const now = new Date().toISOString();
  const prev = readLastCycleState();
  const next: LastCycleState = {
    lastRunAt: now,
    lastSuccessAt: result.ok ? now : prev?.lastSuccessAt,
    lastError: result.ok ? undefined : err ?? result.reason ?? result.errors?.join("; "),
  };
  writeLastCycleState(next);
}

export async function runOnce(opts?: RunFullCycleOpts): Promise<RunFullCycleResult> {
  const result = await runFullCycle(opts);
  const err =
    result.errors?.join("; ") ??
    (result.ok ? undefined : result.reason);
  recordRun(result, err);
  return result;
}

let loopStarted = false;

export function runSchedulerLoop(): void {
  if (loopStarted) return;
  loopStarted = true;

  const tick = async () => {
    if (!shouldRunNow()) return;
    try {
      await runOnce();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      recordRun({ ok: false, reason: "scheduler_tick", errors: [message] }, message);
      console.error("[scheduler]", message);
    }
  };

  void tick();
  setInterval(() => {
    void tick();
  }, TICK_MS);
}
