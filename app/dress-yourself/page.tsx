'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { useAuth } from '@/hooks/useAuth';
import Button from '@/components/Button';
import { UploadIcon, SparklesIcon, DownloadIcon } from '@/components/IconComponents';
import { useRouter } from 'next/navigation';
import PreviousOutfits from '@/components/PreviousOutfits';
import { preprocessImages, PreprocessingDebugInfo } from '@/lib/preprocessingPipeline';
import { GarmentType } from '@/lib/garmentSegmentation';
import { DebugPanel } from '@/components/DebugPanel';
import { compositeImageWithBackground, BackgroundType, getBackgroundPreviewUrl } from '@/lib/backgroundCompositing';
import { loadImage, imageToCanvas, canvasToDataUrl } from '@/lib/imageProcessing';
import Link from 'next/link';

/**
 * Convert a File to opaque JPEG base64 data
 * Fills transparent areas with white background for PNG files
 * Returns direct base64 data (no intermediate File objects or blob URLs)
 */
const convertFileToOpaqueJpegBase64 = async (file: File): Promise<{ base64: string; mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const result = reader.result as string;
        if (!result) {
          reject(new Error('FileReader returned no result'));
          return;
        }

        // Load the image
        const img = await loadImage(result);
        const canvas = imageToCanvas(img);
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // Create white background
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw the image on top (transparent areas will show white background)
        ctx.drawImage(img, 0, 0);

        // Convert canvas directly to JPEG base64 (no blob URLs, no intermediate Files)
        const jpegDataUrl = canvasToDataUrl(canvas, 'image/jpeg', 0.95);
        
        // Extract base64 data (remove data URL prefix)
        const base64Data = jpegDataUrl.includes(',') ? jpegDataUrl.split(',')[1] : jpegDataUrl;
        
        if (!base64Data || base64Data.length === 0) {
          reject(new Error('Base64 data is empty after JPEG conversion'));
          return;
        }

        resolve({
          base64: base64Data,
          mimeType: 'image/jpeg'
        });
      } catch (error: any) {
        reject(new Error(`Failed to convert file to opaque JPEG: ${error.message}`));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('FileReader error while reading file'));
    };
    
    reader.readAsDataURL(file);
  });
};

