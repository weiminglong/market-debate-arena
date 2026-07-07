import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSequentialRunner } from "./sequential-runner.js";

const execFileAsync = promisify(execFile);

interface CursorOptions {
  systemPrompt?: string;
  allowBash?: boolean;
  model?: string;
}

// SECURITY: with --force the cursor runtime grants unrestricted shell to a
// model that is fed untrusted market/web content — unlike the claude runtime,
// whose bash is allowlisted to surf. The scratch workspace below only isolates
// file writes, not command execution. Prefer the claude runtime for unattended
// runs; use cursor only with trusted inputs on an isolated machine.
// The "do not edit files" rule below is prompt text only — so point the agent
// at a throwaway workspace instead of the repo to keep any file writes away
// from project state.
let scratchWorkspace: string | null = null;
function getScratchWorkspace(): string {
  const workspace =
    scratchWorkspace ?? mkdtempSync(join(tmpdir(), "debate-arena-cursor-"));
  scratchWorkspace = workspace;
  return workspace;
}

function mapModelForCursor(model: string | undefined): string | undefined {
  if (!model) return undefined;

  const normalized = model.trim().toLowerCase();
  if (normalized === "sonnet") return "sonnet-4";
  if (normalized === "haiku") return undefined;
  return model;
}

function buildPrompt(prompt: string, systemPrompt?: string): string {
  const parts: string[] = [];
  if (systemPrompt) {
    parts.push(`SYSTEM INSTRUCTIONS:\n${systemPrompt}`);
  }
  parts.push(`TASK:\n${prompt}`);
  parts.push(
    [
      "CONSTRAINTS:",
      "- Use shell commands only if needed for data gathering.",
      "- Do not edit, create, or delete files.",
      "- Return only the final answer in the requested format.",
    ].join("\n")
  );
  return parts.join("\n\n");
}

export async function runCursor(
  prompt: string,
  options: CursorOptions = {}
): Promise<string> {
  return runCursorSequential(prompt, options);
}

async function runCursorInternal(
  prompt: string,
  options: CursorOptions = {}
): Promise<string> {
  const args = [
    "--print",
    "--trust",
    "--workspace",
    getScratchWorkspace(),
  ];

  const mappedModel = mapModelForCursor(options.model);
  if (mappedModel) {
    args.push("--model", mappedModel);
  }

  if (options.allowBash) {
    args.push("--force");
  } else {
    args.push("--mode", "ask");
  }

  args.push(buildPrompt(prompt, options.systemPrompt));

  const { stdout } = await execFileAsync("cursor-agent", args, {
    timeout: options.allowBash ? 240_000 : 120_000,
    maxBuffer: 1024 * 1024 * 10,
  });

  return stdout.trim();
}

const runCursorSequential = createSequentialRunner(runCursorInternal);
