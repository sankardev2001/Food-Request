// src/apiServer.ts
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { MongoClient } from "mongodb";

// src/mongoHelpers.ts
import fs from "fs";
import path from "path";

// src/foodRequestNormalize.ts
function normalizeMealType(type) {
  return ["Breakfast", "Lunch", "Dinner", "Snacks"].includes(type) ? type : "Lunch";
}
function normalizeBeneficiaryRole(role) {
  return role === "Contractor" ? "Contractor" : "CPS";
}
function normalizeFoodRequestDoc(raw) {
  const mobile = String(raw.requesterMobile ?? raw.requesterCps ?? "").trim();
  return {
    id: String(raw.id ?? `req-${Date.now()}-${Math.floor(Math.random() * 1e3)}`),
    date: String(raw.date ?? (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)),
    requesterName: String(raw.requesterName ?? "").trim(),
    requesterCps: String(raw.requesterCps ?? mobile).trim(),
    requesterMobile: mobile,
    name: String(raw.name ?? "").trim(),
    aadharNumber: raw.aadharNumber != null ? String(raw.aadharNumber).trim() : "",
    beneficiaryRole: normalizeBeneficiaryRole(
      raw.beneficiaryRole != null ? String(raw.beneficiaryRole) : void 0
    ),
    vegNonVeg: raw.vegNonVeg === "Non-Veg" ? "Non-Veg" : "Veg",
    type: normalizeMealType(String(raw.type ?? "Lunch")),
    remarks: raw.remarks != null ? String(raw.remarks).trim() : "",
    createdAt: String(raw.createdAt ?? (/* @__PURE__ */ new Date()).toISOString()),
    createdByRole: raw.createdByRole != null && raw.createdByRole !== "" ? String(raw.createdByRole) : void 0
  };
}

// src/mongoHelpers.ts
var MONGODB_DB_NAME = "food_requester";
var SUPER_ADMIN_MOBILE = "9500466927";
var DatabaseUnavailableError = class extends Error {
  constructor(message = "Database unavailable. Set MONGODB_URI and ensure MongoDB Atlas is reachable.") {
    super(message);
    this.name = "DatabaseUnavailableError";
  }
};
function normalizeMongoUri(raw) {
  if (!raw) return "";
  let uri = raw.trim();
  if (uri.startsWith('"') && uri.endsWith('"') || uri.startsWith("'") && uri.endsWith("'")) {
    uri = uri.slice(1, -1).trim();
  }
  return uri;
}
function isSuperAdminUser(user) {
  return !!user.isSuperAdmin || user.id === "usr-subash-superadmin" || user.mobileNo.trim() === SUPER_ADMIN_MOBILE;
}
function normalizeAppUser(raw) {
  const mobileNo = String(raw.mobileNo ?? "").trim();
  const user = {
    id: String(raw.id ?? `usr-${Date.now()}`),
    name: String(raw.name ?? "").trim(),
    team: raw.team != null ? String(raw.team).trim() : "",
    mobileNo,
    password: raw.password != null && raw.password !== "" ? String(raw.password) : void 0,
    userType: raw.userType === "admin" ? "admin" : "employer",
    isSuperAdmin: !!raw.isSuperAdmin || mobileNo === SUPER_ADMIN_MOBILE,
    createdAt: String(raw.createdAt ?? (/* @__PURE__ */ new Date()).toISOString())
  };
  if (user.id === "usr-subash-superadmin") {
    user.isSuperAdmin = true;
  }
  return user;
}
function readLocalUsersFile() {
  const candidates = [
    path.join(process.cwd(), "data", "users.json"),
    path.join(process.cwd(), "..", "data", "users.json")
  ];
  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((u) => normalizeAppUser(u));
      }
    } catch {
    }
  }
  return [];
}
async function upsertUsersToMongo(db, users) {
  let count = 0;
  const col = db.collection("users");
  for (const user of users) {
    await col.updateOne({ id: user.id }, { $set: user }, { upsert: true });
    count += 1;
  }
  return count;
}
function readLocalFoodRequestsFile() {
  const candidates = [
    path.join(process.cwd(), "data", "food_requests.json"),
    path.join(process.cwd(), "..", "data", "food_requests.json")
  ];
  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      if (!Array.isArray(parsed)) continue;
      return parsed.map(
        (r) => normalizeFoodRequestDoc(r)
      );
    } catch {
    }
  }
  return [];
}
async function upsertFoodRequestsToMongo(db, requests) {
  let count = 0;
  const col = db.collection("food_requests");
  for (const raw of requests) {
    const doc = normalizeFoodRequestDoc(raw);
    await col.updateOne({ id: doc.id }, { $set: doc }, { upsert: true });
    count += 1;
  }
  return count;
}

