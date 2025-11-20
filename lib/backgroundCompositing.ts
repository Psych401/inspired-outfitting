/**
 * Client-side background compositing utilities
 * Composites AI-generated images over selected backgrounds
 */

import { loadImage, imageToCanvas, canvasToDataUrl, canvasToFile, dataUrlToFile } from './imageProcessing';
import { removeBackground } from './backgroundRemoval';

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
 * Composite an image (with transparent background) over a selected background
 * If the image has a solid background, attempts to remove it first
 */
export const compositeImageWithBackground = async (
  imageDataUrl: string,
  backgroundType: BackgroundType = 'white'
): Promise<BackgroundCompositingResult> => {
  try {
    // Load the foreground image (AI result should have transparent background)
    let foregroundImg = await loadImage(imageDataUrl);
    let foregroundWidth = foregroundImg.width;
    let foregroundHeight = foregroundImg.height;
    
    // Check if image has transparency by examining alpha channel
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = foregroundWidth;
    tempCanvas.height = foregroundHeight;
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx) {
      tempCtx.drawImage(foregroundImg, 0, 0);
      const imageData = tempCtx.getImageData(0, 0, foregroundWidth, foregroundHeight);
      const data = imageData.data;
      
      // Check if image has any transparency (alpha < 255)
      let hasTransparency = false;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 255) {
          hasTransparency = true;
          break;
        }
      }
      
      // If no transparency detected, use the existing background removal service
      // This is specifically designed for Gemini outputs with plain white backgrounds
      if (!hasTransparency) {
        console.log('🔄 Removing white background from Gemini output using background removal service...');
        
        try {
          // Convert the image data URL to a File object for the background removal service
          const imageFile = await dataUrlToFile(imageDataUrl, 'gemini-output.png');
          
          // Use the same background removal service we use for preprocessing
          // This handles white/light backgrounds effectively with Replicate API or client-side fallback
          const bgRemovalResult = await removeBackground(imageFile, false);
          
          if (bgRemovalResult.success && bgRemovalResult.imageDataUrl) {
            // Load the background-removed image
            foregroundImg = await loadImage(bgRemovalResult.imageDataUrl);
            foregroundWidth = foregroundImg.width;
            foregroundHeight = foregroundImg.height;
            console.log('✅ White background removed from Gemini output using background removal service');
          } else {
            console.warn('⚠️ Background removal service failed, using original image:', bgRemovalResult.error);
            // Continue with original image if removal fails
          }
        } catch (error: any) {
          console.warn('⚠️ Background removal service error, using original image:', error.message);
          // Continue with original image if removal fails
        }
      }
    }

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

