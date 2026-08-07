/**
 * Verify a Commun SSO ticket (compact RS256 JWT) against the school's JWKS.
 * Enforces signature (by `kid`), `aud`, `iss`, `exp`/`nbf` (with 30s skew).
 * `jti` single-use is enforced separately by the caller (jtiStore).
 */
import { jwtVerify, createRemoteJWKSet, type JWTPayload } from 'jose';
import type { SsoConfig } from './config.js';

export interface CommunName {
  first_name?: string;
  last_name?: string;
  nric_name?: string;
  preferred_name?: string;
}

export interface TicketClaims extends JWTPayload {
  sub: string;
  school_id: string;
  school_slug?: string;
  name?: CommunName;
  email?: string | null;
  user_types?: Array<'student' | 'guardian' | 'teacher' | 'staff'>;
  locale?: string;
  jti: string;
  exp: number;
}

// Cache one JWKS resolver per subdomain (jose caches keys internally and
// re-fetches on unknown kid during rotation).
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(subdomain: string) {
  let jwks = jwksCache.get(subdomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${subdomain}/api/sso/jwks`));
    jwksCache.set(subdomain, jwks);
  }
  return jwks;
}

export async function verifyTicket(ticket: string, cfg: SsoConfig): Promise<TicketClaims> {
  const { payload } = await jwtVerify(ticket, getJwks(cfg.subdomain), {
    issuer: cfg.issuer,
    audience: cfg.clientId,
    clockTolerance: 30, // seconds
  });

  if (typeof payload.sub !== 'string' || !payload.sub) {
    throw new Error('ticket missing sub');
  }
  if (typeof payload.jti !== 'string' || !payload.jti) {
    throw new Error('ticket missing jti');
  }
  if (typeof payload.exp !== 'number') {
    throw new Error('ticket missing exp');
  }
  if (typeof (payload as TicketClaims).school_id !== 'string') {
    throw new Error('ticket missing school_id');
  }

  return payload as TicketClaims;
}