// src/authSecurity.ts
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
var AUTH_COOKIE_NAME = "fr_session";
var BCRYPT_ROUNDS = 12;
var JWT_EXPIRES_IN = "8h";
var loginAttempts = /* @__PURE__ */ new Map();
var MAX_LOGIN_FAILURES = 5;
var LOGIN_WINDOW_MS = 15 * 60 * 1e3;
function getJwtSecret() {
  const secret = (process.env.JWT_SECRET || "").trim();
  if (secret.length >= 32) return secret;
  if (process.env.NODE_ENV === "production") {
    console.error("JWT_SECRET must be set (min 32 chars) in production.");
  }
  return secret || "dev-only-insecure-jwt-secret-change-me";
}
function isPasswordHash(stored) {
  return !!stored && stored.startsWith("$2");
}
async function hashPassword(plain) {
  return bcrypt.hash(plain.trim(), BCRYPT_ROUNDS);
}
async function verifyPassword(plain, stored) {
  if (!stored) return false;
  const normalized = plain.trim();
  if (isPasswordHash(stored)) {
    return bcrypt.compare(normalized, stored);
  }
  return stored === normalized;
}
function validatePasswordPolicy(plain) {
  const p = plain.trim();
  if (p.length < 4) return "Password must be at least 4 characters.";
  if (p.length > 128) return "Password is too long.";
  return null;
}
function sanitizeUserForClient(user) {
  const { password: _password, ...safe } = user;
  return safe;
}
function toUserProfile(user) {
  return {
    id: user.id,
    name: user.name,
    team: user.team || "",
    mobileNo: user.mobileNo,
    role: user.userType,
    isSuperAdmin: isSuperAdminUser(user),
    loggedInAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function signAuthToken(payload) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: JWT_EXPIRES_IN });
}
function verifyAuthToken(token) {
  try {
    return jwt.verify(token, getJwtSecret());
  } catch {
    return null;
  }
}
function setAuthCookie(res, token) {
  const isProd = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    maxAge: 8 * 60 * 60 * 1e3,
    path: "/"
  });
}
function clearAuthCookie(res) {
  const isProd = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/"
  });
}
function getTokenFromRequest(req) {
  const cookieToken = req.cookies?.[AUTH_COOKIE_NAME];
  if (typeof cookieToken === "string" && cookieToken) return cookieToken;
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    return header.slice(7).trim();
  }
  return null;
}
function checkLoginRateLimit(req, mobileNo) {
  const key = `${req.ip || "unknown"}:${mobileNo.trim()}`;
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (entry && entry.lockedUntil > now) {
    return { allowed: false, retryAfterSec: Math.ceil((entry.lockedUntil - now) / 1e3) };
  }
  if (entry && entry.lockedUntil <= now && entry.failures >= MAX_LOGIN_FAILURES) {
    loginAttempts.delete(key);
  }
  return { allowed: true };
}
function recordLoginFailure(req, mobileNo) {
  const key = `${req.ip || "unknown"}:${mobileNo.trim()}`;
  const now = Date.now();
  const entry = loginAttempts.get(key) || { failures: 0, lockedUntil: 0 };
  entry.failures += 1;
  if (entry.failures >= MAX_LOGIN_FAILURES) {
    entry.lockedUntil = now + LOGIN_WINDOW_MS;
  }
  loginAttempts.set(key, entry);
}
function clearLoginFailures(req, mobileNo) {
  const key = `${req.ip || "unknown"}:${mobileNo.trim()}`;
  loginAttempts.delete(key);
}
function requireAuth(options) {
  return (req, res, next) => {
    const token = getTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ success: false, error: "Authentication required." });
    }
    const payload = verifyAuthToken(token);
    if (!payload) {
      return res.status(401).json({ success: false, error: "Session expired or invalid. Please log in again." });
    }
    if (options?.adminOnly && payload.role !== "admin") {
      return res.status(403).json({ success: false, error: "Admin access required." });
    }
    req.authUser = payload;
    next();
  };
}

