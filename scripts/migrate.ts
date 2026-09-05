import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Parse command line arguments (e.g. --uri=mongodb+srv://...)
function getMongoUri(): string {
  const arg = process.argv.find((a) => a.startsWith('--uri='));
  if (arg) {
    return arg.replace('--uri=', '').trim();
  }
  return (process.env.MONGODB_URI || '').trim();
}

export async function runMigration(explicitUri?: string): Promise<{
  success: boolean;
  mode: 'mongodb' | 'local_files';
  details: string[];
  error?: string;
}> {
  const uri = explicitUri || getMongoUri();
  const details: string[] = [];

  console.log('----------------------------------------------------');
  console.log('🚀 FOOD REQUESTER DATABASE MIGRATION ENGINE');
  console.log('----------------------------------------------------');

  let activeUri = uri;
  const hasPlaceholder =
    activeUri.includes('<db_password>') ||
    activeUri.includes('<password>') ||
    activeUri.includes('<username>');

  if (hasPlaceholder) {
    console.warn('⚠️  WARNING: Placeholder "<db_password>" detected in MONGODB_URI.');
    console.warn('   Replace "<db_password>" with your actual MongoDB user password to connect to Atlas.');
    console.log('   Proceeding with local database migration...');
    details.push('Placeholder <db_password> found in URI. Handled via local storage migration.');
    activeUri = '';
  }

  if (activeUri && activeUri.trim() !== '') {
    console.log(`📡 Connecting to MongoDB Atlas for migration...`);
    let client: MongoClient | null = null;
    try {
      client = new MongoClient(uri, { serverSelectionTimeoutMS: 6000 });
      await client.connect();
      details.push('Connected to MongoDB cluster');

      // Database name from URI or default 'food_requester'
      const db = client.db();
      const dbName = db.databaseName || 'food_requester';
      console.log(`📁 Target Database: [${dbName}]`);
      details.push(`Target Database: ${dbName}`);

      // 1. Ensure 'users' collection & indexes
      const collections = await db.listCollections().toArray();
      const colNames = collections.map((c) => c.name);

      if (!colNames.includes('users')) {
        await db.createCollection('users');
        details.push('Created "users" collection');
        console.log('✅ Created "users" collection');
      } else {
        details.push('"users" collection already exists');
      }

      const usersCol = db.collection('users');
      // Create indexes for users
      try {
        await usersCol.createIndex({ cpsNo: 1 }, { unique: true, name: 'idx_users_cpsNo_unique' });
        details.push('Created unique index on users.cpsNo');
        console.log('✅ Created unique index: users.cpsNo');
      } catch (idxErr: any) {
        details.push(`Index users.cpsNo exists or verified: ${idxErr.message || 'ok'}`);
      }

      await usersCol.createIndex({ mobileNo: 1 }, { name: 'idx_users_mobileNo' });
      await usersCol.createIndex({ userType: 1 }, { name: 'idx_users_userType' });
      details.push('Created auxiliary indexes on users.mobileNo and users.userType');

      // 2. Ensure 'food_requests' collection & indexes
      if (!colNames.includes('food_requests')) {
        await db.createCollection('food_requests');
        details.push('Created "food_requests" collection');
        console.log('✅ Created "food_requests" collection');
      } else {
        details.push('"food_requests" collection already exists');
      }

      const reqCol = db.collection('food_requests');
      await reqCol.createIndex({ date: 1 }, { name: 'idx_requests_date' });
      await reqCol.createIndex({ requesterCps: 1 }, { name: 'idx_requests_requesterCps' });
      await reqCol.createIndex({ createdAt: -1 }, { name: 'idx_requests_createdAt' });
      await reqCol.createIndex({ type: 1 }, { name: 'idx_requests_type' });
      details.push('Created query performance indexes on food_requests (date, requesterCps, createdAt, type)');
      console.log('✅ Created query indexes on food_requests');

      // 3. Schema Data Migration: normalize legacy types to MealTypes
      const legacyResult = await reqCol.updateMany(
        { type: { $in: ['Detaction', 'Non-Detaction'] } },
        { $set: { type: 'Lunch' } }
      );
      if (legacyResult.modifiedCount > 0) {
        details.push(`Migrated ${legacyResult.modifiedCount} legacy food requests from Detaction to Lunch`);
        console.log(`🔄 Migrated ${legacyResult.modifiedCount} legacy records to standard MealTypes.`);
      }

      console.log('🎉 MongoDB Migration completed successfully!');
      return { success: true, mode: 'mongodb', details };
    } catch (err: any) {
      console.error('❌ Migration failed:', err.message);
      return {
        success: false,
        mode: 'mongodb',
        details,
        error: err.message || 'Unknown migration error',
      };
    } finally {
      if (client) {
        try {
          await client.close();
        } catch {}
      }
    }
  } else {
    // Local Filesystem Migration
    console.log('⚠️  No MONGODB_URI found. Running local filesystem storage migration...');
    const dataDir = path.join(process.cwd(), 'data');
    const usersFile = path.join(dataDir, 'users.json');
    const reqFile = path.join(dataDir, 'food_requests.json');

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      details.push('Created data directory');
    }

    if (!fs.existsSync(usersFile)) {
      fs.writeFileSync(usersFile, JSON.stringify([], null, 2), 'utf-8');
      details.push('Created users.json file');
    }

    if (!fs.existsSync(reqFile)) {
      fs.writeFileSync(reqFile, JSON.stringify([], null, 2), 'utf-8');
      details.push('Created food_requests.json file');
    } else {
      // Migrate legacy types in food_requests.json
      try {
        const raw = fs.readFileSync(reqFile, 'utf-8');
        const list = JSON.parse(raw);
        let modified = false;
        const updated = list.map((item: any) => {
          if (item.type === 'Detaction' || item.type === 'Non-Detaction') {
            modified = true;
            return { ...item, type: 'Lunch' };
          }
          return item;
        });
        if (modified) {
          fs.writeFileSync(reqFile, JSON.stringify(updated, null, 2), 'utf-8');
          details.push(`Migrated legacy types in local food_requests.json to Lunch`);
        }
      } catch (e: any) {
        details.push(`Warning: could not verify food_requests.json: ${e.message}`);
      }
    }

    console.log('✅ Local file storage schema verified and ready.');
    return { success: true, mode: 'local_files', details };
  }
}

// Execute directly if run via CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigration()
    .then((res) => {
      if (!res.success) {
        process.exit(1);
      }
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
