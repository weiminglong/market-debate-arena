import { runClaude } from "./claude-runner.js";
import { runCursor } from "./cursor-runner.js";

export const SUPPORTED_AGENT_RUNTIMES = ["claude", "cursor"] as const;
export type AgentRuntime = (typeof SUPPORTED_AGENT_RUNTIMES)[number];

interface AgentRunOptions {
  systemPrompt?: string;
  allowBash?: boolean;
  model?: string;
}

export function parseAgentRuntime(runtime: string | undefined): AgentRuntime {
  if (!runtime) return "claude";

  const normalized = runtime.trim().toLowerCase();
  if (normalized === "claude" || normalized === "cursor") {
    return normalized;
  }

  throw new Error(
    `Unsupported agent runtime "${runtime}". Supported values: ${SUPPORTED_AGENT_RUNTIMES.join(", ")}`
  );
}

export async function runAgent(
  runtime: AgentRuntime,
  prompt: string,
  options: AgentRunOptions = {}
): Promise<string> {
  if (runtime === "cursor") {
    return runCursor(prompt, options);
  }
  return runClaude(prompt, options);
}
