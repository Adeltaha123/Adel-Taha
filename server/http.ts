import type { Context, MiddlewareHandler } from 'hono';
import { z } from 'zod';
import { PublicError } from './public-error.js';

export class HttpError extends Error { constructor(public statusCode: number, message: string) { super(message); } }

/** Turns thrown errors into JSON responses; only deliberately public messages are shown for server failures. */
export function errorResponse(error: unknown, c: Context) {
  if (error instanceof z.ZodError) return c.json({ error: 'Invalid request', details: error.issues.map(i => i.message) }, 400);
  if (error instanceof SyntaxError) return c.json({ error: 'Invalid request', details: ['The body is not valid JSON.'] }, 400);
  const status = (error as HttpError).statusCode ?? 500;
  const message = status >= 500 && !(error instanceof PublicError) ? 'The server could not complete this request.' : (error as Error).message;
  if (status >= 500 && !(error instanceof PublicError)) console.error(error);
  return c.json({ error: message, ...(error instanceof PublicError && error.code ? { code: error.code } : {}) }, status as 400);
}

/** Parses a JSON body with a schema; an empty body counts as {}. */
export async function body<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  const text = await c.req.text();
  return schema.parse(text.trim() ? JSON.parse(text) : {});
}

/** The caller's address: Cloudflare and proxies send it in headers; Node knows the socket. */
export function clientAddress(c: Context) {
  const incoming = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming;
  return c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? incoming?.socket?.remoteAddress ?? 'unknown';
}

/**
 * Fixed-window request limits per caller address, kept in memory. On Cloudflare each server location keeps its
 * own counts, so limits there are per location rather than global; they still stop rapid password guessing.
 */
export function rateLimiter(enabled: boolean) {
  const windows = new Map<string, { start: number; count: number }>();
  return (name: string, max: number, windowMs = 60_000): MiddlewareHandler => async (c, next) => {
    if (!enabled) return next();
    const now = Date.now(), key = `${name}:${clientAddress(c)}`;
    if (windows.size > 10_000) for (const [k, w] of windows) if (now - w.start >= windowMs) windows.delete(k);
    const current = windows.get(key);
    const window = current && now - current.start < windowMs ? current : { start: now, count: 0 };
    window.count++; windows.set(key, window);
    if (window.count > max) {
      c.header('Retry-After', String(Math.ceil((window.start + windowMs - now) / 1000)));
      return c.json({ error: 'Too many requests. Please wait a minute and try again.' }, 429);
    }
    return next();
  };
}
