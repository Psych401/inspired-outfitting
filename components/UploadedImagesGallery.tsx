'use client';

import React, { useState } from 'react';

interface UploadedImagesGalleryProps {
  title: string;
  images: string[];
}

const ITEMS_PER_PAGE = 8;

const UploadedImagesGallery: React.FC<UploadedImagesGalleryProps> = ({ title, images }) => {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(images.length / ITEMS_PER_PAGE);
  const paginatedImages = images.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleNext = () => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  };

  const handlePrev = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };

  if (images.length === 0) {
    return null; // Don't render if there are no images
  }

  return (
    <div className="bg-white p-8 rounded-lg shadow-lg">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-heading font-semibold">{title}</h2>
        {totalPages > 1 && (
          <div className="flex items-center space-x-2 text-sm">
             <span className="text-charcoal-grey/70">Page {currentPage} of {totalPages}</span>
            <button onClick={handlePrev} disabled={currentPage === 1} className="px-3 py-1 border rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors">
              Prev
            </button>
            <button onClick={handleNext} disabled={currentPage === totalPages} className="px-3 py-1 border rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors">
              Next
            </button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {paginatedImages.map((imgSrc, index) => (
          <div key={index} className="aspect-w-1 aspect-h-1 rounded-md overflow-hidden bg-gray-100 border">
            <img src={imgSrc} alt={`Uploaded image ${index + 1}`} className="w-full h-full object-contain" />
          </div>
        ))}
      </div>
      {images.length > 0 && paginatedImages.length === 0 && currentPage > 1 && (
        <p className="text-center text-gray-500 mt-4">No more images.</p>
      )}
    </div>
  );
};

export default UploadedImagesGallery;
