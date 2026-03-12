import type { Context, Next } from 'hono';
import { verifyAccessToken, type TokenPayload } from './jwt';

// Extend Hono's context variables
declare module 'hono' {
  interface ContextVariableMap {
    user: TokenPayload;
  }
}

/**
 * Middleware: requires a valid JWT access token in the Authorization header.
 * Sets c.get('user') with { sub, email } on success.
 */
export async function requireAuth(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }

  const token = authHeader.slice(7);
  const payload = await verifyAccessToken(token);
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  c.set('user', payload);
  await next();
}

/**
 * Middleware: optionally attaches user if a valid token is present.
 * Does NOT reject the request if no token is found.
 */
export async function optionalAuth(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = await verifyAccessToken(token);
    if (payload) {
      c.set('user', payload);
    }
  }
  await next();
}
