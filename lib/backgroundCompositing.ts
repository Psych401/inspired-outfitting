/**
 * Client-side background compositing utilities
 * Composites AI-generated images over selected backgrounds
 */

import { loadImage, canvasToDataUrl, canvasToFile } from './imageProcessing';

export type BackgroundType = 'white' | 'studio' | 'fitting-room';

export interface BackgroundCompositingResult {
  compositedImageDataUrl: string;
  compositedImageFile: File;
  success: boolean;
  error?: string;
}

/**
 * Load a background image from the public folder
 */
const loadBackgroundImage = async (backgroundType: BackgroundType): Promise<HTMLImageElement | null> => {
  try {
    if (backgroundType === 'white') {
      // Create a white canvas instead of loading an image
      return null;
    }

    const imagePath = `/backgrounds/${backgroundType}.jpg`;
    const img = await loadImage(imagePath);
    return img;
  } catch (error) {
    console.warn(`Failed to load background image for ${backgroundType}, falling back to white:`, error);
    return null;
  }
};

/**
 * Create a white background canvas
 */
const createWhiteBackground = (width: number, height: number): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');
  
  // Fill with white
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  
  return canvas;
};

/**
 * Composite a try-on result image over a selected background.
 * Does not call /api/remove-background or any BG-removal service — opaque results are drawn as-is.
 */
export const compositeImageWithBackground = async (
  imageDataUrl: string,
  backgroundType: BackgroundType = 'white'
): Promise<BackgroundCompositingResult> => {
  try {
    console.log('[compositing] try_on_result_overlay', {
      direct_vton_without_preprocessing: true,
      background_removal_active: false,
      backgroundType,
      note: 'No remove-background API; foreground drawn directly on background',
    });

    const foregroundImg = await loadImage(imageDataUrl);
    const foregroundWidth = foregroundImg.width;
    const foregroundHeight = foregroundImg.height;

    // Determine canvas dimensions
    // Use foreground dimensions, or scale background to match if needed
    let canvasWidth = foregroundWidth;
    let canvasHeight = foregroundHeight;
    let backgroundImg: HTMLImageElement | null = null;

    // Load or create background
    if (backgroundType === 'white') {
      // White background - no image needed
    } else {
      backgroundImg = await loadBackgroundImage(backgroundType);
      if (backgroundImg) {
        // Scale background to match foreground aspect ratio while covering
        const bgAspect = backgroundImg.width / backgroundImg.height;
        const fgAspect = foregroundWidth / foregroundHeight;

        if (bgAspect > fgAspect) {
          // Background is wider - fit to height
          canvasHeight = foregroundHeight;
          canvasWidth = canvasHeight * bgAspect;
        } else {
          // Background is taller - fit to width
          canvasWidth = foregroundWidth;
          canvasHeight = canvasWidth / bgAspect;
        }
      }
    }

    // Create composite canvas
    const compositeCanvas = document.createElement('canvas');
    compositeCanvas.width = canvasWidth;
    compositeCanvas.height = canvasHeight;
    const ctx = compositeCanvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Could not get canvas context');
    }

    // Draw background
    if (backgroundType === 'white') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    } else if (backgroundImg) {
      // Draw background, centered and scaled to cover
      const scale = Math.max(
        canvasWidth / backgroundImg.width,
        canvasHeight / backgroundImg.height
      );
      const scaledWidth = backgroundImg.width * scale;
      const scaledHeight = backgroundImg.height * scale;
      const x = (canvasWidth - scaledWidth) / 2;
      const y = (canvasHeight - scaledHeight) / 2;
      
      ctx.drawImage(backgroundImg, x, y, scaledWidth, scaledHeight);
    } else {
      // Fallback to white if background failed to load
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    // Calculate position to center foreground image
    const foregroundX = (canvasWidth - foregroundWidth) / 2;
    const foregroundY = (canvasHeight - foregroundHeight) / 2;

    // Draw foreground image (with transparency preserved)
    ctx.drawImage(foregroundImg, foregroundX, foregroundY, foregroundWidth, foregroundHeight);

    // Convert to data URL and File
    const dataUrl = canvasToDataUrl(compositeCanvas, 'image/png');
    const file = await canvasToFile(compositeCanvas, `composited-${backgroundType}.png`, 'image/png');

    return {
      compositedImageDataUrl: dataUrl,
      compositedImageFile: file,
      success: true,
    };
  } catch (error: any) {
    return {
      compositedImageDataUrl: '',
      compositedImageFile: new File([], 'error.png'),
      success: false,
      error: error.message || 'Background compositing failed',
    };
  }
};

/**
 * Get background preview URL (for UI thumbnails)
 */
export const getBackgroundPreviewUrl = (backgroundType: BackgroundType): string => {
  if (backgroundType === 'white') {
    // Return a data URL for white background
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, 200, 200);
    }
    return canvas.toDataURL();
  }
  return `/backgrounds/${backgroundType}-thumb.jpg`;
};

