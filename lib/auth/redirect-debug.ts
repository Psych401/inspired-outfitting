/**
 * Client-only debug for auth hydration (bootstrap, Stripe return, /api/me, billing).
 * Enable with: NEXT_PUBLIC_AUTH_DEBUG_REDIRECTS=true
 * (Never log tokens or secrets.)
 */
export function authRedirectDebug(message: string, meta: Record<string, unknown> = {}): void {
  const on =
    process.env.NEXT_PUBLIC_AUTH_DEBUG_REDIRECTS === '1' ||
    process.env.NEXT_PUBLIC_AUTH_DEBUG_REDIRECTS === 'true';
  if (!on) return;
  console.log('[auth][redirect]', message, JSON.stringify(meta));
}
