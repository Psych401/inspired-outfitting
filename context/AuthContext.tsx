'use client';

import React, { createContext, useState, useCallback, ReactNode } from 'react';
import { AuthContextType, User, TryOnHistoryItem } from '../types';

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [history, setHistory] = useState<TryOnHistoryItem[]>([]);
  const [uploadedPersonImages, setUploadedPersonImages] = useState<string[]>([]);
  const [uploadedOutfitImages, setUploadedOutfitImages] = useState<string[]>([]);
  const [favoriteOutfitImages, setFavoriteOutfitImages] = useState<string[]>([]);
  const [imagesToRegenerate, setImagesToRegenerate] = useState<{personImg: string, outfitImg: string} | null>(null);


  const login = useCallback((userData: User) => {
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
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
    setHistory(prevHistory => [newItem, ...prevHistory]);

    // Add unique person image. Outfit images are handled separately on upload.
    setUploadedPersonImages(prev => [...new Set([item.personImg, ...prev])]);
  }, []);

  const deleteHistoryItem = useCallback((id: string) => {
    setHistory(prev => prev.filter(item => item.id !== id));
  }, []);

  const setRegenerate = useCallback((personImg: string, outfitImg: string) => {
    setImagesToRegenerate({ personImg, outfitImg });
  }, []);

  const clearRegenerate = useCallback(() => {
    setImagesToRegenerate(null);
  }, []);

  const addUploadedOutfitImage = useCallback((imageBase64: string) => {
    setUploadedOutfitImages(prev => {
      // Remove if it exists to add it to the front (as most recently used)
      const filtered = prev.filter(img => img !== imageBase64);
      return [imageBase64, ...filtered];
    });
  }, []);

  const deleteUploadedOutfitImage = useCallback((imageBase64: string) => {
    setUploadedOutfitImages(prev => prev.filter(img => img !== imageBase64));
    setFavoriteOutfitImages(prev => prev.filter(img => img !== imageBase64));
  }, []);

  const toggleFavoriteOutfit = useCallback((imageBase64: string) => {
    setFavoriteOutfitImages(prev => {
      if (prev.includes(imageBase64)) {
        return prev.filter(img => img !== imageBase64);
      } else {
        return [...prev, imageBase64];
      }
    });
  }, []);

  const value = {
    isAuthenticated: !!user,
    user,
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