import fs from 'fs';
import path from 'path';
import type { Db } from 'mongodb';
import { normalizeFoodRequestDoc, type FoodRequestShape } from './foodRequestHelpers';

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
  return uri;
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
