export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function newRunId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
