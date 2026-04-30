'use client';

/**
 * PROFILE_UI_TODOS
 * - Persist favourite try-ons / garments to backend when API exists (currently try-on hearts use localStorage;
 *   garment hearts use AuthContext session state only).
 * - DELETE_PERSON_UPLOAD_API: enable “Remove from uploads” when server route + AuthContext handler exist.
 * - ACCOUNT_DELETE_API: wire “Delete account” when a safe Supabase + billing teardown flow exists.
 */

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/Button';
import UploadedImagesGallery from '@/components/UploadedImagesGallery';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { PLAN_LABEL, type SubscriptionPlanKey } from '@/lib/billing/products';
import type { BillingSubscriptionStatus, TryOnHistoryItem } from '@/types';
import { authRedirectDebug } from '@/lib/auth/redirect-debug';
import { finishStripeReturnRestore, isStripeReturnRestoreActive, startStripeReturnRestore } from '@/lib/auth/stripe-return-restore';

const FAV_TRYON_STORAGE_KEY = 'io_profile_favourite_tryon_ids_v1';

type SavedTab = 'outfits' | 'person' | 'garments' | 'favourites';

type ConfirmKind =
  | null
  | { kind: 'delete_tryon'; id: string }
  | { kind: 'clear_all_tryons' }
  | { kind: 'delete_garment'; src: string };

const DownloadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);
const DeleteIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);
const RegenerateIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5M4 4l1.5 1.5A9 9 0 0120 12h-3a6 6 0 00-9.66-4.99L4 4zM20 20l-1.5-1.5A9 9 0 014 12h3a6 6 0 009.66 4.99L20 20z" />
  </svg>
);

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" aria-hidden>
      <path
        strokeWidth="1.8"
        d="M12 21s-7-4.35-9-9c-1.2-3.1 1.05-6 4.5-6 2.1 0 3.45 1.2 4.5 2.55C13.05 7.2 14.4 6 16.5 6 19.95 6 22.2 8.9 21 12c-2 4.65-9 9-9 9z"
      />
    </svg>
  );
}

function billingIssueMessage(status: BillingSubscriptionStatus): string | null {
  switch (status) {
    case 'past_due':
      return 'There’s a payment issue with your subscription. Please manage your billing to avoid interruption.';
    case 'payment_action_required':
      return 'Your payment needs authentication. Please update your billing details.';
    case 'invoice_finalization_failed':
      return 'There was a billing issue finalizing your invoice. Please contact support or manage billing.';
    default:
      return null;
  }
}

function planLabel(billing: { loading: boolean; subscriptionTier: string }): string {
  if (billing.loading) return '…';
  if (billing.subscriptionTier === 'none') return 'No active plan';
  return PLAN_LABEL[billing.subscriptionTier as SubscriptionPlanKey];
}

