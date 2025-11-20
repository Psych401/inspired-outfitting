/**
 * Garment segmentation utilities
 * Segments clothing items based on user selection (top, bottom, full body, complete outfit)
 * Includes smart detection to avoid unnecessary cropping of single-garment images
 */

import { loadImage, imageToCanvas, canvasToDataUrl } from './imageProcessing';

export type GarmentType = 'top' | 'bottom' | 'fullBody' | 'completeOutfit';

export interface SegmentationDebugInfo {
  selectedGarmentType: GarmentType;
  aspectRatio: number;
  aspectRatioAnalysis: 'likelyTop' | 'likelyBottom' | 'likelyFullBody';
  edgeDensity: { topEdgeDensity: number; bottomEdgeDensity: number };
  detectionConfidence: number;
  isSingleGarment: boolean;
  detectedType?: 'top' | 'bottom' | 'fullBody';
  decision: 'using-full-image' | 'using-region-cropping';
  regionCoordinates?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  originalDimensions: { width: number; height: number };
  processedDimensions: { width: number; height: number };
  originalImageDataUrl?: string;
  segmentedImageDataUrl?: string;
}

export interface SegmentationResult {
  segmentedImageDataUrl: string;
  success: boolean;
  error?: string;
  debug?: SegmentationDebugInfo;
}

export interface SingleGarmentDetection {
  isSingleGarment: boolean;
  confidence: number;
  detectedType?: 'top' | 'bottom' | 'fullBody';
}

/**
 * Detect garment type by aspect ratio analysis
 * Tops are typically wider (horizontal), bottoms are typically taller (vertical)
 */
export const detectGarmentTypeByAspectRatio = (width: number, height: number): 'likelyTop' | 'likelyBottom' | 'likelyFullBody' => {
  const aspectRatio = width / height;
  
  // Tops are typically wider (aspect ratio > 1.2)
  if (aspectRatio > 1.2) {
    return 'likelyTop';
  }
  
  // Bottoms are typically taller (aspect ratio < 0.8)
  if (aspectRatio < 0.8) {
    return 'likelyBottom';
  }
  
  // Full body garments are typically more square or slightly vertical
  return 'likelyFullBody';
};

/**
 * Analyze edge density in top vs bottom halves of the image
 * Tops typically have more edges in the top half (sleeves, necklines)
 * Bottoms typically have more edges in the bottom half (leg openings, hems)
 */
export const analyzeEdgeDensity = (imageData: ImageData): { topEdgeDensity: number; bottomEdgeDensity: number } => {
  const { width, height, data } = imageData;
  const topHalfHeight = Math.floor(height / 2);
  const bottomHalfStart = topHalfHeight;
  
  let topEdges = 0;
  let bottomEdges = 0;
  let topPixels = 0;
  let bottomPixels = 0;
  
  // Simple edge detection using Sobel-like gradient calculation
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      const idxRight = (y * width + (x + 1)) * 4;
      const idxBottom = ((y + 1) * width + x) * 4;
      
      // Calculate gradient magnitude
      const rDiffX = Math.abs(data[idx] - data[idxRight]);
      const gDiffX = Math.abs(data[idx + 1] - data[idxRight + 1]);
      const bDiffX = Math.abs(data[idx + 2] - data[idxRight + 2]);
      
      const rDiffY = Math.abs(data[idx] - data[idxBottom]);
      const gDiffY = Math.abs(data[idx + 1] - data[idxBottom + 1]);
      const bDiffY = Math.abs(data[idx + 2] - data[idxBottom + 2]);
      
      const gradient = Math.sqrt(
        Math.pow(rDiffX + gDiffX + bDiffX, 2) +
        Math.pow(rDiffY + gDiffY + bDiffY, 2)
      );
      
      // Count as edge if gradient is above threshold
      if (gradient > 30) {
        if (y < topHalfHeight) {
          topEdges++;
        } else {
          bottomEdges++;
        }
      }
      
      // Count total pixels for density calculation
      if (y < topHalfHeight) {
        topPixels++;
      } else {
        bottomPixels++;
      }
    }
  }
  
  const topEdgeDensity = topPixels > 0 ? topEdges / topPixels : 0;
  const bottomEdgeDensity = bottomPixels > 0 ? bottomEdges / bottomPixels : 0;
  
  return { topEdgeDensity, bottomEdgeDensity };
};

