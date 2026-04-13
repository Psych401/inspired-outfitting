import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let serviceClient: SupabaseClient | null = null;

function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required');
  return url;
}

export function getSupabaseServiceRoleClient(): SupabaseClient {
  if (serviceClient) return serviceClient;
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!key) throw new Error('SUPABASE_SECRET_KEY is required');
  serviceClient = createClient(getSupabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return serviceClient;
}

