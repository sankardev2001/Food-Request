import type { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { AppUserDoc } from './mongoHelpers';
import { isSuperAdminUser } from './mongoHelpers';

export const AUTH_COOKIE_NAME = 'fr_session';
const BCRYPT_ROUNDS = 12;
const JWT_EXPIRES_IN = '8h';

export interface AuthTokenPayload {
  sub: string;
  name: string;
  team?: string;
  mobileNo: string;
  role: 'admin' | 'employer';
  isSuperAdmin?: boolean;
}

const loginAttempts = new Map<string, { failures: number; lockedUntil: number }>();
const MAX_LOGIN_FAILURES = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export function getJwtSecret(): string {
  const secret = (process.env.JWT_SECRET || '').trim();
  if (secret.length >= 32) return secret;
  if (process.env.NODE_ENV === 'production') {
    console.error('JWT_SECRET must be set (min 32 chars) in production.');
  }
  return secret || 'dev-only-insecure-jwt-secret-change-me';
}

export function isPasswordHash(stored?: string): boolean {
  return !!stored && stored.startsWith('$2');
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain.trim(), BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, stored?: string): Promise<boolean> {
  if (!stored) return false;
  const normalized = plain.trim();
  if (isPasswordHash(stored)) {
    return bcrypt.compare(normalized, stored);
  }
  return stored === normalized;
}

export function validatePasswordPolicy(plain: string): string | null {
  const p = plain.trim();
  if (p.length < 4) return 'Password must be at least 4 characters.';
  if (p.length > 128) return 'Password is too long.';
  return null;
}

export function sanitizeUserForClient(user: AppUserDoc) {
  const { password: _password, ...safe } = user;
  return safe;
}

export function toUserProfile(user: AppUserDoc) {
  return {
    id: user.id,
    name: user.name,
    team: user.team || '',
    mobileNo: user.mobileNo,
    role: user.userType,
    isSuperAdmin: isSuperAdminUser(user),
    loggedInAt: new Date().toISOString(),
  };
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: JWT_EXPIRES_IN });
}

export function verifyAuthToken(token: string): AuthTokenPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as AuthTokenPayload;
  } catch {
    return null;
  }
}

export function setAuthCookie(res: Response, token: string) {
  const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearAuthCookie(res: Response) {
  const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
  });
}

export function getTokenFromRequest(req: Request): string | null {
  const cookieToken = req.cookies?.[AUTH_COOKIE_NAME];
  if (typeof cookieToken === 'string' && cookieToken) return cookieToken;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  return null;
}

export function checkLoginRateLimit(req: Request, mobileNo: string): { allowed: boolean; retryAfterSec?: number } {
  const key = `${req.ip || 'unknown'}:${mobileNo.trim()}`;
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (entry && entry.lockedUntil > now) {
    return { allowed: false, retryAfterSec: Math.ceil((entry.lockedUntil - now) / 1000) };
  }
  if (entry && entry.lockedUntil <= now && entry.failures >= MAX_LOGIN_FAILURES) {
    loginAttempts.delete(key);
  }
  return { allowed: true };
}

export function recordLoginFailure(req: Request, mobileNo: string) {
  const key = `${req.ip || 'unknown'}:${mobileNo.trim()}`;
  const now = Date.now();
  const entry = loginAttempts.get(key) || { failures: 0, lockedUntil: 0 };
  entry.failures += 1;
  if (entry.failures >= MAX_LOGIN_FAILURES) {
    entry.lockedUntil = now + LOGIN_WINDOW_MS;
  }
  loginAttempts.set(key, entry);
}

export function clearLoginFailures(req: Request, mobileNo: string) {
  const key = `${req.ip || 'unknown'}:${mobileNo.trim()}`;
  loginAttempts.delete(key);
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthTokenPayload;
    }
  }
}

export function requireAuth(options?: { adminOnly?: boolean }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = getTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }
    const payload = verifyAuthToken(token);
    if (!payload) {
      return res.status(401).json({ success: false, error: 'Session expired or invalid. Please log in again.' });
    }
    if (options?.adminOnly && payload.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required.' });
    }
    req.authUser = payload;
    next();
  };
}
