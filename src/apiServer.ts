import express, { Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { MongoClient } from 'mongodb';

type FirebaseDatabase = import('firebase-admin/database').Database;
import {
  AppUserDoc,
  MONGODB_DB_NAME,
  SUPER_ADMIN_MOBILE,
  normalizeAppUser,
  normalizeMongoUri,
  readLocalUsersFile,
  readLocalFoodRequestsFile,
  isSuperAdminUser,
  upsertUsersToMongo,
  upsertFoodRequestsToMongo,
  DatabaseUnavailableError,
} from './mongoHelpers';
import { requireAuth, sanitizeUserForClient } from './authSecurity';
import {
  handleLoginRequest,
  handleLogoutRequest,
  handleMeRequest,
  hashPasswordForStorage,
} from './authHandlers';
import {
  buildFoodRequest,
  canManageRequest,
  normalizeBeneficiaryRole,
  normalizeFoodRequestDoc,
  normalizeMealType,
  validateEmployerFoodBody,
} from './foodRequestHelpers';
import type { AuthTokenPayload } from './authSecurity';

let firebaseDb: FirebaseDatabase | null = null;
let firebaseInitPromise: Promise<FirebaseDatabase | null> | null = null;

async function getFirebaseAdminDb(): Promise<FirebaseDatabase | null> {
  if (firebaseDb) return firebaseDb;
  if (!firebaseInitPromise) {
    firebaseInitPromise = (async () => {
      try {
        const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
        const databaseURL = process.env.VITE_FIREBASE_DATABASE_URL;
        if (!serviceAccountRaw || !databaseURL) return null;

        const serviceAccount = JSON.parse(serviceAccountRaw);
        if (serviceAccount.private_key) {
          serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }

        const { initializeApp, getApps, cert } = await import('firebase-admin/app');
        const { getDatabase } = await import('firebase-admin/database');

        const app = getApps().length
          ? getApps()[0]!
          : initializeApp({
              credential: cert(serviceAccount),
              databaseURL,
            });
        firebaseDb = getDatabase(app);
        return firebaseDb;
      } catch (error) {
        console.error('Failed to initialize Firebase Admin:', error);
        return null;
      }
    })();
  }
  return firebaseInitPromise;
}

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

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

// In-memory fallback for serverless container restarts
const SEED_SUPER_ADMIN: AppUserDoc = {
  id: 'usr-subash-superadmin',
  name: 'subash',
  mobileNo: SUPER_ADMIN_MOBILE,
  password: '1234',
  userType: 'admin',
  isSuperAdmin: true,
  createdAt: new Date().toISOString(),
};

let mongoClient: MongoClient | null = null;
let currentMongoUri: string = normalizeMongoUri(process.env.MONGODB_URI);
let mongoLastError: string | null = null;
let mongoBootstrapped = false;

async function bootstrapMongo(db: ReturnType<MongoClient['db']>) {
  if (mongoBootstrapped) return;
  const usersCol = db.collection<AppUserDoc>('users');
  const adminDoc = await usersCol.findOne({ id: 'usr-subash-superadmin' });
  if (!adminDoc) {
    await usersCol.insertOne({ ...SEED_SUPER_ADMIN });
  }
  mongoBootstrapped = true;
}

async function getDbOrThrow() {
  const db = await getMongoDb();
  if (!db) {
    throw new DatabaseUnavailableError(
      mongoLastError ? `Database unavailable: ${mongoLastError}` : undefined
    );
  }
  return db;
}

async function getMongoDb(overrideUri?: string) {
  const uri = normalizeMongoUri(overrideUri || currentMongoUri || process.env.MONGODB_URI);
  if (!uri || uri.trim() === '') {
    mongoLastError = 'MONGODB_URI is not configured';
    return null;
  }
  if (uri.includes('<db_password>') || uri.includes('<password>') || uri.includes('<username>')) {
    mongoLastError = 'MONGODB_URI contains placeholder values';
    return null;
  }
  try {
    if (mongoClient && (!overrideUri || overrideUri === currentMongoUri)) {
      try {
        await mongoClient.db('admin').command({ ping: 1 });
      } catch (err) {
        // Topology is likely closed or connection lost
        mongoClient = null;
      }
    }

    if (!mongoClient || (overrideUri && overrideUri !== currentMongoUri)) {
      if (mongoClient) {
        try { await mongoClient.close(); } catch {}
      }
      mongoClient = new MongoClient(uri, {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
        maxPoolSize: 5,
      });
      await mongoClient.connect();
      currentMongoUri = uri;
      mongoLastError = null;

      await bootstrapMongo(mongoClient.db(MONGODB_DB_NAME));
    }
    const db = mongoClient!.db(MONGODB_DB_NAME);
    await bootstrapMongo(db);
    return db;
  } catch (err: unknown) {
    mongoLastError = err instanceof Error ? err.message : 'Connection failed';
    console.warn('MongoDB connection error in serverless:', mongoLastError);
    return null;
  }
}

async function getAllUsers(): Promise<AppUserDoc[]> {
  const db = await getDbOrThrow();
  const docs = await db.collection<AppUserDoc>('users').find({}).sort({ createdAt: -1 }).toArray();
  return docs.map((d) => normalizeAppUser(d as unknown as Record<string, unknown>));
}

async function saveUser(user: AppUserDoc): Promise<AppUserDoc> {
  const db = await getDbOrThrow();
  await db.collection('users').updateOne({ id: user.id }, { $set: user }, { upsert: true });
  return user;
}

async function deleteUserById(id: string): Promise<void> {
  const db = await getDbOrThrow();
  await db.collection('users').deleteOne({ id });
}

async function deleteRequestById(id: string): Promise<void> {
  const db = await getDbOrThrow();
  await db.collection('food_requests').deleteOne({ id });
}

async function persistRequest(doc: FoodRequestDoc): Promise<FoodRequestDoc> {
  const stored = normalizeFoodRequestDoc(
    doc as unknown as Record<string, unknown>
  ) as FoodRequestDoc;
  const db = await getDbOrThrow();
  await db.collection('food_requests').updateOne(
    { id: stored.id },
    { $set: stored },
    { upsert: true }
  );
  return stored;
}

async function findRequestById(id: string): Promise<FoodRequestDoc | undefined> {
  return (await getAllRequests()).find((r) => r.id === id);
}

async function getAllRequests(): Promise<FoodRequestDoc[]> {
  const db = await getDbOrThrow();
  const docs = await db
    .collection<FoodRequestDoc>('food_requests')
    .find({})
    .sort({ createdAt: -1 })
    .toArray();
  return docs.map((doc) =>
    normalizeFoodRequestDoc(doc as unknown as Record<string, unknown>)
  ) as FoodRequestDoc[];
}

// Health check
app.get('/api/health', async (req: Request, res: Response) => {
  const db = await getMongoDb();
  res.json({
    status: 'ok',
    environment: 'vercel_serverless',
    storage: db ? 'mongodb_atlas' : 'unavailable',
    databaseRequired: true,
    hasMongoUri: !!normalizeMongoUri(process.env.MONGODB_URI),
    mongoError: mongoLastError,
    timestamp: new Date().toISOString(),
  });
});

// Test MongoDB connection
app.post('/api/mongodb/test', async (req: Request, res: Response) => {
  const { uri } = req.body;
  if (!uri || typeof uri !== 'string' || !uri.startsWith('mongodb')) {
    return res.status(400).json({ success: false, error: 'Invalid URI format.' });
  }

  let testClient: MongoClient | null = null;
  try {
    testClient = new MongoClient(uri, { serverSelectionTimeoutMS: 4000 });
    await testClient.connect();
    await testClient.db('admin').command({ ping: 1 });
    res.json({ success: true, message: 'Successfully connected to MongoDB Atlas!' });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  } finally {
    if (testClient) {
      try {
        await testClient.close();
      } catch {}
    }
  }
});

// Connect to MongoDB Atlas dynamically
app.post('/api/mongodb/connect', async (req: Request, res: Response) => {
  const { uri } = req.body;
  if (!uri) return res.status(400).json({ success: false, error: 'URI required' });
  mongoBootstrapped = false;
  const db = await getMongoDb(normalizeMongoUri(uri));
  if (db) {
    const count = await db.collection('users').countDocuments();
    res.json({
      success: true,
      message: 'Connected to MongoDB Atlas. Application data is read from and written to the database only.',
      userCount: count,
    });
  } else {
    res.status(400).json({
      success: false,
      error: mongoLastError || 'Failed to connect to MongoDB Atlas.',
    });
  }
});

// Upsert bundled/local users into MongoDB (same data as data/users.json)
app.post('/api/db/sync-requests', requireAuth({ adminOnly: true }), async (req: Request, res: Response) => {
  try {
    const source = readLocalFoodRequestsFile();
    if (source.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No food requests in data/food_requests.json to import.',
      });
    }

    const db = await getDbOrThrow();
    const synced = await upsertFoodRequestsToMongo(db, source);
    const requestCount = await db.collection('food_requests').countDocuments();
    res.json({ success: true, mode: 'mongodb', synced, requestCount });
  } catch (err: unknown) {
    if (err instanceof DatabaseUnavailableError) {
      return res.status(503).json({ success: false, error: err.message });
    }
    const message = err instanceof Error ? err.message : 'Request sync failed';
    res.status(500).json({ success: false, error: message });
  }
});

