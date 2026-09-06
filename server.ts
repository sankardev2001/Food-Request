import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import * as XLSX from 'xlsx';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { runMigration } from './scripts/migrate';
import { runSeeding } from './scripts/seed';
import { getFirebaseAdminDb } from './api/firebase-admin';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// ---------------- DATA MODELS ----------------

export interface AppUserDoc {
  id: string;
  name: string;
  cpsNo: string;
  mobileNo: string;
  password?: string;
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

// ---------------- LOCAL STORAGE FALLBACK ----------------
const DATA_DIR = path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const REQUESTS_FILE = path.join(DATA_DIR, 'food_requests.json');

// Exact super admin seeding requested by user:
// Name: subash
// CPS No : 1234
// mobile number : 9500466927
const SEED_SUPER_ADMIN: AppUserDoc = {
  id: 'usr-subash-superadmin',
  name: 'subash',
  cpsNo: '1234',
  mobileNo: '9500466927',
  password: '1234',
  userType: 'admin',
  aadharNumber: '1234',
  isSuperAdmin: true,
  createdAt: new Date().toISOString(),
};

function ensureDataStorage() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Seed Users table with ONLY the single super admin
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([SEED_SUPER_ADMIN], null, 2), 'utf-8');
  } else {
    // Ensure subash exists in users file
    try {
      const current = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8')) as AppUserDoc[];
      const exists = current.some((u) => u.cpsNo.toUpperCase() === '1234');
      if (!exists) {
        current.unshift(SEED_SUPER_ADMIN);
        fs.writeFileSync(USERS_FILE, JSON.stringify(current, null, 2), 'utf-8');
      }
    } catch {
      fs.writeFileSync(USERS_FILE, JSON.stringify([SEED_SUPER_ADMIN], null, 2), 'utf-8');
    }
  }

  // Food requests table (clean, empty or initialized)
  if (!fs.existsSync(REQUESTS_FILE)) {
    fs.writeFileSync(REQUESTS_FILE, JSON.stringify([], null, 2), 'utf-8');
  }
}

ensureDataStorage();

// ---------------- MONGODB CLIENT & HELPERS ----------------
let mongoClient: MongoClient | null = null;
let currentMongoUri: string = process.env.MONGODB_URI || '';
let isMongoConnected = false;
let mongoLastError: string | null = null;

