import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SURF_TIMEOUT_MS = [45_000, 90_000] as const;
const SURF_MAX_BUFFER = 1024 * 1024 * 20;

function extractJsonCandidate(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;

  let start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{" || text[i] === "[") {
      start = i;
      break;
    }
  }
  if (start < 0) return null;

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (ch === "\"") {
      inString = true;
      continue;
    }

    if (ch === "{" || ch === "[") {
      stack.push(ch);
      continue;
    }

    if (ch === "}" || ch === "]") {
      const open = stack.pop();
      const expected = ch === "}" ? "{" : "[";
      if (open !== expected) {
        return null;
      }
      if (stack.length === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
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
    const candidate = extractJsonCandidate(raw);
    if (!candidate) {
      const looksJson = raw.startsWith("{") || raw.startsWith("[");
      throw new Error(
        `surf ${command} returned ${
          looksJson ? "truncated or invalid JSON output" : "non-JSON output"
        }: ${raw.slice(0, 200)}`
      );
    }
    try {
      parsed = JSON.parse(candidate);
    } catch {
      throw new Error(
        `surf ${command} returned invalid JSON output: ${raw.slice(0, 200)}`
      );
    }
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
  return /unknown command|unknown flag|validation failed|expected value to be one of/i.test(
    message
  );
}

function isRetryableFailure(message: string): boolean {
  return /timed out|ETIMEDOUT|maxbuffer|truncated or invalid JSON output|returned empty output/i.test(
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

  for (let attempt = 0; attempt < SURF_TIMEOUT_MS.length; attempt++) {
    try {
      const { stdout } = await execFileAsync("surf", args, {
        timeout: SURF_TIMEOUT_MS[attempt],
        maxBuffer: SURF_MAX_BUFFER,
      });
      return parseSurfOutput(command, stdout);
    } catch (e: unknown) {
      const err = e as { stdout?: string; stderr?: string; code?: number | string };
      let surfacedMessage = "";

      // Try to extract useful API error details from stdout.
      if (err.stdout) {
        try {
          parseSurfOutput(command, err.stdout);
        } catch (parseErr) {
          if (
            parseErr instanceof Error &&
            (parseErr.message.includes("credits exhausted") ||
              parseErr.message.startsWith("Surf API error:"))
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
      const retryable = isRetryableFailure(message);

      if (!permanent && retryable && attempt < SURF_TIMEOUT_MS.length - 1) {
        continue;
      }
      throw lastError;
    }
  }

  throw lastError || new Error(`surf ${command} failed`);
}