app.post('/api/db/sync-users', requireAuth({ adminOnly: true }), async (req: Request, res: Response) => {
  try {
    const source = readLocalUsersFile();
    if (source.length === 0) {
      return res.status(400).json({ success: false, error: 'No users in data/users.json to import.' });
    }

    const db = await getDbOrThrow();
    const synced = await upsertUsersToMongo(db, source);
    const userCount = await db.collection('users').countDocuments();
    res.json({ success: true, mode: 'mongodb', synced, userCount });
  } catch (err: unknown) {
    if (err instanceof DatabaseUnavailableError) {
      return res.status(503).json({ success: false, error: err.message });
    }
    const message = err instanceof Error ? err.message : 'Sync failed';
    res.status(500).json({ success: false, error: message });
  }
});

// Run Migration in serverless
app.post('/api/db/migrate', async (req: Request, res: Response) => {
  try {
    const { uri } = req.body;
    const db = await getMongoDb(uri);
    if (!db) {
      return res.status(400).json({
        success: false,
        error: 'MongoDB is not connected. Please provide a valid MONGODB_URI in environment variables.',
      });
    }

    const details: string[] = [];
    const collections = await db.listCollections().toArray();
    const colNames = collections.map((c) => c.name);

    if (!colNames.includes('users')) {
      await db.createCollection('users');
      details.push('Created "users" collection');
    }
    const usersCol = db.collection('users');
    try {
      await usersCol.createIndex({ mobileNo: 1 }, { unique: true });
      details.push('Created unique index on users.mobileNo');
    } catch {}
    await usersCol.createIndex({ userType: 1 });
    if (!colNames.includes('food_requests')) {
      await db.createCollection('food_requests');
      details.push('Created "food_requests" collection');
    }
    const reqCol = db.collection('food_requests');
    await reqCol.createIndex({ date: 1 });
    await reqCol.createIndex({ requesterCps: 1 });
    await reqCol.createIndex({ createdAt: -1 });
    await reqCol.createIndex({ type: 1 });

    // Migrate any legacy types to Lunch
    const legacy = await reqCol.updateMany(
      { type: { $in: ['Detaction', 'Non-Detaction'] } },
      { $set: { type: 'Lunch' } }
    );
    if (legacy.modifiedCount > 0) {
      details.push(`Migrated ${legacy.modifiedCount} legacy records to standard MealTypes.`);
    }

    res.json({ success: true, mode: 'mongodb', details });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Run Seeding in serverless
app.post('/api/db/seed', async (req: Request, res: Response) => {
  try {
    const { uri } = req.body;
    const db = await getMongoDb(uri);
    if (!db) {
      return res.status(503).json({
        success: false,
        error: mongoLastError || 'MongoDB is required to seed the database.',
      });
    }

    const usersCol = db.collection<AppUserDoc>('users');
    const existing = await usersCol.findOne({ id: 'usr-subash-superadmin' });
    let action: 'inserted' | 'updated' = 'updated';

    if (!existing) {
      await usersCol.insertOne({ ...SEED_SUPER_ADMIN });
      action = 'inserted';
    } else {
      await usersCol.updateOne(
        { id: 'usr-subash-superadmin' },
        {
          $set: {
            name: SEED_SUPER_ADMIN.name,
            mobileNo: SEED_SUPER_ADMIN.mobileNo,
            password: SEED_SUPER_ADMIN.password,
            userType: 'admin',
            isSuperAdmin: true,
          },
        }
      );
    }

    res.json({
      success: true,
      mode: 'mongodb',
      admin: SEED_SUPER_ADMIN,
      action,
      details: [`Super Admin subash verified and seeded in MongoDB users collection.`],
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    await handleLoginRequest(req, res, { getAllUsers, saveUser });
  } catch (e) {
    if (e instanceof DatabaseUnavailableError) {
      return res.status(503).json({ success: false, error: e.message });
    }
    console.error('Login error:', e);
    const message = e instanceof Error ? e.message : 'Login authentication failed.';
    res.status(500).json({ success: false, error: message });
  }
});

app.post('/api/auth/logout', (req: Request, res: Response) => {
  handleLogoutRequest(req, res);
});

app.get('/api/auth/me', (req: Request, res: Response) => {
  handleMeRequest(req, res);
});

app.get('/api/users', requireAuth({ adminOnly: true }), async (req: Request, res: Response) => {
  const users = (await getAllUsers()).map(sanitizeUserForClient);
  res.json({ success: true, count: users.length, users });
});

app.put('/api/users/:id', requireAuth({ adminOnly: true }), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, team, mobileNo } = req.body;
  const all = await getAllUsers();
  const target = all.find((u) => u.id === id);
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (name) target.name = String(name).trim();
  if (team !== undefined) target.team = String(team).trim();
  if (mobileNo) {
    const clean = String(mobileNo).trim();
    if (all.some((u) => u.id !== id && u.mobileNo.trim() === clean)) {
      return res.status(400).json({ error: 'Mobile number already in use.' });
    }
    target.mobileNo = clean;
  }
  const saved = await saveUser(target);
  res.json({ success: true, user: sanitizeUserForClient(saved) });
});

app.post('/api/users', requireAuth({ adminOnly: true }), async (req: Request, res: Response) => {
  const { name, team, mobileNo, password, userType } = req.body;
  if (!name || !mobileNo || !password || !userType) {
    return res.status(400).json({ error: 'Name, mobile number, password, and user type are required.' });
  }

  const cleanMobile = String(mobileNo).trim();
  const duplicate = (await getAllUsers()).find((u) => u.mobileNo.trim() === cleanMobile);
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
    id: `usr-${Date.now()}`,
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
});

app.put('/api/users/:id/password', requireAuth({ adminOnly: true }), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { newPassword } = req.body;

  if (!newPassword) {
    return res.status(400).json({ error: 'New password is required.' });
  }

  const hashed = await hashPasswordForStorage(newPassword);
  if (typeof hashed !== 'string') {
    return res.status(400).json({ error: hashed.error });
  }

  const all = await getAllUsers();
  const target = all.find((u) => u.id === id);
  if (!target) {
    return res.status(404).json({ error: 'User not found.' });
  }
  target.password = hashed;
  await saveUser(target);

  res.json({ success: true, message: 'Password updated.' });
});

app.delete('/api/users/:id', requireAuth({ adminOnly: true }), async (req: Request, res: Response) => {
  const { id } = req.params;
  const target = (await getAllUsers()).find((u) => u.id === id);
  if (target && isSuperAdminUser(target)) {
    return res.status(403).json({ error: 'Super Admin subash cannot be deleted.' });
  }

  await deleteUserById(id);
  res.json({ success: true, message: 'User deleted.' });
});

// GET /api/requests/recent
app.get('/api/requests/recent', requireAuth({ adminOnly: true }), async (req: Request, res: Response) => {
  const since = req.query.since as string;
  if (!since) return res.status(400).json({ error: 'Since timestamp required.' });

  const allRequests = await getAllRequests();
  const newRequests = allRequests.filter((r) => r.createdAt > since);

  res.json({ success: true, count: newRequests.length, requests: newRequests });
});

// GET /api/requests
app.get('/api/requests', requireAuth(), async (req: Request, res: Response) => {
  const role = (req.query.role as string) || 'employer';
  if (role === 'admin' && req.authUser?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  const requesterMobile = (req.query.mobileNo as string) || (req.query.cpsNo as string) || '';
  const date = req.query.date as string;
  const search = ((req.query.search as string) || '').toLowerCase();
  const type = req.query.type as string;

  let all = await getAllRequests();

  if (role === 'employer') {
    const mobile = (requesterMobile || req.authUser?.mobileNo || '').trim();
    if (!mobile) {
      return res.status(403).json({ error: 'Mobile number required for employer access.' });
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

  if (date) all = all.filter((r) => r.date === date);
  if (type && type !== 'all') all = all.filter((r) => r.type.toLowerCase() === type.toLowerCase());
  if (search) {
    all = all.filter(
      (r) =>
        r.name.toLowerCase().includes(search) ||
        r.requesterName.toLowerCase().includes(search) ||
        (r.aadharNumber && r.aadharNumber.includes(search)) ||
        r.type.toLowerCase().includes(search)
    );
  }

  res.json({ success: true, count: all.length, requests: all });
});

async function notifyNewRequest(saved: FoodRequestDoc) {
  const adminDb = await getFirebaseAdminDb();
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
  const { date, name, vegNonVeg, type, remarks, aadharNumber, beneficiaryRole, createdByRole } =
    req.body;
  const auth = req.authUser! as AuthTokenPayload;
  const validation = validateEmployerFoodBody({
    name,
    aadharNumber,
    beneficiaryRole,
    vegNonVeg,
    type,
    remarks,
  });
  if (validation.ok === false) {
    return res.status(400).json({ error: validation.error });
  }
  const newDoc = buildFoodRequest(auth, {
    date,
    name,
    vegNonVeg,
    type,
    remarks,
    aadharNumber,
    beneficiaryRole,
    createdByRole,
  }) as FoodRequestDoc;
  const saved = await persistRequest(newDoc);
  await notifyNewRequest(saved);
  res.status(201).json({ success: true, request: saved });
});

app.post('/api/requests/bulk', requireAuth(), async (req: Request, res: Response) => {
  const auth = req.authUser! as AuthTokenPayload;
  const { date, type, items } = req.body;
  if (!type || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Meal type and request rows are required.' });
  }
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
    const doc = buildFoodRequest(auth, {
      date,
      name: item.name,
      vegNonVeg: item.vegNonVeg || 'Veg',
      type,
      remarks: item.remarks,
      aadharNumber: item.aadharNumber,
      beneficiaryRole: item.beneficiaryRole,
    }) as FoodRequestDoc;
    savedRows.push(await persistRequest(doc));
    await notifyNewRequest(savedRows[savedRows.length - 1]);
  }
  if (savedRows.length === 0) {
    return res.status(400).json({ error: 'No valid rows with beneficiary name.' });
  }
  res.status(201).json({ success: true, count: savedRows.length, requests: savedRows });
});

app.put('/api/requests/:id', requireAuth(), async (req: Request, res: Response) => {
  const auth = req.authUser! as AuthTokenPayload;
  const existing = await findRequestById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Request not found.' });
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
  if (validation.ok === false) {
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
  res.json({ success: true, request: await persistRequest(updated) });
});

app.put('/api/requests/bulk', requireAuth(), async (req: Request, res: Response) => {
  const auth = req.authUser! as AuthTokenPayload;
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Items array is required.' });
  }
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
    updated.push(
      await persistRequest({
        ...existing,
        name: item.name!.trim(),
        aadharNumber: String(item.aadharNumber ?? existing.aadharNumber ?? '').trim(),
        beneficiaryRole: normalizeBeneficiaryRole(
          item.beneficiaryRole ?? existing.beneficiaryRole ?? 'CPS'
        ),
        vegNonVeg: item.vegNonVeg === 'Non-Veg' ? 'Non-Veg' : 'Veg',
        type: normalizeMealType(item.type!),
        remarks: item.remarks != null ? String(item.remarks).trim() : existing.remarks || '',
      })
    );
  }
  if (updated.length === 0) return res.status(400).json({ error: 'No requests updated.' });
  res.json({ success: true, count: updated.length, requests: updated });
});

// DELETE /api/requests/:id
app.delete('/api/requests/:id', requireAuth({ adminOnly: true }), async (req: Request, res: Response) => {
  try {
    await deleteRequestById(req.params.id);
    res.json({ success: true, message: 'Deleted' });
  } catch (err: unknown) {
    if (err instanceof DatabaseUnavailableError) {
      return res.status(503).json({ success: false, error: err.message });
    }
    throw err;
  }
});

// Export Excel
app.get('/api/requests/export.xlsx', requireAuth({ adminOnly: true }), async (req: Request, res: Response) => {
  const all = await getAllRequests();
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

  const XLSX = await import('xlsx');
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'data collect - admin site');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', 'attachment; filename="Food_Requests_Admin_Data_Collect.xlsx"');
  res.send(buffer);
});

// GET /api/stats
app.get('/api/stats', requireAuth({ adminOnly: true }), async (req: Request, res: Response) => {
  const all = await getAllRequests();
  const todayStr = new Date().toISOString().slice(0, 10);
  res.json({
    success: true,
    stats: {
      total: all.length,
      vegCount: all.filter((r) => r.vegNonVeg === 'Veg').length,
      nonVegCount: all.filter((r) => r.vegNonVeg === 'Non-Veg').length,
      breakfastCount: all.filter((r) => r.type === 'Breakfast').length,
      lunchCount: all.filter((r) => r.type === 'Lunch').length,
      dinnerCount: all.filter((r) => r.type === 'Dinner').length,
      snacksCount: all.filter((r) => r.type === 'Snacks').length,
      todayCount: all.filter((r) => r.date === todayStr).length,
    },
  });
});

app.use((err: unknown, _req: Request, res: Response, _next: () => void) => {
  if (err instanceof DatabaseUnavailableError) {
    return res.status(503).json({ success: false, error: err.message });
  }
  console.error(err);
  res.status(500).json({ success: false, error: 'Internal server error.' });
});

export default app;
