/**
 * Commun Connected-Systems SSO configuration, read from environment.
 * All values are scaffolded as placeholders in .env.example; until they are set
 * the SSO routes report "not configured" rather than behaving insecurely.
 */
export interface SsoConfig {
  subdomain: string;     // base URL for JWKS + back-channel, e.g. https://zera.commun.cloud
  issuer: string;        // expected `iss` claim (the school app URL)
  clientId: string;      // expected `aud` claim (your registered client_id)
  machineToken: string;  // Bearer for /userinfo + /api/v1/* back-channel reads
}

export function getSsoConfig(): SsoConfig | null {
  const subdomain = process.env.COMMUN_SUBDOMAIN?.replace(/\/$/, '') ?? '';
  const issuer = process.env.COMMUN_ISSUER ?? '';
  const clientId = process.env.COMMUN_CLIENT_ID ?? '';
  const machineToken = process.env.COMMUN_MACHINE_TOKEN ?? '';

  // subdomain + issuer + clientId are required to verify a ticket.
  // machineToken is required only for back-channel reads (handled separately).
  if (!subdomain || !issuer || !clientId) return null;
  return { subdomain, issuer, clientId, machineToken };
}