/**
 * Combined smart detection to determine if image contains only the selected garment type
 * Uses aspect ratio and edge density analysis
 */
export const detectSingleGarment = async (
  imageDataUrl: string,
  userSelectedType: GarmentType
): Promise<SingleGarmentDetection> => {
  try {
    // Skip detection for fullBody and completeOutfit (always use full image)
    if (userSelectedType === 'fullBody' || userSelectedType === 'completeOutfit') {
      return {
        isSingleGarment: true,
        confidence: 1.0,
        detectedType: 'fullBody',
      };
    }
    
    const img = await loadImage(imageDataUrl);
    const canvas = imageToCanvas(img);
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Could not get canvas context');
    }
    
    const width = canvas.width;
    const height = canvas.height;
    
    // Aspect ratio analysis
    const aspectRatioType = detectGarmentTypeByAspectRatio(width, height);
    
    // Edge density analysis
    const imageData = ctx.getImageData(0, 0, width, height);
    const { topEdgeDensity, bottomEdgeDensity } = analyzeEdgeDensity(imageData);
    
    // Determine detected type based on edge density
    let detectedType: 'top' | 'bottom' | 'fullBody' | undefined;
    let confidence = 0;
    
    // If user selected "top"
    if (userSelectedType === 'top') {
      const aspectRatioMatch = aspectRatioType === 'likelyTop' ? 0.3 : 0;
      const edgeMatch = topEdgeDensity > bottomEdgeDensity ? 
        Math.min((topEdgeDensity - bottomEdgeDensity) * 2, 0.7) : 0;
      
      confidence = aspectRatioMatch + edgeMatch;
      
      if (confidence > 0.6) {
        detectedType = 'top';
      }
    }
    
    // If user selected "bottom"
    if (userSelectedType === 'bottom') {
      const aspectRatioMatch = aspectRatioType === 'likelyBottom' ? 0.3 : 0;
      const edgeMatch = bottomEdgeDensity > topEdgeDensity ? 
        Math.min((bottomEdgeDensity - topEdgeDensity) * 2, 0.7) : 0;
      
      confidence = aspectRatioMatch + edgeMatch;
      
      if (confidence > 0.6) {
        detectedType = 'bottom';
      }
    }
    
    const isSingleGarment = confidence > 0.6 && 
      ((userSelectedType === 'top' && detectedType === 'top') ||
       (userSelectedType === 'bottom' && detectedType === 'bottom'));
    
    return {
      isSingleGarment,
      confidence,
      detectedType,
    };
  } catch (error: any) {
    // On error, be conservative and return false (will use region cropping)
    return {
      isSingleGarment: false,
      confidence: 0,
    };
  }
};

/**
 * Segment garment based on user selection
 * For "top" and "bottom" types, always use the full image (single garments)
 * Only apply region cropping for special cases with full-body images
 */
