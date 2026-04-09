import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_PLAYBOOK, type Playbook } from "../types.js";

const PLAYBOOK_PATH = join(process.cwd(), "strategies", "playbook.json");

export function loadPlaybook(): Playbook {
  try {
    const raw = readFileSync(PLAYBOOK_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed.generation && parsed.generation !== 0) {
      return { ...DEFAULT_PLAYBOOK };
    }
    return parsed as Playbook;
  } catch {
    return { ...DEFAULT_PLAYBOOK };
  }
}

export function savePlaybook(playbook: Playbook): void {
  writeFileSync(PLAYBOOK_PATH, JSON.stringify(playbook, null, 2) + "\n");
}
