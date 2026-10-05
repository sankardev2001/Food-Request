import express, { Request, Response } from 'express';
import path from 'path';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createServer as createViteServer } from 'vite';
import * as XLSX from 'xlsx';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { runMigration } from './scripts/migrate';
import { runSeeding } from './scripts/seed';
import { getFirebaseAdminDb } from './src/firebase-admin';
import {
  AppUserDoc,
  MONGODB_DB_NAME,
  SUPER_ADMIN_MOBILE,
  normalizeAppUser,
  normalizeMongoUri,
  readLocalUsersFile,
  isSuperAdminUser,
  upsertUsersToMongo,
  upsertFoodRequestsToMongo,
  readLocalFoodRequestsFile,
  DatabaseUnavailableError,
} from './src/mongoHelpers';
import { requireAuth, sanitizeUserForClient } from './src/authSecurity';
import {
  handleLoginRequest,
  handleLogoutRequest,
  handleMeRequest,
  hashPasswordForStorage,
} from './src/authHandlers';
import {
  buildFoodRequest,
  canManageRequest,
  normalizeBeneficiaryRole,
  normalizeFoodRequestDoc,
  normalizeMealType,
  validateEmployerFoodBody,
} from './src/foodRequestHelpers';
import type { AuthTokenPayload } from './src/authSecurity';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// ---------------- DATA MODELS ----------------

export type { AppUserDoc };

export interface FoodRequestDoc {
  id: string;
  date: string;
  requesterName: string;
  requesterCps: string;
  requesterMobile: string;
  name: string;
  aadharNumber?: string;
  beneficiaryRole?: 'CPS' | 'Contractor';
  vegNonVeg: 'Veg' | 'Non-Veg';
  type: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snacks' | string;
  remarks?: string;
  createdAt: string;
  createdByRole?: string;
}

async function findRequestById(id: string): Promise<FoodRequestDoc | undefined> {
  const all = await getAllRequests();
  return all.find((r) => r.id === id);
}

const SEED_SUPER_ADMIN: AppUserDoc = {
  id: 'usr-subash-superadmin',
  name: 'subash',
  mobileNo: SUPER_ADMIN_MOBILE,
  password: '1234',
  userType: 'admin',
  isSuperAdmin: true,
  createdAt: new Date().toISOString(),
};

// ---------------- MONGODB CLIENT & HELPERS ----------------
let mongoClient: MongoClient | null = null;
let currentMongoUri: string = normalizeMongoUri(process.env.MONGODB_URI);
let isMongoConnected = false;
let mongoLastError: string | null = null;

async function getMongoClient(overrideUri?: string): Promise<MongoClient | null> {
  const uri = normalizeMongoUri(overrideUri || currentMongoUri || process.env.MONGODB_URI);
  if (!uri || uri.trim() === '') {
    return null;
  }

  if (uri.includes('<db_password>') || uri.includes('<password>') || uri.includes('<username>')) {
    mongoLastError = 'Placeholder detected: Please replace "<db_password>" in your MongoDB connection string with your actual Atlas user password.';
    isMongoConnected = false;
    return null;
  }

  try {
    if (!mongoClient || (overrideUri && overrideUri !== currentMongoUri)) {
      if (mongoClient) {
        try {
          await mongoClient.close();
        } catch {}
      }
      mongoClient = new MongoClient(uri, { serverSelectionTimeoutMS: 4000 });
      await mongoClient.connect();
      currentMongoUri = uri;
      isMongoConnected = true;
      mongoLastError = null;
      console.log('Connected successfully to MongoDB Atlas database!');

      // Ensure super admin exists in MongoDB users collection
      const db = mongoClient.db(MONGODB_DB_NAME);
      const usersCol = db.collection<AppUserDoc>('users');
      const adminDoc = await usersCol.findOne({ id: 'usr-subash-superadmin' });
      if (!adminDoc) {
        await usersCol.insertOne({ ...SEED_SUPER_ADMIN });
        console.log('Seeded super admin subash to MongoDB users collection.');
      }
    }
    return mongoClient;
  } catch (err: any) {
    isMongoConnected = false;
    mongoLastError = err.message || 'Connection failed';
    console.warn('MongoDB Atlas connection error:', mongoLastError);
    return null;
  }
}