async function getMongoClient(overrideUri?: string): Promise<MongoClient | null> {
  const uri = overrideUri || currentMongoUri || process.env.MONGODB_URI;
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
      const db = mongoClient.db('food_requester');
      const usersCol = db.collection<AppUserDoc>('users');
      const adminDoc = await usersCol.findOne({ cpsNo: '1234' });
      if (!adminDoc) {
        await usersCol.insertOne({ ...SEED_SUPER_ADMIN });
        console.log('Seeded super admin subash (CPS: 1234) to MongoDB users collection.');
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

// ---------------- DATABASE ACCESSORS: USERS TABLE ----------------
async function getAllUsers(): Promise<AppUserDoc[]> {
  const client = await getMongoClient();
  if (client && isMongoConnected) {
    try {
      const db = client.db('food_requester');
      const docs = await db.collection<AppUserDoc>('users').find({}).sort({ createdAt: -1 }).toArray();
      if (docs.length > 0) {
        return docs.map((d) => ({
          id: d.id,
          name: d.name,
          cpsNo: d.cpsNo,
          mobileNo: d.mobileNo,
          password: d.password,
          userType: d.userType,
          aadharNumber: d.aadharNumber,
          isSuperAdmin: d.isSuperAdmin,
          createdAt: d.createdAt,
        }));
      }
    } catch (e) {
      console.error('Error fetching users from MongoDB, using local fallback:', e);
    }
  }

  // Fallback to local storage
  try {
    ensureDataStorage();
    const raw = fs.readFileSync(USERS_FILE, 'utf-8');
    return JSON.parse(raw) as AppUserDoc[];
  } catch {
    return [SEED_SUPER_ADMIN];
  }
}

async function saveUser(user: AppUserDoc): Promise<AppUserDoc> {
  const client = await getMongoClient();
  if (client && isMongoConnected) {
    try {
      const db = client.db('food_requester');
      await db.collection<AppUserDoc>('users').updateOne(
        { id: user.id },
        { $set: user },
        { upsert: true }
      );
    } catch (e) {
      console.error('MongoDB error saving user:', e);
    }
  }

  // Always keep local file synchronized
  ensureDataStorage();
  const all = await getAllUsers();
  const idx = all.findIndex((u) => u.id === user.id || u.cpsNo.toUpperCase() === user.cpsNo.toUpperCase());
  if (idx >= 0) {
    all[idx] = user;
  } else {
    all.unshift(user);
  }
  fs.writeFileSync(USERS_FILE, JSON.stringify(all, null, 2), 'utf-8');
  return user;
}

async function deleteUserById(id: string): Promise<boolean> {
  const client = await getMongoClient();
  if (client && isMongoConnected) {
    try {
      const db = client.db('food_requester');
      await db.collection<AppUserDoc>('users').deleteOne({ id });
    } catch (e) {
      console.error('MongoDB delete user error:', e);
    }
  }

  ensureDataStorage();
  const all = await getAllUsers();
  const filtered = all.filter((u) => u.id !== id);
  fs.writeFileSync(USERS_FILE, JSON.stringify(filtered, null, 2), 'utf-8');
  return true;
}

// ---------------- DATABASE ACCESSORS: FOOD REQUESTS TABLE ----------------
async function getAllRequests(): Promise<FoodRequestDoc[]> {
  const client = await getMongoClient();
  if (client && isMongoConnected) {
    try {
      const db = client.db('food_requester');
      const docs = await db.collection<FoodRequestDoc>('food_requests').find({}).sort({ createdAt: -1 }).toArray();
      return docs.map((doc) => ({
        id: doc.id,
        date: doc.date,
        requesterName: doc.requesterName,
        requesterCps: doc.requesterCps,
        requesterMobile: doc.requesterMobile,
        name: doc.name,
        aadharNumber: doc.aadharNumber,
        vegNonVeg: doc.vegNonVeg,
        type: doc.type,
        createdAt: doc.createdAt,
        createdByRole: doc.createdByRole,
      }));
    } catch (e) {
      console.error('MongoDB fetch requests error:', e);
    }
  }

  // Local fallback
  try {
    ensureDataStorage();
    const raw = fs.readFileSync(REQUESTS_FILE, 'utf-8');
    return JSON.parse(raw) as FoodRequestDoc[];
  } catch {
    return [];
  }
}

async function saveRequest(reqDoc: FoodRequestDoc): Promise<FoodRequestDoc> {
  const client = await getMongoClient();
  if (client && isMongoConnected) {
    try {
      const db = client.db('food_requester');
      await db.collection<FoodRequestDoc>('food_requests').insertOne({ ...reqDoc });
    } catch (e) {
      console.error('MongoDB insert request error:', e);
    }
  }

  ensureDataStorage();
  const all = await getAllRequests();
  const existingIdx = all.findIndex((r) => r.id === reqDoc.id);
  if (existingIdx >= 0) {
    all[existingIdx] = reqDoc;
  } else {
    all.unshift(reqDoc);
  }
  fs.writeFileSync(REQUESTS_FILE, JSON.stringify(all, null, 2), 'utf-8');
  return reqDoc;
}

async function deleteRequestById(id: string): Promise<boolean> {
  const client = await getMongoClient();
  if (client && isMongoConnected) {
    try {
      const db = client.db('food_requester');
      await db.collection<FoodRequestDoc>('food_requests').deleteOne({ id });
    } catch (e) {
      console.error('MongoDB delete request error:', e);
    }
  }

  ensureDataStorage();
  const all = await getAllRequests();
  const filtered = all.filter((r) => r.id !== id);
  fs.writeFileSync(REQUESTS_FILE, JSON.stringify(filtered, null, 2), 'utf-8');
  return true;
}

// ---------------- REST API ENDPOINTS ----------------

// System health and storage status
app.get('/api/health', async (req: Request, res: Response) => {
  await getMongoClient();
  res.json({
    status: 'ok',
    storage: isMongoConnected ? 'mongodb_atlas' : 'local_persistent_json',
    isMongoConnected,
    hasMongoUri: !!(currentMongoUri || process.env.MONGODB_URI),
    mongoLastError,
    timestamp: new Date().toISOString(),
  });
});

// MongoDB Connection diagnostics and interactive test endpoint
app.post('/api/mongodb/test', async (req: Request, res: Response) => {
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
    const db = testClient.db('food_requester');
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
app.post('/api/mongodb/connect', async (req: Request, res: Response) => {
  const { uri } = req.body;
  if (!uri) {
    return res.status(400).json({ success: false, error: 'URI required' });
  }

  try {
    const client = await getMongoClient(uri);
    if (client && isMongoConnected) {
      // Sync local users and requests to MongoDB
      const localUsers = await getAllUsers();
      const localRequests = await getAllRequests();
      const db = client.db('food_requester');

      for (const u of localUsers) {
        await db.collection('users').updateOne({ id: u.id }, { $set: u }, { upsert: true });
      }
      for (const r of localRequests) {
        await db.collection('food_requests').updateOne({ id: r.id }, { $set: r }, { upsert: true });
      }

      res.json({
        success: true,
        message: 'Connected to MongoDB Atlas and synchronized users & requests tables!',
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
app.post('/api/db/migrate', async (req: Request, res: Response) => {
  try {
    const { uri } = req.body;
    const result = await runMigration(uri || currentMongoUri || process.env.MONGODB_URI);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Migration execution failed.' });
  }
});

// Trigger database seeding (seed super admin subash)
app.post('/api/db/seed', async (req: Request, res: Response) => {
  try {
    const { uri } = req.body;
    const result = await runSeeding(uri || currentMongoUri || process.env.MONGODB_URI);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Seeding execution failed.' });
  }
});

// ---------------- USER AUTHENTICATION & DIRECTORY ----------------

// Login endpoint checking registered users in the 'users' table
app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { mobileNo, password } = req.body;

    if (!mobileNo || !password) {
      return res.status(400).json({ error: 'Mobile No and Password are required.' });
    }

    const cleanMobile = String(mobileNo).trim();
    const cleanPassword = String(password).trim().toUpperCase();

    const allUsers = await getAllUsers();

    // Check if user exists in the users table
    const matchedUser = allUsers.find(
      (u) => 
        u.mobileNo.trim() === cleanMobile && 
        (u.password === password || (!u.password && u.cpsNo.toUpperCase() === cleanPassword))
    );

    // If super admin subash
    if (cleanMobile === '9500466927' && cleanPassword === '1234') {
      const superAdminUser = {
        name: 'subash',
        cpsNo: '1234',
        mobileNo: '9500466927',
        role: 'admin' as const,
        aadharNumber: '1234',
        isSuperAdmin: true,
        loggedInAt: new Date().toISOString(),
      };
      return res.json({ success: true, user: superAdminUser });
    }

    if (!matchedUser) {
      return res.status(401).json({
        error: `Invalid mobile number or password.`,
      });
    }

    const userProfile = {
      id: matchedUser.id,
      name: matchedUser.name,
      cpsNo: matchedUser.cpsNo,
      mobileNo: matchedUser.mobileNo,
      role: matchedUser.userType,
      aadharNumber: matchedUser.aadharNumber,
      isSuperAdmin: matchedUser.isSuperAdmin,
      loggedInAt: new Date().toISOString(),
    };

    res.json({ success: true, user: userProfile });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login authentication failed.' });
  }
});

// GET /api/users - List all users in user table
app.get('/api/users', async (req: Request, res: Response) => {
  try {
    const users = await getAllUsers();
    res.json({ success: true, count: users.length, users });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to retrieve users.' });
  }
});

// POST /api/users - Add employee or admin (Stored in users table)
app.post('/api/users', async (req: Request, res: Response) => {
  try {
    const { name, cpsNo, mobileNo, password, userType, aadharNumber } = req.body;

    if (!name || !cpsNo || !mobileNo || !password || !userType || !aadharNumber) {
      return res.status(400).json({
        error: 'All fields (Name, CPS No, Mobile Number, Password, User Type, Aadhar Number) are required.',
      });
    }

    const cleanCps = String(cpsNo).trim().toUpperCase();
    const cleanMobile = String(mobileNo).trim();

    const existingUsers = await getAllUsers();
    const duplicate = existingUsers.find((u) => u.cpsNo.toUpperCase() === cleanCps);
    if (duplicate) {
      return res.status(400).json({
        error: `A user with CPS No "${cleanCps}" already exists (${duplicate.name}).`,
      });
    }

    const newUser: AppUserDoc = {
      id: `usr-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: name.trim(),
      cpsNo: cleanCps,
      mobileNo: cleanMobile,
      password: String(password).trim(),
      userType: userType === 'admin' ? 'admin' : 'employer',
      aadharNumber: String(aadharNumber).trim(),
      isSuperAdmin: false,
      createdAt: new Date().toISOString(),
    };

    const saved = await saveUser(newUser);
    res.status(201).json({ success: true, user: saved });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to create user in user table.' });
  }
});

// PUT /api/users/:id/password - Update user password
app.put('/api/users/:id/password', async (req: Request, res: Response) => {
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

    target.password = newPassword.trim();
    await saveUser(target);

    res.json({ success: true, message: `Password updated for ${target.name}.` });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update password.' });
  }
});

// DELETE /api/users/:id - Delete a user (Cannot delete super admin)
app.delete('/api/users/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const allUsers = await getAllUsers();
    const target = allUsers.find((u) => u.id === id);

    if (!target) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (target.isSuperAdmin || target.cpsNo === '1234') {
      return res.status(403).json({ error: 'Super Admin subash (CPS: 1234) cannot be deleted.' });
    }

    await deleteUserById(id);
    res.json({ success: true, message: `User ${target.name} removed successfully.` });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete user.' });
  }
});

// ---------------- FOOD REQUESTS ENDPOINTS ----------------

// GET /api/requests/recent - Polling endpoint
app.get('/api/requests/recent', async (req: Request, res: Response) => {
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
app.get('/api/requests', async (req: Request, res: Response) => {
  try {
    const role = (req.query.role as string) || 'employer';
    const cpsNo = (req.query.cpsNo as string) || '';
    const date = req.query.date as string;
    const search = ((req.query.search as string) || '').toLowerCase();
    const type = req.query.type as string;

    let all = await getAllRequests();

    // STRICT ACCESS CONTROL:
    // Employer can ONLY access their own food request submissions.
    // Employer CANNOT view the full master Excel sheet or other employees' requests.
    if (role === 'employer') {
      if (!cpsNo) {
        return res.status(403).json({ error: 'CPS No required for employer request access.' });
      }
      all = all.filter((r) => r.requesterCps.toUpperCase() === cpsNo.toUpperCase());
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
          r.aadharNumber.includes(search) ||
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

// POST /api/requests - Submit new food request
app.post('/api/requests', async (req: Request, res: Response) => {
  try {
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
      return res.status(400).json({
        error: 'All fields (Beneficiary Name, Aadhar, Veg/Non-Veg, Type) are required.',
      });
    }

    // Valid meal types: Breakfast, Lunch, Dinner, Snacks
    const validMealType = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'].includes(type)
      ? type
      : type || 'Lunch';

    const newRequest: FoodRequestDoc = {
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

    const saved = await saveRequest(newRequest);
    
    // Push real-time notification to Firebase
    const adminDb = getFirebaseAdminDb();
    if (adminDb) {
      try {
        await adminDb.ref('/admin_notifications').push({
          id: saved.id,
          createdAt: saved.createdAt,
          type: saved.type,
          beneficiaryName: saved.name,
          requesterName: saved.requesterName,
          requesterMobile: saved.requesterMobile
        });
      } catch (fbErr) {
        console.error('Failed to push Firebase notification:', fbErr);
      }
    }

    res.status(201).json({ success: true, request: saved });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to save food request.' });
  }
});

// DELETE /api/requests/:id - Admin only
app.delete('/api/requests/:id', async (req: Request, res: Response) => {
  try {
    const { role } = req.query;
    if (role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Only Admins can delete records.' });
    }

    const { id } = req.params;
    await deleteRequestById(id);
    res.json({ success: true, message: 'Record deleted successfully.' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete record.' });
  }
});

// GET /api/requests/export.xlsx - Full Excel Export (Admin Only)
app.get('/api/requests/export.xlsx', async (req: Request, res: Response) => {
  try {
    const { role } = req.query;
    if (role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden: Employers cannot view or download full excel sheets.',
      });
    }

    const all = await getAllRequests();

    // Exact columns matching wireframe:
    // DATE | REQUESTER NAME | NAME | AADHAR NUMBER | VEG/NON-VEG | TYPE | CPS NO | MOBILE NO
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
    worksheet['!cols'] = [
      { wch: 14 },
      { wch: 22 },
      { wch: 22 },
      { wch: 18 },
      { wch: 16 },
      { wch: 18 },
      { wch: 15 },
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
app.get('/api/stats', async (req: Request, res: Response) => {
  try {
    const { role } = req.query;
    if (role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

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
