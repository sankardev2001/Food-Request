import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import {
  MONGODB_DB_NAME,
  normalizeAppUser,
  normalizeMongoUri,
  getMongoUriFormatError,
  getMongoClientOptions,
  getMongoConnectionTroubleshooting,
} from '../src/mongoHelpers';
import { DEFAULT_SUPER_ADMIN as SEED_SUPER_ADMIN } from '../src/adminBootstrap';
import { isDirectScriptRun } from './isDirectScriptRun';

dotenv.config();

export { SEED_SUPER_ADMIN };

function getMongoUri(): string {
  const arg = process.argv.find((a) => a.startsWith('--uri='));
  if (arg) {
    return arg.replace('--uri=', '').trim();
  }
  return normalizeMongoUri(process.env.MONGODB_URI);
}

export async function runSeeding(explicitUri?: string): Promise<{
  success: boolean;
  mode: 'mongodb' | 'local_files';
  admin: typeof SEED_SUPER_ADMIN;
  action: 'inserted' | 'updated' | 'already_exists';
  details: string[];
  error?: string;
}> {
  const uri = normalizeMongoUri(explicitUri || getMongoUri());
  const details: string[] = [];
  const uriFormatError = uri ? getMongoUriFormatError(uri) : null;
  if (uriFormatError) {
    console.error('❌ Invalid MONGODB_URI:', uriFormatError);
    return {
      success: false,
      mode: 'mongodb',
      admin: SEED_SUPER_ADMIN,
      action: 'already_exists',
      details,
      error: uriFormatError,
    };
  }

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
      client = new MongoClient(uri, getMongoClientOptions({ serverSelectionTimeoutMS: 15000 }));
      await client.connect();

      const db = client.db(MONGODB_DB_NAME);
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
      const msg = err?.message || 'Unknown seeding error';
      console.error('❌ MongoDB seeding failed:', msg);
      const hints = getMongoConnectionTroubleshooting(msg);
      if (
        msg.toLowerCase().includes('tls') ||
        msg.toLowerCase().includes('socket disconnected') ||
        msg.toLowerCase().includes('ssl')
      ) {
        console.error('');
        console.error('   This often means your network (corporate VPN/firewall) blocks MongoDB Atlas.');
        console.error('   Production on Vercel may still work. Try: mobile hotspot, home Wi‑Fi, or seed via Atlas UI.');
        console.error('   Also add your current public IP in Atlas → Network Access (or use 0.0.0.0/0).');
      }
      for (const h of hints) console.error(`   • ${h}`);
      return {
        success: false,
        mode: 'mongodb',
        admin: SEED_SUPER_ADMIN,
        action: 'already_exists',
        details,
        error: msg,
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
