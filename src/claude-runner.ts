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
    // Debaters only need the surf CLI; an unscoped Bash grant would let
    // prompt-injected market/web content run arbitrary commands unattended.
    // --permission-mode default enforces the allowlist even when the ambient
    // user config defaults to bypassPermissions.
    args.push("--allowedTools", "Bash(surf:*)", "--permission-mode", "default");
  }

  const { stdout } = await execFileAsync("claude", args, {
    // Research runs (6-8 surf calls + reasoning) routinely exceed 120s.
    timeout: options.allowBash ? 240_000 : 120_000,
    maxBuffer: 1024 * 1024 * 10,
  });

  return stdout.trim();
}
