/**
 * Background removal service using Replicate API
 * Falls back to client-side removal for reliability
 */

import { fileToDataUrl, loadImage, imageToCanvas, canvasToDataUrl } from './imageProcessing';

export interface BackgroundRemovalDebugInfo {
  method: 'replicate' | 'client-side';
  processingTimeMs: number;
  originalDimensions: { width: number; height: number };
  processedDimensions: { width: number; height: number };
  originalImageDataUrl?: string;
  processedImageDataUrl?: string;
  warnings?: string[];
}

export interface BackgroundRemovalResult {
  imageDataUrl: string;
  success: boolean;
  error?: string;
  debug?: BackgroundRemovalDebugInfo;
}

/**
 * Remove background using Replicate API via server-side route
 * Requires API token in REPLICATE_API_TOKEN (server-side)
 */
const removeBackgroundWithReplicate = async (
  imageFile: File,
  includeDebug: boolean = false
): Promise<BackgroundRemovalResult> => {
  const startTime = performance.now();
  let originalImageDataUrl: string | undefined;
  
  try {
    if (includeDebug) {
      originalImageDataUrl = await fileToDataUrl(imageFile);
    }

    const formData = new FormData();
    formData.append('image', imageFile);

    const response = await fetch('/api/remove-background', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `API error: ${response.status}`);
    }

    const blob = await response.blob();
    
    // CRITICAL: Verify the blob is PNG format (required for transparency)
    let dataUrl: string;
    let imgForDimensions: HTMLImageElement;
    
    if (blob.type !== 'image/png') {
      console.warn('⚠️ Background removal returned non-PNG format:', blob.type, '- Converting to PNG');
      // Convert to PNG via canvas to ensure transparency is preserved
      const blobUrl = URL.createObjectURL(blob);
      const img = await loadImage(blobUrl);
      const canvas = imageToCanvas(img);
      dataUrl = canvasToDataUrl(canvas, 'image/png');
      URL.revokeObjectURL(blobUrl);
      imgForDimensions = img; // Reuse loaded image
      console.log('✅ Converted to PNG format with transparency preserved');
    } else {
      // Use blob URL for PNG files (transparency preserved)
      dataUrl = URL.createObjectURL(blob);
      imgForDimensions = await loadImage(dataUrl);
    }
    
    const processingTime = performance.now() - startTime;

    // Get dimensions from the processed image
    const img = imgForDimensions;
    const processedDimensions = { width: img.width, height: img.height };
    const originalDimensions = { width: imageFile.size > 0 ? 0 : 0, height: 0 };
    
    // Get original dimensions
    if (includeDebug && originalImageDataUrl) {
      const originalImg = await loadImage(originalImageDataUrl);
      originalDimensions.width = originalImg.width;
      originalDimensions.height = originalImg.height;
    }

    return {
      imageDataUrl: dataUrl,
      success: true,
      debug: includeDebug ? {
        method: 'replicate',
        processingTimeMs: Math.round(processingTime * 100) / 100,
        originalDimensions,
        processedDimensions,
        originalImageDataUrl,
        processedImageDataUrl: dataUrl,
      } : undefined,
    };
  } catch (error: any) {
    return {
      imageDataUrl: '',
      success: false,
      error: error.message || 'Replicate API failed',
      debug: includeDebug ? {
        method: 'replicate',
        processingTimeMs: Math.round((performance.now() - startTime) * 100) / 100,
        originalDimensions: { width: 0, height: 0 },
        processedDimensions: { width: 0, height: 0 },
        originalImageDataUrl,
        warnings: [error.message || 'Replicate API failed'],
      } : undefined,
    };
  }
};

/**
 * Simple client-side background removal using canvas (fallback)
 * This is a basic implementation that works best with simple backgrounds
 */
const removeBackgroundClientSide = async (
  imageFile: File,
  includeDebug: boolean = false
): Promise<BackgroundRemovalResult> => {
  const startTime = performance.now();
  let originalImageDataUrl: string | undefined;
  
  try {
    const imageUrl = URL.createObjectURL(imageFile);
    const img = await loadImage(imageUrl);
    
    if (includeDebug) {
      originalImageDataUrl = imageUrl;
    }
    
    const canvas = imageToCanvas(img);
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Could not get canvas context');
    }

    const originalDimensions = { width: img.width, height: img.height };
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Simple background removal: remove pixels that are close to white/light colors
    // This is a basic implementation - for better results, use an API
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const brightness = (r + g + b) / 3;
      
      // If pixel is very light (likely background), make it transparent
      if (brightness > 240) {
        data[i + 3] = 0; // Set alpha to 0 (transparent)
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const resultDataUrl = canvasToDataUrl(canvas, 'image/png');
    const processingTime = performance.now() - startTime;
    
    if (!includeDebug) {
      URL.revokeObjectURL(imageUrl);
    }

    return {
      imageDataUrl: resultDataUrl,
      success: true,
      debug: includeDebug ? {
        method: 'client-side',
        processingTimeMs: Math.round(processingTime * 100) / 100,
        originalDimensions,
        processedDimensions: originalDimensions,
        originalImageDataUrl,
        processedImageDataUrl: resultDataUrl,
        warnings: ['Using basic client-side removal. For better results, configure REPLICATE_API_TOKEN.'],
      } : undefined,
    };
  } catch (error: any) {
    return {
      imageDataUrl: '',
      success: false,
      error: error.message || 'Client-side removal failed',
      debug: includeDebug ? {
        method: 'client-side',
        processingTimeMs: Math.round((performance.now() - startTime) * 100) / 100,
        originalDimensions: { width: 0, height: 0 },
        processedDimensions: { width: 0, height: 0 },
        originalImageDataUrl,
        warnings: [error.message || 'Client-side removal failed'],
      } : undefined,
    };
  }
};

/**
 * Remove background from an image
 * Tries Replicate API first (via server route), falls back to client-side removal
 */
export const removeBackground = async (
  imageFile: File,
  includeDebug: boolean = false
): Promise<BackgroundRemovalResult> => {
  // Try Replicate API first (server will check for API token)
  const replicateResult = await removeBackgroundWithReplicate(imageFile, includeDebug);
  if (replicateResult.success) {
    return replicateResult;
  }
  
  // If Replicate fails, log warning and continue to fallback
  console.warn('Replicate background removal failed, using client-side fallback:', replicateResult.error);

  // Fallback to client-side removal (basic, but free and always available)
  const fallbackResult = await removeBackgroundClientSide(imageFile, includeDebug);
  
  // Merge debug info if both attempts were made
  if (includeDebug && replicateResult.debug && fallbackResult.debug) {
    fallbackResult.debug.warnings = [
      ...(replicateResult.debug.warnings || []),
      `Replicate failed: ${replicateResult.error}`,
      ...(fallbackResult.debug.warnings || []),
    ];
  }
  
  return fallbackResult;
};

