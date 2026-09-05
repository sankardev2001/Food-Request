import express, { Request, Response } from 'express';
import cors from 'cors';
import * as XLSX from 'xlsx';
import { MongoClient } from 'mongodb';

const app = express();

app.use(cors());
app.use(express.json());

export interface AppUserDoc {
  id: string;
  name: string;
  cpsNo: string;
  mobileNo: string;
  userType: 'employer' | 'admin';
  aadharNumber: string;
  isSuperAdmin?: boolean;
  createdAt: string;
}

export interface FoodRequestDoc {
  id: string;
  date: string;
  requesterName: string;
  requesterCps: string;
  requesterMobile: string;
  name: string;
  aadharNumber: string;
  vegNonVeg: 'Veg' | 'Non-Veg';
  type: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snacks' | string;
  createdAt: string;
  createdByRole?: string;
}

// In-memory fallback for serverless container restarts
const SEED_SUPER_ADMIN: AppUserDoc = {
  id: 'usr-subash-superadmin',
  name: 'subash',
  cpsNo: '1234',
  mobileNo: '9500466927',
  userType: 'admin',
  aadharNumber: '1234',
  isSuperAdmin: true,
  createdAt: new Date().toISOString(),
};

let memoryUsers: AppUserDoc[] = [SEED_SUPER_ADMIN];
let memoryRequests: FoodRequestDoc[] = [];

let mongoClient: MongoClient | null = null;
let currentMongoUri: string = process.env.MONGODB_URI || '';

async function getMongoDb(overrideUri?: string) {
  const uri = overrideUri || currentMongoUri || process.env.MONGODB_URI;
  if (!uri || uri.trim() === '') return null;
  if (uri.includes('<db_password>') || uri.includes('<password>') || uri.includes('<username>')) {
    return null;
  }
  try {
    if (!mongoClient || (overrideUri && overrideUri !== currentMongoUri)) {
      if (mongoClient) {
        try { await mongoClient.close(); } catch {}
      }
      mongoClient = new MongoClient(uri, { serverSelectionTimeoutMS: 4000 });
      await mongoClient.connect();
      currentMongoUri = uri;

      // Auto-ensure super admin exists in MongoDB
      const db = mongoClient.db('food_requester');
      const usersCol = db.collection<AppUserDoc>('users');
      const adminDoc = await usersCol.findOne({ cpsNo: '1234' });
      if (!adminDoc) {
        await usersCol.insertOne({ ...SEED_SUPER_ADMIN });
      }
    }
    return mongoClient.db('food_requester');
  } catch (err) {
    console.warn('MongoDB connection error in serverless:', err);
    return null;
  }
}

async function getAllUsers(): Promise<AppUserDoc[]> {
  const db = await getMongoDb();
  if (db) {
    try {
      const docs = await db.collection<AppUserDoc>('users').find({}).sort({ createdAt: -1 }).toArray();
      if (docs.length > 0) return docs;
    } catch (e) {
      console.error(e);
    }
  }
  return memoryUsers;
}

async function getAllRequests(): Promise<FoodRequestDoc[]> {
  const db = await getMongoDb();
  if (db) {
    try {
      const docs = await db.collection<FoodRequestDoc>('food_requests').find({}).sort({ createdAt: -1 }).toArray();
      return docs;
    } catch (e) {
      console.error(e);
    }
  }
  return memoryRequests;
}

