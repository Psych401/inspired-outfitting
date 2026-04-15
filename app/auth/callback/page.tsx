'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';

export default function AuthCallbackPage() {
  const router = useRouter();
  const search = useSearchParams();

  useEffect(() => {
    let cancelled = false;
    const next = search?.get('next') || '/pricing';

    const run = async () => {
      const supabase = getSupabaseBrowserClient();
      try {
        const code = search?.get('code');
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        } else if (typeof window !== 'undefined' && window.location.hash) {
          const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
          const accessToken = hash.get('access_token');
          const refreshToken = hash.get('refresh_token');
          if (accessToken && refreshToken) {
            await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          }
        }
      } catch {
        // Fallback to auth page if callback exchange fails.
        if (!cancelled) router.replace('/auth');
        return;
      }
      if (!cancelled) router.replace(next);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [router, search]);

  return (
    <div className="flex min-h-[calc(100vh-200px)] items-center justify-center px-4">
      <p className="text-charcoal-grey/70">Signing you in…</p>
    </div>
  );
}