export const segmentGarment = async (
  imageDataUrl: string,
  garmentType: GarmentType,
  includeDebug: boolean = false
): Promise<SegmentationResult> => {
  try {
    const img = await loadImage(imageDataUrl);
    const canvas = imageToCanvas(img);
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Could not get canvas context');
    }

    const width = canvas.width;
    const height = canvas.height;
    const aspectRatio = width / height;
    const aspectRatioAnalysis = detectGarmentTypeByAspectRatio(width, height);

    // Get edge density for debug
    const imageData = ctx.getImageData(0, 0, width, height);
    const edgeDensity = analyzeEdgeDensity(imageData);

    // For "top" and "bottom" types, ALWAYS use the full image
    // These are single garments and should not be cropped
    if (garmentType === 'top' || garmentType === 'bottom') {
      return {
        segmentedImageDataUrl: imageDataUrl,
        success: true,
        debug: includeDebug ? {
          selectedGarmentType: garmentType,
          aspectRatio: Math.round(aspectRatio * 100) / 100,
          aspectRatioAnalysis,
          edgeDensity: {
            topEdgeDensity: Math.round(edgeDensity.topEdgeDensity * 1000) / 1000,
            bottomEdgeDensity: Math.round(edgeDensity.bottomEdgeDensity * 1000) / 1000,
          },
          detectionConfidence: 1.0,
          isSingleGarment: true,
          detectedType: garmentType === 'top' ? 'top' : 'bottom',
          decision: 'using-full-image',
          originalDimensions: { width, height },
          processedDimensions: { width, height },
          originalImageDataUrl: includeDebug ? imageDataUrl : undefined,
          segmentedImageDataUrl: imageDataUrl,
        } : undefined,
      };
    }

    // For "fullBody" and "completeOutfit", also use full image (no cropping needed)
    if (garmentType === 'fullBody' || garmentType === 'completeOutfit') {
      return {
        segmentedImageDataUrl: imageDataUrl,
        success: true,
        debug: includeDebug ? {
          selectedGarmentType: garmentType,
          aspectRatio: Math.round(aspectRatio * 100) / 100,
          aspectRatioAnalysis,
          edgeDensity: {
            topEdgeDensity: Math.round(edgeDensity.topEdgeDensity * 1000) / 1000,
            bottomEdgeDensity: Math.round(edgeDensity.bottomEdgeDensity * 1000) / 1000,
          },
          detectionConfidence: 1.0,
          isSingleGarment: true,
          detectedType: 'fullBody',
          decision: 'using-full-image',
          originalDimensions: { width, height },
          processedDimensions: { width, height },
          originalImageDataUrl: includeDebug ? imageDataUrl : undefined,
          segmentedImageDataUrl: imageDataUrl,
        } : undefined,
      };
    }

    // Fallback: region-based cropping (should rarely be used now)
    // Create a new canvas for the segmented result
    const resultCanvas = document.createElement('canvas');
    resultCanvas.width = width;
    resultCanvas.height = height;
    const resultCtx = resultCanvas.getContext('2d');
    
    if (!resultCtx) {
      throw new Error('Could not get result canvas context');
    }

    // Clear the result canvas with transparent background
    resultCtx.clearRect(0, 0, width, height);

    // Define segmentation regions based on garment type
    let regionX = 0;
    let regionY = 0;
    let regionWidth = width;
    let regionHeight = height;

    switch (garmentType) {
      case 'top':
        // Top: upper portion of image (shoulders to waist)
        regionY = 0;
        regionHeight = height * 0.6; // Top 60% of image
        break;

      case 'bottom':
        // Bottom: lower portion of image (waist to feet)
        regionY = height * 0.4; // Start from 40% down
        regionHeight = height * 0.6; // Bottom 60% of image
        break;

      case 'fullBody':
        // Full body: entire image (dresses, jumpsuits)
        // No cropping needed
        break;

      case 'completeOutfit':
        // Complete outfit: entire image (top + bottom combination)
        // No cropping needed
        break;

      default:
        // Default: entire image
        break;
    }

    // Extract the region
    const regionImageData = ctx.getImageData(regionX, regionY, regionWidth, regionHeight);
    
    // Create a new canvas with just the segmented region
    const segmentedCanvas = document.createElement('canvas');
    segmentedCanvas.width = regionWidth;
    segmentedCanvas.height = regionHeight;
    const segmentedCtx = segmentedCanvas.getContext('2d');
    
    if (!segmentedCtx) {
      throw new Error('Could not get segmented canvas context');
    }

    segmentedCtx.putImageData(regionImageData, 0, 0);

    // Convert to data URL
    const resultDataUrl = canvasToDataUrl(segmentedCanvas, 'image/png');

    return {
      segmentedImageDataUrl: resultDataUrl,
      success: true,
      debug: includeDebug ? {
        selectedGarmentType: garmentType,
        aspectRatio: Math.round(aspectRatio * 100) / 100,
        aspectRatioAnalysis,
        edgeDensity: {
          topEdgeDensity: Math.round(edgeDensity.topEdgeDensity * 1000) / 1000,
          bottomEdgeDensity: Math.round(edgeDensity.bottomEdgeDensity * 1000) / 1000,
        },
        detectionConfidence: 0,
        isSingleGarment: false,
        detectedType: undefined,
        decision: 'using-region-cropping',
        regionCoordinates: {
          x: regionX,
          y: regionY,
          width: regionWidth,
          height: regionHeight,
        },
        originalDimensions: { width, height },
        processedDimensions: { width: regionWidth, height: regionHeight },
        originalImageDataUrl: includeDebug ? imageDataUrl : undefined,
        segmentedImageDataUrl: resultDataUrl,
      } : undefined,
    };
  } catch (error: any) {
    return {
      segmentedImageDataUrl: '',
      success: false,
      error: error.message || 'Segmentation failed',
    };
  }
};