const fileToGenerativePart = async (file: File) => {
    return new Promise<{ inlineData: { data: string; mimeType: string } }>(async (resolve, reject) => {
      // Validate file
      if (!file || file.size === 0) {
        reject(new Error('File is empty or invalid'));
        return;
      }

      // Detect if file is PNG or preprocessed (background-removed)
      const isPngOrPreprocessed = file.type === 'image/png' || 
                                  file.name.includes('bg-removed') || 
                                  file.name.includes('processed');

      if (isPngOrPreprocessed) {
        // Convert PNG to opaque JPEG base64 directly
        try {
          console.log('🔄 Converting PNG/preprocessed file to opaque JPEG base64...', {
            fileName: file.name,
            fileType: file.type,
          });
          
          const jpegData = await convertFileToOpaqueJpegBase64(file);
          
          console.log('✅ File converted to opaque JPEG base64:', {
            fileName: file.name,
            originalType: file.type,
            newMimeType: jpegData.mimeType,
            base64Length: jpegData.base64.length,
          });

          resolve({
            inlineData: { 
              data: jpegData.base64, 
              mimeType: jpegData.mimeType 
            },
          });
        } catch (error: any) {
          reject(new Error(`Failed to convert PNG to JPEG: ${error.message}`));
        }
      } else {
        // For non-PNG files, use standard conversion
        const reader = new FileReader();
        reader.onloadend = () => {
          try {
            const result = reader.result as string;
            if (!result) {
              reject(new Error('FileReader returned no result'));
              return;
            }

            // Extract base64 data (remove data URL prefix)
            const base64Data = result.includes(',') ? result.split(',')[1] : result;
            
            if (!base64Data || base64Data.length === 0) {
              reject(new Error('Base64 data is empty'));
              return;
            }

            // Use the file's actual mimeType
            let mimeType = file.type || 'image/jpeg';
            if (result.startsWith('data:')) {
              const mimeMatch = result.match(/data:([^;]+)/);
              if (mimeMatch) {
                mimeType = mimeMatch[1];
              }
            }

            console.log('📦 File converted (non-PNG):', {
              fileName: file.name,
              fileSize: file.size,
              mimeType,
              base64Length: base64Data.length,
            });

            resolve({
              inlineData: { 
                data: base64Data, 
                mimeType: mimeType || 'image/jpeg' 
              },
            });
          } catch (error: any) {
            reject(new Error(`Failed to process file: ${error.message}`));
          }
        };
        
        reader.onerror = () => {
          reject(new Error('FileReader error while reading file'));
        };
        
        reader.readAsDataURL(file);
      }
    });
};

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
    selection: { top: boolean; bottom: boolean; fullBody: boolean };
    onSelectType: (type: 'top' | 'bottom' | 'fullBody') => void;
}> = ({ selection, onSelectType }) => {
    const types = [
        { id: 'top', label: 'Top' },
        { id: 'bottom', label: 'Bottom' },
        { id: 'fullBody', label: 'Full Body' },
    ] as const;

    return (
        <div className="w-full">
            <h3 className="text-2xl font-heading font-semibold mb-2">3. Select Garment Type(s)</h3>
            <p className="text-charcoal-grey/70 mb-4">Help our AI understand what to replace. Select 'Top' and/or 'Bottom', or 'Full Body'.</p>
            <div className="grid grid-cols-3 gap-4">
                {types.map(({ id, label }) => (
                    <button
                        key={id}
                        onClick={() => onSelectType(id)}
                        className={`p-4 rounded-lg border-2 font-medium text-center transition-all duration-200 ${
                            selection[id]
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


export default function DressYourselfPage() {
  const router = useRouter();
  const { 
    isAuthenticated, 
    user, 
    addHistoryItem, 
    imagesToRegenerate, 
    clearRegenerate, 
    uploadedOutfitImages,
    addUploadedOutfitImage,
    deleteUploadedOutfitImage,
    favoriteOutfitImages,
    toggleFavoriteOutfit
  } = useAuth();
  const [personImage, setPersonImage] = useState<File | null>(null);
  const [outfitImage, setOutfitImage] = useState<File | null>(null);
  const [personPreview, setPersonPreview] = useState<string | null>(null);
  const [outfitPreview, setOutfitPreview] = useState<string | null>(null);
  const [personImageBase64, setPersonImageBase64] = useState<string | null>(null);
  const [outfitImageBase64, setOutfitImageBase64] = useState<string | null>(null);
  const [garmentSelection, setGarmentSelection] = useState({
    top: false,
    bottom: false,
    fullBody: false,
  });
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPreprocessing, setIsPreprocessing] = useState(false);
  const [preprocessingProgress, setPreprocessingProgress] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [debugInfo, setDebugInfo] = useState<PreprocessingDebugInfo | null>(null);
  const [isDebugPanelOpen, setIsDebugPanelOpen] = useState(false);
  const [selectedBackground, setSelectedBackground] = useState<BackgroundType>('white');
  const [compositedImage, setCompositedImage] = useState<string | null>(null);
  
  // Check if debug mode is enabled
  const isDebugMode = typeof window !== 'undefined' 
    ? (process.env.NEXT_PUBLIC_DEBUG_PREPROCESSING === 'true' || 
       localStorage.getItem('debug_preprocessing') === 'true')
    : process.env.NEXT_PUBLIC_DEBUG_PREPROCESSING === 'true';

  // Log debug mode status
  useEffect(() => {
    if (isDebugMode) {
      console.log('🔍 Debug mode is ENABLED');
      console.log('Environment variable:', process.env.NEXT_PUBLIC_DEBUG_PREPROCESSING);
    } else {
      console.log('Debug mode is DISABLED');
      console.log('Environment variable:', process.env.NEXT_PUBLIC_DEBUG_PREPROCESSING);
    }
  }, [isDebugMode]);

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
  };

  const handleOutfitImageSelect = async (file: File) => {
    setOutfitImage(file);
    setOutfitPreview(URL.createObjectURL(file));
    const base64 = await fileToBase64(file);
    setOutfitImageBase64(base64);
    addUploadedOutfitImage(base64);
    setGarmentSelection({ top: false, bottom: false, fullBody: false });
  };

  const handleSelectPreviousOutfit = async (imageBase64: string) => {
    setOutfitPreview(imageBase64);
    setOutfitImageBase64(imageBase64);
    const outfitFile = await dataUrlToFile(imageBase64, 'previous-outfit.png');
    setOutfitImage(outfitFile);
    setGarmentSelection({ top: false, bottom: false, fullBody: false });
  };
  
  const handleGarmentSelect = (type: 'top' | 'bottom' | 'fullBody') => {
    setGarmentSelection(prev => {
        if (type === 'fullBody') {
            const isBecomingActive = !prev.fullBody;
            return {
                top: false,
                bottom: false,
                fullBody: isBecomingActive,
            };
        }
        // for top or bottom
        return {
            ...prev,
            [type]: !prev[type],
            fullBody: false,
        };
    });
  };
  
  const handleGenerate = useCallback(async () => {
    if (!personImage || !outfitImage) {
      setError('Please upload both a person and an outfit image.');
      return;
    }
    
    const isGarmentSelected = garmentSelection.top || garmentSelection.bottom || garmentSelection.fullBody;
    if (!isGarmentSelected) {
        setError('Please select the garment type.');
        return;
    }

    if (!isAuthenticated || user?.subscription === 'Free') {
        setError('Please subscribe to generate unlimited try-ons.');
        setTimeout(()=>router.push('/pricing'), 2000);
        return;
    }

    setIsLoading(true);
    setIsPreprocessing(true);
    setError(null);
    setGeneratedImage(null);
    setIsSaved(false);
    setPreprocessingProgress('Starting preprocessing...');

    try {
      // Determine garment type from selection
      let garmentType: GarmentType = 'completeOutfit';
      if (garmentSelection.fullBody) {
        garmentType = 'fullBody';
      } else if (garmentSelection.top && garmentSelection.bottom) {
        garmentType = 'completeOutfit';
      } else if (garmentSelection.top) {
        garmentType = 'top';
      } else if (garmentSelection.bottom) {
        garmentType = 'bottom';
      }

      // Step 1: Preprocess images (background removal + segmentation)
      setPreprocessingProgress('Removing backgrounds from images...');
      const preprocessingResult = await preprocessImages(
        personImage,
        outfitImage,
        {
          removePersonBackground: true,
          removeGarmentBackground: true,
          segmentGarment: true,
          garmentType,
          useAdvancedSegmentation: false, // Set to true for better results (slower)
          includeDebug: isDebugMode,
        }
      );

      // Store debug info if available
      if (isDebugMode && preprocessingResult.debug) {
        setDebugInfo(preprocessingResult.debug);
        console.log('✅ Preprocessing Debug Info stored:', preprocessingResult.debug);
        console.log('🔍 Debug info state updated, button should appear');
      } else {
        console.log('⚠️ Debug mode:', isDebugMode, 'Debug result:', !!preprocessingResult.debug);
      }

      if (!preprocessingResult.success) {
        throw new Error(preprocessingResult.error || 'Preprocessing failed');
      }

      // Verify that preprocessing actually succeeded for critical steps
      // If background removal failed, we should not proceed with original images
      if (!preprocessingResult.steps.personBackgroundRemoved) {
        const errorMsg = 'Person background removal failed. Cannot proceed with original image. Please try again.';
        console.error('❌', errorMsg);
        throw new Error(errorMsg);
      }
      if (!preprocessingResult.steps.garmentBackgroundRemoved) {
        const errorMsg = 'Garment background removal failed. Cannot proceed with original image. Please try again.';
        console.error('❌', errorMsg);
        throw new Error(errorMsg);
      }
      
      console.log('✅ All preprocessing steps completed successfully');

      setPreprocessingProgress('Preprocessing complete. Generating try-on...');

      // Step 2: Generate try-on with preprocessed images
      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      
      // Validate API key
      if (!apiKey) {
        throw new Error("API key not found. Please set NEXT_PUBLIC_GEMINI_API_KEY in your .env.local file.");
      }
      
      if (apiKey.length < 20) {
        throw new Error("API key appears to be invalid (too short). Please check your NEXT_PUBLIC_GEMINI_API_KEY.");
      }
      
      console.log('🔑 API Key validation:', {
        exists: !!apiKey,
        length: apiKey.length,
        startsWith: apiKey.substring(0, 10) + '...',
      });

      // Verify preprocessed images are valid and check preprocessing steps
      console.log('🔍 Verifying preprocessed images...');
      console.log('📊 Preprocessing steps completed:', {
        personBackgroundRemoved: preprocessingResult.steps.personBackgroundRemoved,
        garmentBackgroundRemoved: preprocessingResult.steps.garmentBackgroundRemoved,
        garmentSegmented: preprocessingResult.steps.garmentSegmented,
      });
      
      if (!preprocessingResult.steps.personBackgroundRemoved) {
        console.error('❌ CRITICAL: Person background was NOT removed! Using original image with background.');
      }
      if (!preprocessingResult.steps.garmentBackgroundRemoved) {
        console.error('❌ CRITICAL: Garment background was NOT removed! Using original image with background.');
      }
      
      console.log('Person image:', {
        name: preprocessingResult.processedPersonImage.name,
        size: preprocessingResult.processedPersonImage.size,
        type: preprocessingResult.processedPersonImage.type,
        isPreprocessed: preprocessingResult.steps.personBackgroundRemoved,
      });
      console.log('Garment image:', {
        name: preprocessingResult.processedGarmentImage.name,
        size: preprocessingResult.processedGarmentImage.size,
        type: preprocessingResult.processedGarmentImage.type,
        isPreprocessed: preprocessingResult.steps.garmentBackgroundRemoved,
      });

      // CRITICAL: Ensure we ONLY use preprocessed images - NEVER originals
      // Verify preprocessing succeeded before proceeding
      if (!preprocessingResult.steps.personBackgroundRemoved || !preprocessingResult.steps.garmentBackgroundRemoved) {
        const missingSteps = [];
        if (!preprocessingResult.steps.personBackgroundRemoved) missingSteps.push('person background removal');
        if (!preprocessingResult.steps.garmentBackgroundRemoved) missingSteps.push('garment background removal');
        throw new Error(`Cannot proceed: Preprocessing failed for: ${missingSteps.join(', ')}. Original images cannot be sent to Gemini.`);
      }

      // FINAL VERIFICATION: Ensure we're using preprocessed files, not originals
      // This is a critical security check to prevent sending original images
      const isUsingPreprocessedFiles = 
        preprocessingResult.processedPersonImage !== personImage && 
        preprocessingResult.processedGarmentImage !== outfitImage;

      if (!isUsingPreprocessedFiles) {
        throw new Error('SECURITY ERROR: Attempting to send original images instead of preprocessed ones!');
      }

      console.log('🔒 SECURITY VERIFICATION: Using preprocessed files:', isUsingPreprocessedFiles);
      console.log('📤 VERIFIED: Using ONLY preprocessed images for Gemini:', {
        personImageName: preprocessingResult.processedPersonImage.name,
        garmentImageName: preprocessingResult.processedGarmentImage.name,
        personImageSize: preprocessingResult.processedPersonImage.size,
        garmentImageSize: preprocessingResult.processedGarmentImage.size,
        personImageType: preprocessingResult.processedPersonImage.type,
        garmentImageType: preprocessingResult.processedGarmentImage.type,
        personBackgroundRemoved: preprocessingResult.steps.personBackgroundRemoved,
        garmentBackgroundRemoved: preprocessingResult.steps.garmentBackgroundRemoved,
        personImageDataUrl: preprocessingResult.personImageDataUrl.substring(0, 30) + '...',
        garmentImageDataUrl: preprocessingResult.garmentImageDataUrl.substring(0, 30) + '...',
      });

      const ai = new GoogleGenAI({ apiKey });
      
      // Convert images to generative parts with error handling
      // CRITICAL: Use the ACTUAL preprocessed File objects from preprocessingResult
      // fileToGenerativePart will automatically convert PNG to opaque JPEG base64
      // No intermediate File objects or blob URLs - direct base64 conversion
      let personPart, outfitPart;
      try {
        // fileToGenerativePart handles PNG→JPEG conversion internally
        personPart = await fileToGenerativePart(preprocessingResult.processedPersonImage);
        console.log('✅ Person image converted to generative part');
        console.log('   ✓ Preprocessing verified: personBackgroundRemoved =', preprocessingResult.steps.personBackgroundRemoved);
        console.log('   ✓ File details:', {
          name: preprocessingResult.processedPersonImage.name,
          size: preprocessingResult.processedPersonImage.size,
          type: preprocessingResult.processedPersonImage.type,
          mimeType: personPart.inlineData?.mimeType
        });
      } catch (error: any) {
        console.error('❌ Failed to convert person image:', error);
        throw new Error(`Failed to process person image: ${error.message}`);
      }

      try {
        // fileToGenerativePart handles PNG→JPEG conversion internally
        outfitPart = await fileToGenerativePart(preprocessingResult.processedGarmentImage);
        console.log('✅ Garment image converted to generative part');
        console.log('   ✓ Preprocessing verified: garmentBackgroundRemoved =', preprocessingResult.steps.garmentBackgroundRemoved);
        console.log('   ✓ File details:', {
          name: preprocessingResult.processedGarmentImage.name,
          size: preprocessingResult.processedGarmentImage.size,
          type: preprocessingResult.processedGarmentImage.type,
          mimeType: outfitPart.inlineData?.mimeType
        });
      } catch (error: any) {
        console.error('❌ Failed to convert garment image:', error);
        throw new Error(`Failed to process garment image: ${error.message}`);
      }

      // Verify the parts have data
      if (!personPart.inlineData || !personPart.inlineData.data) {
        throw new Error('Person image data is invalid or empty');
      }
      if (!outfitPart.inlineData || !outfitPart.inlineData.data) {
        throw new Error('Garment image data is invalid or empty');
      }

      // CRITICAL: Verify both images are JPEG (conversion must have succeeded)
      if (personPart.inlineData.mimeType !== 'image/jpeg') {
        throw new Error(`Person image conversion to JPEG failed. Got mimeType: ${personPart.inlineData.mimeType}. Expected: image/jpeg`);
      }
      if (outfitPart.inlineData.mimeType !== 'image/jpeg') {
        throw new Error(`Garment image conversion to JPEG failed. Got mimeType: ${outfitPart.inlineData.mimeType}. Expected: image/jpeg`);
      }

      // CRITICAL: Verify we're sending the actual preprocessed images as JPEG
      // No blob URLs should be present - only base64 data
      console.log('🔍 FINAL VERIFICATION: Images being sent to Gemini (must be JPEG):', {
        personImageBase64Start: personPart.inlineData.data.substring(0, 50),
        garmentImageBase64Start: outfitPart.inlineData.data.substring(0, 50),
        personMimeType: personPart.inlineData.mimeType,
        garmentMimeType: outfitPart.inlineData.mimeType,
        personDataLength: personPart.inlineData.data.length,
        garmentDataLength: outfitPart.inlineData.data.length,
        personIsJpeg: personPart.inlineData.mimeType === 'image/jpeg',
        garmentIsJpeg: outfitPart.inlineData.mimeType === 'image/jpeg',
      });

      // Verify no blob URLs in the data (should be pure base64)
      if (personPart.inlineData.data.includes('blob:') || personPart.inlineData.data.startsWith('blob:')) {
        throw new Error('CRITICAL: Person image contains blob URL instead of base64 data. Conversion failed.');
      }
      if (outfitPart.inlineData.data.includes('blob:') || outfitPart.inlineData.data.startsWith('blob:')) {
        throw new Error('CRITICAL: Garment image contains blob URL instead of base64 data. Conversion failed.');
      }

      console.log('✅ Both images verified as JPEG and ready for API call');

      // Store images sent to Gemini in debug info (if debug mode is enabled)
      // Store the JPEG versions that are actually being sent (with white backgrounds)
      if (isDebugMode) {
        // Create data URLs from the JPEG parts for debug display
        const personJpegDataUrl = `data:${personPart.inlineData?.mimeType || 'image/jpeg'};base64,${personPart.inlineData?.data || ''}`;
        const garmentJpegDataUrl = `data:${outfitPart.inlineData?.mimeType || 'image/jpeg'};base64,${outfitPart.inlineData?.data || ''}`;
        
        setDebugInfo((prevDebugInfo) => {
          // Use existing debug info or create from preprocessing result
          const baseDebugInfo = prevDebugInfo || preprocessingResult.debug || {
            totalProcessingTimeMs: 0,
          };
          return {
            ...baseDebugInfo,
            imagesSentToGemini: {
              // Store the JPEG versions (with white backgrounds) that are actually sent
              personImageDataUrl: personJpegDataUrl,
              garmentImageDataUrl: garmentJpegDataUrl,
              // Also keep the original PNG versions for comparison
              personImagePngDataUrl: preprocessingResult.personImageDataUrl,
              garmentImagePngDataUrl: preprocessingResult.garmentImageDataUrl,
              // Store base64 previews for verification (first 100 chars)
              personImageBase64Preview: personPart.inlineData?.data?.substring(0, 100) || '',
              garmentImageBase64Preview: outfitPart.inlineData?.data?.substring(0, 100) || '',
            },
          };
        });
        console.log('📸 Stored images sent to Gemini in debug info (JPEG with white backgrounds)');
        console.log('   Person JPEG base64 preview:', personPart.inlineData?.data?.substring(0, 50) + '...');
        console.log('   Garment JPEG base64 preview:', outfitPart.inlineData?.data?.substring(0, 50) + '...');
      }

      const getSelectionString = () => {
        if (garmentSelection.fullBody) {
            return 'FULL BODY';
        }
        if (garmentSelection.top && garmentSelection.bottom) {
            return 'FULL-OUTFIT (top + bottom)';
        }
        if (garmentSelection.top) {
            return 'TOP';
        }
        if (garmentSelection.bottom) {
            return 'BOTTOM';
        }
        return ''; // Should not be reached
      };

      const selection = getSelectionString();

      const basePrompt = `
You are an expert AI photo editor for virtual try-on. 
You receive two PREPROCESSED images:

• IMAGE 1 = the person (isolated subject)
• IMAGE 2 = the selected garment segment (segmented based on user selection)

IMPORTANT: Both images have been preprocessed:
- Backgrounds have been removed from both images
- Image 2 contains ONLY the selected garment segment (${selection})
- The garment segment in Image 2 is already isolated and ready to be applied
- You do NOT need to detect or segment the garment - it's already done
- You do NOT need to remove backgrounds - they're already removed

====================================================
CRITICAL TASK REQUIREMENTS
====================================================

Your task is to COMPLETELY REPLACE the existing clothing with the new garment. The final image MUST look like the person changed clothes, NOT like clothes were layered on top.

CRITICAL REQUIREMENTS:
1. The new garment MUST completely occlude, erase, and replace the old clothing in the target area
2. The old clothing MUST be ENTIRELY invisible in the final result - no traces, textures, colors, or edges should remain
3. Where the new garment covers the old clothing, the old clothing MUST be completely removed and replaced
4. Where the new garment does NOT cover (e.g., exposed arms, legs below shorts), you MUST show natural skin - NOT remnants of the old clothing
5. The transition between the new garment and exposed skin MUST be clean and natural
6. The final image MUST look like the person is wearing ONLY the new garment, with no old clothing visible anywhere

FAILURE EXAMPLES TO AVOID:
❌ Jeans visible under shorts (legs below shorts must show skin, not denim)
❌ Long sleeves visible under short sleeves (arms must show skin, not sleeve fabric)
❌ Old shirt visible around edges of new shirt (old shirt must be completely erased)
❌ Any texture, color, or fabric pattern from old clothing showing through

====================================================
GARMENT TYPE: ${selection}
====================================================

Based on the preprocessed garment segment:

• If "TOP" is selected:  
  CRITICAL: The new top MUST completely replace the old top. The old top MUST be entirely invisible.
  
  - Image 2 contains ONLY the top/upper garment
  - Overlay it onto the person's upper body (shoulders → waist)
  - The new top MUST occlude and completely replace the existing upper garment
  - The old top MUST be completely erased - no fabric, texture, or color should remain visible
  - Where the new top doesn't cover (e.g., arms, neckline, exposed skin), you MUST show natural skin
  - EXAMPLE: If replacing a long-sleeve shirt with a t-shirt: t-shirt becomes the ONLY visible top, arms show natural skin, NO sleeve fabric should remain visible anywhere
  - Ignore any bottom clothing

• If "BOTTOM" is selected:  
  CRITICAL: The new bottom MUST completely replace the old bottom. The old bottom MUST be entirely invisible.
  
  - Image 2 contains ONLY the bottom/lower garment
  - Overlay it onto the person's lower body (waist → ankles)
  - The new bottom garment MUST occlude and completely replace the existing lower clothing
  - The old bottom MUST be completely erased - no fabric, texture, or color should remain visible
  - Where the new bottom doesn't cover (e.g., exposed waist, legs below shorts), you MUST show natural skin
  - EXAMPLE: If replacing jeans with shorts: shorts become the ONLY visible garment on lower body, legs below shorts MUST show natural skin, NO denim texture or color should remain visible anywhere - the jeans MUST be completely gone
  - Ignore any top clothing

• If "FULL-OUTFIT (top + bottom)" is selected:  
  CRITICAL: Both new garments MUST completely replace the old garments. The old top and bottom MUST be entirely invisible.
  
  - Image 2 contains both top and bottom garments
  - Overlay both garments onto the upper and lower body
  - Both new garments MUST occlude and completely replace the existing clothing
  - The old top and bottom MUST be completely erased - no fabric, texture, or color should remain visible
  - Where garments don't cover (e.g., exposed skin areas), you MUST show natural skin
  - The old top and bottom MUST be completely removed and not visible anywhere in the final image

• If "FULL BODY" is selected:  
  CRITICAL: The new full-body garment MUST completely replace all old clothing. The old clothing MUST be entirely invisible.
  
  - Image 2 contains a full-body garment (dress, jumpsuit, etc.)
  - Overlay it onto the entire body
  - The new full-body garment MUST occlude and completely replace all existing clothing
  - The old clothing MUST be completely erased - no fabric, texture, or color should remain visible
  - Where the garment doesn't cover (e.g., face, hands, exposed skin), you MUST show natural skin
  - EXAMPLE: If replacing a t-shirt and jeans with a dress: dress becomes the ONLY visible clothing, arms show natural skin, legs that the dress does not cover show natural skin, NO jean or t-shirt fabric should remain visible anywhere - the old clothing MUST be completely gone
  - The old clothing MUST be completely removed and not visible anywhere in the final image

====================================================
FITTING INSTRUCTIONS
====================================================

1. Analyze the person's body shape and pose in Image 1
2. Identify the exact placement area for the garment segment
3. CRITICAL: Overlay the preprocessed garment segment and COMPLETELY ERASE the old clothing in that area
4. The new garment MUST become the only visible layer - the old clothing underneath MUST be completely invisible
5. Blend seamlessly with:
   - Correct proportions matching the person's body
   - Natural draping and folds
   - Proper lighting and shadows matching Image 1
   - Clean transitions where the new garment replaces the old
6. Handle occlusions (arms, hair, accessories) realistically
7. Ensure the garment looks naturally worn, not pasted
8. CRITICAL: In areas not covered by the new garment, show natural skin - NOT remnants of old clothing

====================================================
QUALITY REQUIREMENTS
====================================================

CRITICAL QUALITY STANDARDS:
- Photorealistic result that looks natural
- NO traces of original clothing visible through or around the new garment
- NO visible seams, artifacts, or inconsistencies
- Proper lighting and shadow matching
- Realistic fabric texture and draping
- Natural fit that follows body contours
- The transition between garment and skin MUST be clean and natural
- The old clothing MUST be completely invisible - no texture, color, or fabric pattern should remain
- The final image MUST look like the person changed clothes, NOT layered clothes
- Natural skin appearance preserved in uncovered areas (NOT old clothing remnants)
- The final result MUST look like the person is wearing ONLY the new garment

VISUAL CHECKLIST:
✓ Old clothing completely erased in target area
✓ No old fabric visible under or around new garment
✓ Exposed skin areas show natural skin (not old clothing)
✓ Clean transitions between garment and skin
✓ Final image looks like a complete clothing change

====================================================
OUTPUT
====================================================

• 1 photorealistic edited image with the garment naturally integrated on the person
• (Optional) a binary replacement mask  
• (Optional) JSON summary: 
  { "garmentType": "${selection}", "fittingSucceeded": true/false }

CRITICAL: The final image MUST show the person wearing ONLY the new garment, with the old clothing completely removed and invisible. The result MUST look like a complete clothing change, not a layering of garments.
`;

      const prompt = basePrompt;

      // Log request details for debugging
      console.log('🔄 Sending request to Gemini API...');
      console.log('📤 Person image part:', {
        hasInlineData: !!personPart.inlineData,
        mimeType: personPart.inlineData?.mimeType,
        dataLength: personPart.inlineData?.data?.length || 0,
      });
      console.log('📤 Outfit image part:', {
        hasInlineData: !!outfitPart.inlineData,
        mimeType: outfitPart.inlineData?.mimeType,
        dataLength: outfitPart.inlineData?.data?.length || 0,
      });
      console.log('📤 Prompt length:', prompt.length);

      // Prepare request payload
      // Note: Model name may vary - try different variants if one fails
      const modelName = 'gemini-2.5-flash-image'; // or 'gemini-2.0-flash-exp', 'gemini-pro-vision', etc.
      
      // CRITICAL: Build request payload with ONLY preprocessed images
      // These MUST be the background-removed versions - NEVER original images
      const requestPayload = {
        model: modelName,
        contents: {
          parts: [
            personPart,  // MUST be preprocessed person image (background removed)
            outfitPart,  // MUST be preprocessed garment image (background removed)
            { text: prompt },
          ],
        },
        config: {
          responseModalities: [Modality.IMAGE],
        },
      };
      
      // Final verification: Ensure we're only sending 2 images (both preprocessed) + 1 text prompt
      // SECURITY CHECK: Verify no original images are being sent
      if (requestPayload.contents.parts.length !== 3) {
        throw new Error('SECURITY ERROR: Request payload must contain exactly 3 parts (2 preprocessed images + 1 prompt)');
      }
      
      console.log('🔒 SECURITY CHECK: Request payload verified:', {
        totalParts: requestPayload.contents.parts.length,
        imageParts: requestPayload.contents.parts.filter((p: any) => 'inlineData' in p).length,
        textParts: requestPayload.contents.parts.filter((p: any) => 'text' in p).length,
        personPartHasData: !!personPart.inlineData?.data,
        outfitPartHasData: !!outfitPart.inlineData?.data,
        verifiedPreprocessed: preprocessingResult.steps.personBackgroundRemoved && preprocessingResult.steps.garmentBackgroundRemoved,
        personImageSource: 'preprocessed (background-removed)',
        garmentImageSource: 'preprocessed (background-removed)',
      });
      
      // CRITICAL: Double-check that preprocessing succeeded
      if (!preprocessingResult.steps.personBackgroundRemoved || !preprocessingResult.steps.garmentBackgroundRemoved) {
        throw new Error('SECURITY ERROR: Cannot send request - preprocessing did not complete successfully. Original images would be sent.');
      }

      console.log('🤖 Using model:', modelName);

      console.log('📋 Request payload structure:', {
        model: requestPayload.model,
        partsCount: requestPayload.contents.parts.length,
        hasPersonPart: !!personPart.inlineData,
        hasOutfitPart: !!outfitPart.inlineData,
        hasPrompt: !!prompt,
        responseModalities: requestPayload.config.responseModalities,
      });

      // CRITICAL: Log the actual base64 data to verify we're not sending original images
      // Check first few characters of base64 to see if images match
      if (isDebugMode) {
        console.log('🔍 VERIFICATION: Checking image data being sent...');
        console.log('   Person image base64 preview:', personPart.inlineData?.data?.substring(0, 50) + '...');
        console.log('   Garment image base64 preview:', outfitPart.inlineData?.data?.substring(0, 50) + '...');
        console.log('   Person image mimeType:', personPart.inlineData?.mimeType);
        console.log('   Garment image mimeType:', outfitPart.inlineData?.mimeType);
        
        // Verify both images are JPEG (conversion must have succeeded)
        if (personPart.inlineData?.mimeType !== 'image/jpeg') {
          console.error('❌ ERROR: Person image mimeType is not JPEG:', personPart.inlineData?.mimeType);
        }
        if (outfitPart.inlineData?.mimeType !== 'image/jpeg') {
          console.error('❌ ERROR: Garment image mimeType is not JPEG:', outfitPart.inlineData?.mimeType);
        }
      }

      let response;
      try {
        response = await ai.models.generateContent(requestPayload);
      } catch (apiError: any) {
        console.error('❌ Gemini API call failed:', {
          error: apiError,
          message: apiError?.message,
          status: apiError?.status,
          statusText: apiError?.statusText,
          response: apiError?.response,
          stack: apiError?.stack,
        });

        // Check for specific error types
        if (apiError?.message?.includes('API key')) {
          throw new Error('Invalid API key. Please check your NEXT_PUBLIC_GEMINI_API_KEY in .env.local');
        }
        if (apiError?.message?.includes('quota') || apiError?.message?.includes('limit')) {
          throw new Error('API quota exceeded. Please check your Gemini API quota or try again later.');
        }
        if (apiError?.status === 401) {
          throw new Error('Authentication failed. Please verify your API key is correct.');
        }
        if (apiError?.status === 429) {
          throw new Error('Rate limit exceeded. Please wait a moment and try again.');
        }
        if (apiError?.status === 400) {
          throw new Error(`Invalid request: ${apiError?.message || 'Please check your input images and try again.'}`);
        }

        throw new Error(`API call failed: ${apiError?.message || 'Unknown error. Please check the console for details.'}`);
      }

      // Check if response is empty or invalid
      if (!response || typeof response !== 'object' || Object.keys(response).length === 0) {
        console.error('❌ Empty or invalid response received from Gemini API');
        throw new Error(
          'Received empty response from Gemini API. This could indicate:\n' +
          '1. API key is invalid or expired\n' +
          '2. API quota is exhausted\n' +
          '3. Network connectivity issue\n' +
          'Please check your API key and quota, then try again.'
        );
      }

      // Check for error in response
      if ((response as any).error) {
        const errorInfo = (response as any).error;
        console.error('❌ Error in API response:', errorInfo);
        throw new Error(
          `Gemini API returned an error: ${errorInfo.message || errorInfo.code || 'Unknown error'}. ` +
          `Please check your API key, quota, and try again.`
        );
      }

      // Log full response for debugging
      console.log('📥 Gemini API Response:', {
        hasCandidates: !!response.candidates,
        candidatesLength: response.candidates?.length || 0,
        firstCandidate: response.candidates?.[0] ? {
          hasContent: !!response.candidates[0].content,
          hasParts: !!response.candidates[0].content?.parts,
          partsLength: response.candidates[0].content?.parts?.length || 0,
          parts: response.candidates[0].content?.parts?.map((p: any) => ({
            hasInlineData: !!p.inlineData,
            hasText: !!p.text,
            mimeType: p.inlineData?.mimeType,
            dataLength: p.inlineData?.data?.length || 0,
          })),
        } : null,
        fullResponse: JSON.stringify(response, null, 2).substring(0, 1000), // First 1000 chars
      });

      // Multiple extraction methods for robustness
      let foundImage = false;
      let imageUrl: string | null = null;

      // Method 1: Check candidates[0].content.parts for inlineData
      if (response.candidates && response.candidates[0]) {
        const candidate = response.candidates[0];
        
        // Check for content.parts
        if (candidate.content?.parts) {
          console.log('🔍 Checking content.parts for image...');
          for (const part of candidate.content.parts) {
            if (part.inlineData && part.inlineData.data) {
              const base64ImageBytes: string = part.inlineData.data;
              imageUrl = `data:image/png;base64,${base64ImageBytes}`;
              console.log('✅ Found image in content.parts.inlineData');
              foundImage = true;
              break;
            }
          }
        }

        // Method 2: Check candidate directly for inlineData
        if (!foundImage && (candidate as any).inlineData) {
          console.log('🔍 Checking candidate.inlineData for image...');
          const inlineData = (candidate as any).inlineData;
          if (inlineData.data) {
            imageUrl = `data:image/png;base64,${inlineData.data}`;
            console.log('✅ Found image in candidate.inlineData');
            foundImage = true;
          }
        }

        // Method 3: Check for text response that might contain base64
        if (!foundImage && candidate.content?.parts) {
          console.log('🔍 Checking for text response with base64...');
          for (const part of candidate.content.parts) {
            if (part.text) {
              const text = part.text;
              // Look for base64 image data in text
              const base64Match = text.match(/data:image\/[^;]+;base64,([A-Za-z0-9+/=]+)/);
              if (base64Match) {
                imageUrl = base64Match[0];
                console.log('✅ Found image in text response');
                foundImage = true;
                break;
              }
            }
          }
        }
      }

      // Method 4: Check response directly for image data
      if (!foundImage && (response as any).inlineData) {
        console.log('🔍 Checking response.inlineData for image...');
        const inlineData = (response as any).inlineData;
        if (inlineData.data) {
          imageUrl = `data:image/png;base64,${inlineData.data}`;
          console.log('✅ Found image in response.inlineData');
          foundImage = true;
        }
      }

      if (!foundImage || !imageUrl) {
        // Log detailed error information
        const responseStr = JSON.stringify(response, null, 2);
        console.error('❌ No image found in response. Full response structure:', {
          responseType: typeof response,
          responseKeys: Object.keys(response || {}),
          candidates: response.candidates,
          candidatesLength: response.candidates?.length,
          error: (response as any).error,
          promptFeedback: (response as any).promptFeedback,
          usageMetadata: (response as any).usageMetadata,
          fullResponse: responseStr.substring(0, 2000), // First 2000 chars
        });

        // Check for specific error indicators
        const errorMessage = (response as any).error?.message || 
                            (response as any).promptFeedback?.blockReason ||
                            (response.candidates?.[0] as any)?.finishReason;

        if (errorMessage) {
          throw new Error(
            `No image was generated. API returned: ${errorMessage}. ` +
            `Please check your API key, quota, and try again.`
          );
        }

        if ((response.candidates?.[0] as any)?.finishReason === 'SAFETY') {
          throw new Error(
            'Image generation was blocked for safety reasons. Please try with different images or adjust your prompt.'
          );
        }

        if ((response.candidates?.[0] as any)?.finishReason === 'RECITATION') {
          throw new Error(
            'Image generation was blocked due to content policy. Please try with different images.'
          );
        }

        throw new Error(
          'No image was generated. The API response did not contain an image. ' +
          'Possible causes:\n' +
          '1. API quota exhausted - Check your Gemini API quota\n' +
          '2. Invalid API key - Verify NEXT_PUBLIC_GEMINI_API_KEY in .env.local\n' +
          '3. Model unavailable - The gemini-2.5-flash-image model may not be available\n' +
          '4. Request format issue - Check console for full response details\n\n' +
          'Full response logged to console for debugging.'
        );
      }

      // Set the generated image
      setGeneratedImage(imageUrl);
      console.log('✅ Image extracted successfully, length:', imageUrl.length);

      // Store image received from Gemini in debug info (if debug mode is enabled)
      if (isDebugMode) {
        setDebugInfo((prevDebugInfo) => {
          if (!prevDebugInfo) {
            // If no debug info exists, create a minimal one
            const newDebugInfo = preprocessingResult.debug || {
              totalProcessingTimeMs: 0,
            };
            newDebugInfo.imageReceivedFromGemini = imageUrl;
            return newDebugInfo;
          }
          // Update existing debug info
          return {
            ...prevDebugInfo,
            imageReceivedFromGemini: imageUrl,
          };
        });
        console.log('📸 Stored image received from Gemini in debug info');
      }
      
      // Composite with selected background
      console.log('🎨 Compositing with background:', selectedBackground);
      const compositeResult = await compositeImageWithBackground(imageUrl, selectedBackground);
      if (compositeResult.success) {
        setCompositedImage(compositeResult.compositedImageDataUrl);
        console.log('✅ Background compositing successful');
      } else {
        // Fallback to original if compositing fails
        console.warn('⚠️ Background compositing failed, using original:', compositeResult.error);
        setCompositedImage(imageUrl);
      }

      setIsPreprocessing(false);
      setPreprocessingProgress('');
    } catch (e: any) {
      setError(e.message || 'An error occurred while generating the image.');
      console.error(e);
      setIsPreprocessing(false);
      setPreprocessingProgress('');
    } finally {
      setIsLoading(false);
    }
  }, [personImage, outfitImage, isAuthenticated, user, router, garmentSelection, selectedBackground]);

  const handleSaveToHistory = useCallback(() => {
    const imageToSave = compositedImage || generatedImage;
    if (imageToSave && personImageBase64 && outfitImageBase64 && !isSaved) {
        addHistoryItem({
            personImg: personImageBase64,
            outfitImg: outfitImageBase64,
            resultImg: imageToSave,
        });
        setIsSaved(true);
    }
  }, [compositedImage, generatedImage, personImageBase64, outfitImageBase64, isSaved, addHistoryItem]);

  const handleDownload = useCallback(() => {
    const imageToDownload = compositedImage || generatedImage;
    if (imageToDownload) {
        const link = document.createElement('a');
        link.href = imageToDownload;
        link.download = `inspired-outfitting-try-on-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
  }, [compositedImage, generatedImage]);


  return (
    <div className="container mx-auto px-6 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-heading font-bold">Dress Yourself</h1>
        <p className="text-lg text-charcoal-grey/70 mt-2">Bring your fashion ideas to life.</p>
      </div>

      {/* Debug Toggle Button - Show after preprocessing completes */}
      {isDebugMode && debugInfo && !isLoading && (
        <div className="mb-6 flex justify-center">
          <button
            onClick={() => {
              console.log('🔍 Opening debug panel');
              setIsDebugPanelOpen(true);
            }}
            className="px-6 py-3 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg transition-colors text-sm font-semibold shadow-lg flex items-center gap-2"
          >
            🔍 View Debug Info
            {debugInfo.totalProcessingTimeMs && (
              <span className="text-xs opacity-90">
                ({debugInfo.totalProcessingTimeMs}ms)
              </span>
            )}
          </button>
        </div>
      )}

      {/* Debug Info Fallback - Always visible when debug mode is on */}
      {isDebugMode && debugInfo && !isDebugPanelOpen && (
        <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="font-semibold text-yellow-800">Debug Mode Active</p>
              <p className="text-sm text-yellow-700">
                Total processing: {debugInfo.totalProcessingTimeMs}ms | 
                Person BG: {debugInfo.personBackgroundRemoval ? '✅' : '❌'} | 
                Garment BG: {debugInfo.garmentBackgroundRemoval ? '✅' : '❌'} | 
                Segmentation: {debugInfo.garmentSegmentation ? '✅' : '❌'}
              </p>
            </div>
            <button
              onClick={() => setIsDebugPanelOpen(true)}
              className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded text-sm font-semibold"
            >
              Open Full Debug Panel
            </button>
          </div>
        </div>
      )}

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
              <GarmentTypeSelector selection={garmentSelection} onSelectType={handleGarmentSelect} />
            )}
          
          {/* Background Selector */}
          <div className="w-full">
            <h3 className="text-xl font-heading font-semibold mb-3">4. Choose Background</h3>
            <div className="grid grid-cols-3 gap-3">
              {(['white', 'studio', 'fitting-room'] as BackgroundType[]).map((bgType) => (
                <button
                  key={bgType}
                  onClick={() => setSelectedBackground(bgType)}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    selectedBackground === bgType
                      ? 'border-dusty-rose bg-dusty-rose/10 shadow-md'
                      : 'border-gray-200 hover:border-dusty-rose/50'
                  }`}
                >
                  <div className="w-full h-16 bg-gray-100 rounded mb-2 flex items-center justify-center overflow-hidden">
                    {bgType === 'white' ? (
                      <div className="w-full h-full bg-white border border-gray-200"></div>
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center text-gray-400 text-xs">
                        {bgType === 'studio' ? '📸 Studio' : '🪞 Fitting Room'}
                      </div>
                    )}
                  </div>
                  <p className="text-xs font-medium capitalize text-center">
                    {bgType === 'white' ? 'White' : bgType === 'studio' ? 'Studio Room' : 'Fitting Room'}
                  </p>
                </button>
              ))}
            </div>
          </div>
          
          <Button onClick={handleGenerate} disabled={isLoading || !personImage || !outfitImage || !(garmentSelection.top || garmentSelection.bottom || garmentSelection.fullBody)} className="w-full flex items-center justify-center gap-2">
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                {isPreprocessing ? 'Preprocessing...' : 'Generating...'}
              </>
            ) : (
                <>
                <SparklesIcon />
                Generate My Look
                </>
            )}
          </Button>
          {isPreprocessing && preprocessingProgress && (
            <p className="text-sm text-charcoal-grey/70 text-center mt-2">{preprocessingProgress}</p>
          )}
          {error && <p className="text-red-500 text-center mt-4">{error}</p>}
        </div>

        {/* Output Section */}
        <div className="bg-white p-8 rounded-lg shadow-lg h-full flex flex-col items-center justify-center min-h-[500px]">
          <h2 className="text-3xl font-heading font-semibold mb-4 text-center">Your AI Preview</h2>
          <div className="w-full aspect-w-3 aspect-h-4 bg-soft-blush/30 rounded-lg flex items-center justify-center">
            {isLoading ? (
                <div className="text-center text-dusty-rose">
                    {isPreprocessing ? (
                      <>
                        <div className="w-8 h-8 border-2 border-dusty-rose border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                        <p>Preprocessing images...</p>
                        <p className="text-sm mt-2">{preprocessingProgress || 'Removing backgrounds and segmenting garment...'}</p>
                      </>
                    ) : (
                      <>
                        <div className="w-8 h-8 border-2 border-dusty-rose border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                        <p>Creating your new look...</p>
                        <p className="text-sm mt-2">This may take a moment.</p>
                      </>
                    )}
                </div>
            ) : compositedImage || generatedImage ? (
                <img 
                  src={compositedImage || generatedImage || ''} 
                  alt="AI Generated Try-On" 
                  className="w-full h-full object-contain rounded-lg" 
                />
            ) : (
                <p className="text-charcoal-grey/60 text-center p-4">Your generated image will appear here.</p>
            )}
          </div>
           {(compositedImage || generatedImage) && (
            <div className="mt-4 space-y-3">
              {/* Background Change Option */}
              <div className="flex items-center gap-2 text-sm">
                <span className="text-charcoal-grey/70">Background:</span>
                <select
                  value={selectedBackground}
                  onChange={(e) => {
                    const newBg = e.target.value as BackgroundType;
                    setSelectedBackground(newBg);
                    if (generatedImage) {
                      compositeImageWithBackground(generatedImage, newBg).then(result => {
                        if (result.success) {
                          setCompositedImage(result.compositedImageDataUrl);
                        }
                      });
                    }
                  }}
                  className="px-3 py-1 border border-gray-300 rounded text-sm"
                >
                  <option value="white">White</option>
                  <option value="studio">Studio Room</option>
                  <option value="fitting-room">Fitting Room</option>
                </select>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full">
                <Button onClick={handleSaveToHistory} disabled={isSaved} variant="secondary" className="text-sm md:text-base py-2 px-2">
                    {isSaved ? 'Saved ✓' : 'Save'}
                </Button>
                 <Button onClick={handleDownload} variant="secondary" className="text-sm md:text-base py-2 px-2 flex items-center justify-center gap-2">
                    <DownloadIcon className="w-4 h-4" />
                    Download
                </Button>
                <Button onClick={handleGenerate} disabled={isLoading} className="text-sm md:text-base py-2 px-2">
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

      {/* Debug Panel */}
      {isDebugMode && debugInfo && (
        <DebugPanel
          debugInfo={debugInfo}
          isOpen={isDebugPanelOpen}
          onClose={() => setIsDebugPanelOpen(false)}
        />
      )}
    </div>
  );
}

