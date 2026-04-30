'use client';

import React, { useState } from 'react';
import Link from 'next/link';

interface UploadedImagesGalleryProps {
  title: string;
  images: string[];
  /** When true, renders an empty-state panel instead of hiding the section. */
  showWhenEmpty?: boolean;
  emptyDescription?: string;
  emptyCtaLabel?: string;
  emptyCtaHref?: string;
  className?: string;
}

const ITEMS_PER_PAGE = 8;

const UploadedImagesGallery: React.FC<UploadedImagesGalleryProps> = ({
  title,
  images,
  showWhenEmpty = false,
  emptyDescription = 'Nothing here yet.',
  emptyCtaLabel = 'Create a look',
  emptyCtaHref = '/dress-yourself',
  className = '',
}) => {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(images.length / ITEMS_PER_PAGE);
  const paginatedImages = images.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const handleNext = () => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  };

  const handlePrev = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };

  if (images.length === 0 && showWhenEmpty) {
    return (
      <div
        className={`rounded-[1.75rem] border border-boutique-blush/40 bg-white/80 p-10 text-center shadow-lg ring-1 ring-boutique-champagne/15 backdrop-blur-sm ${className}`}
      >
        <h2 className="font-heading text-xl font-semibold text-boutique-cocoa">{title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-boutique-cocoa/70">{emptyDescription}</p>
        <Link
          href={emptyCtaHref}
          className="mt-6 inline-flex rounded-full bg-boutique-rose px-6 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-boutique-rose/90"
        >
          {emptyCtaLabel}
        </Link>
      </div>
    );
  }

  if (images.length === 0) {
    return null;
  }

  return (
    <div
      className={`rounded-[1.75rem] border border-boutique-blush/40 bg-white/80 p-8 shadow-lg ring-1 ring-boutique-champagne/15 backdrop-blur-sm ${className}`}
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-heading text-xl font-semibold text-boutique-cocoa">{title}</h2>
        {totalPages > 1 && (
          <div className="flex items-center space-x-2 text-sm">
            <span className="text-boutique-cocoa/60">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={handlePrev}
              disabled={currentPage === 1}
              className="rounded-full border border-boutique-blush/60 px-3 py-1 transition hover:bg-boutique-blush/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={currentPage === totalPages}
              className="rounded-full border border-boutique-blush/60 px-3 py-1 transition hover:bg-boutique-blush/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {paginatedImages.map((imgSrc, index) => (
          <div
            key={`${title}-${index}-${imgSrc.slice(0, 24)}`}
            className="aspect-square overflow-hidden rounded-xl border border-boutique-blush/30 bg-boutique-ivory"
          >
            <img src={imgSrc} alt={`Uploaded image ${index + 1}`} className="h-full w-full object-contain" />
          </div>
        ))}
      </div>
      {images.length > 0 && paginatedImages.length === 0 && currentPage > 1 && (
        <p className="mt-4 text-center text-boutique-cocoa/50">No more images.</p>
      )}
    </div>
  );
};

export default UploadedImagesGallery;
