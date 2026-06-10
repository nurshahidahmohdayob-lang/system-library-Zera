/**
 * Single-use ticket enforcement. A `jti` may be redeemed exactly once.
 * Backed by Firestore (`sso_used_tickets/{jti}`) so it survives restarts and is
 * correct across multiple server instances. `expiresAt` lets a Firestore TTL
 * policy auto-purge old rows (configure TTL on `expiresAt` in the console).
 *
 * Admin SDK writes bypass security rules, so this collection needs no client rule.
 */
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from './firebaseAdmin';

/**
 * Atomically record a jti. Returns true if this is the first time we've seen it
 * (caller may proceed), false if it's a replay (caller must reject).
 */
export async function consumeJti(jti: string, expSeconds: number): Promise<boolean> {
  const db = getAdminDb();
  const ref = db.collection('sso_used_tickets').doc(jti);
  // keep the row a bit past the ticket's exp to cover clock-skew leeway
  const expiresAt = Timestamp.fromMillis((expSeconds + 60) * 1000);

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) {
        throw new Error('jti-replay');
      }
      tx.set(ref, { usedAt: Timestamp.now(), expiresAt });
    });
    return true;
  } catch (err) {
    if (err instanceof Error && err.message === 'jti-replay') return false;
    throw err; // genuine Firestore/credential error — surface it
  }
}
