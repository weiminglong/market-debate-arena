import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as sleep } from "node:timers/promises";
import { extractFirstJSONValue } from "../json-extract.js";
import { SURF } from "../config.js";
import { isTransientExecError } from "../exec-utils.js";
import type { ExecError } from "../exec-utils.js";

const execFileAsync = promisify(execFile);

export { isTransientExecError };

// The demo's mock fallback keys off this error — a typed class instead of
// message-substring matching, so rewording the message can't break it.
export class SurfCreditsExhaustedError extends Error {
  constructor() {
    super(
      "Surf API credits exhausted. Get an API key at https://agents.asksurf.ai and run: surf auth --api-key <key>"
    );
    this.name = "SurfCreditsExhaustedError";
  }
}

export function parseSurfOutput(command: string, stdout: string): unknown {
  const raw = stdout.trim();
  if (!raw) {
    throw new Error(`surf ${command} returned empty output`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const candidate = extractFirstJSONValue(raw);
    if (!candidate) {
      const looksJson = raw.startsWith("{") || raw.startsWith("[");
      throw new Error(
        `surf ${command} returned ${
          looksJson ? "truncated or invalid JSON output" : "non-JSON output"
        }: ${raw.slice(0, 200)}`
      );
    }
    parsed = JSON.parse(candidate);
  }

  if (parsed && typeof parsed === "object" && "error" in parsed) {
    const errObj = (parsed as { error?: { code?: string; message?: string } }).error;
    if (errObj?.code === "INSUFFICIENT_CREDIT") {
      throw new SurfCreditsExhaustedError();
    }
    throw new Error(`Surf API error: ${errObj?.message || errObj?.code || "unknown"}`);
  }

  if (
    parsed &&
    typeof parsed === "object" &&
    "data" in (parsed as Record<string, unknown>)
  ) {
    return (parsed as { data?: unknown }).data;
  }

  return parsed;
}

function isPermanentCliError(message: string): boolean {
  return /unknown command|unknown flag|validation failed|expected value to be one of/i.test(
    message
  );
}

// Message-text classification alone misses Node-enforced timeout kills (their
// message is just "Command failed: surf ..."), so callers must also check the
// structured exec error via isTransientExecError.
export function isRetryableFailure(message: string): boolean {
  return /timed out|ETIMEDOUT|ECONNRESET|maxbuffer|truncated or invalid JSON output|invalid JSON output|non-JSON output|returned empty output|rate limit|429|5\d\d|temporarily/i.test(
    message
  );
}

export async function runSurf(
  command: string,
  params: Record<string, string | number | boolean>
): Promise<unknown> {
  const args = [command, "-o", "json"];

  for (const [key, value] of Object.entries(params)) {
    if (value === true) {
      args.push(`--${key}`);
    } else if (value !== false && value !== undefined) {
      args.push(`--${key}`, String(value));
    }
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < SURF.timeoutsMs.length; attempt++) {
    if (attempt > 0) {
      await sleep(SURF.retryDelayMs * attempt);
    }

    try {
      const { stdout } = await execFileAsync("surf", args, {
        timeout: SURF.timeoutsMs[attempt],
        maxBuffer: SURF.maxBuffer,
      });
      return parseSurfOutput(command, stdout);
    } catch (e: unknown) {
      if (e instanceof SurfCreditsExhaustedError) throw e;

      const err = e as ExecError;

      if (String(err?.code) === "ENOENT") {
        throw new Error(
          `surf CLI not found. Install it with: curl -fsSL https://downloads.asksurf.ai/cli/releases/install.sh | sh (or run with --mock)`
        );
      }

      let surfacedMessage = "";

      // Try to extract useful API error details from stdout.
      if (err.stdout) {
        try {
          parseSurfOutput(command, err.stdout);
        } catch (parseErr) {
          if (parseErr instanceof SurfCreditsExhaustedError) {
            throw parseErr;
          }
          if (parseErr instanceof Error) {
            surfacedMessage = parseErr.message;
          }
        }
      }

      const stderrMessage = err.stderr?.trim() || "";
      const fallbackMessage = e instanceof Error ? e.message : "";
      const message = surfacedMessage || stderrMessage || fallbackMessage || "unknown error";
      lastError = new Error(`surf ${command} failed: ${message}`);

      const permanent = isPermanentCliError(message);
      const retryable = isTransientExecError(e) || isRetryableFailure(message);

      if (!permanent && retryable && attempt < SURF.timeoutsMs.length - 1) {
        continue;
      }
      throw lastError;
    }
  }

  throw lastError || new Error(`surf ${command} failed`);
}
