import chalk from "chalk";

// Live agent phases run for minutes with no output; a periodic elapsed-time
// line is the only way to tell a hung 240s subprocess from normal work.
export function startHeartbeat(label: string, intervalMs = 20_000): () => void {
  const started = Date.now();
  const timer = setInterval(() => {
    const elapsed = Math.round((Date.now() - started) / 1000);
    console.log(chalk.gray(`    ... ${label} (${elapsed}s elapsed)`));
  }, intervalMs);
  // Never keep the process alive just for progress lines.
  timer.unref();
  return () => clearInterval(timer);
}

export function formatDuration(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms)) return "-";
  const seconds = Math.round(ms / 1000);
  if (seconds < 90) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m${String(seconds % 60).padStart(2, "0")}s`;
}
