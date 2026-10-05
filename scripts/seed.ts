import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { SUPER_ADMIN_MOBILE, normalizeAppUser } from '../src/mongoHelpers';
import { isDirectScriptRun } from './isDirectScriptRun';

dotenv.config();

export const SEED_SUPER_ADMIN = {
  id: 'usr-subash-superadmin',
  name: 'subash',
  mobileNo: SUPER_ADMIN_MOBILE,
  password: '1234',
  userType: 'admin' as const,
  isSuperAdmin: true,
  createdAt: new Date().toISOString(),
};

function getMongoUri(): string {
  const arg = process.argv.find((a) => a.startsWith('--uri='));
  if (arg) {
    return arg.replace('--uri=', '').trim();
  }
  return (process.env.MONGODB_URI || '').trim();
}

export async function runSeeding(explicitUri?: string): Promise<{
  success: boolean;
  mode: 'mongodb' | 'local_files';
  admin: typeof SEED_SUPER_ADMIN;
  action: 'inserted' | 'updated' | 'already_exists';
  details: string[];
  error?: string;
}> {
  const uri = explicitUri || getMongoUri();
  const details: string[] = [];

  console.log('----------------------------------------------------');
  console.log('🌱 FOOD REQUESTER DATABASE SEEDING ENGINE');
  console.log('----------------------------------------------------');
  console.log(`👤 Target Super Admin User:`);
  console.log(`   - Name:          ${SEED_SUPER_ADMIN.name}`);
  console.log(`   - Mobile Number: ${SEED_SUPER_ADMIN.mobileNo}`);
  console.log(`   - Role/Type:     ${SEED_SUPER_ADMIN.userType} (Super Admin)`);
  console.log('----------------------------------------------------');

  let activeUri = uri;
  const hasPlaceholder =
    activeUri.includes('<db_password>') ||
    activeUri.includes('<password>') ||
    activeUri.includes('<username>');

  if (hasPlaceholder) {
    console.warn('⚠️  WARNING: Placeholder "<db_password>" detected in MONGODB_URI.');
    console.warn('   Replace "<db_password>" with your actual MongoDB user password to connect to Atlas.');
    console.log('   Proceeding with local storage seeding...');
    details.push('Placeholder <db_password> found in URI. Handled via local storage seeding.');
    activeUri = '';
  }

  if (activeUri && activeUri.trim() !== '') {
    console.log(`📡 Connecting to MongoDB Atlas to seed database...`);
    let client: MongoClient | null = null;
    try {
      client = new MongoClient(uri, { serverSelectionTimeoutMS: 6000 });
      await client.connect();

      const db = client.db('food_requester');
      const usersCol = db.collection('users');

      const existing = await usersCol.findOne({ id: SEED_SUPER_ADMIN.id });
      let action: 'inserted' | 'updated' | 'already_exists' = 'already_exists';

      if (!existing) {
        await usersCol.insertOne({ ...SEED_SUPER_ADMIN });
        action = 'inserted';
        details.push(`Created Super Admin ${SEED_SUPER_ADMIN.name} in MongoDB`);
        console.log(`✅ Inserted Super Admin "${SEED_SUPER_ADMIN.name}" into MongoDB users collection.`);
      } else {
        await usersCol.updateOne(
          { id: SEED_SUPER_ADMIN.id },
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
        action = 'updated';
        details.push(`Updated Super Admin ${SEED_SUPER_ADMIN.name} in MongoDB`);
        console.log(`✅ Verified and synced Super Admin "${SEED_SUPER_ADMIN.name}" in MongoDB.`);
      }

      return { success: true, mode: 'mongodb', admin: SEED_SUPER_ADMIN, action, details };
    } catch (err: any) {
      console.error('❌ MongoDB seeding failed:', err.message);
      return {
        success: false,
        mode: 'mongodb',
        admin: SEED_SUPER_ADMIN,
        action: 'already_exists',
        details,
        error: err.message || 'Unknown seeding error',
      };
    } finally {
      if (client) {
        try {
          await client.close();
        } catch {}
      }
    }
  } else {
    console.log('⚠️  No MONGODB_URI found. Seeding local JSON data files...');
    const dataDir = path.join(process.cwd(), 'data');
    const usersFile = path.join(dataDir, 'users.json');

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    let usersList: Record<string, unknown>[] = [];
    if (fs.existsSync(usersFile)) {
      try {
        usersList = JSON.parse(fs.readFileSync(usersFile, 'utf-8'));
      } catch {
        usersList = [];
      }
    }

    const index = usersList.findIndex(
      (u) => normalizeAppUser(u).id === SEED_SUPER_ADMIN.id
    );
    let action: 'inserted' | 'updated' | 'already_exists' = 'already_exists';

    if (index === -1) {
      usersList.unshift(SEED_SUPER_ADMIN);
      action = 'inserted';
      details.push(`Inserted Super Admin into local ${usersFile}`);
    } else {
      usersList[index] = {
        ...normalizeAppUser(usersList[index]),
        ...SEED_SUPER_ADMIN,
      };
      action = 'updated';
      details.push(`Updated Super Admin in local ${usersFile}`);
    }

    fs.writeFileSync(usersFile, JSON.stringify(usersList, null, 2), 'utf-8');
    console.log(`✅ Local users file updated: ${usersFile}`);
    return { success: true, mode: 'local_files', admin: SEED_SUPER_ADMIN, action, details };
  }
}

if (isDirectScriptRun('seed.ts')) {
  runSeeding()
    .then((res) => {
      if (!res.success) process.exit(1);
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
