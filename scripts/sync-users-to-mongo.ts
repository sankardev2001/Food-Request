import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import {
  MONGODB_DB_NAME,
  normalizeMongoUri,
  readLocalUsersFile,
  upsertUsersToMongo,
} from '../src/mongoHelpers';

dotenv.config();

async function main() {
  const uri = normalizeMongoUri(process.env.MONGODB_URI);
  if (!uri) {
    console.error('❌ MONGODB_URI is not set in .env');
    process.exit(1);
  }

  const users = readLocalUsersFile();
  if (users.length === 0) {
    console.error('❌ No users found in data/users.json');
    process.exit(1);
  }

  console.log(`📂 Found ${users.length} user(s) in data/users.json`);
  console.log(`📡 Connecting to MongoDB (${MONGODB_DB_NAME})...`);

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  try {
    await client.connect();
    await client.db('admin').command({ ping: 1 });
    const db = client.db(MONGODB_DB_NAME);
    const synced = await upsertUsersToMongo(db, users);
    const total = await db.collection('users').countDocuments();
    console.log(`✅ Upserted ${synced} user(s). Collection now has ${total} document(s).`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Sync failed:', message);
    console.error(
      '   Check Atlas Network Access (0.0.0.0/0), database user password, and MONGODB_URI in .env / Vercel.'
    );
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
