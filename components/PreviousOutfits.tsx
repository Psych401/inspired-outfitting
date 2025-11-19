'use client';

import React, { useState } from 'react';
import { XIcon, HeartIcon } from './IconComponents';

interface PreviousOutfitsProps {
  images: string[];
  favorites: string[];
  onSelect: (imageBase64: string) => void;
  onDelete: (imageBase64: string) => void;
  onToggleFavorite: (imageBase64: string) => void;
}

const PreviousOutfits: React.FC<PreviousOutfitsProps> = ({ images, favorites, onSelect, onDelete, onToggleFavorite }) => {
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  if (images.length === 0) {
    return null;
  }

  const handleDelete = (e: React.MouseEvent, imgSrc: string) => {
    e.stopPropagation(); // Prevent the onSelect from firing when deleting
    onDelete(imgSrc);
  }

  const handleFavorite = (e: React.MouseEvent, imgSrc: string) => {
    e.stopPropagation();
    onToggleFavorite(imgSrc);
  }

  const displayedImages = showFavoritesOnly 
    ? images.filter(img => favorites.includes(img))
    : images;

  return (
    <div className="w-full mt-6">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-heading font-semibold text-charcoal-grey/80">Or use a previous outfit</h3>
        <button 
            onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
            className={`text-sm flex items-center gap-1 px-3 py-1 rounded-full transition-colors ${showFavoritesOnly ? 'bg-dusty-rose text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
            <HeartIcon className="w-4 h-4" filled={showFavoritesOnly} />
            {showFavoritesOnly ? 'Favorites' : 'Show Favorites'}
        </button>
      </div>
      
      {displayedImages.length === 0 ? (
         <div className="p-6 text-center bg-warm-cream/30 rounded-lg border border-dashed border-dusty-rose/30">
             <p className="text-charcoal-grey/60 text-sm">No {showFavoritesOnly ? 'favorite ' : ''}outfits found.</p>
         </div>
      ) : (
        <div className="flex overflow-x-auto space-x-4 p-2 bg-warm-cream/50 rounded-lg scrollbar-thin scrollbar-thumb-dusty-rose/50 scrollbar-track-transparent">
            {displayedImages.map((imgSrc, index) => {
            const isFavorite = favorites.includes(imgSrc);
            return (
                <div key={index} className="relative flex-shrink-0 w-28 h-28 group">
                    <div className="w-full h-full cursor-pointer" onClick={() => onSelect(imgSrc)}>
                        <img src={imgSrc} alt={`Previous outfit ${index + 1}`} className="w-full h-full object-contain rounded-md bg-gray-100 border-2 border-transparent group-hover:border-dusty-rose transition-all" />
                        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all duration-300 flex items-center justify-center rounded-md">
                        <span className="text-white text-sm opacity-0 group-hover:opacity-100 transition-opacity font-semibold">
                            Use
                        </span>
                        </div>
                    </div>
                    {/* Favorite Button */}
                    <button
                        onClick={(e) => handleFavorite(e, imgSrc)}
                        className={`absolute top-1 left-1 z-10 p-1 rounded-full transition-all duration-200 ${isFavorite ? 'text-red-500 bg-white shadow-sm opacity-100' : 'text-white bg-black/30 opacity-0 group-hover:opacity-100 hover:text-red-400'}`}
                        aria-label={isFavorite ? "Unfavorite" : "Favorite"}
                    >
                        <HeartIcon className="w-3 h-3" filled={isFavorite} />
                    </button>
                    {/* Delete Button */}
                    <button
                        onClick={(e) => handleDelete(e, imgSrc)}
                        className="absolute top-1 right-1 z-10 p-1 bg-charcoal-grey/60 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-charcoal-grey focus:opacity-100"
                        aria-label="Delete outfit"
                    >
                        <XIcon className="w-3 h-3" />
                    </button>
                </div>
            )})}
        </div>
      )}
    </div>
  );
};

export default PreviousOutfits;
