import { getSupabaseServiceRoleClient } from '@/lib/supabase/server';
import type { SubscriptionPlanKey } from './products';
import { normalizeSubscriptionPlanKey } from './plan-keys';
import { defaultCreditsForNewUser } from './default-free-credits';

export type SubscriptionStatus =
  | 'none'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'trialing'
  | 'unpaid'
  | 'payment_action_required'
  | 'invoice_finalization_failed';

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
  return userId.trim();
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === '23505');
}

async function updateProfileFieldsById(
  id: string,
  patch: Record<string, string | null>
): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  const supabase = getSupabaseServiceRoleClient();
  const { error: updateErr } = await supabase.from('profiles').update(patch).eq('id', id);
  if (updateErr && !isUniqueViolation(updateErr)) {
    throw new Error(`profiles update by id failed: ${updateErr.message}`);
  }
  // If email is taken by another row, keep the existing email but still persist non-email fields.
  if (updateErr && isUniqueViolation(updateErr)) {
    delete patch.email;
    if (Object.keys(patch).length > 0) {
      const { error: retryErr } = await supabase.from('profiles').update(patch).eq('id', id);
      if (retryErr) throw new Error(`profiles update retry failed: ${retryErr.message}`);
    }
  }
}

export async function ensureUserProfile(
  userId: string,
  profile?: { email?: string | null; fullName?: string | null; avatarUrl?: string | null }
): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  const id = normalizeUserId(userId);
  const email = profile?.email?.trim().toLowerCase() || null;
  const { data: byId, error: byIdError } = await supabase
    .from('profiles')
    .select('id,email,full_name,avatar_url')
    .eq('id', id)
    .maybeSingle();
  if (byIdError) throw new Error(`profiles read by id failed: ${byIdError.message}`);

  if (byId) {
    const patch: Record<string, string | null> = {};
    if (profile?.fullName !== undefined) patch.full_name = profile.fullName ?? null;
    if (profile?.avatarUrl !== undefined) patch.avatar_url = profile.avatarUrl ?? null;
    if (email && byId.email !== email) patch.email = email;
    await updateProfileFieldsById(id, patch);
  } else {
    let claimedByEmail: { id: string } | null = null;
    if (email) {
      const { data: byEmail, error: byEmailError } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle();
      if (byEmailError) throw new Error(`profiles read by email failed: ${byEmailError.message}`);
      claimedByEmail = byEmail;
    }

    if (claimedByEmail && claimedByEmail.id !== id) {
      const { error: claimErr } = await supabase
        .from('profiles')
        .update({
          id,
          email,
          full_name: profile?.fullName ?? null,
          avatar_url: profile?.avatarUrl ?? null,
        })
        .eq('id', claimedByEmail.id);
      if (claimErr && !isUniqueViolation(claimErr)) throw new Error(`profiles reconciliation failed: ${claimErr.message}`);
      if (claimErr && isUniqueViolation(claimErr)) {
        // Another request likely created/claimed the uuid row first.
        const { data: nowById, error: nowByIdErr } = await supabase
          .from('profiles')
          .select('id,email')
          .eq('id', id)
          .maybeSingle();
        if (nowByIdErr) throw new Error(`profiles reconciliation post-conflict read failed: ${nowByIdErr.message}`);
        if (nowById) {
          const patch: Record<string, string | null> = {};
          if (profile?.fullName !== undefined) patch.full_name = profile.fullName ?? null;
          if (profile?.avatarUrl !== undefined) patch.avatar_url = profile.avatarUrl ?? null;
          if (email && nowById.email !== email) patch.email = email;
          await updateProfileFieldsById(id, patch);
        }
      }
    } else {
      const { error: insertErr } = await supabase.from('profiles').insert({
        id,
        email,
        full_name: profile?.fullName ?? null,
        avatar_url: profile?.avatarUrl ?? null,
      });
      if (insertErr && !isUniqueViolation(insertErr)) {
        throw new Error(`profiles insert failed: ${insertErr.message}`);
      }
      if (insertErr && isUniqueViolation(insertErr) && email) {
        const { data: nowByEmail, error: reReadErr } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', email)
          .maybeSingle();
        if (reReadErr) throw new Error(`profiles reconciliation re-read failed: ${reReadErr.message}`);
        if (nowByEmail && nowByEmail.id !== id) {
          const { error: claimErr } = await supabase
            .from('profiles')
            .update({ id, full_name: profile?.fullName ?? null, avatar_url: profile?.avatarUrl ?? null })
            .eq('id', nowByEmail.id);
          if (claimErr && !isUniqueViolation(claimErr)) {
            throw new Error(`profiles reconciliation claim failed: ${claimErr.message}`);
          }
        }
      }
    }
  }

  const { error: appUserErr } = await supabase.from('app_users').upsert(
    {
      id,
      email: email ?? id,
    },
    { onConflict: 'id' }
  );
  if (appUserErr) throw new Error(`app_users upsert failed: ${appUserErr.message}`);
}

export async function getProfile(userId: string): Promise<{
  id: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
} | null> {
  const supabase = getSupabaseServiceRoleClient();
  const id = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,full_name,avatar_url')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`profiles read failed: ${error.message}`);
  if (!data) return null;
  return {
    id: data.id,
    email: data.email ?? null,
    fullName: data.full_name ?? null,
    avatarUrl: data.avatar_url ?? null,
  };
}

export async function getOrCreateUser(userId: string): Promise<UserBillingRecord> {
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

/** Resolve app user id from Stripe Customer id (webhooks when subscription metadata is missing). */
export async function getUserIdByStripeCustomerId(stripeCustomerId: string): Promise<string | null> {
  const supabase = getSupabaseServiceRoleClient();
  const id = stripeCustomerId.trim();
  if (!id) return null;
  const { data, error } = await supabase
    .from('user_billing_state')
    .select('user_id')
    .eq('stripe_customer_id', id)
    .maybeSingle();
  if (error) throw new Error(`user_billing_state lookup by stripe customer failed: ${error.message}`);
  return data?.user_id ?? null;
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
