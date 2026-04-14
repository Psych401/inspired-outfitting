import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let singleton: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (singleton) return singleton;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anon) {
    throw new Error('Supabase browser auth is not configured.');
  }
  singleton = createClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return singleton;
}
