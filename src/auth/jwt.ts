import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { hash, verify } from '@node-rs/bcrypt';
import { createHash, randomBytes } from 'node:crypto';

// ── Configuration ────────────────────────────────────────────────────────────
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret-change-me');
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 30;

export interface TokenPayload extends JWTPayload {
  sub: string; // user ID
  email: string;
}

// ── Password hashing ─────────────────────────────────────────────────────────
export async function hashPassword(password: string): Promise<string> {
  return hash(password, 12);
}

export async function verifyPassword(password: string, hashed: string): Promise<boolean> {
  return verify(password, hashed);
}

// ── JWT access tokens ────────────────────────────────────────────────────────
export async function createAccessToken(userId: string, email: string): Promise<string> {
  return new SignJWT({ sub: userId, email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(JWT_SECRET);
}

export async function verifyAccessToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as TokenPayload;
  } catch {
    return null;
  }
}

// ── Refresh tokens ───────────────────────────────────────────────────────────
// Refresh tokens are opaque random strings. We store their SHA-256 hash in the DB.
export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function getRefreshTokenExpiry(): Date {
  const d = new Date();
  d.setDate(d.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
  return d;
}
