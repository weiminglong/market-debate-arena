import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_PLAYBOOK, KNOWN_TOOLS, type Playbook } from "../types.js";

const MAX_LESSONS = 10;
const MAX_AVOID_PATTERNS = 5;
const MAX_ENTRY_LENGTH = 300;

// Anchor to the repo root (not process.cwd()); PLAYBOOK_PATH env overrides for
// tests and for isolated (e.g. mock/showcase) runs.
function playbookPath(): string {
  return (
    process.env.PLAYBOOK_PATH ||
    join(dirname(fileURLToPath(import.meta.url)), "..", "..", "strategies", "playbook.json")
  );
}

function stringArray(value: unknown, cap: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .map((s) => s.slice(0, MAX_ENTRY_LENGTH))
    .slice(-cap);
}

// The playbook is written from LLM output and re-injected into every future
// bash-enabled prompt, so validate structure on both read and write: string
// arrays with length caps, and toolPriority restricted to the known tool set.
export function sanitizePlaybook(raw: unknown): Playbook {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ...DEFAULT_PLAYBOOK,
      lessons: [],
      toolPriority: [...KNOWN_TOOLS],
      avoidPatterns: [],
    };
  }

  const record = raw as Record<string, unknown>;

  const requestedTools = Array.isArray(record.toolPriority)
    ? record.toolPriority.filter((t): t is string => typeof t === "string")
    : [];
  const seen = new Set<string>();
  const toolPriority: string[] = [];
  for (const tool of requestedTools) {
    if (KNOWN_TOOLS.includes(tool) && !seen.has(tool)) {
      seen.add(tool);
      toolPriority.push(tool);
    }
  }
  for (const tool of KNOWN_TOOLS) {
    if (!seen.has(tool)) toolPriority.push(tool);
  }

  const generation = Number.isFinite(record.generation)
    ? Math.max(0, Math.floor(record.generation as number))
    : 0;

  return {
    generation,
    lessons: stringArray(record.lessons, MAX_LESSONS),
    toolPriority,
    avoidPatterns: stringArray(record.avoidPatterns, MAX_AVOID_PATTERNS),
  };
}

export function loadPlaybook(): Playbook {
  try {
    const raw = readFileSync(playbookPath(), "utf-8");
    return sanitizePlaybook(JSON.parse(raw));
  } catch {
    return sanitizePlaybook(null);
  }
}

export function savePlaybook(playbook: Playbook): void {
  const path = playbookPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(sanitizePlaybook(playbook), null, 2) + "\n");
}

// Mock runs are simulations: point them at a throwaway playbook so every mock
// run starts fresh (repeatable demo trend) and never overwrites live-learned
// strategy state. Respects an explicitly-set PLAYBOOK_PATH.
export function ensureMockPlaybookIsolation(mock: boolean): void {
  if (!mock || process.env.PLAYBOOK_PATH) return;
  process.env.PLAYBOOK_PATH = join(
    mkdtempSync(join(tmpdir(), "debate-arena-mock-")),
    "playbook.json"
  );
}

export interface PlaybookHistoryEntry {
  generation: number;
  averageScore: number;
  keyMutation: string;
  reverted: boolean;
  playbook: Playbook;
  createdAt: string;
}

// Append-only JSONL trail of every mutation, so regressions can be audited
// and reverted states reconstructed.
export function appendPlaybookHistory(entry: PlaybookHistoryEntry): void {
  const historyPath = join(dirname(playbookPath()), "playbook-history.jsonl");
  try {
    mkdirSync(dirname(historyPath), { recursive: true });
    appendFileSync(historyPath, JSON.stringify(entry) + "\n");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`Warning: could not append playbook history: ${msg}`);
  }
}
