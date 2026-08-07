// Vercel serverless entrypoint. Vercel serves the built static client (dist/)
// directly and routes only backend paths here (see vercel.json rewrites). We
// reuse the exact same Express app the local server builds, so /api/v1/* and
// /sso/* behave identically in production and in local dev.
import type { IncomingMessage, ServerResponse } from 'http';
import { createApiApp } from '../server.js';

// Build the app once per warm serverless instance and reuse across invocations.
let appPromise: ReturnType<typeof createApiApp> | null = null;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!appPromise) {
    appPromise = createApiApp();
  }
  const app = await appPromise;
  // An Express app is itself an (req, res) request handler.
  return (app as unknown as (req: IncomingMessage, res: ServerResponse) => void)(req, res);
}
