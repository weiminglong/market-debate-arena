import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface ClaudeOptions {
  systemPrompt?: string;
  allowBash?: boolean;
  model?: string;
}

export async function runClaude(
  prompt: string,
  options: ClaudeOptions = {}
): Promise<string> {
  const args = [
    "-p",
    prompt,
    "--model",
    options.model || "sonnet",
  ];

  if (options.systemPrompt) {
    args.push("--system-prompt", options.systemPrompt);
  }

  if (options.allowBash) {
    args.push("--allowedTools", "Bash");
  }

  const { stdout } = await execFileAsync("claude", args, {
    timeout: 120_000,
    maxBuffer: 1024 * 1024 * 10,
  });

  return stdout.trim();
}
