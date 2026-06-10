/**
 * Provision or match the local "shadow user" for a Commun identity.
 *
 * - Firebase uid is namespaced `commun:{sub}` so SSO users never collide with
 *   librarian (email/password) accounts.
 * - Privilege is carried in trusted custom claims (`role`, `sso`, `school_id`),
 *   NOT in the client-writable Firestore doc. The `sso:true` claim is what the
 *   Firestore rules use to forbid SSO users from self-assigning the admin role.
 * - Admin SDK writes bypass security rules, so the profile doc is authoritative.
 */
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from './firebaseAdmin';
import type { CommunName, TicketClaims } from './verifyTicket';
import type { Userinfo } from './communClient';

export type AppRole = 'student' | 'teacher';

/**
 * Map Commun user_types -> app role. SSO never grants admin (admin is reserved
 * for bootstrapped/librarian accounts). teacher/staff -> teacher; student and
 * guardian -> student.
 */
export function mapRole(userTypes: string[] | undefined): AppRole {
  if (userTypes?.some((t) => t === 'teacher' || t === 'staff')) return 'teacher';
  return 'student';
}

/** Compose a display name from Commun's structured name (never a pre-formatted string). */
export function composeName(name: CommunName | undefined, email: string | null | undefined, sub: string): string {
  if (name) {
    if (name.preferred_name && name.last_name) return `${name.preferred_name} ${name.last_name}`;
    if (name.first_name && name.last_name) return `${name.first_name} ${name.last_name}`;
    const single = name.preferred_name || name.first_name || name.nric_name;
    if (single) return single;
  }
  if (email) return email.split('@')[0];
  return `Commun User ${sub.slice(0, 8)}`;
}

export interface ProvisionResult {
  uid: string;
  role: AppRole;
  active: boolean;
  name: string;
}

export async function provisionShadowUser(
  claims: TicketClaims,
  userinfo: Userinfo | null,
): Promise<ProvisionResult> {
  const auth = getAdminAuth();
  const db = getAdminDb();

  const uid = `commun:${claims.sub}`;
  // userinfo (back-channel) wins over ticket claims when present.
  const active = userinfo ? userinfo.active !== false : true;
  const userTypes = userinfo?.user_types ?? claims.user_types;
  const role = mapRole(userTypes);
  const email = userinfo?.email ?? claims.email ?? undefined;
  const name = composeName(userinfo?.name ?? claims.name, email, claims.sub);

  // 1. Ensure the Firebase Auth user exists (idempotent).
  let isNew = false;
  try {
    await auth.getUser(uid);
    await auth.updateUser(uid, { displayName: name, disabled: !active });
  } catch (err) {
    if ((err as { code?: string }).code === 'auth/user-not-found') {
      isNew = true;
      await auth.createUser({
        uid,
        displayName: name,
        ...(email ? { email } : {}),
        disabled: !active,
      });
    } else {
      throw err;
    }
  }

  // 2. Trusted privilege claims.
  await auth.setCustomUserClaims(uid, {
    role,
    sso: true,
    school_id: claims.school_id,
    commun_sub: claims.sub,
  });
  if (!active) {
    await auth.revokeRefreshTokens(uid);
  }

  // 3. Mirror into the Firestore profile (read by the app UI).
  await db.collection('users').doc(uid).set(
    {
      uid,
      name,
      email: email ?? '',
      role,
      school_id: claims.school_id,
      syncSource: 'commun',
      status: active ? 'active' : 'archived',
      lastSyncedAt: new Date().toISOString(),
      ...(isNew ? { createdAt: FieldValue.serverTimestamp(), activeLoansCount: 0 } : {}),
    },
    { merge: true },
  );

  return { uid, role, active, name };
}
