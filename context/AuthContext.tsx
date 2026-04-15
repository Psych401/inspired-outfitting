'use client';

import React, { createContext, useState, useCallback, useEffect, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AuthContextType, User, TryOnHistoryItem, BillingSnapshot, BillingTier, BillingSubscriptionStatus } from '../types';
import { normalizeSubscriptionPlanKey } from '@/lib/billing/plan-keys';
import { auditLog } from '@/lib/billing/audit';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

const emptyBilling = (): BillingSnapshot => ({
  credits: null,
  subscriptionTier: 'none',
  subscriptionStatus: 'none',
  loading: false,
});

function parseBillingPayload(data: Record<string, unknown>): BillingSnapshot {
  const tierRaw = typeof data.subscriptionTier === 'string' ? data.subscriptionTier : 'none';
  const statusRaw = typeof data.subscriptionStatus === 'string' ? data.subscriptionStatus : 'none';
  const subscriptionTier: BillingTier =
    tierRaw === 'none'
      ? 'none'
      : (normalizeSubscriptionPlanKey(tierRaw) as BillingTier | null) ?? 'none';
  const statuses: BillingSubscriptionStatus[] = [
    'none',
    'active',
    'past_due',
    'canceled',
    'trialing',
    'unpaid',
    'payment_action_required',
    'invoice_finalization_failed',
  ];
  return {
    credits: typeof data.credits === 'number' && Number.isFinite(data.credits) ? data.credits : null,
    subscriptionTier,
    subscriptionStatus: (statuses.includes(statusRaw as BillingSubscriptionStatus)
      ? statusRaw
      : 'none') as BillingSubscriptionStatus,
    loading: false,
  };
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authHydrated, setAuthHydrated] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [billing, setBilling] = useState<BillingSnapshot>(emptyBilling);
  const [history, setHistory] = useState<TryOnHistoryItem[]>([]);
  const [uploadedPersonImages, setUploadedPersonImages] = useState<string[]>([]);
  const [uploadedOutfitImages, setUploadedOutfitImages] = useState<string[]>([]);
  const [favoriteOutfitImages, setFavoriteOutfitImages] = useState<string[]>([]);
  const [imagesToRegenerate, setImagesToRegenerate] = useState<{ personImg: string; outfitImg: string } | null>(null);

  const authHeaders = useCallback((): HeadersInit => {
    return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
  }, [accessToken]);

  const applySessionUser = useCallback((session: Session) => {
    const email = session.user.email;
    if (!email) return;
    setUser({
      id: session.user.id,
      email,
      name:
        (typeof session.user.user_metadata?.full_name === 'string' && session.user.user_metadata.full_name.trim()) ||
        email.split('@')[0] ||
        'Member',
    });
  }, []);

  const loadMe = useCallback(
    async (token?: string | null) => {
      const hdrs: HeadersInit = token ? { Authorization: `Bearer ${token}` } : authHeaders();
      if (!hdrs || Object.keys(hdrs).length === 0) return false;
      const res = await fetch('/api/me', { credentials: 'include', cache: 'no-store', headers: hdrs });
      if (!res.ok) return false;
      const data = (await res.json()) as {
        user?: { id?: string; email?: string; fullName?: string | null };
        billing?: Record<string, unknown>;
      };
      if (!data.user?.id || !data.user?.email) return false;
      setUser({
        id: data.user.id,
        email: data.user.email,
        name: data.user.fullName?.trim() || data.user.email.split('@')[0] || 'Member',
      });
      if (data.billing) setBilling(parseBillingPayload(data.billing));
      return true;
    },
    [authHeaders]
  );

  const refreshBilling = useCallback(async () => {
    if (!user) {
      setBilling(emptyBilling());
      return;
    }
    setBilling((b) => ({ ...b, loading: true }));
    try {
      const res = await fetch('/api/billing/me', { credentials: 'include', cache: 'no-store', headers: authHeaders() });
      if (!res.ok) {
        setBilling(emptyBilling());
        return;
      }
      const data = (await res.json()) as Record<string, unknown>;
      setBilling(parseBillingPayload(data));
    } catch {
      setBilling(emptyBilling());
    }
  }, [user, authHeaders]);

  const ensureSession = useCallback(async (): Promise<boolean> => {
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.auth.getSession();
      if (error) return false;
      const session = data.session;
      if (!session?.access_token) return false;
      setAccessToken(session.access_token);
      const ok = await loadMe(session.access_token);
      if (ok) auditLog('post_checkout_session_restored', { userId: session.user.id });
      if (!ok) {
        applySessionUser(session);
        auditLog('post_checkout_session_restored', { userId: session.user.id, mode: 'partial' });
      }
      return true;
    } catch {
      setUser(null);
      return false;
    }
  }, [applySessionUser, loadMe]);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    if (accessToken) return accessToken;
    const ok = await ensureSession();
    if (!ok) return null;
    return getSupabaseBrowserClient().auth.getSession().then(({ data }) => data.session?.access_token ?? null);
  }, [accessToken, ensureSession]);

  /** Restore client user state from the httpOnly session cookie (e.g. return from Stripe checkout). */
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let cancelled = false;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session: Session | null) => {
      if (session?.access_token) {
        setAccessToken(session.access_token);
        const ok = await loadMe(session.access_token);
        if (!ok) applySessionUser(session);
      } else {
        setAccessToken(null);
        setUser(null);
        setBilling(emptyBilling());
      }
      if (!cancelled) setAuthHydrated(true);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [applySessionUser, loadMe]);

  useEffect(() => {
    void refreshBilling();
  }, [refreshBilling]);

  const signUpWithPassword = useCallback(async (params: { email: string; password: string; fullName?: string }) => {
    const supabase = getSupabaseBrowserClient();
    const origin =
      typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '');
    const emailRedirectTo = origin ? `${origin}/auth/callback?next=/pricing` : undefined;
    const { data, error } = await supabase.auth.signUp({
      email: params.email,
      password: params.password,
      options: {
        data: { full_name: params.fullName ?? '' },
        ...(emailRedirectTo ? { emailRedirectTo } : {}),
      },
    });
    if (error) return { ok: false, message: error.message };
    const token = data.session?.access_token ?? null;
    if (token) {
      setAccessToken(token);
      await loadMe(token);
    }
    const needsEmailVerification = !data.session;
    return {
      ok: true,
      needsEmailVerification,
    };
  }, [loadMe]);

  const signInWithPassword = useCallback(async (params: { email: string; password: string }) => {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: params.email,
      password: params.password,
    });
    if (error || !data.session) return { ok: false, error: error?.message ?? 'Sign in failed' };
    setAccessToken(data.session.access_token);
    await loadMe(data.session.access_token);
    return { ok: true };
  }, [loadMe]);

  const logout = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    setUser(null);
    setAccessToken(null);
    setBilling(emptyBilling());
    setHistory([]);
    setUploadedPersonImages([]);
    setUploadedOutfitImages([]);
    setFavoriteOutfitImages([]);
    setImagesToRegenerate(null);
  }, []);

  const addHistoryItem = useCallback((item: Omit<TryOnHistoryItem, 'id' | 'createdAt'>) => {
    const newItem: TryOnHistoryItem = {
      ...item,
      id: new Date().toISOString() + Math.random(),
      createdAt: new Date(),
    };
    setHistory((prevHistory) => [newItem, ...prevHistory]);

    setUploadedPersonImages((prev) => [...new Set([item.personImg, ...prev])]);
  }, []);

  const deleteHistoryItem = useCallback((id: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const setRegenerate = useCallback((personImg: string, outfitImg: string) => {
    setImagesToRegenerate({ personImg, outfitImg });
  }, []);

  const clearRegenerate = useCallback(() => {
    setImagesToRegenerate(null);
  }, []);

  const addUploadedOutfitImage = useCallback((imageBase64: string) => {
    setUploadedOutfitImages((prev) => {
      const filtered = prev.filter((img) => img !== imageBase64);
      return [imageBase64, ...filtered];
    });
  }, []);

  const deleteUploadedOutfitImage = useCallback((imageBase64: string) => {
    setUploadedOutfitImages((prev) => prev.filter((img) => img !== imageBase64));
    setFavoriteOutfitImages((prev) => prev.filter((img) => img !== imageBase64));
  }, []);

  const toggleFavoriteOutfit = useCallback((imageBase64: string) => {
    setFavoriteOutfitImages((prev) => {
      if (prev.includes(imageBase64)) {
        return prev.filter((img) => img !== imageBase64);
      }
      return [...prev, imageBase64];
    });
  }, []);

  const value = {
    isAuthenticated: !!user,
    authHydrated,
    user,
    billing,
    refreshBilling,
    ensureSession,
    getAccessToken,
    history,
    uploadedPersonImages,
    uploadedOutfitImages,
    favoriteOutfitImages,
    imagesToRegenerate,
    signUpWithPassword,
    signInWithPassword,
    logout,
    addHistoryItem,
    deleteHistoryItem,
    setRegenerate,
    clearRegenerate,
    addUploadedOutfitImage,
    deleteUploadedOutfitImage,
    toggleFavoriteOutfit,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
