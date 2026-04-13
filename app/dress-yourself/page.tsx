'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import Button from '@/components/Button';
import { UploadIcon, SparklesIcon, DownloadIcon } from '@/components/IconComponents';
import { useRouter } from 'next/navigation';
import PreviousOutfits from '@/components/PreviousOutfits';
import Link from 'next/link';
import {
  isInvalidOnePiecePhotoType,
  type GarmentCategory,
  type GarmentPhotoType,
} from '@/lib/try-on/types';

const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
};

const dataUrlToFile = async (dataUrl: string, fileName: string): Promise<File> => {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return new File([blob], fileName, { type: blob.type });
};

const ImageUploader: React.FC<{
    onFileSelect: (file: File) => void;
    preview: string | null;
    title: string;
    description: string;
}> = ({ onFileSelect, preview, title, description }) => {
    const [isDragging, setIsDragging] = useState(false);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files[0]) {
            onFileSelect(event.target.files[0]);
        }
    };

    const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const file = e.dataTransfer.files[0];
            if (file.type.startsWith('image/')) {
                onFileSelect(file);
            }
        }
    };

    return (
        <div className="w-full">
            <h3 className="text-2xl font-heading font-semibold mb-2">{title}</h3>
            <p className="text-charcoal-grey/70 mb-4">{description}</p>
            <label 
                className={`relative cursor-pointer w-full h-64 flex flex-col items-center justify-center border-2 border-dashed rounded-lg transition-colors overflow-hidden ${
                    isDragging 
                        ? 'border-dusty-rose bg-dusty-rose/20' 
                        : 'border-dusty-rose/50 bg-soft-blush/30 hover:bg-soft-blush/60'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {preview ? (
                    <>
                        <img src={preview} alt="Preview" className="w-full h-full object-contain rounded-lg" />
                        {isDragging && (
                            <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                                <p className="text-dusty-rose font-semibold text-lg">Drop to replace</p>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="text-center text-dusty-rose">
                        <UploadIcon className="mx-auto" />
                        <p className="mt-2">{isDragging ? 'Drop image here' : 'Click or drag & drop to upload'}</p>
                    </div>
                )}
                <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
            </label>
        </div>
    );
};

const GarmentTypeSelector: React.FC<{
    value: GarmentCategory | null;
    onSelectType: (type: GarmentCategory) => void;
}> = ({ value, onSelectType }) => {
    const types = [
        { id: 'tops', label: 'Tops' },
        { id: 'bottoms', label: 'Bottoms' },
        { id: 'one-pieces', label: 'One-Piece' },
    ] as const;

    return (
        <div className="w-full">
            <h3 className="text-2xl font-heading font-semibold mb-2">3. Select Garment Category</h3>
            <p className="text-charcoal-grey/70 mb-4">Choose the category that matches your garment image.</p>
            <div className="grid grid-cols-3 gap-4">
                {types.map(({ id, label }) => (
                    <button
                        key={id}
                        onClick={() => onSelectType(id)}
                        className={`p-4 rounded-lg border-2 font-medium text-center transition-all duration-200 ${
                            value === id
                                ? 'bg-dusty-rose text-white border-dusty-rose shadow-md scale-105'
                                : 'bg-warm-cream/50 border-gray-200 hover:border-dusty-rose/50 hover:bg-soft-blush/50'
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>
        </div>
    );
};

const GarmentPhotoTypeSelector: React.FC<{
  category: GarmentCategory | null;
  value: GarmentPhotoType | null;
  onSelectType: (type: GarmentPhotoType) => void;
}> = ({ category, value, onSelectType }) => {
  const flatLayDisabled = category === 'one-pieces';
  const options: Array<{ id: GarmentPhotoType; label: string; description: string }> = [
    {
      id: 'flat-lay',
      label: 'Flat-lay product image',
      description: 'Garment only, laid out or on a hanger/mannequin.',
    },
    {
      id: 'model',
      label: 'Worn by a model',
      description: 'Garment shown while being worn in the source photo.',
    },
  ];

  return (
    <div className="w-full">
      <h3 className="text-2xl font-heading font-semibold mb-2">4. Select Garment Photo Type</h3>
      <p className="text-charcoal-grey/70 mb-4">Required for FASHN VTON processing.</p>
      <div className="grid gap-3">
        {options.map((option) => {
          const disabled = option.id === 'flat-lay' && flatLayDisabled;
          return (
            <button
              key={option.id}
              type="button"
              disabled={disabled}
              aria-disabled={disabled}
              onClick={() => {
                if (!disabled) onSelectType(option.id);
              }}
              className={`w-full text-left rounded-lg border-2 p-4 transition-all duration-200 ${
                disabled
                  ? 'opacity-40 cursor-not-allowed border-gray-200 bg-gray-50 text-charcoal-grey/50'
                  : value === option.id
                    ? 'bg-dusty-rose/10 border-dusty-rose shadow-md'
                    : 'bg-warm-cream/50 border-gray-200 hover:border-dusty-rose/50 hover:bg-soft-blush/50'
              }`}
            >
              <p className="font-semibold text-charcoal-grey">{option.label}</p>
              <p className="text-sm text-charcoal-grey/70">{option.description}</p>
              {disabled && (
                <p className="text-xs text-charcoal-grey/50 mt-2">Not available for one-piece garments — use model-worn.</p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};


export default function DressYourselfPage() {
  const router = useRouter();
  const {
    isAuthenticated,
    user,
    refreshBilling,
    addHistoryItem,
    imagesToRegenerate,
    clearRegenerate,
    uploadedOutfitImages,
    addUploadedOutfitImage,
    deleteUploadedOutfitImage,
    favoriteOutfitImages,
    toggleFavoriteOutfit,
  } = useAuth();
  const [personImage, setPersonImage] = useState<File | null>(null);
  const [outfitImage, setOutfitImage] = useState<File | null>(null);
  const [personPreview, setPersonPreview] = useState<string | null>(null);
  const [outfitPreview, setOutfitPreview] = useState<string | null>(null);
  const [personImageBase64, setPersonImageBase64] = useState<string | null>(null);
  const [outfitImageBase64, setOutfitImageBase64] = useState<string | null>(null);
  const [garmentCategory, setGarmentCategory] = useState<GarmentCategory | null>(null);
  const [garmentPhotoType, setGarmentPhotoType] = useState<GarmentPhotoType | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  type GenPhase = 'idle' | 'submitting' | 'generating';
  const [genPhase, setGenPhase] = useState<GenPhase>('idle');
  const isBusy = genPhase !== 'idle';
  const [error, setError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    if (q.get('checkout') === 'success') {
      void refreshBilling();
      q.delete('checkout');
      const next = `${window.location.pathname}${q.toString() ? `?${q}` : ''}`;
      window.history.replaceState({}, '', next);
    }
  }, [refreshBilling]);

  useEffect(() => {
    const initFromRegenerate = async () => {
      if (imagesToRegenerate) {
        setPersonPreview(imagesToRegenerate.personImg);
        setOutfitPreview(imagesToRegenerate.outfitImg);
        setPersonImageBase64(imagesToRegenerate.personImg);
        setOutfitImageBase64(imagesToRegenerate.outfitImg);

        const personFile = await dataUrlToFile(imagesToRegenerate.personImg, 'person.png');
        const outfitFile = await dataUrlToFile(imagesToRegenerate.outfitImg, 'outfit.png');
        setPersonImage(personFile);
        setOutfitImage(outfitFile);
        
        clearRegenerate();
        window.scrollTo(0, 0);
      }
    };
    initFromRegenerate();
  }, [imagesToRegenerate, clearRegenerate]);

  const handlePersonImageSelect = async (file: File) => {
    setPersonImage(file);
    setPersonPreview(URL.createObjectURL(file));
    const base64 = await fileToBase64(file);
    setPersonImageBase64(base64);
    setError(null);
  };

  const handleOutfitImageSelect = async (file: File) => {
    setOutfitImage(file);
    setOutfitPreview(URL.createObjectURL(file));
    const base64 = await fileToBase64(file);
    setOutfitImageBase64(base64);
    addUploadedOutfitImage(base64);
    setGarmentCategory(null);
    setGarmentPhotoType(null);
    setError(null);
  };

  const handleSelectPreviousOutfit = async (imageBase64: string) => {
    setOutfitPreview(imageBase64);
    setOutfitImageBase64(imageBase64);
    const outfitFile = await dataUrlToFile(imageBase64, 'previous-outfit.png');
    setOutfitImage(outfitFile);
    setGarmentCategory(null);
    setGarmentPhotoType(null);
    setError(null);
  };

  const hasInvalidOnePiecePhotoType = isInvalidOnePiecePhotoType(garmentCategory, garmentPhotoType);
  const canSubmit = Boolean(
    personImage &&
      outfitImage &&
      garmentCategory &&
      garmentPhotoType &&
      !hasInvalidOnePiecePhotoType &&
      !isBusy
  );
  
  const handleGenerate = useCallback(async () => {
    setSubmitAttempted(true);
    if (!personImage || !outfitImage) {
      setError('Please upload both a person and an outfit image.');
      return;
    }
    
    if (!garmentCategory) {
        setError('Please select a garment category.');
        return;
    }

    if (!garmentPhotoType) {
        setError('Please select a garment photo type.');
        return;
    }

    if (hasInvalidOnePiecePhotoType) {
      setError('One-piece garments must use a model-worn garment image.');
      return;
    }

    if (!isAuthenticated || !user?.email) {
      setError('Please sign in to use try-on.');
      setTimeout(() => router.push('/auth'), 2000);
      return;
    }

    setGenPhase('submitting');
    setError(null);
    setGeneratedImage(null);
    setIsSaved(false);

    try {
      // Direct VTON: original uploads only (no background removal / segmentation before submit)
      let imageUrl: string | null = null;
      const requestId = `web_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const formData = new FormData();
      formData.append('person', personImage, personImage.name);
      formData.append('outfit', outfitImage, outfitImage.name);
      formData.append('category', garmentCategory);
      formData.append('garment_photo_type', garmentPhotoType);
      formData.append('requestId', requestId);

      console.log('[try-on][client] submit', {
        requestId,
        category: garmentCategory,
        garment_photo_type: garmentPhotoType,
        direct_vton_without_preprocessing: true,
        person: {
          name: personImage.name,
          size: personImage.size,
          type: personImage.type,
        },
        outfit: {
          name: outfitImage.name,
          size: outfitImage.size,
          type: outfitImage.type,
        },
      });

      const submitRes = await fetch('/api/try-on', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      const submitBody = await submitRes.json().catch(() => ({}));
      if (!submitRes.ok) {
        console.error('[try-on][client] submit failed', {
          requestId,
          status: submitRes.status,
          body: submitBody,
        });
        throw new Error(
          (submitBody as { error?: string })?.error ??
            `Try-on submit failed (${submitRes.status})`
        );
      }

      const jobId = (submitBody as { jobId?: string }).jobId;
      if (!jobId) {
        console.error('[try-on][client] missing jobId', { requestId, submitBody });
        throw new Error('Try-on submit succeeded but no jobId was returned');
      }
      console.log('[try-on][client] queued', { requestId, jobId });

      setGenPhase('generating');

      const pollEveryMs = 1500;
      const timeoutMs = 240000;
      const pollStarted = Date.now();
      while (Date.now() - pollStarted < timeoutMs) {
        const pollRes = await fetch(`/api/try-on/${jobId}`, { cache: 'no-store' });
        const pollBody = await pollRes.json().catch(() => ({}));
        if (!pollRes.ok) {
          console.error('[try-on][client] poll failed', {
            requestId,
            jobId,
            status: pollRes.status,
            body: pollBody,
          });
          throw new Error(
            (pollBody as { error?: string })?.error ??
              `Try-on status check failed (${pollRes.status})`
          );
        }

        const status = (pollBody as { status?: string }).status;
        console.log('[try-on][client] poll', { requestId, jobId, status, pollBody });
        if (status === 'succeeded') {
          imageUrl = (pollBody as { resultUrl?: string }).resultUrl ?? null;
          break;
        }
        if (status === 'failed') {
          const failed = pollBody as { error?: string; errorCode?: string };
          throw new Error(
            failed.error
              ? `Try-on failed: ${failed.error}${failed.errorCode ? ` (${failed.errorCode})` : ''}`
              : 'Try-on failed'
          );
        }

        await new Promise((resolve) => setTimeout(resolve, pollEveryMs));
      }

      if (!imageUrl) {
        throw new Error('Try-on timed out before completion. Check /api/try-on logs for details.');
      }

      // Set the generated image
      setGeneratedImage(imageUrl);
      console.log('✅ Image extracted successfully, length:', imageUrl.length);
    } catch (e: any) {
      setError(e.message || 'An error occurred while generating the image.');
      console.error(e);
    } finally {
      setGenPhase('idle');
      void refreshBilling();
    }
  }, [
    personImage,
    outfitImage,
    garmentCategory,
    garmentPhotoType,
    hasInvalidOnePiecePhotoType,
    isAuthenticated,
    user,
    router,
    refreshBilling,
  ]);

  const handleSaveToHistory = useCallback(() => {
    if (generatedImage && personImageBase64 && outfitImageBase64 && !isSaved) {
        addHistoryItem({
            personImg: personImageBase64,
            outfitImg: outfitImageBase64,
            resultImg: generatedImage,
        });
        setIsSaved(true);
    }
  }, [generatedImage, personImageBase64, outfitImageBase64, isSaved, addHistoryItem]);

  const handleDownload = useCallback(() => {
    if (generatedImage) {
        const link = document.createElement('a');
        link.href = generatedImage;
        link.download = `inspired-outfitting-try-on-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
  }, [generatedImage]);


  return (
    <div className="container mx-auto px-6 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-heading font-bold">Dress Yourself</h1>
        <p className="text-lg text-charcoal-grey/70 mt-2">Bring your fashion ideas to life.</p>
      </div>
      <div className="grid lg:grid-cols-2 gap-12 items-start">
        {/* Input Section */}
        <div className="space-y-8 bg-white p-8 rounded-lg shadow-lg">
          <ImageUploader 
            title="1. Upload Your Photo"
            description="Choose a clear, full-body photo of yourself."
            preview={personPreview}
            onFileSelect={handlePersonImageSelect}
          />
          <div>
            <ImageUploader 
              title="2. Upload an Outfit Image"
              description="Select an image of the clothing you want to try on."
              preview={outfitPreview}
              onFileSelect={handleOutfitImageSelect}
            />
            <PreviousOutfits 
              images={uploadedOutfitImages} 
              favorites={favoriteOutfitImages}
              onSelect={handleSelectPreviousOutfit}
              onDelete={deleteUploadedOutfitImage}
              onToggleFavorite={toggleFavoriteOutfit}
            />
          </div>
          
          {/* Upload Guidance */}
          <div className="bg-soft-blush/50 border border-dusty-rose/30 rounded-lg p-4 mt-4">
            <p className="text-sm text-charcoal-grey/80 mb-2">
              <strong>💡 Tip:</strong> For best results, upload an image of the garment itself - not on a person.
            </p>
            <p className="text-sm text-charcoal-grey/70 mb-2">
              The AI will work best with images of the clothing item by itself.
            </p>
            <Link 
              href="/upload-guide" 
              className="text-sm text-dusty-rose hover:text-dusty-rose/80 underline font-medium"
            >
              See examples of good uploads →
            </Link>
          </div>
          {outfitImage && (
            <GarmentTypeSelector
              value={garmentCategory}
              onSelectType={(value) => {
                setGarmentCategory(value);
                setGarmentPhotoType((prev) => {
                  if (value === 'one-pieces' && prev === 'flat-lay') return 'model';
                  return prev;
                });
                setError(null);
              }}
            />
          )}
          {outfitImage && (
            <p className="text-sm text-charcoal-grey/70 -mt-4">
              Category guide: <span className="font-medium">Tops</span> for upper garments, <span className="font-medium">Bottoms</span> for lower garments, <span className="font-medium">One-Piece</span> for dresses/jumpsuits.
            </p>
          )}

          {outfitImage && (
            <GarmentPhotoTypeSelector
              category={garmentCategory}
              value={garmentPhotoType}
              onSelectType={(value) => {
                setGarmentPhotoType(value);
                setError(null);
              }}
            />
          )}
          {outfitImage && (
            <p className="text-sm text-charcoal-grey/70 -mt-4">
              Photo type guide: <span className="font-medium">Flat-lay</span> = product-only garment image, <span className="font-medium">Model-worn</span> = garment shown on a person.
            </p>
          )}
          {hasInvalidOnePiecePhotoType && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              One-piece outfits (e.g. dresses) require a model-worn garment image for best results.
              Please upload a garment shown on a person.
            </div>
          )}

          <div className="rounded-lg border border-dusty-rose/30 bg-soft-blush/30 px-4 py-3 text-sm">
            <p className="font-medium text-charcoal-grey">Before submitting:</p>
            <p className={personImage ? 'text-green-700' : 'text-charcoal-grey/80'}>{personImage ? '✓' : '•'} Person image uploaded</p>
            <p className={outfitImage ? 'text-green-700' : 'text-charcoal-grey/80'}>{outfitImage ? '✓' : '•'} Garment image uploaded</p>
            <p className={garmentCategory ? 'text-green-700' : 'text-charcoal-grey/80'}>{garmentCategory ? '✓' : '•'} Garment category selected</p>
            <p className={garmentPhotoType ? 'text-green-700' : 'text-charcoal-grey/80'}>{garmentPhotoType ? '✓' : '•'} Garment photo type selected</p>
            {submitAttempted && !canSubmit && !isBusy && (
              <p className="mt-2 text-red-600">Please complete all required fields to submit your try-on.</p>
            )}
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!canSubmit}
            className="w-full flex items-center justify-center gap-2"
          >
            {genPhase === 'submitting' ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Submitting...
              </>
            ) : genPhase === 'generating' ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Generating...
              </>
            ) : (
              <>
                <SparklesIcon />
                Generate
              </>
            )}
          </Button>
          {error && <p className="text-red-500 text-center mt-4">{error}</p>}
        </div>

        {/* Output Section */}
        <div className="bg-white p-8 rounded-lg shadow-lg h-full flex flex-col items-center justify-center min-h-[500px]">
          <h2 className="text-3xl font-heading font-semibold mb-4 text-center">Your AI Preview</h2>
          <div className="w-full aspect-w-3 aspect-h-4 bg-soft-blush/30 rounded-lg flex items-center justify-center">
            {isBusy ? (
                <div className="text-center text-dusty-rose">
                    <div className="w-8 h-8 border-2 border-dusty-rose border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                    <p>Creating your new look...</p>
                    <p className="text-sm mt-2">This may take a moment.</p>
                </div>
            ) : generatedImage ? (
                <img 
                  src={generatedImage} 
                  alt="AI Generated Try-On" 
                  className="w-full h-full object-contain rounded-lg" 
                />
            ) : (
                <p className="text-charcoal-grey/60 text-center p-4">Your generated image will appear here.</p>
            )}
          </div>
           {generatedImage && (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full">
                <Button onClick={handleSaveToHistory} disabled={isSaved} variant="secondary" className="text-sm md:text-base py-2 px-2">
                    {isSaved ? 'Saved ✓' : 'Save'}
                </Button>
                 <Button onClick={handleDownload} variant="secondary" className="text-sm md:text-base py-2 px-2 flex items-center justify-center gap-2">
                    <DownloadIcon className="w-4 h-4" />
                    Download
                </Button>
                <Button onClick={handleGenerate} disabled={isBusy} className="text-sm md:text-base py-2 px-2">
                    Retry
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
      
       {!isAuthenticated && (
        <div className="mt-12 bg-soft-blush p-8 rounded-lg text-center">
          <h3 className="text-2xl font-heading mb-2">Unlock Unlimited Try-Ons</h3>
          <p className="mb-4">Sign up or log in to start generating your styles.</p>
          <Button onClick={() => router.push('/auth')} variant="secondary">
            Login / Sign Up
          </Button>
        </div>
      )}
    </div>
  );
}
