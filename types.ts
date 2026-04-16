export interface NavigationProps {
  navigate: (path: string) => void;
}

export type BillingSubscriptionStatus =
  | 'none'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'trialing'
  | 'unpaid'
  | 'payment_action_required'
  | 'invoice_finalization_failed';

export type BillingTier = 'closet' | 'studio' | 'runway' | 'none';

/** Snapshot from GET /api/billing/me (server source of truth). */
export interface BillingSnapshot {
  credits: number | null;
  subscriptionTier: BillingTier;
  subscriptionStatus: BillingSubscriptionStatus;
  loading: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface TryOnHistoryItem {
  id: string;
  personImg: string;
  outfitImg: string;
  resultImg: string;
  createdAt: Date;
}

export interface AuthContextType {
  isAuthenticated: boolean;
  authHydrated: boolean;
  user: User | null;
  billing: BillingSnapshot;
  refreshBilling: () => Promise<void>;
  ensureSession: () => Promise<boolean>;
  /** Call after returning from Stripe Checkout / Customer Portal to refresh tokens and /api/me. */
  rehydrateAfterStripeReturn: () => Promise<boolean>;
  getAccessToken: () => Promise<string | null>;
  history: TryOnHistoryItem[];
  uploadedPersonImages: string[];
  uploadedOutfitImages: string[];
  favoriteOutfitImages: string[];
  imagesToRegenerate: { personImg: string; outfitImg: string } | null;
  signUpWithPassword: (params: { email: string; password: string; fullName?: string }) => Promise<{
    ok: boolean;
    message?: string;
    needsEmailVerification?: boolean;
  }>;
  signInWithPassword: (params: { email: string; password: string }) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  addHistoryItem: (item: Omit<TryOnHistoryItem, 'id' | 'createdAt'>) => void;
  deleteHistoryItem: (id: string) => void;
  setRegenerate: (personImg: string, outfitImg: string) => void;
  clearRegenerate: () => void;
  addUploadedOutfitImage: (imageBase64: string) => void;
  deleteUploadedOutfitImage: (imageBase64: string) => void;
  toggleFavoriteOutfit: (imageBase64: string) => void;
}