// Health check
app.get('/api/health', async (req: Request, res: Response) => {
  const db = await getMongoDb();
  res.json({
    status: 'ok',
    environment: 'vercel_serverless',
    storage: db ? 'mongodb_atlas' : 'memory_fallback',
    hasMongoUri: !!process.env.MONGODB_URI,
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
  const db = await getMongoDb(uri);
  if (db) {
    res.json({ success: true, message: 'Connected to MongoDB Atlas successfully!' });
  } else {
    res.status(400).json({ success: false, error: 'Failed to connect to MongoDB Atlas.' });
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
      await usersCol.createIndex({ cpsNo: 1 }, { unique: true });
      details.push('Created unique index on users.cpsNo');
    } catch {}
    await usersCol.createIndex({ mobileNo: 1 });
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
      // Memory fallback seed
      const exists = memoryUsers.some((u) => u.cpsNo === '1234');
      if (!exists) memoryUsers.unshift(SEED_SUPER_ADMIN);
      return res.json({
        success: true,
        mode: 'memory_fallback',
        admin: SEED_SUPER_ADMIN,
        details: ['Seeded Super Admin Subash into in-memory storage.'],
      });
    }

    const usersCol = db.collection<AppUserDoc>('users');
    const existing = await usersCol.findOne({ cpsNo: '1234' });
    let action: 'inserted' | 'updated' = 'updated';

    if (!existing) {
      await usersCol.insertOne({ ...SEED_SUPER_ADMIN });
      action = 'inserted';
    } else {
      await usersCol.updateOne(
        { cpsNo: '1234' },
        {
          $set: {
            name: SEED_SUPER_ADMIN.name,
            mobileNo: SEED_SUPER_ADMIN.mobileNo,
            userType: 'admin',
            aadharNumber: SEED_SUPER_ADMIN.aadharNumber,
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

// Auth Login
app.post('/api/auth/login', async (req: Request, res: Response) => {
  const { name, cpsNo, mobileNo, role, passcode } = req.body;
  if (!name || !cpsNo || !mobileNo) {
    return res.status(400).json({ error: 'Name, CPS No, and Mobile No are required.' });
  }

  const cleanCps = String(cpsNo).trim().toUpperCase();
  const cleanMobile = String(mobileNo).trim();
  const selectedRole = role === 'admin' ? 'admin' : 'employer';

  // Check super admin subash
  if (cleanCps === '1234' && (cleanMobile === '9500466927' || cleanMobile === '1234')) {
    return res.json({
      success: true,
      user: {
        name: 'subash',
        cpsNo: '1234',
        mobileNo: '9500466927',
        role: 'admin',
        aadharNumber: '1234',
        isSuperAdmin: true,
        loggedInAt: new Date().toISOString(),
      },
    });
  }

  const allUsers = await getAllUsers();
  const user = allUsers.find(
    (u) => u.cpsNo.toUpperCase() === cleanCps && u.mobileNo.trim() === cleanMobile
  );

  if (!user) {
    return res.status(401).json({
      error: `User with CPS No "${cleanCps}" & Mobile "${cleanMobile}" not found in employee directory.`,
    });
  }

  if (selectedRole === 'admin' && user.userType !== 'admin') {
    return res.status(403).json({ error: 'User does not have Administrator privileges.' });
  }

  res.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      cpsNo: user.cpsNo,
      mobileNo: user.mobileNo,
      role: user.userType,
      aadharNumber: user.aadharNumber,
      isSuperAdmin: user.isSuperAdmin,
      loggedInAt: new Date().toISOString(),
    },
  });
});

// GET /api/users
app.get('/api/users', async (req: Request, res: Response) => {
  const users = await getAllUsers();
  res.json({ success: true, count: users.length, users });
});

// POST /api/users
app.post('/api/users', async (req: Request, res: Response) => {
  const { name, cpsNo, mobileNo, userType, aadharNumber } = req.body;
  if (!name || !cpsNo || !mobileNo || !userType || !aadharNumber) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  const cleanCps = String(cpsNo).trim().toUpperCase();
  const newUser: AppUserDoc = {
    id: `usr-${Date.now()}`,
    name: name.trim(),
    cpsNo: cleanCps,
    mobileNo: String(mobileNo).trim(),
    userType: userType === 'admin' ? 'admin' : 'employer',
    aadharNumber: String(aadharNumber).trim(),
    createdAt: new Date().toISOString(),
  };

  const db = await getMongoDb();
  if (db) {
    await db.collection('users').insertOne(newUser);
  }
  memoryUsers.unshift(newUser);

  res.status(201).json({ success: true, user: newUser });
});

// DELETE /api/users/:id
app.delete('/api/users/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const db = await getMongoDb();
  if (db) {
    await db.collection('users').deleteOne({ id });
  }
  memoryUsers = memoryUsers.filter((u) => u.id !== id);
  res.json({ success: true, message: 'User deleted.' });
});

// GET /api/requests
app.get('/api/requests', async (req: Request, res: Response) => {
  const role = (req.query.role as string) || 'employer';
  const cpsNo = (req.query.cpsNo as string) || '';
  const date = req.query.date as string;
  const search = ((req.query.search as string) || '').toLowerCase();
  const type = req.query.type as string;

  let all = await getAllRequests();

  if (role === 'employer') {
    if (!cpsNo) return res.status(403).json({ error: 'CPS No required for employer access.' });
    all = all.filter((r) => r.requesterCps.toUpperCase() === cpsNo.toUpperCase());
  }

  if (date) all = all.filter((r) => r.date === date);
  if (type && type !== 'all') all = all.filter((r) => r.type.toLowerCase() === type.toLowerCase());
  if (search) {
    all = all.filter(
      (r) =>
        r.name.toLowerCase().includes(search) ||
        r.requesterName.toLowerCase().includes(search) ||
        r.aadharNumber.includes(search) ||
        r.type.toLowerCase().includes(search)
    );
  }

  res.json({ success: true, count: all.length, requests: all });
});

// POST /api/requests
app.post('/api/requests', async (req: Request, res: Response) => {
  const {
    date,
    requesterName,
    requesterCps,
    requesterMobile,
    name,
    aadharNumber,
    vegNonVeg,
    type,
    createdByRole,
  } = req.body;

  if (!name || !aadharNumber || !vegNonVeg || !type) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  const validMealType = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'].includes(type)
    ? type
    : type || 'Lunch';

  const newDoc: FoodRequestDoc = {
    id: `req-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    date: date || new Date().toISOString().slice(0, 10),
    requesterName: requesterName || name,
    requesterCps: requesterCps || 'N/A',
    requesterMobile: requesterMobile || 'N/A',
    name: name.trim(),
    aadharNumber: String(aadharNumber).trim(),
    vegNonVeg: vegNonVeg === 'Non-Veg' ? 'Non-Veg' : 'Veg',
    type: validMealType,
    createdAt: new Date().toISOString(),
    createdByRole: createdByRole || 'employer',
  };

  const db = await getMongoDb();
  if (db) {
    await db.collection('food_requests').insertOne(newDoc);
  }
  memoryRequests.unshift(newDoc);

  res.status(201).json({ success: true, request: newDoc });
});

// DELETE /api/requests/:id
app.delete('/api/requests/:id', async (req: Request, res: Response) => {
  const { role } = req.query;
  if (role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { id } = req.params;

  const db = await getMongoDb();
  if (db) {
    await db.collection('food_requests').deleteOne({ id });
  }
  memoryRequests = memoryRequests.filter((r) => r.id !== id);
  res.json({ success: true, message: 'Deleted' });
});

// Export Excel
app.get('/api/requests/export.xlsx', async (req: Request, res: Response) => {
  const { role } = req.query;
  if (role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  const all = await getAllRequests();
  const rows = all.map((r) => ({
    DATE: r.date,
    'REQUESTER NAME': r.requesterName,
    NAME: r.name,
    'AADHAR NUMBER': r.aadharNumber,
    'VEG/NON-VEG': r.vegNonVeg,
    TYPE: r.type,
    'CPS NO': r.requesterCps,
    'MOBILE NO': r.requesterMobile,
  }));

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
app.get('/api/stats', async (req: Request, res: Response) => {
  const { role } = req.query;
  if (role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

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

export default app;
