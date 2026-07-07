export interface ExecError extends Error {
  code?: string | number;
  killed?: boolean;
  signal?: string | null;
  stdout?: string;
  stderr?: string;
}

// Node-enforced timeout kills reject with a generic "Command failed" message;
// only the structured properties identify them reliably.
export function isTransientExecError(e: unknown): boolean {
  const err = e as ExecError;
  if (err?.killed === true || err?.signal === "SIGTERM") return true;
  const code = String(err?.code ?? "");
  return code === "ETIMEDOUT" || code === "ECONNRESET";
}
