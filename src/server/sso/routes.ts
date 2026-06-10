/**
 * Commun SSO routes. Registered on the Express app BEFORE the Vite/static
 * SPA catch-all so the browser handoff lands here, not on index.html.
 *
 *   GET  /sso/callback?ticket=<JWT>   verify -> provision -> mint custom token -> handoff cookie
 *   POST /api/v1/sso/exchange         redeem the one-time cookie for the custom token
 *   GET  /sso/dev-login               (dev only) bypass Commun to exercise the bridge locally
 *
 * The custom token is delivered via a short-lived, path-scoped, httpOnly cookie
 * rather than the URL, so it never lands in history, referrers, or server logs.
 */
import type { Express, Request, Response } from 'express';
import { getSsoConfig } from './config';
import { verifyTicket, type TicketClaims } from './verifyTicket';
import { consumeJti } from './jtiStore';
import { getUserinfo, CommunRevokedError } from './communClient';
import { provisionShadowUser, mapRole } from './provisionUser';
import { getAdminAuth } from './firebaseAdmin';

const HANDOFF_COOKIE = 'zera_sso_handoff';
const HANDOFF_PATH = '/api/v1/sso/exchange';

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

async function issueHandoff(res: Response, uid: string) {
  // Custom tokens are short-lived (~1h) Firebase JWTs; the cookie is even shorter.
  const customToken = await getAdminAuth().createCustomToken(uid, { sso: true });
  res.cookie(HANDOFF_COOKIE, customToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 120_000, // 2 min
    path: HANDOFF_PATH,
  });
}

export function registerSsoRoutes(app: Express) {
  // --- Browser SSO handoff ---
  app.get('/sso/callback', async (req: Request, res: Response) => {
    const cfg = getSsoConfig();
    if (!cfg) {
      console.error('[SSO] /sso/callback hit but SSO is not configured (set COMMUN_* env)');
      return res.redirect('/?sso_error=not_configured');
    }

    const ticket = typeof req.query.ticket === 'string' ? req.query.ticket : '';
    if (!ticket) return res.redirect('/?sso_error=missing_ticket');

    let claims: TicketClaims;
    try {
      claims = await verifyTicket(ticket, cfg);
    } catch (err) {
      console.error('[SSO] ticket verification failed:', (err as Error).message);
      return res.redirect('/?sso_error=invalid_ticket');
    }

    try {
      // Single-use enforcement.
      const fresh = await consumeJti(claims.jti, claims.exp);
      if (!fresh) return res.redirect('/?sso_error=replay');

      // Best-effort identity re-sync; a revoked machine token is fatal.
      let userinfo = null;
      try {
        userinfo = await getUserinfo(claims.sub, cfg);
      } catch (err) {
        if (err instanceof CommunRevokedError) {
          console.error('[SSO]', err.message);
          return res.redirect('/?sso_error=backchannel_revoked');
        }
        throw err;
      }

      // Commun sign-in is reserved for teaching staff. Students/guardians use
      // the public name-lookup in the Member Portal, not SSO.
      const userTypes = userinfo?.user_types ?? claims.user_types;
      if (mapRole(userTypes) !== 'teacher') {
        return res.redirect('/?sso_error=teachers_only');
      }

      const { uid, active } = await provisionShadowUser(claims, userinfo);
      if (!active) return res.redirect('/?sso_error=disabled');

      await issueHandoff(res, uid);
      return res.redirect('/?sso=1');
    } catch (err) {
      console.error('[SSO] callback provisioning failed:', (err as Error).message);
      return res.redirect('/?sso_error=server_error');
    }
  });

  // --- SP-initiated sign-in: send the user to Commun to authenticate/launch ---
  // (Commun then redirects back to /sso/callback with a ticket.)
  app.get('/api/v1/sso/login', (_req: Request, res: Response) => {
    const target = process.env.COMMUN_LOGIN_URL || process.env.COMMUN_SUBDOMAIN;
    if (!target) return res.redirect('/?sso_error=not_configured');
    return res.redirect(target.replace(/\/$/, ''));
  });

  // --- One-time custom-token exchange (same-origin POST from the client) ---
  app.post('/api/v1/sso/exchange', (req: Request, res: Response) => {
    const token = readCookie(req, HANDOFF_COOKIE);
    // Always clear: the handoff is single-use.
    res.clearCookie(HANDOFF_COOKIE, { path: HANDOFF_PATH });
    if (!token) return res.status(401).json({ error: 'no_handoff' });
    return res.json({ token });
  });

  // --- Dev-only: exercise the provision -> custom-token bridge without Commun ---
  if (process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_SSO === 'true') {
    app.get('/sso/dev-login', async (req: Request, res: Response) => {
      try {
        const q = req.query as Record<string, string | undefined>;
        const sub = q.sub || 'dev-sub-1001';
        const claims = {
          sub,
          school_id: q.school_id || 'dev-school',
          name: {
            first_name: q.first_name || 'Dev',
            last_name: q.last_name || 'Student',
            preferred_name: q.preferred_name || q.first_name || 'Dev',
          },
          email: q.email ?? `${sub}@dev.local`,
          user_types: (q.user_types || 'teacher').split(',') as TicketClaims['user_types'],
          jti: `dev-${sub}`,
          exp: Math.floor(Date.now() / 1000) + 60,
        } as TicketClaims;

        if (mapRole(claims.user_types) !== 'teacher') {
          return res.redirect('/?sso_error=teachers_only');
        }

        const { uid, active } = await provisionShadowUser(claims, null);
        if (!active) return res.redirect('/?sso_error=disabled');
        await issueHandoff(res, uid);
        return res.redirect('/?sso=1');
      } catch (err) {
        console.error('[SSO][dev] failed:', (err as Error).message);
        return res.redirect('/?sso_error=dev_failed');
      }
    });
    console.log('[SSO] dev-login enabled at /sso/dev-login (NODE_ENV!=production, ALLOW_DEV_SSO=true)');
  }
}
