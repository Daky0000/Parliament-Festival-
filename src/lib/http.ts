import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export const unauthorized = () => new HttpError(401, "Unauthorized");
export const forbidden = () => new HttpError(403, "Forbidden");
export const notFound = () => new HttpError(404, "Not found");
export const badRequest = (message = "Bad request", details?: unknown) => new HttpError(400, message, details);

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(data, { ...init, headers });
}

/** Maps thrown errors to safe JSON responses; never leaks stack traces. */
export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return json(err.details ? { error: err.message, details: err.details } : { error: err.message }, {
      status: err.status,
    });
  }
  if (err instanceof ZodError) {
    return json({ error: "Invalid request", details: err.issues.map((i) => ({ path: i.path, message: i.message })) }, { status: 400 });
  }
  const correlationId = crypto.randomUUID();
  console.error(`[${correlationId}]`, err);
  return json({ error: "Internal error", correlationId }, { status: 500 });
}

/** Parses a JSON body; a malformed body is a 400, not a 500. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw badRequest("Body must be valid JSON");
  }
}
