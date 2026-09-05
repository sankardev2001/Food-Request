import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Exact Super Admin requested by user:
// Name: subash
// CPS No : 1234
// mobile number : 9500466927
export const SEED_SUPER_ADMIN = {
  id: 'usr-subash-superadmin',
  name: 'subash',
  cpsNo: '1234',
  mobileNo: '9500466927',
  userType: 'admin' as const,
  aadharNumber: '1234',
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
  console.log(`   - CPS No:        ${SEED_SUPER_ADMIN.cpsNo}`);
  console.log(`   - Mobile Number: ${SEED_SUPER_ADMIN.mobileNo}`);
  console.log(`   - Role/Type:     ${SEED_SUPER_ADMIN.userType} (Super Admin)`);
  console.log(`   - Aadhar No:     ${SEED_SUPER_ADMIN.aadharNumber}`);
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

      const db = client.db();
      const usersCol = db.collection('users');

      // Check for existing super admin by CPS No
      const existing = await usersCol.findOne({ cpsNo: SEED_SUPER_ADMIN.cpsNo });
      let action: 'inserted' | 'updated' | 'already_exists' = 'already_exists';

      if (!existing) {
        await usersCol.insertOne({ ...SEED_SUPER_ADMIN });
        action = 'inserted';
        details.push(`Created Super Admin ${SEED_SUPER_ADMIN.name} (CPS: ${SEED_SUPER_ADMIN.cpsNo}) in MongoDB`);
        console.log(`✅ Inserted Super Admin "${SEED_SUPER_ADMIN.name}" into MongoDB users collection.`);
      } else {
        // Update to ensure super admin privileges and correct phone number
        await usersCol.updateOne(
          { cpsNo: SEED_SUPER_ADMIN.cpsNo },
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
        action = 'updated';
        details.push(`Verified and updated Super Admin ${SEED_SUPER_ADMIN.name} in MongoDB`);
        console.log(`✅ Verified and synced Super Admin "${SEED_SUPER_ADMIN.name}" in MongoDB.`);
      }

      // Ensure food_requests collection is accessible
      const reqCol = db.collection('food_requests');
      const reqCount = await reqCol.countDocuments();
      details.push(`Food requests table verified (${reqCount} total records)`);

      console.log('🎉 MongoDB Seeding completed successfully!');
      return {
        success: true,
        mode: 'mongodb',
        admin: SEED_SUPER_ADMIN,
        action,
        details,
      };
    } catch (err: any) {
      console.error('❌ Seeding failed:', err.message);
      return {
        success: false,
        mode: 'mongodb',
        admin: SEED_SUPER_ADMIN,
        action: 'already_exists',
        details,
        error: err.message || 'Seeding error',
      };
    } finally {
      if (client) {
        try {
          await client.close();
        } catch {}
      }
    }
  } else {
    // Local filesystem seeding
    console.log('⚠️  No MONGODB_URI found. Seeding local JSON data files...');
    const dataDir = path.join(process.cwd(), 'data');
    const usersFile = path.join(dataDir, 'users.json');
    const reqFile = path.join(dataDir, 'food_requests.json');

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    let usersList: any[] = [];
    if (fs.existsSync(usersFile)) {
      try {
        usersList = JSON.parse(fs.readFileSync(usersFile, 'utf-8'));
      } catch {
        usersList = [];
      }
    }

    const index = usersList.findIndex((u: any) => u.cpsNo === SEED_SUPER_ADMIN.cpsNo);
    let action: 'inserted' | 'updated' | 'already_exists' = 'already_exists';

    if (index === -1) {
      usersList.unshift(SEED_SUPER_ADMIN);
      action = 'inserted';
      details.push(`Inserted Super Admin into local ${usersFile}`);
    } else {
      usersList[index] = {
        ...usersList[index],
        name: SEED_SUPER_ADMIN.name,
        mobileNo: SEED_SUPER_ADMIN.mobileNo,
        userType: 'admin',
        aadharNumber: SEED_SUPER_ADMIN.aadharNumber,
        isSuperAdmin: true,
      };
      action = 'updated';
      details.push(`Updated Super Admin in local ${usersFile}`);
    }

    fs.writeFileSync(usersFile, JSON.stringify(usersList, null, 2), 'utf-8');

    if (!fs.existsSync(reqFile)) {
      fs.writeFileSync(reqFile, JSON.stringify([], null, 2), 'utf-8');
      details.push(`Created empty food_requests.json`);
    }

    console.log(`✅ Seeded Super Admin "${SEED_SUPER_ADMIN.name}" into local storage.`);
    return {
      success: true,
      mode: 'local_files',
      admin: SEED_SUPER_ADMIN,
      action,
      details,
    };
  }
}

// Execute directly if run via CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  runSeeding()
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
