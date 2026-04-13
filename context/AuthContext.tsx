'use client';

import React, { createContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { AuthContextType, User, TryOnHistoryItem, BillingSnapshot, BillingTier, BillingSubscriptionStatus } from '../types';
import { normalizeSubscriptionPlanKey } from '@/lib/billing/plan-keys';

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
  const [billing, setBilling] = useState<BillingSnapshot>(emptyBilling);
  const [history, setHistory] = useState<TryOnHistoryItem[]>([]);
  const [uploadedPersonImages, setUploadedPersonImages] = useState<string[]>([]);
  const [uploadedOutfitImages, setUploadedOutfitImages] = useState<string[]>([]);
  const [favoriteOutfitImages, setFavoriteOutfitImages] = useState<string[]>([]);
  const [imagesToRegenerate, setImagesToRegenerate] = useState<{ personImg: string; outfitImg: string } | null>(null);

  const refreshBilling = useCallback(async () => {
    if (!user) {
      setBilling(emptyBilling());
      return;
    }
    setBilling((b) => ({ ...b, loading: true }));
    try {
      const res = await fetch('/api/billing/me', { credentials: 'include', cache: 'no-store' });
      if (!res.ok) {
        setBilling(emptyBilling());
        return;
      }
      const data = (await res.json()) as Record<string, unknown>;
      setBilling(parseBillingPayload(data));
    } catch {
      setBilling(emptyBilling());
    }
  }, [user]);

  /** Restore client user state from the httpOnly session cookie (e.g. return from Stripe checkout). */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { authenticated?: boolean; userId?: string };
        if (data.authenticated && typeof data.userId === 'string' && data.userId) {
          const email = data.userId;
          setUser({ email, name: email.split('@')[0] || 'Member' });
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void refreshBilling();
  }, [refreshBilling]);

  const login = useCallback((userData: User) => {
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    void fetch('/api/auth/session', { method: 'DELETE', credentials: 'include' });
    setUser(null);
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
    user,
    billing,
    refreshBilling,
    history,
    uploadedPersonImages,
    uploadedOutfitImages,
    favoriteOutfitImages,
    imagesToRegenerate,
    login,
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
