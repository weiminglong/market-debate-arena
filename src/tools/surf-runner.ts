import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function runSurf(
  command: string,
  params: Record<string, string | number | boolean>
): Promise<unknown> {
  const args = [command, "-o", "json", "-f", "body.data"];

  for (const [key, value] of Object.entries(params)) {
    if (value === true) {
      args.push(`--${key}`);
    } else if (value !== false && value !== undefined) {
      args.push(`--${key}`, String(value));
    }
  }

  const { stdout, stderr } = await execFileAsync("surf", args, {
    timeout: 30_000,
  });

  if (!stdout.trim()) {
    throw new Error(`surf ${command} returned empty output. stderr: ${stderr}`);
  }

  return JSON.parse(stdout);
}
