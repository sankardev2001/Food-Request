import dotenv from 'dotenv';
import { getFirebaseAdminDb } from './api/firebase-admin';

dotenv.config();

async function testFirebase() {
  console.log('Testing Firebase Admin...');
  const db = getFirebaseAdminDb();
  if (!db) {
    console.error('db is null');
    return;
  }
  try {
    const ref = db.ref('/test_node');
    await ref.set({ message: 'Hello World', timestamp: new Date().toISOString() });
    console.log('Successfully wrote to Firebase!');
    
    // Clean up
    await ref.remove();
    console.log('Cleaned up test node. Firebase Admin is working perfectly.');
    process.exit(0);
  } catch (e) {
    console.error('Firebase error:', e);
    process.exit(1);
  }
}

testFirebase();
