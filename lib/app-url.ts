/**
 * Canonical public app origin (no trailing slash).
 *
 * Use everywhere Stripe needs absolute URLs (checkout success/cancel, portal return),
 * Supabase emailRedirectTo, and any server callback base.
 *
 * For local Stripe + Supabase testing through ngrok, set **the same** value on server and client, e.g.:
 *   NEXT_PUBLIC_APP_URL=https://your-subdomain.ngrok-free.dev
 * Optionally also APP_BASE_URL for server-only reads (must match if set).
 *
 * Priority:
 * 1. NEXT_PUBLIC_APP_URL — preferred explicit public base (ngrok in dev)
 * 2. NEXT_PUBLIC_SITE_URL — common Supabase / site convention
 * 3. APP_BASE_URL — server-only fallback (not available in browser unless inlined)
 * 4. window.location.origin — client only, when no public env is set (pure local dev)
 * 5. VERCEL_URL — hosted preview/production on Vercel
 * 6. http://localhost:3000
 */
export function getCanonicalAppOrigin(): string {
  const trim = (s: string) => s.trim().replace(/\/+$/, '');

  const nextPublic =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (nextPublic) return trim(nextPublic);

  if (typeof window !== 'undefined') {
    return trim(window.location.origin);
  }

  const appBase = process.env.APP_BASE_URL?.trim();
  if (appBase) return trim(appBase);

  const v = process.env.VERCEL_URL?.trim();
  if (v) return trim(v.startsWith('http') ? v : `https://${v}`);

  return 'http://localhost:3000';
}