async function getDbOrThrow() {
  const client = await getMongoClient();
  if (!client || !isMongoConnected) {
    throw new DatabaseUnavailableError(
      mongoLastError
        ? `Database unavailable: ${mongoLastError}`
        : undefined
    );
  }
  return client.db(MONGODB_DB_NAME);
}

// ---------------- DATABASE ACCESSORS: USERS TABLE (MongoDB only) ----------------
async function getAllUsers(): Promise<AppUserDoc[]> {
  const db = await getDbOrThrow();
  const docs = await db.collection<AppUserDoc>('users').find({}).sort({ createdAt: -1 }).toArray();
  return docs.map((d) => normalizeAppUser(d as unknown as Record<string, unknown>));
}

async function saveUser(user: AppUserDoc): Promise<AppUserDoc> {
  const db = await getDbOrThrow();
  await db.collection<AppUserDoc>('users').updateOne({ id: user.id }, { $set: user }, { upsert: true });
  return user;
}

async function deleteUserById(id: string): Promise<boolean> {
  const db = await getDbOrThrow();
  await db.collection<AppUserDoc>('users').deleteOne({ id });
  return true;
}

// ---------------- DATABASE ACCESSORS: FOOD REQUESTS TABLE (MongoDB only) ----------------
async function getAllRequests(): Promise<FoodRequestDoc[]> {
  const db = await getDbOrThrow();
  const docs = await db
    .collection<FoodRequestDoc>('food_requests')
    .find({})
    .sort({ createdAt: -1 })
    .toArray();
  return docs.map(
    (doc) =>
      normalizeFoodRequestDoc(doc as unknown as Record<string, unknown>) as FoodRequestDoc
  );
}

async function saveRequest(reqDoc: FoodRequestDoc): Promise<FoodRequestDoc> {
  const stored = normalizeFoodRequestDoc(
    reqDoc as unknown as Record<string, unknown>
  ) as FoodRequestDoc;
  const db = await getDbOrThrow();
  await db
    .collection<FoodRequestDoc>('food_requests')
    .updateOne({ id: stored.id }, { $set: stored }, { upsert: true });
  return stored;
}

async function deleteRequestById(id: string): Promise<boolean> {
  const db = await getDbOrThrow();
  await db.collection<FoodRequestDoc>('food_requests').deleteOne({ id });
  return true;
}

// ---------------- REST API ENDPOINTS ----------------

// System health and storage status
app.get('/api/health', async (req: Request, res: Response) => {
  await getMongoClient();
  res.json({
    status: 'ok',
    storage: isMongoConnected ? 'mongodb_atlas' : 'unavailable',
    databaseRequired: true,
    isMongoConnected,
    hasMongoUri: !!(currentMongoUri || process.env.MONGODB_URI),
    mongoLastError,
    timestamp: new Date().toISOString(),
  });
});

// MongoDB Connection diagnostics and interactive test endpoint
app.post('/api/mongodb/test', requireAuth({ adminOnly: true }), async (req: Request, res: Response) => {
  const { uri } = req.body;
  if (!uri || typeof uri !== 'string' || !uri.startsWith('mongodb')) {
    return res.status(400).json({
      success: false,
      error: 'Invalid MongoDB connection string. Must start with "mongodb://" or "mongodb+srv://".',
    });
  }

  const start = Date.now();
  let testClient: MongoClient | null = null;
  try {
    testClient = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    await testClient.connect();
    const pingRes = await testClient.db('admin').command({ ping: 1 });
    const pingMs = Date.now() - start;
    const db = testClient.db(MONGODB_DB_NAME);
    const collections = await db.listCollections().toArray();

    res.json({
      success: true,
      pingMs,
      message: 'Successfully connected and pinged MongoDB Atlas!',
      collections: collections.map((c) => c.name),
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: err.message || 'Connection failed',
      suggestion:
        'Ensure you have added IP Address 0.0.0.0/0 (Allow Access from Anywhere) in MongoDB Atlas Network Access, and checked your username/password.',
    });
  } finally {
    if (testClient) {
      try {
        await testClient.close();
      } catch {}
    }
  }
});