/**
 * Advanced segmentation using edge detection and region analysis
 * This is a more sophisticated approach that tries to identify garment boundaries
 */
export const segmentGarmentAdvanced = async (
  imageDataUrl: string,
  garmentType: GarmentType
): Promise<SegmentationResult> => {
  try {
    const img = await loadImage(imageDataUrl);
    const canvas = imageToCanvas(img);
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Could not get canvas context');
    }

    const width = canvas.width;
    const height = canvas.height;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Create mask based on garment type
    const mask = new Uint8Array(width * height);

    // Define vertical regions
    const topRegionEnd = Math.floor(height * 0.6); // Top 60%
    const bottomRegionStart = Math.floor(height * 0.4); // Bottom 60%

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        let shouldInclude = false;

        switch (garmentType) {
          case 'top':
            shouldInclude = y < topRegionEnd;
            break;
          case 'bottom':
            shouldInclude = y >= bottomRegionStart;
            break;
          case 'fullBody':
          case 'completeOutfit':
            shouldInclude = true;
            break;
        }

        mask[index] = shouldInclude ? 255 : 0;
      }
    }

    // Apply mask to image
    const resultCanvas = document.createElement('canvas');
    resultCanvas.width = width;
    resultCanvas.height = height;
    const resultCtx = resultCanvas.getContext('2d');
    
    if (!resultCtx) {
      throw new Error('Could not get result canvas context');
    }

    // Draw original image
    resultCtx.drawImage(img, 0, 0);

    // Apply mask to make non-selected regions transparent
    const resultImageData = resultCtx.getImageData(0, 0, width, height);
    const resultData = resultImageData.data;

    for (let i = 0; i < mask.length; i++) {
      if (mask[i] === 0) {
        resultData[i * 4 + 3] = 0; // Set alpha to 0 (transparent)
      }
    }

    resultCtx.putImageData(resultImageData, 0, 0);

    const resultDataUrl = canvasToDataUrl(resultCanvas, 'image/png');

    return {
      segmentedImageDataUrl: resultDataUrl,
      success: true,
    };
  } catch (error: any) {
    return {
      segmentedImageDataUrl: '',
      success: false,
      error: error.message || 'Advanced segmentation failed',
    };
  }
};

/**
 * Get the appropriate segmentation function based on garment type
 */
export const getSegmentedGarment = async (
  imageDataUrl: string,
  garmentType: GarmentType,
  useAdvanced: boolean = false,
  includeDebug: boolean = false
): Promise<SegmentationResult> => {
  if (useAdvanced) {
    // Advanced segmentation doesn't support debug yet, fall back to regular
    return await segmentGarment(imageDataUrl, garmentType, includeDebug);
  }
  return await segmentGarment(imageDataUrl, garmentType, includeDebug);
};

