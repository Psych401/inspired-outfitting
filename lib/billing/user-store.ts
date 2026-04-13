import { getSupabaseServiceRoleClient } from '@/lib/supabase/server';
import type { SubscriptionPlanKey } from './products';
import { normalizeSubscriptionPlanKey } from './plan-keys';
import { defaultCreditsForNewUser } from './default-free-credits';

export type SubscriptionStatus = 'none' | 'active' | 'past_due' | 'canceled' | 'trialing' | 'unpaid';

export interface UserBillingRecord {
  userId: string;
  stripeCustomerId?: string;
  subscriptionTier: SubscriptionPlanKey | 'none';
  subscriptionStatus: SubscriptionStatus;
  stripeSubscriptionId?: string;
  credits: number;
  updatedAt: number;
}

function mapTierFromDb(raw: string | null | undefined): SubscriptionPlanKey | 'none' {
  if (raw == null || raw === 'none') return 'none';
  return normalizeSubscriptionPlanKey(raw) ?? 'none';
}

export function normalizeUserId(userId: string): string {
  return userId.trim().toLowerCase();
}

async function ensureUserProfile(userId: string): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  const id = normalizeUserId(userId);
  const { error } = await supabase.from('app_users').upsert(
    {
      id,
      email: id,
    },
    { onConflict: 'id' }
  );
  if (error) throw new Error(`app_users upsert failed: ${error.message}`);
}

export async function getOrCreateUser(userId: string): Promise<UserBillingRecord> {
  await ensureUserProfile(userId);
  const supabase = getSupabaseServiceRoleClient();
  const id = normalizeUserId(userId);

  let { data: row, error } = await supabase
    .from('user_billing_state')
    .select('*')
    .eq('user_id', id)
    .maybeSingle();
  if (error) throw new Error(`user_billing_state read failed: ${error.message}`);

  if (!row) {
    const seed = defaultCreditsForNewUser();
    const { data: inserted, error: insertError } = await supabase
      .from('user_billing_state')
      .insert({
        user_id: id,
        credit_balance: seed,
        subscription_tier: 'none',
        subscription_status: 'none',
      })
      .select('*')
      .maybeSingle();

    if (insertError?.code === '23505') {
      const { data: existing, error: readErr } = await supabase
        .from('user_billing_state')
        .select('*')
        .eq('user_id', id)
        .single();
      if (readErr) throw new Error(`user_billing_state read after duplicate failed: ${readErr.message}`);
      row = existing;
    } else if (insertError) {
      throw new Error(`user_billing_state insert failed: ${insertError.message}`);
    } else if (inserted) {
      return {
        userId: inserted.user_id,
        stripeCustomerId: inserted.stripe_customer_id ?? undefined,
        subscriptionTier: mapTierFromDb(inserted.subscription_tier),
        subscriptionStatus: inserted.subscription_status,
        stripeSubscriptionId: inserted.stripe_subscription_id ?? undefined,
        credits: inserted.credit_balance,
        updatedAt: Date.parse(inserted.updated_at),
      };
    } else {
      const { data: existing, error: readErr } = await supabase
        .from('user_billing_state')
        .select('*')
        .eq('user_id', id)
        .single();
      if (readErr) throw new Error(`user_billing_state read failed after insert: ${readErr.message}`);
      row = existing;
    }
  }

  return {
    userId: row.user_id,
    stripeCustomerId: row.stripe_customer_id ?? undefined,
    subscriptionTier: mapTierFromDb(row.subscription_tier),
    subscriptionStatus: row.subscription_status,
    stripeSubscriptionId: row.stripe_subscription_id ?? undefined,
    credits: row.credit_balance,
    updatedAt: Date.parse(row.updated_at),
  };
}

export async function getUser(userId: string): Promise<UserBillingRecord | undefined> {
  const supabase = getSupabaseServiceRoleClient();
  const id = normalizeUserId(userId);
  const { data: row, error } = await supabase
    .from('user_billing_state')
    .select('*')
    .eq('user_id', id)
    .maybeSingle();
  if (error) throw new Error(`user_billing_state read failed: ${error.message}`);
  if (!row) return undefined;
  return {
    userId: row.user_id,
    stripeCustomerId: row.stripe_customer_id ?? undefined,
    subscriptionTier: mapTierFromDb(row.subscription_tier),
    subscriptionStatus: row.subscription_status,
    stripeSubscriptionId: row.stripe_subscription_id ?? undefined,
    credits: row.credit_balance,
    updatedAt: Date.parse(row.updated_at),
  };
}

export async function patchUser(userId: string, patch: Partial<UserBillingRecord>): Promise<UserBillingRecord> {
  const cur = await getOrCreateUser(userId);
  const supabase = getSupabaseServiceRoleClient();
  const id = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('user_billing_state')
    .update({
      credit_balance: patch.credits ?? cur.credits,
      subscription_tier: patch.subscriptionTier ?? cur.subscriptionTier,
      subscription_status: patch.subscriptionStatus ?? cur.subscriptionStatus,
      stripe_customer_id: patch.stripeCustomerId ?? cur.stripeCustomerId ?? null,
      stripe_subscription_id: patch.stripeSubscriptionId ?? cur.stripeSubscriptionId ?? null,
    })
    .eq('user_id', id)
    .select('*')
    .single();
  if (error) throw new Error(`user_billing_state patch failed: ${error.message}`);
  return {
    userId: data.user_id,
    stripeCustomerId: data.stripe_customer_id ?? undefined,
    subscriptionTier: mapTierFromDb(data.subscription_tier),
    subscriptionStatus: data.subscription_status,
    stripeSubscriptionId: data.stripe_subscription_id ?? undefined,
    credits: data.credit_balance,
    updatedAt: Date.parse(data.updated_at),
  };
}

export async function setStripeCustomer(userId: string, stripeCustomerId: string): Promise<void> {
  await patchUser(userId, { stripeCustomerId });
}