// src/authHandlers.ts
async function handleLoginRequest(req, res, deps) {
  const { mobileNo, password } = req.body;
  if (!mobileNo || !password) {
    return res.status(400).json({ success: false, error: "Mobile number and password are required." });
  }
  const cleanMobile = String(mobileNo).trim();
  const rate = checkLoginRateLimit(req, cleanMobile);
  if (!rate.allowed) {
    return res.status(429).json({
      success: false,
      error: `Too many failed login attempts. Try again in ${rate.retryAfterSec} seconds.`
    });
  }
  const allUsers = await deps.getAllUsers();
  const matchedUser = allUsers.find((u) => u.mobileNo.trim() === cleanMobile);
  if (!matchedUser || !await verifyPassword(String(password), matchedUser.password)) {
    recordLoginFailure(req, cleanMobile);
    return res.status(401).json({
      success: false,
      error: "Invalid mobile number or password."
    });
  }
  clearLoginFailures(req, cleanMobile);
  if (matchedUser.password && !matchedUser.password.startsWith("$2")) {
    matchedUser.password = await hashPassword(String(password));
    await deps.saveUser(matchedUser);
  }
  const profile = toUserProfile(matchedUser);
  const token = signAuthToken({
    sub: matchedUser.id,
    name: matchedUser.name,
    team: matchedUser.team || "",
    mobileNo: matchedUser.mobileNo,
    role: matchedUser.userType,
    isSuperAdmin: profile.isSuperAdmin
  });
  setAuthCookie(res, token);
  return res.json({ success: true, user: profile });
}
function handleLogoutRequest(_req, res) {
  clearAuthCookie(res);
  return res.json({ success: true, message: "Logged out." });
}
function handleMeRequest(req, res) {
  const token = getTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ success: false, error: "Not authenticated." });
  }
  const payload = verifyAuthToken(token);
  if (!payload) {
    return res.status(401).json({ success: false, error: "Session expired. Please log in again." });
  }
  return res.json({
    success: true,
    user: {
      id: payload.sub,
      name: payload.name,
      team: payload.team || "",
      mobileNo: payload.mobileNo,
      role: payload.role,
      isSuperAdmin: payload.isSuperAdmin,
      loggedInAt: (/* @__PURE__ */ new Date()).toISOString()
    }
  });
}
async function hashPasswordForStorage(plain) {
  const policyError = validatePasswordPolicy(plain);
  if (policyError) return { error: policyError };
  return hashPassword(plain);
}

// src/foodRequestHelpers.ts
function isAadharFirst4(value) {
  return /^\d{4}$/.test(String(value).trim());
}
function validateEmployerFoodBody(body) {
  if (!body.name?.trim()) {
    return { ok: false, error: "Beneficiary name is required." };
  }
  if (!isAadharFirst4(body.aadharNumber ?? "")) {
    return { ok: false, error: "Aadhar first 4 digits must be exactly 4 numbers." };
  }
  if (!body.vegNonVeg || !["Veg", "Non-Veg"].includes(body.vegNonVeg)) {
    return { ok: false, error: "Food type (Veg/Non-Veg) is required." };
  }
  if (!body.type?.trim()) {
    return { ok: false, error: "Meal type is required." };
  }
  if (body.beneficiaryRole != null && body.beneficiaryRole !== "" && body.beneficiaryRole !== "CPS" && body.beneficiaryRole !== "Contractor") {
    return { ok: false, error: "Role must be CPS or Contractor." };
  }
  return { ok: true };
}
function buildFoodRequest(auth, fields) {
  return normalizeFoodRequestDoc({
    id: fields.id || `req-${Date.now()}-${Math.floor(Math.random() * 1e3)}`,
    date: fields.date || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
    requesterName: auth.name,
    requesterCps: auth.mobileNo,
    requesterMobile: auth.mobileNo,
    name: fields.name.trim(),
    aadharNumber: fields.aadharNumber?.trim() || "",
    beneficiaryRole: normalizeBeneficiaryRole(fields.beneficiaryRole),
    vegNonVeg: fields.vegNonVeg === "Non-Veg" ? "Non-Veg" : "Veg",
    type: normalizeMealType(fields.type),
    remarks: fields.remarks?.trim() || "",
    createdAt: fields.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
    createdByRole: fields.createdByRole || auth.role
  });
}
function canManageRequest(auth, req) {
  if (auth.role === "admin") return true;
  return req.requesterMobile.trim() === auth.mobileNo.trim();
}