// Switch active database to new MongoDB URI dynamically
app.post('/api/mongodb/connect', requireAuth({ adminOnly: true }), async (req: Request, res: Response) => {
  const { uri } = req.body;
  if (!uri) {
    return res.status(400).json({ success: false, error: 'URI required' });
  }

  try {
    const client = await getMongoClient(uri);
    if (client && isMongoConnected) {
      res.json({
        success: true,
        message:
          'Connected to MongoDB Atlas. All reads and writes use the database only (use /api/db/sync-* to import legacy JSON once).',
      });
    } else {
      res.status(400).json({
        success: false,
        error: mongoLastError || 'Could not connect with the provided MongoDB URI.',
      });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Trigger database migration (create collections, indexes, migrate legacy data)
app.post('/api/db/migrate', requireAuth({ adminOnly: true }), async (req: Request, res: Response) => {
  try {
    const { uri } = req.body;
    const result = await runMigration(uri || currentMongoUri || process.env.MONGODB_URI);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Migration execution failed.' });
  }
});

// Trigger database seeding (seed super admin subash)
app.post('/api/db/seed', requireAuth({ adminOnly: true }), async (req: Request, res: Response) => {
  try {
    const { uri } = req.body;
    const result = await runSeeding(uri || currentMongoUri || process.env.MONGODB_URI);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Seeding execution failed.' });
  }
});

// Upsert data/users.json into MongoDB Atlas
app.post('/api/db/sync-users', requireAuth({ adminOnly: true }), async (req: Request, res: Response) => {
  try {
    const localUsers = readLocalUsersFile();
    if (localUsers.length === 0) {
      return res.status(400).json({ success: false, error: 'No users found in data/users.json.' });
    }

    const client = await getMongoClient();
    if (!client || !isMongoConnected) {
      return res.status(400).json({
        success: false,
        error: mongoLastError || 'MongoDB is not connected. Set MONGODB_URI and check Atlas network access.',
      });
    }

    const db = client.db(MONGODB_DB_NAME);
    const synced = await upsertUsersToMongo(db, localUsers);
    const userCount = await db.collection('users').countDocuments();
    res.json({ success: true, mode: 'mongodb', synced, userCount });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'User sync failed.' });
  }
});

app.post('/api/db/sync-requests', requireAuth({ adminOnly: true }), async (req: Request, res: Response) => {
  try {
    const source = readLocalFoodRequestsFile().map((r) =>
      normalizeFoodRequestDoc(r as unknown as Record<string, unknown>)
    ) as FoodRequestDoc[];
    if (source.length === 0) {
      return res.status(400).json({ success: false, error: 'No food requests found to sync.' });
    }

    const client = await getMongoClient();
    if (!client || !isMongoConnected) {
      return res.status(400).json({
        success: false,
        error: mongoLastError || 'MongoDB is not connected.',
      });
    }

    const db = client.db(MONGODB_DB_NAME);
    const synced = await upsertFoodRequestsToMongo(db, source);
    const requestCount = await db.collection('food_requests').countDocuments();
    res.json({ success: true, mode: 'mongodb', synced, requestCount });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Request sync failed.' });
  }
});

// ---------------- USER AUTHENTICATION & DIRECTORY ----------------

app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    await handleLoginRequest(req, res, { getAllUsers, saveUser });
  } catch (error: unknown) {
    if (error instanceof DatabaseUnavailableError) {
      return res.status(503).json({ success: false, error: error.message });
    }
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Login authentication failed.' });
  }
});

