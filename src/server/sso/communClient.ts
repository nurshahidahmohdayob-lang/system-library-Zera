/**
 * Back-channel reads against the Commun Vendor API using the machine token.
 * Used here for identity re-sync on each SSO login via GET /api/v1/userinfo/{sub}.
 */
import type { SsoConfig } from './config';
import type { CommunName } from './verifyTicket';

export interface Userinfo {
  sub: string;
  name?: CommunName;
  email?: string | null;
  user_types?: Array<'student' | 'guardian' | 'teacher' | 'staff'>;
  active: boolean;
  school_id?: string;
  locale?: string;
}

export class CommunRevokedError extends Error {}

/**
 * Fetch the current identity for a Commun user id (`sub`).
 * - Returns null if the machine token is not configured (re-sync simply skipped).
 * - Throws CommunRevokedError on 401 (token revoked / system disabled).
 * - Returns null on other non-OK responses (best-effort; login can still proceed
 *   on the verified ticket claims).
 */
export async function getUserinfo(sub: string, cfg: SsoConfig): Promise<Userinfo | null> {
  if (!cfg.machineToken) return null;

  const url = `${cfg.subdomain}/api/v1/userinfo/${encodeURIComponent(sub)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${cfg.machineToken}`,
      Accept: 'application/json',
    },
  });

  if (res.status === 401) {
    throw new CommunRevokedError('Commun machine token rejected (401) — revoked or invalid');
  }
  if (!res.ok) return null;

  return (await res.json()) as Userinfo;
}
