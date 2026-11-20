// Structured JSON logging with request_id. Never log secrets or free-text addresses typed by anonymous users.
export type LogFields = Record<string, unknown>;

export function log(level: "info" | "warn" | "error", event: string, fields: LogFields = {}): void {
  const line = JSON.stringify({ level, event, ts: new Date().toISOString(), ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function errorFields(err: unknown): LogFields {
  if (err instanceof Error) return { error_name: err.name, error_message: err.message };
  return { error_message: String(err) };
}
