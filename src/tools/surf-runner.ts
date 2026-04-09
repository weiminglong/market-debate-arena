import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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

  try {
    const { stdout } = await execFileAsync("surf", args, {
      timeout: 30_000,
    });

    if (!stdout.trim()) {
      throw new Error(`surf ${command} returned empty output`);
    }

    const parsed = JSON.parse(stdout);

    // Check for API errors in the response envelope
    if (parsed.error) {
      if (parsed.error.code === "INSUFFICIENT_CREDIT") {
        throw new Error(
          `Surf API credits exhausted. Get an API key at https://agents.asksurf.ai and run: surf auth --api-key <key>`
        );
      }
      throw new Error(`Surf API error: ${parsed.error.message || parsed.error.code}`);
    }

    // Extract data from envelope if present
    return parsed.data ?? parsed;
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("credits exhausted")) {
      throw e;
    }
    // On exit code 4, try to parse the raw output for error details
    const err = e as { stdout?: string; stderr?: string; code?: number };
    if (err.code === 4 || err.stdout) {
      try {
        const raw = JSON.parse(err.stdout || "{}");
        if (raw.error?.code === "INSUFFICIENT_CREDIT") {
          throw new Error(
            `Surf API credits exhausted. Get an API key at https://agents.asksurf.ai and run: surf auth --api-key <key>`
          );
        }
      } catch (parseErr) {
        if (parseErr instanceof Error && parseErr.message.includes("credits exhausted")) {
          throw parseErr;
        }
      }
    }
    throw e;
  }
}