// src/apiServer.ts
var firebaseDb = null;
var firebaseInitPromise = null;
async function getFirebaseAdminDb() {
  if (firebaseDb) return firebaseDb;
  if (!firebaseInitPromise) {
    firebaseInitPromise = (async () => {
      try {
        const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
        const databaseURL = process.env.VITE_FIREBASE_DATABASE_URL;
        if (!serviceAccountRaw || !databaseURL) return null;
        const serviceAccount = JSON.parse(serviceAccountRaw);
        if (serviceAccount.private_key) {
          serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
        }
        const { initializeApp, getApps, cert } = await import("firebase-admin/app");
        const { getDatabase } = await import("firebase-admin/database");
        const app2 = getApps().length ? getApps()[0] : initializeApp({
          credential: cert(serviceAccount),
          databaseURL
        });
        firebaseDb = getDatabase(app2);
        return firebaseDb;
      } catch (error) {
        console.error("Failed to initialize Firebase Admin:", error);
        return null;
      }
    })();
  }
  return firebaseInitPromise;
}
var app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
var SEED_SUPER_ADMIN = {
  id: "usr-subash-superadmin",
  name: "subash",
  mobileNo: SUPER_ADMIN_MOBILE,
  password: "1234",
  userType: "admin",
  isSuperAdmin: true,
  createdAt: (/* @__PURE__ */ new Date()).toISOString()
};
var mongoClient = null;
var currentMongoUri = normalizeMongoUri(process.env.MONGODB_URI);
var mongoLastError = null;
var mongoBootstrapped = false;
async function bootstrapMongo(db) {
  if (mongoBootstrapped) return;
  const usersCol = db.collection("users");
  const adminDoc = await usersCol.findOne({ id: "usr-subash-superadmin" });
  if (!adminDoc) {
    await usersCol.insertOne({ ...SEED_SUPER_ADMIN });
  }
  mongoBootstrapped = true;
}
async function getDbOrThrow() {
  const db = await getMongoDb();
  if (!db) {
    throw new DatabaseUnavailableError(
      mongoLastError ? `Database unavailable: ${mongoLastError}` : void 0
    );
  }
  return db;
}
async function getMongoDb(overrideUri) {
  const uri = normalizeMongoUri(overrideUri || currentMongoUri || process.env.MONGODB_URI);
  if (!uri || uri.trim() === "") {
    mongoLastError = "MONGODB_URI is not configured";
    return null;
  }
  if (uri.includes("<db_password>") || uri.includes("<password>") || uri.includes("<username>")) {
    mongoLastError = "MONGODB_URI contains placeholder values";
    return null;
  }
  try {
    if (mongoClient && (!overrideUri || overrideUri === currentMongoUri)) {
      try {
        await mongoClient.db("admin").command({ ping: 1 });
      } catch (err) {
        mongoClient = null;
      }
    }
    if (!mongoClient || overrideUri && overrideUri !== currentMongoUri) {
      if (mongoClient) {
        try {
          await mongoClient.close();
        } catch {
        }
      }
      mongoClient = new MongoClient(uri, {
        serverSelectionTimeoutMS: 1e4,
        connectTimeoutMS: 1e4,
        maxPoolSize: 5
      });
      await mongoClient.connect();
      currentMongoUri = uri;
      mongoLastError = null;
      await bootstrapMongo(mongoClient.db(MONGODB_DB_NAME));
    }
    const db = mongoClient.db(MONGODB_DB_NAME);
    await bootstrapMongo(db);
    return db;
  } catch (err) {
    mongoLastError = err instanceof Error ? err.message : "Connection failed";
    console.warn("MongoDB connection error in serverless:", mongoLastError);
    return null;
  }
}
async function getAllUsers() {
  const db = await getDbOrThrow();
  const docs = await db.collection("users").find({}).sort({ createdAt: -1 }).toArray();
  return docs.map((d) => normalizeAppUser(d));
}
async function saveUser(user) {
  const db = await getDbOrThrow();
  await db.collection("users").updateOne({ id: user.id }, { $set: user }, { upsert: true });
  return user;
}
async function deleteUserById(id) {
  const db = await getDbOrThrow();
  await db.collection("users").deleteOne({ id });
}
async function deleteRequestById(id) {
  const db = await getDbOrThrow();
  await db.collection("food_requests").deleteOne({ id });
}
async function persistRequest(doc) {
  const stored = normalizeFoodRequestDoc(
    doc
  );
  const db = await getDbOrThrow();
  await db.collection("food_requests").updateOne(
    { id: stored.id },
    { $set: stored },
    { upsert: true }
  );
  return stored;
}
async function findRequestById(id) {
  return (await getAllRequests()).find((r) => r.id === id);
}
async function getAllRequests() {
  const db = await getDbOrThrow();
  const docs = await db.collection("food_requests").find({}).sort({ createdAt: -1 }).toArray();
  return docs.map(
    (doc) => normalizeFoodRequestDoc(doc)
  );
}
app.get("/api/health", async (req, res) => {
  const db = await getMongoDb();
  res.json({
    status: "ok",
    environment: "vercel_serverless",
    storage: db ? "mongodb_atlas" : "unavailable",
    databaseRequired: true,
    hasMongoUri: !!normalizeMongoUri(process.env.MONGODB_URI),
    mongoError: mongoLastError,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
});
app.post("/api/mongodb/test", async (req, res) => {
  const { uri } = req.body;
  if (!uri || typeof uri !== "string" || !uri.startsWith("mongodb")) {
    return res.status(400).json({ success: false, error: "Invalid URI format." });
  }
  let testClient = null;
  try {
    testClient = new MongoClient(uri, { serverSelectionTimeoutMS: 4e3 });
    await testClient.connect();
    await testClient.db("admin").command({ ping: 1 });
    res.json({ success: true, message: "Successfully connected to MongoDB Atlas!" });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  } finally {
    if (testClient) {
      try {
        await testClient.close();
      } catch {
      }
    }
  }
});
app.post("/api/mongodb/connect", async (req, res) => {
  const { uri } = req.body;
  if (!uri) return res.status(400).json({ success: false, error: "URI required" });
  mongoBootstrapped = false;
  const db = await getMongoDb(normalizeMongoUri(uri));
  if (db) {
    const count = await db.collection("users").countDocuments();
    res.json({
      success: true,
      message: "Connected to MongoDB Atlas. Application data is read from and written to the database only.",
      userCount: count
    });
  } else {
    res.status(400).json({
      success: false,
      error: mongoLastError || "Failed to connect to MongoDB Atlas."
    });
  }
});
app.post("/api/db/sync-requests", requireAuth({ adminOnly: true }), async (req, res) => {
  try {
    const source = readLocalFoodRequestsFile();
    if (source.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No food requests in data/food_requests.json to import."
      });
    }
    const db = await getDbOrThrow();
    const synced = await upsertFoodRequestsToMongo(db, source);
    const requestCount = await db.collection("food_requests").countDocuments();
    res.json({ success: true, mode: "mongodb", synced, requestCount });
  } catch (err) {
    if (err instanceof DatabaseUnavailableError) {
      return res.status(503).json({ success: false, error: err.message });
    }
    const message = err instanceof Error ? err.message : "Request sync failed";
    res.status(500).json({ success: false, error: message });
  }
});
app.post("/api/db/sync-users", requireAuth({ adminOnly: true }), async (req, res) => {
  try {
    const source = readLocalUsersFile();
    if (source.length === 0) {
      return res.status(400).json({ success: false, error: "No users in data/users.json to import." });
    }
    const db = await getDbOrThrow();
    const synced = await upsertUsersToMongo(db, source);
    const userCount = await db.collection("users").countDocuments();
    res.json({ success: true, mode: "mongodb", synced, userCount });
  } catch (err) {
    if (err instanceof DatabaseUnavailableError) {
      return res.status(503).json({ success: false, error: err.message });
    }
    const message = err instanceof Error ? err.message : "Sync failed";
    res.status(500).json({ success: false, error: message });
  }
});
app.post("/api/db/migrate", async (req, res) => {
  try {
    const { uri } = req.body;
    const db = await getMongoDb(uri);
    if (!db) {
      return res.status(400).json({
        success: false,
        error: "MongoDB is not connected. Please provide a valid MONGODB_URI in environment variables."
      });
    }
    const details = [];
    const collections = await db.listCollections().toArray();
    const colNames = collections.map((c) => c.name);
    if (!colNames.includes("users")) {
      await db.createCollection("users");
      details.push('Created "users" collection');
    }
    const usersCol = db.collection("users");
    try {
      await usersCol.createIndex({ mobileNo: 1 }, { unique: true });
      details.push("Created unique index on users.mobileNo");
    } catch {
    }
    await usersCol.createIndex({ userType: 1 });
    if (!colNames.includes("food_requests")) {
      await db.createCollection("food_requests");
      details.push('Created "food_requests" collection');
    }
    const reqCol = db.collection("food_requests");
    await reqCol.createIndex({ date: 1 });
    await reqCol.createIndex({ requesterCps: 1 });
    await reqCol.createIndex({ createdAt: -1 });
    await reqCol.createIndex({ type: 1 });
    const legacy = await reqCol.updateMany(
      { type: { $in: ["Detaction", "Non-Detaction"] } },
      { $set: { type: "Lunch" } }
    );
    if (legacy.modifiedCount > 0) {
      details.push(`Migrated ${legacy.modifiedCount} legacy records to standard MealTypes.`);
    }
    res.json({ success: true, mode: "mongodb", details });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.post("/api/db/seed", async (req, res) => {
  try {
    const { uri } = req.body;
    const db = await getMongoDb(uri);
    if (!db) {
      return res.status(503).json({
        success: false,
        error: mongoLastError || "MongoDB is required to seed the database."
      });
    }
    const usersCol = db.collection("users");
    const existing = await usersCol.findOne({ id: "usr-subash-superadmin" });
    let action = "updated";
    if (!existing) {
      await usersCol.insertOne({ ...SEED_SUPER_ADMIN });
      action = "inserted";
    } else {
      await usersCol.updateOne(
        { id: "usr-subash-superadmin" },
        {
          $set: {
            name: SEED_SUPER_ADMIN.name,
            mobileNo: SEED_SUPER_ADMIN.mobileNo,
            password: SEED_SUPER_ADMIN.password,
            userType: "admin",
            isSuperAdmin: true
          }
        }
      );
    }
    res.json({
      success: true,
      mode: "mongodb",
      admin: SEED_SUPER_ADMIN,
      action,
      details: [`Super Admin subash verified and seeded in MongoDB users collection.`]
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.post("/api/auth/login", async (req, res) => {
  try {
    await handleLoginRequest(req, res, { getAllUsers, saveUser });
  } catch (e) {
    if (e instanceof DatabaseUnavailableError) {
      return res.status(503).json({ success: false, error: e.message });
    }
    console.error("Login error:", e);
    const message = e instanceof Error ? e.message : "Login authentication failed.";
    res.status(500).json({ success: false, error: message });
  }
});
app.post("/api/auth/logout", (req, res) => {
  handleLogoutRequest(req, res);
});
app.get("/api/auth/me", (req, res) => {
  handleMeRequest(req, res);
});
app.get("/api/users", requireAuth({ adminOnly: true }), async (req, res) => {
  const users = (await getAllUsers()).map(sanitizeUserForClient);
  res.json({ success: true, count: users.length, users });
});
app.put("/api/users/:id", requireAuth({ adminOnly: true }), async (req, res) => {
  const { id } = req.params;
  const { name, team, mobileNo } = req.body;
  const all = await getAllUsers();
  const target = all.find((u) => u.id === id);
  if (!target) return res.status(404).json({ error: "User not found." });
  if (name) target.name = String(name).trim();
  if (team !== void 0) target.team = String(team).trim();
  if (mobileNo) {
    const clean = String(mobileNo).trim();
    if (all.some((u) => u.id !== id && u.mobileNo.trim() === clean)) {
      return res.status(400).json({ error: "Mobile number already in use." });
    }
    target.mobileNo = clean;
  }
  const saved = await saveUser(target);
  res.json({ success: true, user: sanitizeUserForClient(saved) });
});
app.post("/api/users", requireAuth({ adminOnly: true }), async (req, res) => {
  const { name, team, mobileNo, password, userType } = req.body;
  if (!name || !mobileNo || !password || !userType) {
    return res.status(400).json({ error: "Name, mobile number, password, and user type are required." });
  }
  const cleanMobile = String(mobileNo).trim();
  const duplicate = (await getAllUsers()).find((u) => u.mobileNo.trim() === cleanMobile);
  if (duplicate) {
    return res.status(400).json({
      error: `A user with mobile number "${cleanMobile}" already exists (${duplicate.name}).`
    });
  }
  const hashed = await hashPasswordForStorage(String(password));
  if (typeof hashed !== "string") {
    return res.status(400).json({ error: hashed.error });
  }
  const newUser = {
    id: `usr-${Date.now()}`,
    name: name.trim(),
    team: team != null ? String(team).trim() : "",
    mobileNo: cleanMobile,
    password: hashed,
    userType: userType === "admin" ? "admin" : "employer",
    isSuperAdmin: false,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  const saved = await saveUser(newUser);
  res.status(201).json({ success: true, user: sanitizeUserForClient(saved) });
});
app.put("/api/users/:id/password", requireAuth({ adminOnly: true }), async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;
  if (!newPassword) {
    return res.status(400).json({ error: "New password is required." });
  }
  const hashed = await hashPasswordForStorage(newPassword);
  if (typeof hashed !== "string") {
    return res.status(400).json({ error: hashed.error });
  }
  const all = await getAllUsers();
  const target = all.find((u) => u.id === id);
  if (!target) {
    return res.status(404).json({ error: "User not found." });
  }
  target.password = hashed;
  await saveUser(target);
  res.json({ success: true, message: "Password updated." });
});
app.delete("/api/users/:id", requireAuth({ adminOnly: true }), async (req, res) => {
  const { id } = req.params;
  const target = (await getAllUsers()).find((u) => u.id === id);
  if (target && isSuperAdminUser(target)) {
    return res.status(403).json({ error: "Super Admin subash cannot be deleted." });
  }
  await deleteUserById(id);
  res.json({ success: true, message: "User deleted." });
});
app.get("/api/requests/recent", requireAuth({ adminOnly: true }), async (req, res) => {
  const since = req.query.since;
  if (!since) return res.status(400).json({ error: "Since timestamp required." });
  const allRequests = await getAllRequests();
  const newRequests = allRequests.filter((r) => r.createdAt > since);
  res.json({ success: true, count: newRequests.length, requests: newRequests });
});
app.get("/api/requests", requireAuth(), async (req, res) => {
  const role = req.query.role || "employer";
  if (role === "admin" && req.authUser?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }
  const requesterMobile = req.query.mobileNo || req.query.cpsNo || "";
  const date = req.query.date;
  const search = (req.query.search || "").toLowerCase();
  const type = req.query.type;
  let all = await getAllRequests();
  if (role === "employer") {
    const mobile = (requesterMobile || req.authUser?.mobileNo || "").trim();
    if (!mobile) {
      return res.status(403).json({ error: "Mobile number required for employer access." });
    }
    if (req.authUser?.mobileNo !== mobile) {
      return res.status(403).json({ error: "You can only view your own requests." });
    }
    all = all.filter(
      (r) => r.requesterMobile.trim() === mobile || r.requesterCps.toUpperCase() === mobile.toUpperCase()
    );
  }
  if (date) all = all.filter((r) => r.date === date);
  if (type && type !== "all") all = all.filter((r) => r.type.toLowerCase() === type.toLowerCase());
  if (search) {
    all = all.filter(
      (r) => r.name.toLowerCase().includes(search) || r.requesterName.toLowerCase().includes(search) || r.aadharNumber && r.aadharNumber.includes(search) || r.type.toLowerCase().includes(search)
    );
  }
  res.json({ success: true, count: all.length, requests: all });
});
async function notifyNewRequest(saved) {
  const adminDb = await getFirebaseAdminDb();
  if (!adminDb) return;
  try {
    await adminDb.ref("/admin_notifications").push({
      id: saved.id,
      createdAt: saved.createdAt,
      type: saved.type,
      beneficiaryName: saved.name,
      requesterName: saved.requesterName,
      requesterMobile: saved.requesterMobile
    });
  } catch (fbErr) {
    console.error("Failed to push Firebase notification:", fbErr);
  }
}
app.post("/api/requests", requireAuth(), async (req, res) => {
  const { date, name, vegNonVeg, type, remarks, aadharNumber, beneficiaryRole, createdByRole } = req.body;
  const auth = req.authUser;
  const validation = validateEmployerFoodBody({
    name,
    aadharNumber,
    beneficiaryRole,
    vegNonVeg,
    type,
    remarks
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
    createdByRole
  });
  const saved = await persistRequest(newDoc);
  await notifyNewRequest(saved);
  res.status(201).json({ success: true, request: saved });
});
app.post("/api/requests/bulk", requireAuth(), async (req, res) => {
  const auth = req.authUser;
  const { date, type, items } = req.body;
  if (!type || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Meal type and request rows are required." });
  }
  const savedRows = [];
  for (const item of items) {
    const validation = validateEmployerFoodBody({
      name: item.name,
      aadharNumber: item.aadharNumber,
      beneficiaryRole: item.beneficiaryRole,
      vegNonVeg: item.vegNonVeg || "Veg",
      type,
      remarks: item.remarks
    });
    if (!validation.ok) continue;
    const doc = buildFoodRequest(auth, {
      date,
      name: item.name,
      vegNonVeg: item.vegNonVeg || "Veg",
      type,
      remarks: item.remarks,
      aadharNumber: item.aadharNumber,
      beneficiaryRole: item.beneficiaryRole
    });
    savedRows.push(await persistRequest(doc));
    await notifyNewRequest(savedRows[savedRows.length - 1]);
  }
  if (savedRows.length === 0) {
    return res.status(400).json({ error: "No valid rows with beneficiary name." });
  }
  res.status(201).json({ success: true, count: savedRows.length, requests: savedRows });
});
app.put("/api/requests/:id", requireAuth(), async (req, res) => {
  const auth = req.authUser;
  const existing = await findRequestById(req.params.id);
  if (!existing) return res.status(404).json({ error: "Request not found." });
  if (!canManageRequest(auth, existing)) {
    return res.status(403).json({ error: "You can only edit your own requests." });
  }
  const { name, vegNonVeg, type, remarks, aadharNumber, beneficiaryRole } = req.body;
  const validation = validateEmployerFoodBody({
    name,
    aadharNumber,
    beneficiaryRole,
    vegNonVeg,
    type,
    remarks
  });
  if (validation.ok === false) {
    return res.status(400).json({ error: validation.error });
  }
  const updated = {
    ...existing,
    name: String(name).trim(),
    aadharNumber: String(aadharNumber).trim(),
    beneficiaryRole: beneficiaryRole != null ? normalizeBeneficiaryRole(String(beneficiaryRole)) : existing.beneficiaryRole || "CPS",
    vegNonVeg: vegNonVeg === "Non-Veg" ? "Non-Veg" : "Veg",
    type: normalizeMealType(type),
    remarks: remarks != null ? String(remarks).trim() : existing.remarks || ""
  };
  res.json({ success: true, request: await persistRequest(updated) });
});
app.put("/api/requests/bulk", requireAuth(), async (req, res) => {
  const auth = req.authUser;
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Items array is required." });
  }
  const updated = [];
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
      remarks: item.remarks
    });
    if (!validation.ok) continue;
    updated.push(
      await persistRequest({
        ...existing,
        name: item.name.trim(),
        aadharNumber: String(item.aadharNumber ?? existing.aadharNumber ?? "").trim(),
        beneficiaryRole: normalizeBeneficiaryRole(
          item.beneficiaryRole ?? existing.beneficiaryRole ?? "CPS"
        ),
        vegNonVeg: item.vegNonVeg === "Non-Veg" ? "Non-Veg" : "Veg",
        type: normalizeMealType(item.type),
        remarks: item.remarks != null ? String(item.remarks).trim() : existing.remarks || ""
      })
    );
  }
  if (updated.length === 0) return res.status(400).json({ error: "No requests updated." });
  res.json({ success: true, count: updated.length, requests: updated });
});
app.delete("/api/requests/:id", requireAuth({ adminOnly: true }), async (req, res) => {
  try {
    await deleteRequestById(req.params.id);
    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    if (err instanceof DatabaseUnavailableError) {
      return res.status(503).json({ success: false, error: err.message });
    }
    throw err;
  }
});
app.get("/api/requests/export.xlsx", requireAuth({ adminOnly: true }), async (req, res) => {
  const all = await getAllRequests();
  const rows = all.map((r) => ({
    DATE: r.date,
    "REQUESTER NAME": r.requesterName,
    NAME: r.name,
    "AADHAR FIRST 4": r.aadharNumber || "",
    ROLES: r.beneficiaryRole || "CPS",
    "VEG/NON-VEG": r.vegNonVeg,
    TYPE: r.type,
    REMARK: r.remarks || "",
    "MOBILE NO": r.requesterMobile
  }));
  const XLSX = await import("xlsx");
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "data collect - admin site");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", 'attachment; filename="Food_Requests_Admin_Data_Collect.xlsx"');
  res.send(buffer);
});
app.get("/api/stats", requireAuth({ adminOnly: true }), async (req, res) => {
  const all = await getAllRequests();
  const todayStr = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  res.json({
    success: true,
    stats: {
      total: all.length,
      vegCount: all.filter((r) => r.vegNonVeg === "Veg").length,
      nonVegCount: all.filter((r) => r.vegNonVeg === "Non-Veg").length,
      breakfastCount: all.filter((r) => r.type === "Breakfast").length,
      lunchCount: all.filter((r) => r.type === "Lunch").length,
      dinnerCount: all.filter((r) => r.type === "Dinner").length,
      snacksCount: all.filter((r) => r.type === "Snacks").length,
      todayCount: all.filter((r) => r.date === todayStr).length
    }
  });
});
app.use((err, _req, res, _next) => {
  if (err instanceof DatabaseUnavailableError) {
    return res.status(503).json({ success: false, error: err.message });
  }
  console.error(err);
  res.status(500).json({ success: false, error: "Internal server error." });
});
var apiServer_default = app;
export {
  apiServer_default as default
};
//# sourceMappingURL=index.js.map
