import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { AGENT_EXEC, MODELS } from "./config.js";
import type { AgentRunOptions } from "./agent-runner.js";

const execFileAsync = promisify(execFile);

export async function runClaude(
  prompt: string,
  options: AgentRunOptions = {}
): Promise<string> {
  const args = [
    "-p",
    prompt,
    "--model",
    options.model || MODELS.debater,
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
    timeout: options.allowBash ? AGENT_EXEC.bashTimeoutMs : AGENT_EXEC.plainTimeoutMs,
    maxBuffer: AGENT_EXEC.maxBuffer,
  });

  return stdout.trim();
}