app.post('/api/auth/logout', (req: Request, res: Response) => {
  handleLogoutRequest(req, res);
});

app.get('/api/auth/me', (req: Request, res: Response) => {
  handleMeRequest(req, res);
});

app.get('/api/users', requireAuth({ adminOnly: true }), async (req: Request, res: Response) => {
  try {
    const users = (await getAllUsers()).map(sanitizeUserForClient);
    res.json({ success: true, count: users.length, users });
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to retrieve users.' });
  }
});

app.post('/api/users', requireAuth({ adminOnly: true }), async (req: Request, res: Response) => {
  try {
    const { name, team, mobileNo, password, userType } = req.body;

    if (!name || !mobileNo || !password || !userType) {
      return res.status(400).json({
        error: 'Full Name, Mobile Number, Password, and User Type are required.',
      });
    }

    const cleanMobile = String(mobileNo).trim();

    const existingUsers = await getAllUsers();
    const duplicate = existingUsers.find((u) => u.mobileNo.trim() === cleanMobile);
    if (duplicate) {
      return res.status(400).json({
        error: `A user with mobile number "${cleanMobile}" already exists (${duplicate.name}).`,
      });
    }

    const hashed = await hashPasswordForStorage(String(password));
    if (typeof hashed !== 'string') {
      return res.status(400).json({ error: hashed.error });
    }

    const newUser: AppUserDoc = {
      id: `usr-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: name.trim(),
      team: team != null ? String(team).trim() : '',
      mobileNo: cleanMobile,
      password: hashed,
      userType: userType === 'admin' ? 'admin' : 'employer',
      isSuperAdmin: false,
      createdAt: new Date().toISOString(),
    };

    const saved = await saveUser(newUser);
    res.status(201).json({ success: true, user: sanitizeUserForClient(saved) });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to create user in user table.' });
  }
});

// PUT /api/users/:id - Update user profile (admin)
app.put('/api/users/:id', requireAuth({ adminOnly: true }), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, team, mobileNo } = req.body;
    const allUsers = await getAllUsers();
    const target = allUsers.find((u) => u.id === id);
    if (!target) return res.status(404).json({ error: 'User not found.' });
    if (isSuperAdminUser(target) && mobileNo && mobileNo.trim() !== target.mobileNo) {
      return res.status(403).json({ error: 'Super Admin mobile cannot be changed here.' });
    }
    if (name) target.name = String(name).trim();
    if (team !== undefined) target.team = String(team).trim();
    if (mobileNo) {
      const clean = String(mobileNo).trim();
      const dup = allUsers.find((u) => u.id !== id && u.mobileNo.trim() === clean);
      if (dup) {
        return res.status(400).json({ error: `Mobile number already used by ${dup.name}.` });
      }
      target.mobileNo = clean;
    }
    const saved = await saveUser(target);
    res.json({ success: true, user: sanitizeUserForClient(saved) });
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to update user.' });
  }
});

app.put('/api/users/:id/password', requireAuth({ adminOnly: true }), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ error: 'New password is required.' });
    }

    const allUsers = await getAllUsers();
    const target = allUsers.find((u) => u.id === id);

    if (!target) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const hashed = await hashPasswordForStorage(newPassword);
    if (typeof hashed !== 'string') {
      return res.status(400).json({ error: hashed.error });
    }
    target.password = hashed;
    await saveUser(target);

    res.json({ success: true, message: `Password updated for ${target.name}.` });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update password.' });
  }
});

// DELETE /api/users/:id - Delete a user (Cannot delete super admin)
app.delete('/api/users/:id', requireAuth({ adminOnly: true }), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const allUsers = await getAllUsers();
    const target = allUsers.find((u) => u.id === id);

    if (!target) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (isSuperAdminUser(target)) {
      return res.status(403).json({ error: 'Super Admin subash cannot be deleted.' });
    }

    await deleteUserById(id);
    res.json({ success: true, message: `User ${target.name} removed successfully.` });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete user.' });
  }
});

// ---------------- FOOD REQUESTS ENDPOINTS ----------------

// GET /api/requests/recent - Polling endpoint
app.get('/api/requests/recent', requireAuth({ adminOnly: true }), async (req: Request, res: Response) => {
  try {
    const since = req.query.since as string;
    if (!since) return res.status(400).json({ error: 'Since timestamp required.' });

    const allRequests = await getAllRequests();
    const newRequests = allRequests.filter((r) => r.createdAt > since);

    res.json({ success: true, count: newRequests.length, requests: newRequests });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch recent requests.' });
  }
});

// GET /api/requests - Get food requests with strict access control
app.get('/api/requests', requireAuth(), async (req: Request, res: Response) => {
  try {
    const role = (req.query.role as string) || 'employer';
    if (role === 'admin' && req.authUser?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    const requesterMobile = (req.query.mobileNo as string) || (req.query.cpsNo as string) || '';
    const date = req.query.date as string;
    const search = ((req.query.search as string) || '').toLowerCase();
    const type = req.query.type as string;

    let all = await getAllRequests();

    // STRICT ACCESS CONTROL:
    // Employer can ONLY access their own food request submissions.
    // Employer CANNOT view the full master Excel sheet or other employees' requests.
    if (role === 'employer') {
      const mobile = (requesterMobile || req.authUser?.mobileNo || '').trim();
      if (!mobile) {
        return res.status(403).json({ error: 'Mobile number required for employer request access.' });
      }
      if (req.authUser?.mobileNo !== mobile) {
        return res.status(403).json({ error: 'You can only view your own requests.' });
      }
      all = all.filter(
        (r) =>
          r.requesterMobile.trim() === mobile ||
          r.requesterCps.toUpperCase() === mobile.toUpperCase()
      );
    }

    // Filter by date
    if (date) {
      all = all.filter((r) => r.date === date);
    }

    // Filter by meal type (Breakfast, Lunch, Dinner, Snacks)
    if (type && type !== 'all') {
      all = all.filter((r) => r.type.toLowerCase() === type.toLowerCase());
    }

    // Search query
    if (search) {
      all = all.filter(
        (r) =>
          r.name.toLowerCase().includes(search) ||
          r.requesterName.toLowerCase().includes(search) ||
          (r.aadharNumber && r.aadharNumber.includes(search)) ||
          r.requesterCps.toLowerCase().includes(search) ||
          r.type.toLowerCase().includes(search)
      );
    }

    res.json({ success: true, count: all.length, requests: all });
  } catch (error: any) {
    console.error('Error fetching food requests:', error);
    res.status(500).json({ error: 'Failed to retrieve food requests.' });
  }
});

async function pushFoodRequestNotification(saved: FoodRequestDoc) {
  const adminDb = getFirebaseAdminDb();
  if (!adminDb) return;
  try {
    await adminDb.ref('/admin_notifications').push({
      id: saved.id,
      createdAt: saved.createdAt,
      type: saved.type,
      beneficiaryName: saved.name,
      requesterName: saved.requesterName,
      requesterMobile: saved.requesterMobile,
    });
  } catch (fbErr) {
    console.error('Failed to push Firebase notification:', fbErr);
  }
}

app.post('/api/requests', requireAuth(), async (req: Request, res: Response) => {
  try {
    const { date, name, vegNonVeg, type, remarks, aadharNumber, beneficiaryRole, createdByRole } =
      req.body;
    const validation = validateEmployerFoodBody({
      name,
      aadharNumber,
      vegNonVeg,
      type,
      remarks,
      beneficiaryRole,
    });
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error });
    }
    const auth = req.authUser!;
    const newRequest = buildFoodRequest(auth as AuthTokenPayload, {
      date,
      name,
      vegNonVeg,
      type,
      remarks,
      aadharNumber,
      beneficiaryRole,
      createdByRole,
    });
    const saved = await saveRequest(newRequest);
    await pushFoodRequestNotification(saved);
    res.status(201).json({ success: true, request: saved });
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to save food request.' });
  }
});

app.post('/api/requests/bulk', requireAuth(), async (req: Request, res: Response) => {
  try {
    const { date, type, items } = req.body as {
      date?: string;
      type?: string;
      items?: Array<{
        name?: string;
        aadharNumber?: string;
        beneficiaryRole?: string;
        vegNonVeg?: string;
        remarks?: string;
      }>;
    };
    if (!type || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Meal type and at least one request row are required.' });
    }
    const auth = req.authUser!;
    const savedRows: FoodRequestDoc[] = [];
    for (const item of items) {
      const validation = validateEmployerFoodBody({
        name: item.name,
        aadharNumber: item.aadharNumber,
        beneficiaryRole: item.beneficiaryRole,
        vegNonVeg: item.vegNonVeg || 'Veg',
        type,
        remarks: item.remarks,
      });
      if (!validation.ok) continue;
      const doc = buildFoodRequest(auth as AuthTokenPayload, {
        date,
        name: item.name!,
        vegNonVeg: item.vegNonVeg || 'Veg',
        type,
        remarks: item.remarks,
        aadharNumber: item.aadharNumber,
        beneficiaryRole: item.beneficiaryRole,
      });
      const saved = await saveRequest(doc);
      savedRows.push(saved);
      await pushFoodRequestNotification(saved);
    }
    if (savedRows.length === 0) {
      return res.status(400).json({ error: 'No valid rows with beneficiary name to submit.' });
    }
    res.status(201).json({ success: true, count: savedRows.length, requests: savedRows });
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to save bulk food requests.' });
  }
});

app.put('/api/requests/:id', requireAuth(), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await findRequestById(id);
    if (!existing) return res.status(404).json({ error: 'Request not found.' });
    const auth = req.authUser!;
    if (!canManageRequest(auth, existing)) {
      return res.status(403).json({ error: 'You can only edit your own requests.' });
    }
    const { name, vegNonVeg, type, remarks, aadharNumber, beneficiaryRole } = req.body;
    const validation = validateEmployerFoodBody({
      name,
      aadharNumber,
      beneficiaryRole,
      vegNonVeg,
      type,
      remarks,
    });
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error });
    }
    const updated: FoodRequestDoc = {
      ...existing,
      name: String(name).trim(),
      aadharNumber: String(aadharNumber).trim(),
      beneficiaryRole:
        beneficiaryRole != null
          ? normalizeBeneficiaryRole(String(beneficiaryRole))
          : existing.beneficiaryRole || 'CPS',
      vegNonVeg: vegNonVeg === 'Non-Veg' ? 'Non-Veg' : 'Veg',
      type: normalizeMealType(type),
      remarks: remarks != null ? String(remarks).trim() : existing.remarks || '',
    };
    const saved = await saveRequest(updated);
    res.json({ success: true, request: saved });
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to update request.' });
  }
});

app.put('/api/requests/bulk', requireAuth(), async (req: Request, res: Response) => {
  try {
    const { items } = req.body as {
      items?: Array<{
        id: string;
        name?: string;
        aadharNumber?: string;
        beneficiaryRole?: string;
        vegNonVeg?: string;
        type?: string;
        remarks?: string;
      }>;
    };
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items array is required.' });
    }
    const auth = req.authUser!;
    const updated: FoodRequestDoc[] = [];
    for (const item of items) {
      if (!item.id) continue;
      const existing = await findRequestById(item.id);
      if (!existing || !canManageRequest(auth, existing)) continue;
      const validation = validateEmployerFoodBody({
        name: item.name,
        aadharNumber: item.aadharNumber ?? existing.aadharNumber,
        beneficiaryRole: item.beneficiaryRole ?? existing.beneficiaryRole,
        vegNonVeg: item.vegNonVeg,
        type: item.type,
        remarks: item.remarks,
      });
      if (!validation.ok) continue;
      const doc: FoodRequestDoc = {
        ...existing,
        name: item.name!.trim(),
        aadharNumber: String(item.aadharNumber ?? existing.aadharNumber ?? '').trim(),
        beneficiaryRole: normalizeBeneficiaryRole(
          item.beneficiaryRole ?? existing.beneficiaryRole ?? 'CPS'
        ),
        vegNonVeg: item.vegNonVeg === 'Non-Veg' ? 'Non-Veg' : 'Veg',
        type: normalizeMealType(item.type!),
        remarks: item.remarks != null ? String(item.remarks).trim() : existing.remarks || '',
      };
      updated.push(await saveRequest(doc));
    }
    if (updated.length === 0) {
      return res.status(400).json({ error: 'No requests were updated.' });
    }
    res.json({ success: true, count: updated.length, requests: updated });
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to bulk update requests.' });
  }
});

// DELETE /api/requests/:id - Admin only
app.delete('/api/requests/:id', requireAuth({ adminOnly: true }), async (req: Request, res: Response) => {
  try {

    const { id } = req.params;
    await deleteRequestById(id);
    res.json({ success: true, message: 'Record deleted successfully.' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete record.' });
  }
});

// GET /api/requests/export.xlsx - Full Excel Export (Admin Only)
app.get('/api/requests/export.xlsx', requireAuth({ adminOnly: true }), async (req: Request, res: Response) => {
  try {
    const all = await getAllRequests();

    // Exact columns matching wireframe:
    const rows = all.map((r) => ({
      DATE: r.date,
      'REQUESTER NAME': r.requesterName,
      NAME: r.name,
      'AADHAR FIRST 4': r.aadharNumber || '',
      ROLES: r.beneficiaryRole || 'CPS',
      'VEG/NON-VEG': r.vegNonVeg,
      TYPE: r.type,
      REMARK: r.remarks || '',
      'MOBILE NO': r.requesterMobile,
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 14 },
      { wch: 22 },
      { wch: 22 },
      { wch: 14 },
      { wch: 16 },
      { wch: 18 },
      { wch: 24 },
      { wch: 16 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'data collect - admin site');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="Food_Requests_Admin_Data_Collect.xlsx"'
    );
    res.send(buffer);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to generate Excel export.' });
  }
});

// GET /api/stats - Admin KPIs
app.get('/api/stats', requireAuth({ adminOnly: true }), async (req: Request, res: Response) => {
  try {
    const all = await getAllRequests();
    const todayStr = new Date().toISOString().slice(0, 10);

    const stats = {
      total: all.length,
      vegCount: all.filter((r) => r.vegNonVeg === 'Veg').length,
      nonVegCount: all.filter((r) => r.vegNonVeg === 'Non-Veg').length,
      breakfastCount: all.filter((r) => r.type === 'Breakfast').length,
      lunchCount: all.filter((r) => r.type === 'Lunch').length,
      dinnerCount: all.filter((r) => r.type === 'Dinner').length,
      snacksCount: all.filter((r) => r.type === 'Snacks').length,
      todayCount: all.filter((r) => r.date === todayStr).length,
    };

    res.json({ success: true, stats });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to calculate stats.' });
  }
});

app.use((err: unknown, _req: Request, res: Response, next: () => void) => {
  if (err instanceof DatabaseUnavailableError) {
    return res.status(503).json({ success: false, error: err.message });
  }
  next();
});

// ---------------- VITE MIDDLEWARE / SPA SERVING ----------------
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Food Requester Server running on port ${PORT}`);
  });
}

startServer();
