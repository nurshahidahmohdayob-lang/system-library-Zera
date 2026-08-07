/**
 * Firebase Admin SDK — lazily initialized so the server boots even when SSO
 * credentials are not yet configured. Only the /sso/* routes need this; if it's
 * unconfigured those routes fail with a clear error instead of crashing boot.
 *
 * Credentials resolve via Application Default Credentials (ADC):
 *   - locally: set GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   - on Cloud Run: the attached service account is used automatically
 */
import { createRequire } from 'module';
import { initializeApp, getApps, applicationDefault, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

// Loaded via createRequire rather than a JSON `import ... with { type: 'json' }`
// so it resolves reliably as plain ESM on Node (no import-attribute handling)
// both locally and in the Vercel serverless function.
const require = createRequire(import.meta.url);
const firebaseConfig = require('../../../firebase-applet-config.json') as {
  projectId: string;
  firestoreDatabaseId?: string;
};

let app: App | undefined;

function getApp(): App {
  if (!app) {
    app = getApps()[0] ?? initializeApp({
      credential: applicationDefault(),
      projectId: firebaseConfig.projectId,
    });
  }
  return app;
}

export function getAdminAuth(): Auth {
  return getAuth(getApp());
}

let firestore: Firestore | undefined;
export function getAdminDb(): Firestore {
  if (!firestore) {
    const dbId = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
      ? firebaseConfig.firestoreDatabaseId
      : '(default)';
    firestore = getFirestore(getApp(), dbId);
  }
  return firestore;
}
