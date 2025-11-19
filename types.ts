
export interface User {
  name: string;
  email: string;
  subscription: 'Free' | 'Standard' | 'Premium';
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