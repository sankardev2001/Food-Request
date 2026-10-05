import fs from 'fs';
import path from 'path';
import type { Db, MongoClientOptions } from 'mongodb';
import { ServerApiVersion } from 'mongodb';
import { normalizeFoodRequestDoc, type FoodRequestShape } from './foodRequestNormalize';

export const MONGODB_DB_NAME = 'food_requester';
export const SUPER_ADMIN_MOBILE = '9500466927';

/** Thrown when MONGODB_URI is missing or Atlas is unreachable (no local/json fallback). */
export class DatabaseUnavailableError extends Error {
  constructor(message = 'Database unavailable. Set MONGODB_URI and ensure MongoDB Atlas is reachable.') {
    super(message);
    this.name = 'DatabaseUnavailableError';
  }
}

export interface AppUserDoc {
  id: string;
  name: string;
  team?: string;
  mobileNo: string;
  password?: string;
  userType: 'employer' | 'admin';
  isSuperAdmin?: boolean;
  createdAt: string;
}

/** Strip wrapping quotes Vercel/env files sometimes add to MONGODB_URI. */
export function normalizeMongoUri(raw: string | undefined): string {
  if (!raw) return '';
  let uri = raw.trim();
  if (
    (uri.startsWith('"') && uri.endsWith('"')) ||
    (uri.startsWith("'") && uri.endsWith("'"))
  ) {
    uri = uri.slice(1, -1).trim();
  }
  return ensureMongoDatabaseInUri(uri);
}

/** Atlas URIs like `...mongodb.net/?appName=` have no DB — default to food_requester. */
export function ensureMongoDatabaseInUri(uri: string, dbName = MONGODB_DB_NAME): string {
  if (!uri || !/^mongodb(\+srv)?:\/\//.test(uri)) return uri;
  if (/^mongodb(\+srv)?:\/\/[^/]+\/[^/?]+/.test(uri)) return uri;
  if (uri.includes('?')) {
    return uri.replace(/^(mongodb(?:\+srv)?:\/\/[^/?]+)\/?\?/, `$1/${dbName}?`);
  }
  return uri.replace(/^(mongodb(?:\+srv)?:\/\/[^/?]+)\/?$/, `$1/${dbName}`);
}

/** Detect common Atlas URI mistakes before connect (Vercel env copy/paste). */
export function getMongoUriFormatError(uri: string): string | null {
  if (!uri) return null;
  if (!/^mongodb(\+srv)?:\/\//.test(uri)) {
    return 'MONGODB_URI must start with mongodb:// or mongodb+srv://';
  }
  const rest = uri.replace(/^mongodb(\+srv)?:\/\//, '');
  const at = rest.indexOf('@');
  if (at === -1) {
    return 'MONGODB_URI must be user:password@host (check username and password).';
  }
  const userInfo = rest.slice(0, at);
  if (userInfo.includes('@')) {
    return 'Password contains @ — URL-encode as %40 in MONGODB_URI (Vercel env).';
  }
  if (!userInfo.includes(':')) {
    return 'MONGODB_URI must include database username and password before @.';
  }
  return null;
}

/** Shared options for Atlas from serverless (Vercel) and local server. */
export function getMongoClientOptions(overrides?: MongoClientOptions): MongoClientOptions {
  return {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
    maxPoolSize: 5,
    maxIdleTimeMS: 60_000,
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
    ...overrides,
  };
}

/** Plain-language fixes for Atlas TLS / auth errors in logs. */
export function getMongoConnectionTroubleshooting(errorMessage: string | null): string[] {
  if (!errorMessage) return [];
  const lower = errorMessage.toLowerCase();
  const hints: string[] = [];
  if (
    lower.includes('alert internal error') ||
    lower.includes('err_ssl') ||
    lower.includes('ssl routines') ||
    lower.includes('tlsv1 alert') ||
    lower.includes('socket disconnected') ||
    lower.includes('secure tls connection')
  ) {
    hints.push(
      'Your network (corporate VPN/firewall) may block MongoDB Atlas TLS — try mobile hotspot or home Wi‑Fi.',
      'Atlas → Network Access: add your current public IP or 0.0.0.0/0 for testing.',
      'Confirm MONGODB_URI in `.env` matches Atlas (user, password, `/food_requester`).',
      'Production on Vercel may work even when localhost cannot reach Atlas.',
    );
  }
  if (lower.includes('authentication failed') || lower.includes('bad auth')) {
    hints.push(
      'Atlas rejected the password in MONGODB_URI — reset the DB user password in Atlas → Database Access.',
      'Update MONGODB_URI on Vercel (Production) to match; URL-encode special characters in the password.',
      'Redeploy after changing env vars (same URI as working local `.env` if local connects).',
    );
  }
  return hints;
}

export function isSuperAdminUser(user: Pick<AppUserDoc, 'isSuperAdmin' | 'id' | 'mobileNo'>): boolean {
  return (
    !!user.isSuperAdmin ||
    user.id === 'usr-subash-superadmin' ||
    user.mobileNo.trim() === SUPER_ADMIN_MOBILE
  );
}

/** Normalize legacy user records that still have cpsNo / aadharNumber in JSON or MongoDB. */
export function normalizeAppUser(raw: Record<string, unknown>): AppUserDoc {
  const mobileNo = String(raw.mobileNo ?? '').trim();
  const user: AppUserDoc = {
    id: String(raw.id ?? `usr-${Date.now()}`),
    name: String(raw.name ?? '').trim(),
    team: raw.team != null ? String(raw.team).trim() : '',
    mobileNo,
    password: raw.password != null && raw.password !== '' ? String(raw.password) : undefined,
    userType: raw.userType === 'admin' ? 'admin' : 'employer',
    isSuperAdmin: !!raw.isSuperAdmin || mobileNo === SUPER_ADMIN_MOBILE,
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
  };
  if (user.id === 'usr-subash-superadmin') {
    user.isSuperAdmin = true;
  }
  return user;
}

export function readLocalUsersFile(): AppUserDoc[] {
  const candidates = [
    path.join(process.cwd(), 'data', 'users.json'),
    path.join(process.cwd(), '..', 'data', 'users.json'),
  ];
  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((u) => normalizeAppUser(u as Record<string, unknown>));
      }
    } catch {
      /* try next path */
    }
  }
  return [];
}

export async function upsertUsersToMongo(db: Db, users: AppUserDoc[]): Promise<number> {
  let count = 0;
  const col = db.collection<AppUserDoc>('users');
  for (const user of users) {
    await col.updateOne({ id: user.id }, { $set: user }, { upsert: true });
    count += 1;
  }
  return count;
}

export function readLocalFoodRequestsFile(): FoodRequestShape[] {
  const candidates = [
    path.join(process.cwd(), 'data', 'food_requests.json'),
    path.join(process.cwd(), '..', 'data', 'food_requests.json'),
  ];
  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (!Array.isArray(parsed)) continue;
      return parsed.map((r) =>
        normalizeFoodRequestDoc(r as Record<string, unknown>)
      );
    } catch {
      /* try next path */
    }
  }
  return [];
}

export async function upsertFoodRequestsToMongo(
  db: Db,
  requests: FoodRequestShape[]
): Promise<number> {
  let count = 0;
  const col = db.collection<FoodRequestShape>('food_requests');
  for (const raw of requests) {
    const doc = normalizeFoodRequestDoc(raw as unknown as Record<string, unknown>);
    await col.updateOne({ id: doc.id }, { $set: doc }, { upsert: true });
    count += 1;
  }
  return count;
}
