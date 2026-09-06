import { initializeApp, getApps, getApp, cert, App } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

// Initialize Firebase Admin only if credentials are provided in env
let firebaseAdminApp: App | null = null;
let initialized = false;

export const getFirebaseAdminDb = () => {
  if (!initialized) {
    try {
      const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
      const databaseURL = process.env.VITE_FIREBASE_DATABASE_URL;

      if (serviceAccountRaw && databaseURL) {
        const serviceAccount = JSON.parse(serviceAccountRaw);
        
        // Fix for dotenv not unescaping \n in the private key
        if (serviceAccount.private_key) {
          serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }
        
        if (!getApps().length) {
          firebaseAdminApp = initializeApp({
            credential: cert(serviceAccount),
            databaseURL: databaseURL
          });
          console.log('Firebase Admin initialized successfully.');
        } else {
          firebaseAdminApp = getApps()[0]!;
        }
      } else {
        console.warn('Firebase Admin NOT initialized. Missing FIREBASE_SERVICE_ACCOUNT or VITE_FIREBASE_DATABASE_URL in environment.');
      }
    } catch (error) {
      console.error('Failed to initialize Firebase Admin:', error);
    }
    initialized = true;
  }

  return firebaseAdminApp ? getDatabase(firebaseAdminApp) : null;
};
