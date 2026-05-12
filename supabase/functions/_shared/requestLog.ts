/**
 * One-line structured request logs for Edge functions.
 * Never logs bodies, headers, API keys, or raw JWTs — only a salted short user hash when `uid` is supplied.
 */

export type RequestLogOutcome = "ok" | "error" | "429" | "400";

const te = new TextEncoder();

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", te.encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Salted, truncated hash of user id for correlating logs without storing raw ids. */
export async function hashUserIdForLog(userId: string): Promise<string> {
  const salt = (Deno.env.get("REQUEST_LOG_USER_SALT") ?? "").trim();
  const material = salt.length > 0 ? `${userId}:${salt}` : `${userId}:REQUEST_LOG_USER_SALT_UNSET`;
  const hex = await sha256Hex(material);
  return hex.slice(0, 16);
}

export class RequestLogHandle {
  readonly reqId: string;
  readonly fn: string;
  readonly started: number;
  userId: string | null = null;
  /** Short non-sensitive diagnostic (no tokens / PII). */
  detail: string | undefined;

  constructor(fn: string) {
    this.reqId = crypto.randomUUID();
    this.fn = fn;
    this.started = Date.now();
  }

  setUser(id: string | null | undefined) {
    if (id && typeof id === "string") this.userId = id;
  }

  setDetail(msg: string, maxLen = 80) {
    const t = msg.replace(/\s+/g, " ").trim();
    this.detail = t.length > maxLen ? `${t.slice(0, maxLen)}…` : t;
  }
}

function outcomeFromStatus(status: number): RequestLogOutcome {
  if (status === 429) return "429";
  if (status >= 500) return "error";
  if (status >= 400) return "400";
  return "ok";
}

export async function emitRequestLogLine(
  req: Request,
  log: RequestLogHandle,
  res: Response,
): Promise<void> {
  const ms = Date.now() - log.started;
  const st = res.status;
  const outcome = outcomeFromStatus(st);
  const user_h = log.userId ? await hashUserIdForLog(log.userId) : null;
  console.log(
    JSON.stringify({
      req_id: log.reqId,
      fn: log.fn,
      method: req.method,
      outcome,
      http_status: st,
      user_h,
      ts: new Date().toISOString(),
      ms,
      ...(log.detail ? { detail: log.detail } : {}),
    }),
  );
}

/**
 * Wraps a handler so every response emits a single JSON console line (try/finally semantics).
 */
export function withRequestLog(
  fn: string,
  handler: (req: Request, log: RequestLogHandle) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req) => {
    const log = new RequestLogHandle(fn);
    let res: Response;
    try {
      res = await handler(req, log);
    } catch (e) {
      if (e instanceof Response) {
        res = e;
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        log.setDetail(msg);
        res = new Response(JSON.stringify({ error: "Internal server error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    await emitRequestLogLine(req, log, res);
    return res;
  };
}
