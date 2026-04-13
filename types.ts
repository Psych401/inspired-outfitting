export interface NavigationProps {
  navigate: (path: string) => void;
}

export type BillingSubscriptionStatus =
  | 'none'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'trialing'
  | 'unpaid';

export type BillingTier = 'closet' | 'studio' | 'runway' | 'none';

/** Snapshot from GET /api/billing/me (server source of truth). */
export interface BillingSnapshot {
  credits: number | null;
  subscriptionTier: BillingTier;
  subscriptionStatus: BillingSubscriptionStatus;
  loading: boolean;
}

export interface User {
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
  user: User | null;
  billing: BillingSnapshot;
  refreshBilling: () => Promise<void>;
  history: TryOnHistoryItem[];
  uploadedPersonImages: string[];
  uploadedOutfitImages: string[];
  favoriteOutfitImages: string[];
  imagesToRegenerate: { personImg: string; outfitImg: string } | null;
  login: (user: User) => void;
  logout: () => void;
  addHistoryItem: (item: Omit<TryOnHistoryItem, 'id' | 'createdAt'>) => void;
  deleteHistoryItem: (id: string) => void;
  setRegenerate: (personImg: string, outfitImg: string) => void;
  clearRegenerate: () => void;
  addUploadedOutfitImage: (imageBase64: string) => void;
  deleteUploadedOutfitImage: (imageBase64: string) => void;
  toggleFavoriteOutfit: (imageBase64: string) => void;
}
