import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as sleep } from "node:timers/promises";
import { extractFirstJSONValue } from "../json-extract.js";

const execFileAsync = promisify(execFile);
const SURF_TIMEOUT_MS = [45_000, 90_000, 90_000] as const;
const SURF_MAX_BUFFER = 1024 * 1024 * 20;
const RETRY_DELAY_MS = 1_500;

interface ExecError extends Error {
  code?: string | number;
  killed?: boolean;
  signal?: string | null;
  stdout?: string;
  stderr?: string;
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
      throw new Error(
        `Surf API credits exhausted. Get an API key at https://agents.asksurf.ai and run: surf auth --api-key <key>`
      );
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
  return /unknown command|unknown flag|validation failed|expected value to be one of|credits exhausted/i.test(
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

export function isTransientExecError(e: unknown): boolean {
  const err = e as ExecError;
  if (err?.killed === true || err?.signal === "SIGTERM") return true;
  const code = String(err?.code ?? "");
  return code === "ETIMEDOUT" || code === "ECONNRESET";
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

  for (let attempt = 0; attempt < SURF_TIMEOUT_MS.length; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_DELAY_MS * attempt);
    }

    try {
      const { stdout } = await execFileAsync("surf", args, {
        timeout: SURF_TIMEOUT_MS[attempt],
        maxBuffer: SURF_MAX_BUFFER,
      });
      return parseSurfOutput(command, stdout);
    } catch (e: unknown) {
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
          if (
            parseErr instanceof Error &&
            parseErr.message.includes("credits exhausted")
          ) {
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

      if (!permanent && retryable && attempt < SURF_TIMEOUT_MS.length - 1) {
        continue;
      }
      throw lastError;
    }
  }

  throw lastError || new Error(`surf ${command} failed`);
}