function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  destructive,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-boutique-cocoa/40 backdrop-blur-sm" aria-label="Dismiss dialog overlay" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-md rounded-[1.75rem] border border-boutique-blush/50 bg-boutique-ivory p-8 shadow-boutique ring-1 ring-white">
        <h3 className="font-heading text-xl font-semibold text-boutique-cocoa">{title}</h3>
        <p className="mt-3 text-sm leading-relaxed text-boutique-cocoa/78">{body}</p>
        <div className="mt-8 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-boutique-blush/70 px-5 py-2 text-sm font-semibold text-boutique-cocoa transition hover:bg-boutique-blush/30"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-full px-5 py-2 text-sm font-semibold text-white shadow-md transition ${
              destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-boutique-rose hover:bg-boutique-rose/90'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function TryOnHistoryCard({
  item,
  favouriteTryOnIds,
  onToggleFavourite,
  onRegenerate,
  onRequestDelete,
}: {
  item: TryOnHistoryItem;
  favouriteTryOnIds: string[];
  onToggleFavourite: (id: string) => void;
  onRegenerate: (personImg: string, outfitImg: string) => void;
  onRequestDelete: (id: string) => void;
}) {
  const fav = favouriteTryOnIds.includes(item.id);
  /** Locale-independent stamp avoids SSR/client hydration mismatches if history ever SSR-preloads. */
  const createdLabel = item.createdAt.toISOString().slice(0, 10);

  return (
    <div className="flex flex-col overflow-hidden rounded-[1.75rem] border border-boutique-blush/40 bg-white/90 shadow-boutique ring-1 ring-boutique-champagne/15 backdrop-blur-sm transition duration-300 motion-safe:hover:-translate-y-1 motion-safe:hover:shadow-boutique-rose motion-reduce:hover:translate-y-0">
      <div className="relative">
        <img src={item.resultImg} alt="" className="aspect-[4/5] w-full object-cover sm:aspect-auto sm:h-72 sm:object-contain sm:bg-boutique-ivory" />
        <button
          type="button"
          onClick={() => onToggleFavourite(item.id)}
          className={`absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full border border-white/80 shadow-md backdrop-blur-sm transition ${
            fav ? 'bg-boutique-rose text-white' : 'bg-white/90 text-boutique-rose hover:bg-boutique-blush/40'
          }`}
          aria-label={fav ? 'Remove from favourites' : 'Add to favourites'}
        >
          <HeartIcon filled={fav} />
        </button>
      </div>
      <div className="flex justify-center gap-3 border-t border-boutique-blush/25 bg-boutique-ivory/40 px-4 py-3">
        <img src={item.personImg} alt="" className="h-16 w-16 rounded-xl border border-boutique-blush/40 bg-white object-contain" />
        <img src={item.outfitImg} alt="" className="h-16 w-16 rounded-xl border border-boutique-blush/40 bg-white object-contain" />
      </div>
      <p className="px-4 pb-2 text-center font-accent text-xs italic text-boutique-cocoa/50">{createdLabel}</p>
      <div className="mt-auto grid grid-cols-3 gap-2 border-t border-boutique-blush/30 p-4">
        <a
          href={item.resultImg}
          download={`inspired-outfit-${item.id}.png`}
          className="flex items-center justify-center gap-1 rounded-xl bg-boutique-blush/25 px-2 py-2 text-xs font-semibold text-boutique-cocoa transition hover:bg-boutique-blush/45"
        >
          <DownloadIcon /> Save
        </a>
        <button
          type="button"
          onClick={() => onRegenerate(item.personImg, item.outfitImg)}
          className="flex items-center justify-center gap-1 rounded-xl bg-boutique-blush/25 px-2 py-2 text-xs font-semibold text-boutique-cocoa transition hover:bg-boutique-blush/45"
        >
          <RegenerateIcon /> Re-do
        </button>
        <button
          type="button"
          onClick={() => onRequestDelete(item.id)}
          className="flex items-center justify-center gap-1 rounded-xl bg-red-50 px-2 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-100"
        >
          <DeleteIcon /> Remove
        </button>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const {
    user,
    authHydrated,
    billing,
    rehydrateAfterStripeReturn,
    getAccessToken,
    history,
    logout,
    deleteHistoryItem,
    setRegenerate,
    uploadedPersonImages,
    uploadedOutfitImages,
    favoriteOutfitImages,
    toggleFavoriteOutfit,
    deleteUploadedOutfitImage,
  } = useAuth();

  const [isPortalReturnRehydrating, setIsPortalReturnRehydrating] = useState(false);
  const [savedTab, setSavedTab] = useState<SavedTab>('outfits');
  const [favouriteTryOnIds, setFavouriteTryOnIds] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<ConfirmKind>(null);

  const isCheckoutSuccessReturn =
    typeof window !== 'undefined' &&
    (new URLSearchParams(window.location.search).get('checkout') === 'success' || isStripeReturnRestoreActive());
  const isPortalReturn =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('portal') === 'return';
  const isStripeReturnFlowActive = isCheckoutSuccessReturn || isPortalReturn;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(FAV_TRYON_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
        setFavouriteTryOnIds(parsed);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const toggleTryOnFavourite = useCallback((id: string) => {
    setFavouriteTryOnIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem(FAV_TRYON_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    if (q.get('portal') === 'return') {
      setIsPortalReturnRehydrating(true);
      startStripeReturnRestore();
      authRedirectDebug('stripe_return_restore_started', {
        from: 'profile:portal_return',
        path: window.location.pathname,
        search: window.location.search,
      });
      void (async () => {
        const ok = await rehydrateAfterStripeReturn();
        authRedirectDebug('portal_return_rehydrate_result', { ok });
        finishStripeReturnRestore();
        authRedirectDebug(ok ? 'stripe_return_restore_succeeded' : 'stripe_return_restore_failed', {
          from: 'profile:portal_return',
          path: window.location.pathname,
          search: window.location.search,
        });
        setIsPortalReturnRehydrating(false);
      })();
      q.delete('portal');
      const next = `${window.location.pathname}${q.toString() ? `?${q}` : ''}`;
      window.history.replaceState({}, '', next);
    }
  }, [rehydrateAfterStripeReturn]);

  useEffect(() => {
    if (!authHydrated || !!user || isPortalReturnRehydrating) return;
    authRedirectDebug('auth_ui_rendered', {
      from: 'profile:logged_out_cta',
      path: typeof window !== 'undefined' ? window.location.pathname : '',
      search: typeof window !== 'undefined' ? window.location.search : '',
      authHydrated,
      hasUser: !!user,
      hasToken: false,
      isCheckoutSuccessReturn,
    });
  }, [authHydrated, user, isPortalReturnRehydrating, isCheckoutSuccessReturn]);

  async function openSubscriptionPortal() {
    const token = await getAccessToken();
    if (!token) {
      if (authHydrated) {
        authRedirectDebug('redirect_to_auth_exact_source', {
          from: 'profile:openSubscriptionPortal:no_token',
          reason: 'getAccessToken_returned_null',
          path: typeof window !== 'undefined' ? window.location.pathname : '',
          search: typeof window !== 'undefined' ? window.location.search : '',
          authHydrated,
          hasUser: !!user,
          hasToken: false,
          isCheckoutSuccessReturn,
          isPortalReturn,
        });
        if (!isStripeReturnFlowActive) {
          authRedirectDebug('stripe_return_redirect_actual', { from: 'profile:openSubscriptionPortal:no_token' });
          router.push('/auth');
        } else {
          authRedirectDebug('stripe_return_redirect_blocked', { from: 'profile:openSubscriptionPortal:no_token' });
        }
      } else {
        authRedirectDebug('redirect_to_auth_deferred', {
          from: 'profile:openSubscriptionPortal:no_token_not_hydrated',
          reason: 'auth_not_hydrated',
          path: typeof window !== 'undefined' ? window.location.pathname : '',
          search: typeof window !== 'undefined' ? window.location.search : '',
          authHydrated,
          hasUser: !!user,
          hasToken: false,
          isStripeReturnFlowActive,
        });
      }
      return;
    }
    const res = await fetch('/api/billing/portal', {
      method: 'POST',
      credentials: 'include',
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert((body as { error?: string }).error ?? 'Could not open Stripe portal');
      return;
    }
    const url = (body as { url?: string }).url;
    if (url) window.location.href = url;
  }

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  const handleRegenerate = (personImg: string, outfitImg: string) => {
    setRegenerate(personImg, outfitImg);
    router.push('/dress-yourself');
  };

  const billingWarning = billing.loading ? null : billingIssueMessage(billing.subscriptionStatus);

  const favouriteTryOns = history.filter((h) => favouriteTryOnIds.includes(h.id));

  const confirmOpen = confirm !== null;
  const confirmProps =
    confirm?.kind === 'delete_tryon'
      ? {
          title: 'Remove this look?',
          body: 'This deletes the preview from your device session. It cannot be undone here.',
          confirmLabel: 'Remove',
          destructive: true as const,
          onConfirm: () => {
            const id = confirm.id;
            deleteHistoryItem(id);
            setFavouriteTryOnIds((prev) => {
              const next = prev.filter((x) => x !== id);
              try {
                localStorage.setItem(FAV_TRYON_STORAGE_KEY, JSON.stringify(next));
              } catch {
                /* ignore */
              }
              return next;
            });
            setConfirm(null);
          },
        }
      : confirm?.kind === 'clear_all_tryons'
        ? {
            title: 'Remove all generated looks?',
            body: 'Clears every saved preview from this session.',
            confirmLabel: 'Remove all',
            destructive: true as const,
            onConfirm: () => {
              history.forEach((h) => deleteHistoryItem(h.id));
              setFavouriteTryOnIds([]);
              try {
                localStorage.removeItem(FAV_TRYON_STORAGE_KEY);
              } catch {
                /* ignore */
              }
              setConfirm(null);
            },
          }
        : confirm?.kind === 'delete_garment'
          ? {
              title: 'Remove this garment from uploads?',
              body: 'Removes it from your saved outfit uploads on this device.',
              confirmLabel: 'Remove',
              destructive: true as const,
              onConfirm: () => {
                deleteUploadedOutfitImage(confirm.src);
                setConfirm(null);
              },
            }
          : null;

  if (!authHydrated || isPortalReturnRehydrating) {
    return (
      <div className="min-h-[40vh] bg-boutique-ivory px-5 py-24 text-center">
        <h1 className="font-heading text-2xl text-boutique-cocoa">Restoring your session...</h1>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-[50vh] bg-boutique-ivory px-5 py-24 text-center">
        <h1 className="font-heading text-2xl text-boutique-cocoa">You are not logged in.</h1>
        <Button
          onClick={() => {
            authRedirectDebug('redirect_to_auth_exact_source', {
              from: 'profile:logged_out_cta_button',
              reason: 'user_clicked_login_cta',
              path: typeof window !== 'undefined' ? window.location.pathname : '',
              search: typeof window !== 'undefined' ? window.location.search : '',
              authHydrated,
              hasUser: !!user,
              hasToken: false,
              isCheckoutSuccessReturn,
              isPortalReturn,
            });
            router.push('/auth');
          }}
          className="mt-6"
        >
          Login
        </Button>
      </div>
    );
  }

  const tabs: { id: SavedTab; label: string }[] = [
    { id: 'outfits', label: 'Saved outfits' },
    { id: 'person', label: 'Person photos' },
    { id: 'garments', label: 'Garment uploads' },
    { id: 'favourites', label: 'Favourites' },
  ];

  return (
    <div className="min-h-screen bg-boutique-ivory pb-20 pt-10 md:pt-14">
      <ConfirmDialog
        open={confirmOpen && !!confirmProps}
        title={confirmProps?.title ?? ''}
        body={confirmProps?.body ?? ''}
        confirmLabel={confirmProps?.confirmLabel ?? 'OK'}
        destructive={confirmProps?.destructive}
        onConfirm={() => confirmProps?.onConfirm()}
        onCancel={() => setConfirm(null)}
      />

      <div className="container mx-auto max-w-6xl px-5 md:px-6">
        <header className="mb-10 text-center md:text-left">
          <p className="font-accent text-lg italic text-boutique-rose">Your boutique mirror</p>
          <h1 className="mt-2 font-heading text-4xl font-bold text-boutique-cocoa md:text-[2.75rem]">Profile</h1>
          <p className="mt-2 text-boutique-cocoa/70">
            Wardrobe previews, uploads, and billing — styled to match your fitting room.
          </p>
        </header>

        {/* Account overview */}
        <section className="mb-10 rounded-[2rem] border border-boutique-blush/45 bg-white/85 p-8 shadow-boutique ring-1 ring-boutique-champagne/15 backdrop-blur-sm md:p-10">
          <h2 className="font-heading text-xl font-semibold text-boutique-cocoa">Account overview</h2>
          <dl className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-boutique-cocoa/50">Name</dt>
              <dd className="mt-1 font-medium text-boutique-cocoa">{user.name}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-boutique-cocoa/50">Email</dt>
              <dd className="mt-1 font-medium text-boutique-cocoa break-all">{user.email}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-boutique-cocoa/50">Current plan</dt>
              <dd className="mt-1 font-medium text-boutique-rose">{planLabel(billing)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-boutique-cocoa/50">Credit balance</dt>
              <dd className="mt-1 font-heading text-2xl font-bold text-boutique-cocoa">{billing.loading ? '…' : (billing.credits ?? '—')}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-boutique-cocoa/50">Subscription status</dt>
              <dd className="mt-1 font-medium capitalize text-boutique-cocoa">{billing.loading ? '…' : billing.subscriptionStatus.replace(/_/g, ' ')}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-boutique-cocoa/50">Renewal date</dt>
              <dd className="mt-1 font-medium text-boutique-cocoa/70">Not available yet</dd>
            </div>
          </dl>
        </section>

        {billingWarning && (
          <div
            className="mb-10 rounded-[1.5rem] border border-boutique-rose/40 bg-boutique-blush/40 px-6 py-5 text-sm leading-relaxed text-boutique-cocoa shadow-boutique"
            role="status"
          >
            <p className="font-semibold text-boutique-cocoa">Billing attention needed</p>
            <p className="mt-2">{billingWarning}</p>
          </div>
        )}

        {/* Saved fashion */}
        <section className="mb-10 rounded-[2rem] border border-boutique-blush/40 bg-white/80 p-6 shadow-boutique ring-1 ring-white backdrop-blur-sm md:p-10">
          <h2 className="font-heading text-xl font-semibold text-boutique-cocoa">Saved fashion</h2>
          <p className="mt-2 text-sm text-boutique-cocoa/72">
            Try-on hearts are stored on this device. Garment hearts follow your session until cloud favourites ship — see TODO
            in file header.
          </p>

          <div className="mt-8 flex flex-wrap gap-2 border-b border-boutique-blush/35 pb-6">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSavedTab(t.id)}
                className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                  savedTab === t.id
                    ? 'bg-boutique-cocoa text-boutique-ivory shadow-md'
                    : 'bg-boutique-blush/35 text-boutique-cocoa hover:bg-boutique-blush/55'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="mt-8">
            {savedTab === 'outfits' && (
              <>
                {history.length > 0 ? (
                  <div className="grid gap-8 md:grid-cols-2">
                    {history.map((item) => (
                      <TryOnHistoryCard
                        key={item.id}
                        item={item}
                        favouriteTryOnIds={favouriteTryOnIds}
                        onToggleFavourite={toggleTryOnFavourite}
                        onRegenerate={handleRegenerate}
                        onRequestDelete={(id) => setConfirm({ kind: 'delete_tryon', id })}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[1.75rem] border border-dashed border-boutique-blush/60 bg-boutique-ivory/80 py-16 text-center">
                    <p className="font-heading text-lg text-boutique-cocoa">No saved outfits yet</p>
                    <p className="mt-2 text-sm text-boutique-cocoa/65">Generate your first look</p>
                    <Link
                      href="/dress-yourself"
                      className="mt-8 inline-flex rounded-full bg-boutique-rose px-8 py-3 font-semibold text-white shadow-md transition hover:bg-boutique-rose/90"
                    >
                      Open fitting room
                    </Link>
                  </div>
                )}
              </>
            )}

            {savedTab === 'person' && (
              <UploadedImagesGallery
                title="Uploaded person images"
                images={uploadedPersonImages}
                showWhenEmpty
                emptyDescription="Photos you use for try-ons will appear here."
                emptyCtaLabel="Generate your first look"
                emptyCtaHref="/dress-yourself"
              />
            )}

            {savedTab === 'garments' && (
              <>
                {uploadedOutfitImages.length > 0 ? (
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                    {uploadedOutfitImages.map((src) => {
                      const fav = favoriteOutfitImages.includes(src);
                      return (
                        <div
                          key={src.slice(0, 48)}
                          className="overflow-hidden rounded-2xl border border-boutique-blush/35 bg-boutique-ivory shadow-md"
                        >
                          <div className="relative">
                            <img src={src} alt="" className="aspect-square w-full object-contain" />
                            <button
                              type="button"
                              onClick={() => toggleFavoriteOutfit(src)}
                              className={`absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full border border-white/70 shadow-md backdrop-blur-md ${
                                fav ? 'bg-boutique-rose text-white' : 'bg-white/90 text-boutique-rose'
                              }`}
                              aria-label={fav ? 'Remove favourite' : 'Mark favourite'}
                            >
                              <HeartIcon filled={fav} />
                            </button>
                          </div>
                          <div className="flex gap-1 border-t border-boutique-blush/30 bg-white/80 p-2">
                            <button
                              type="button"
                              onClick={() => toggleFavoriteOutfit(src)}
                              className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-2 text-xs font-semibold ${
                                fav ? 'bg-boutique-blush/50 text-boutique-cocoa' : 'bg-boutique-blush/25 text-boutique-cocoa'
                              }`}
                            >
                              <HeartIcon filled={fav} />
                              {fav ? 'Saved' : 'Favourite'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirm({ kind: 'delete_garment', src })}
                              className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-[1.75rem] border border-dashed border-boutique-blush/60 bg-boutique-ivory/80 py-16 text-center">
                    <p className="text-boutique-cocoa">No garment uploads saved yet.</p>
                    <Link href="/dress-yourself" className="mt-6 inline-block font-semibold text-boutique-rose underline-offset-4 hover:underline">
                      Add a piece in the fitting room
                    </Link>
                  </div>
                )}
              </>
            )}

            {savedTab === 'favourites' && (
              <div className="space-y-12">
                <div>
                  <h3 className="font-heading text-lg font-semibold text-boutique-cocoa">Favourite looks</h3>
                  <p className="mt-1 text-sm text-boutique-cocoa/65">Try-ons you’ve hearted (stored on this device).</p>
                  {favouriteTryOns.length > 0 ? (
                    <div className="mt-6 grid gap-8 md:grid-cols-2">
                      {favouriteTryOns.map((item) => (
                        <TryOnHistoryCard
                          key={item.id}
                          item={item}
                          favouriteTryOnIds={favouriteTryOnIds}
                          onToggleFavourite={toggleTryOnFavourite}
                          onRegenerate={handleRegenerate}
                          onRequestDelete={(id) => setConfirm({ kind: 'delete_tryon', id })}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="mt-6 rounded-xl border border-boutique-blush/40 bg-boutique-ivory/60 px-4 py-6 text-sm text-boutique-cocoa/70">
                      Heart any try-on above to pin it here.
                    </p>
                  )}
                </div>
                <div>
                  <h3 className="font-heading text-lg font-semibold text-boutique-cocoa">Favourite garments</h3>
                  <p className="mt-1 text-sm text-boutique-cocoa/65">Session-only until backend sync — toggle hearts under Garment uploads.</p>
                  {favoriteOutfitImages.length > 0 ? (
                    <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                      {favoriteOutfitImages.map((src) => (
                        <div key={src.slice(0, 48)} className="overflow-hidden rounded-2xl border border-boutique-rose/35 bg-white shadow-md">
                          <img src={src} alt="" className="aspect-square w-full object-contain" />
                          <button
                            type="button"
                            onClick={() => toggleFavoriteOutfit(src)}
                            className="w-full py-2 text-center text-xs font-semibold text-boutique-rose hover:bg-boutique-blush/30"
                          >
                            Remove favourite
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-6 rounded-xl border border-boutique-blush/40 bg-boutique-ivory/60 px-4 py-6 text-sm text-boutique-cocoa/70">
                      No favourite garments in this session yet.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Billing */}
        <section className="mb-10 rounded-[2rem] border border-boutique-blush/45 bg-white/85 p-8 shadow-boutique ring-1 ring-boutique-champagne/15 backdrop-blur-sm md:p-10">
          <h2 className="font-heading text-xl font-semibold text-boutique-cocoa">Billing</h2>
          <p className="mt-2 text-sm text-boutique-cocoa/72">
            Plan: <span className="font-semibold text-boutique-rose">{planLabel(billing)}</span>
          </p>
          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:flex-wrap">
            <Button onClick={() => void openSubscriptionPortal()} variant="secondary" className="w-full sm:w-auto sm:min-w-[200px]" disabled={billing.subscriptionTier === 'none'}>
              Manage subscription
            </Button>
            <Link
              href="/pricing"
              prefetch={false}
              className="inline-flex w-full items-center justify-center rounded-full border border-dusty-rose bg-white px-8 py-3 text-lg font-semibold text-dusty-rose shadow-md transition hover:bg-soft-blush sm:w-auto sm:min-w-[200px]"
            >
              Buy credits
            </Link>
          </div>
          {billing.subscriptionTier === 'none' && (
            <p className="mt-4 text-xs text-boutique-cocoa/55">Subscribe first to unlock the customer portal for subscription management.</p>
          )}
        </section>

        {/* Privacy / controls */}
        <section className="rounded-[2rem] border border-boutique-blush/45 bg-boutique-blush/25 p-8 shadow-boutique ring-1 ring-white/80 backdrop-blur-sm md:p-10">
          <h2 className="font-heading text-xl font-semibold text-boutique-cocoa">Privacy & account controls</h2>
          <ul className="mt-6 space-y-4">
            <li className="flex flex-col gap-3 rounded-xl border border-boutique-blush/40 bg-white/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-boutique-cocoa">Delete uploaded images</p>
                <p className="text-sm text-boutique-cocoa/65">Garments: use Remove on each thumbnail. Person uploads: awaiting DELETE_PERSON_UPLOAD_API.</p>
              </div>
              <button
                type="button"
                disabled
                className="shrink-0 rounded-full border border-boutique-cocoa/20 bg-boutique-cocoa/10 px-5 py-2 text-sm font-semibold text-boutique-cocoa/45"
              >
                Coming soon
              </button>
            </li>
            <li className="flex flex-col gap-3 rounded-xl border border-boutique-blush/40 bg-white/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-boutique-cocoa">Delete generated looks</p>
                <p className="text-sm text-boutique-cocoa/65">Clears every preview stored in this browser session.</p>
              </div>
              <button
                type="button"
                disabled={history.length === 0}
                onClick={() => setConfirm({ kind: 'clear_all_tryons' })}
                className="shrink-0 rounded-full border border-red-200 bg-red-50 px-5 py-2 text-sm font-semibold text-red-700 transition enabled:hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Remove all looks
              </button>
            </li>
            <li className="flex flex-col gap-3 rounded-xl border border-boutique-blush/40 bg-white/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-boutique-cocoa">Sign out</p>
                <p className="text-sm text-boutique-cocoa/65">Ends this session on this device.</p>
              </div>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="shrink-0 rounded-full bg-boutique-cocoa px-6 py-2 text-sm font-semibold text-boutique-ivory transition hover:bg-boutique-cocoa/90"
              >
                Sign out
              </button>
            </li>
            <li className="flex flex-col gap-3 rounded-xl border border-boutique-cocoa/15 bg-boutique-cocoa/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-boutique-cocoa">Delete account</p>
                <p className="text-sm text-boutique-cocoa/65">Permanent removal requires billing + auth teardown — not enabled yet.</p>
              </div>
              <button type="button" disabled className="shrink-0 rounded-full bg-boutique-cocoa/25 px-5 py-2 text-sm font-semibold text-boutique-cocoa/50">
                Coming soon
              </button>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
