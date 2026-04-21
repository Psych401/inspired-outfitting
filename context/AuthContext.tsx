'use client';

import React, { createContext, useState, useCallback, useEffect, ReactNode, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AuthContextType, User, TryOnHistoryItem, BillingSnapshot, BillingTier, BillingSubscriptionStatus } from '../types';
import { normalizeSubscriptionPlanKey } from '@/lib/billing/plan-keys';
import { auditLog } from '@/lib/billing/audit';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';
import { authRedirectDebug } from '@/lib/auth/redirect-debug';
import { getCanonicalAppOrigin } from '@/lib/app-url';

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

  const accessTokenRef = useRef<string | null>(null);
  accessTokenRef.current = accessToken;
  const billingRequestInFlightRef = useRef(false);
  const lastBillingRefreshAtRef = useRef(0);

  const loadMeRef = useRef<
    (tokenOverride?: string | null) => Promise<boolean>
  >(async () => false);
  const applySessionUserRef = useRef<(session: Session) => void>(() => {});

  const applySessionUser = useCallback((session: Session) => {
    const email = session.user.email;
    if (!email) return;
    authRedirectDebug('user_set', { source: 'applySessionUser', userId: session.user.id });
    setUser({
      id: session.user.id,
      email,
      name:
        (typeof session.user.user_metadata?.full_name === 'string' && session.user.user_metadata.full_name.trim()) ||
        email.split('@')[0] ||
        'Member',
    });
  }, []);

  applySessionUserRef.current = applySessionUser;

  const loadMe = useCallback(
    async (tokenOverride?: string | null): Promise<boolean> => {
      const supabase = getSupabaseBrowserClient();
      let authToken = (tokenOverride ?? accessTokenRef.current)?.trim() || null;
      if (!authToken) {
        authRedirectDebug('loadMe_no_token_yet', { hadOverride: tokenOverride != null });
        return false;
      }

      for (let attempt = 0; attempt < 3; attempt++) {
        authRedirectDebug('loadMe_attempt', {
          attempt,
          callingApiMe: true,
          callingApiMeWithAuthorizationHeader: !!authToken,
          tokenSource: tokenOverride != null ? 'explicit' : 'ref',
        });
        const res = await fetch('/api/me', {
          credentials: 'include',
          cache: 'no-store',
          headers: { Authorization: `Bearer ${authToken}` },
        });

        if (res.status === 401) {
          authRedirectDebug('loadMe_401', { attempt });
          const { data, error } = await supabase.auth.refreshSession();
          if (error || !data.session?.access_token) {
            authRedirectDebug('loadMe_refresh_failed', { attempt, message: error?.message });
            return false;
          }
          authToken = data.session.access_token;
          setAccessToken(authToken);
          continue;
        }

        if (!res.ok) {
          authRedirectDebug('loadMe_http_error', { status: res.status, attempt });
          return false;
        }

        const data = (await res.json()) as {
          user?: { id?: string; email?: string; fullName?: string | null };
          billing?: Record<string, unknown>;
        };
        if (!data.user?.id || !data.user?.email) {
          authRedirectDebug('loadMe_invalid_payload');
          return false;
        }
        setUser({
          id: data.user.id,
          email: data.user.email,
          name: data.user.fullName?.trim() || data.user.email.split('@')[0] || 'Member',
        });
        authRedirectDebug('user_set', { source: 'loadMe', userId: data.user.id });
        if (data.billing) {
          const snap = parseBillingPayload(data.billing);
          setBilling(snap);
          authRedirectDebug('billing_set', {
            source: 'loadMe',
            credits: snap.credits,
            tier: snap.subscriptionTier,
          });
        }
        authRedirectDebug('api_me_ok', { attempt });
        return true;
      }
      return false;
    },
    []
  );

  loadMeRef.current = loadMe;

  const refreshBilling = useCallback(async () => {
    const token = accessTokenRef.current?.trim() || null;
    if (!user) {
      // Do not wipe billing while a session token exists (bootstrap / Stripe return before user is applied).
      if (!token) {
        setBilling(emptyBilling());
        authRedirectDebug('billing_cleared', { reason: 'no_user_no_token' });
      } else {
        authRedirectDebug('refreshBilling_skip', { reason: 'no_user_yet_has_token' });
      }
      return;
    }
    if (!token) {
      authRedirectDebug('refreshBilling_skip', { reason: 'no_token_yet' });
      return;
    }
    const now = Date.now();
    if (billingRequestInFlightRef.current) {
      authRedirectDebug('refreshBilling_skip', { reason: 'in_flight' });
      return;
    }
    if (now - lastBillingRefreshAtRef.current < 1200) {
      authRedirectDebug('refreshBilling_skip', { reason: 'recently_refreshed' });
      return;
    }
    billingRequestInFlightRef.current = true;
    lastBillingRefreshAtRef.current = now;
    setBilling((b) => ({ ...b, loading: true }));
    try {
      const res = await fetch('/api/billing/me', {
        credentials: 'include',
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        authRedirectDebug('api_billing_me_failed', { status: res.status });
        setBilling((b) => ({ ...b, loading: false }));
        return;
      }
      const data = (await res.json()) as Record<string, unknown>;
      const snap = parseBillingPayload(data);
      setBilling(snap);
      authRedirectDebug('billing_set', {
        source: 'refreshBilling',
        credits: snap.credits,
        tier: snap.subscriptionTier,
      });
      authRedirectDebug('api_billing_me_ok', {});
    } catch (e) {
      authRedirectDebug('api_billing_me_error', { message: e instanceof Error ? e.message : 'unknown' });
      setBilling((b) => ({ ...b, loading: false }));
    } finally {
      billingRequestInFlightRef.current = false;
    }
  }, [user]);

  const rehydrateAfterStripeReturn = useCallback(async (): Promise<boolean> => {
    setAuthHydrated(false);
    authRedirectDebug('checkout_return_session_state', {
      path: typeof window !== 'undefined' ? window.location.pathname : '',
      search: typeof window !== 'undefined' ? window.location.search : '',
      isCheckoutReturn:
        typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).get('checkout') === 'success',
      phase: 'start',
    });
    authRedirectDebug('rehydrate_start', {
      path: typeof window !== 'undefined' ? window.location.pathname : '',
      search: typeof window !== 'undefined' ? window.location.search : '',
    });
    try {
      const supabase = getSupabaseBrowserClient();
      let {
        data: { session },
      } = await supabase.auth.getSession();
      authRedirectDebug('rehydrate_getSession', {
        hasAccess: !!session?.access_token,
        hasRefresh: !!session?.refresh_token,
      });
      authRedirectDebug('checkout_return_session_state', {
        phase: 'after_getSession',
        hasAccess: !!session?.access_token,
        hasRefresh: !!session?.refresh_token,
      });
      if (!session?.access_token && session?.refresh_token) {
        const { data, error } = await supabase.auth.refreshSession();
        session = data.session ?? session;
        authRedirectDebug('rehydrate_after_refresh', {
          hasAccess: !!session?.access_token,
          refreshError: error?.message,
        });
        authRedirectDebug('checkout_return_session_state', {
          phase: 'after_refreshSession',
          hasAccess: !!session?.access_token,
          hasRefresh: !!session?.refresh_token,
          refreshError: error?.message ?? null,
        });
      }
      if (!session?.access_token) {
        authRedirectDebug('rehydrate_abort_no_session');
        authRedirectDebug('checkout_return_session_state', {
          phase: 'abort_no_session',
          reasonLoggedOut: 'no_access_token_after_getSession_and_refreshSession',
        });
        setAuthHydrated(true);
        return false;
      }
      setAccessToken(session.access_token);
      const ok = await loadMeRef.current(session.access_token);
      if (ok) auditLog('post_checkout_session_restored', { userId: session.user.id, context: 'stripe_return' });
      if (!ok) {
        applySessionUserRef.current(session);
        auditLog('post_checkout_session_restored', { userId: session.user.id, mode: 'partial', context: 'stripe_return' });
        authRedirectDebug('checkout_return_session_state', {
          phase: 'partial_user_applied',
          reasonLoggedOut: null,
          note: 'session_exists_api_me_failed_transiently',
        });
      }
      setAuthHydrated(true);
      authRedirectDebug('checkout_return_session_state', {
        phase: 'done',
        restored: true,
      });
      return true;
    } catch (e) {
      authRedirectDebug('rehydrate_error', { message: e instanceof Error ? e.message : 'unknown' });
      authRedirectDebug('checkout_return_session_state', {
        phase: 'error',
        restored: false,
        reasonLoggedOut: e instanceof Error ? e.message : 'unknown',
      });
      setAuthHydrated(true);
      return false;
    }
  }, []);

  const ensureSession = useCallback(async (): Promise<boolean> => {
    try {
      const supabase = getSupabaseBrowserClient();
      for (let attempt = 0; attempt < 3; attempt++) {
        let {
          data: { session },
          error,
        } = await supabase.auth.getSession();
        if (error) {
          authRedirectDebug('ensureSession_failed', { reason: 'getSession_error', message: error.message, attempt });
          return false;
        }
        if (!session?.access_token && session?.refresh_token) {
          const { data, error: refreshError } = await supabase.auth.refreshSession();
          session = data.session ?? session;
          authRedirectDebug('ensureSession_refreshSession', {
            attempt,
            hasAccess: !!session?.access_token,
            hasRefresh: !!session?.refresh_token,
            refreshError: refreshError?.message ?? null,
          });
        }
        if (!session?.access_token) {
          authRedirectDebug('ensureSession_retry_wait', {
            attempt,
            reason: 'no_access_token_yet',
          });
          await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
          continue;
        }
        setAccessToken(session.access_token);
        const ok = await loadMeRef.current(session.access_token);
        if (ok) {
          auditLog('post_checkout_session_restored', { userId: session.user.id });
          return true;
        }
        // Prevent false logout redirects after Stripe return: preserve signed-in fallback user.
        applySessionUserRef.current(session);
        auditLog('post_checkout_session_restored', { userId: session.user.id, mode: 'partial' });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    if (accessToken) return accessToken;
    const ok = await ensureSession();
    if (!ok) return null;
    return getSupabaseBrowserClient().auth.getSession().then(({ data }) => data.session?.access_token ?? null);
  }, [accessToken, ensureSession]);

  /** Bootstrap + listener: do not treat transient null session as logout (fixes post-Stripe full-page return). */
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let cancelled = false;

    void (async () => {
      authRedirectDebug('bootstrap_start');
      let {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      authRedirectDebug('bootstrap_getSession', {
        hasAccess: !!session?.access_token,
        hasRefresh: !!session?.refresh_token,
      });
      if (!session?.access_token && session?.refresh_token) {
        const { data } = await supabase.auth.refreshSession();
        session = data.session ?? session;
        authRedirectDebug('bootstrap_after_refresh', { hasAccess: !!session?.access_token });
      }
      if (session?.access_token) {
        setAccessToken(session.access_token);
        const ok = await loadMeRef.current(session.access_token);
        if (!ok) applySessionUserRef.current(session);
      }
      if (!cancelled) setAuthHydrated(true);
      authRedirectDebug('bootstrap_done', { hydrated: true });
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session: Session | null) => {
      if (cancelled) return;
      authRedirectDebug('onAuthStateChange', {
        event,
        hasAccess: !!session?.access_token,
        hasRefresh: !!session?.refresh_token,
      });

      if (event === 'SIGNED_OUT') {
        authRedirectDebug('user_cleared', { reason: 'SIGNED_OUT' });
        setAccessToken(null);
        setUser(null);
        setBilling(emptyBilling());
        setAuthHydrated(true);
        return;
      }

      if (session?.access_token) {
        setAccessToken(session.access_token);
        const ok = await loadMeRef.current(session.access_token);
        if (!ok) applySessionUserRef.current(session);
      }
      setAuthHydrated(true);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    void refreshBilling();
  }, [refreshBilling]);

  const signUpWithPassword = useCallback(async (params: { email: string; password: string; fullName?: string }) => {
    const supabase = getSupabaseBrowserClient();
    const origin = getCanonicalAppOrigin();
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
    authRedirectDebug('user_cleared', { reason: 'logout' });
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
    rehydrateAfterStripeReturn,
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
