/**
 * Main preprocessing pipeline that combines background removal and garment segmentation
 */

import { removeBackground, BackgroundRemovalDebugInfo } from './backgroundRemoval';
import { getSegmentedGarment, GarmentType, SegmentationDebugInfo } from './garmentSegmentation';
import { dataUrlToFile, fileToDataUrl } from './imageProcessing';

export interface PreprocessingDebugInfo {
  personBackgroundRemoval?: BackgroundRemovalDebugInfo;
  garmentBackgroundRemoval?: BackgroundRemovalDebugInfo;
  garmentSegmentation?: SegmentationDebugInfo;
  totalProcessingTimeMs: number;
  // Original images (for comparison)
  originalPersonImageDataUrl?: string;
  originalGarmentImageDataUrl?: string;
  // Intermediate processed versions
  personImageAfterBackgroundRemoval?: string;
  garmentImageAfterBackgroundRemoval?: string;
  garmentImageAfterSegmentation?: string;
  // Final processed versions (what gets sent to Gemini)
  finalPersonImageDataUrl?: string;
  finalGarmentImageDataUrl?: string;
  // Gemini API images
  imagesSentToGemini?: {
    personImageDataUrl: string;
    garmentImageDataUrl: string;
    personImageBase64Preview?: string; // First 100 chars for verification
    garmentImageBase64Preview?: string; // First 100 chars for verification
  };
  imageReceivedFromGemini?: string;
}

export interface PreprocessingResult {
  processedPersonImage: File;
  processedGarmentImage: File;
  personImageDataUrl: string;
  garmentImageDataUrl: string;
  success: boolean;
  error?: string;
  steps: {
    personBackgroundRemoved: boolean;
    garmentBackgroundRemoved: boolean;
    garmentSegmented: boolean;
  };
  debug?: PreprocessingDebugInfo;
}

export interface PreprocessingOptions {
  removePersonBackground?: boolean;
  removeGarmentBackground?: boolean;
  segmentGarment?: boolean;
  garmentType?: GarmentType;
  useAdvancedSegmentation?: boolean;
  includeDebug?: boolean;
}

/**
 * Main preprocessing pipeline
 * Processes both person and garment images according to options
 */
export const preprocessImages = async (
  personImageFile: File,
  garmentImageFile: File,
  options: PreprocessingOptions = {}
): Promise<PreprocessingResult> => {
  const {
    removePersonBackground = true,
    removeGarmentBackground = true,
    segmentGarment = true,
    garmentType = 'completeOutfit',
    useAdvancedSegmentation = false,
    includeDebug = false,
  } = options;

  const startTime = performance.now();
  const steps = {
    personBackgroundRemoved: false,
    garmentBackgroundRemoved: false,
    garmentSegmented: false,
  };

  const debugInfo: PreprocessingDebugInfo = {
    totalProcessingTimeMs: 0,
  };

  try {
    let personImageDataUrl = await fileToDataUrl(personImageFile);
    let garmentImageDataUrl = await fileToDataUrl(garmentImageFile);

    // Store original images in debug info for comparison
    if (includeDebug) {
      debugInfo.originalPersonImageDataUrl = personImageDataUrl;
      debugInfo.originalGarmentImageDataUrl = garmentImageDataUrl;
      console.log('📸 Stored original images in debug info');
    }

    // Step 1: Remove background from person image
    if (removePersonBackground) {
      console.log('🔄 Removing background from person image...');
      const personBgResult = await removeBackground(personImageFile, includeDebug);
      if (personBgResult.success && personBgResult.imageDataUrl) {
        personImageDataUrl = personBgResult.imageDataUrl;
        steps.personBackgroundRemoved = true;
        console.log('✅ Person background removed successfully');
        if (includeDebug) {
          debugInfo.personBackgroundRemoval = personBgResult.debug;
          debugInfo.personImageAfterBackgroundRemoval = personImageDataUrl;
          console.log('📸 Stored person image after background removal');
        }
      } else {
        console.warn('⚠️ Person background removal failed, using original:', personBgResult.error);
        if (includeDebug && personBgResult.debug) {
          debugInfo.personBackgroundRemoval = personBgResult.debug;
        }
        // Continue with original image - but log a warning
        console.warn('⚠️ WARNING: Using original person image with background. Preprocessing may not have worked correctly.');
      }
    }

    // Step 2: Remove background from garment image
    if (removeGarmentBackground) {
      console.log('🔄 Removing background from garment image...');
      const garmentFile = await dataUrlToFile(garmentImageDataUrl, 'garment.png');
      const garmentBgResult = await removeBackground(garmentFile, includeDebug);
      if (garmentBgResult.success && garmentBgResult.imageDataUrl) {
        garmentImageDataUrl = garmentBgResult.imageDataUrl;
        steps.garmentBackgroundRemoved = true;
        console.log('✅ Garment background removed successfully');
        if (includeDebug) {
          debugInfo.garmentBackgroundRemoval = garmentBgResult.debug;
          debugInfo.garmentImageAfterBackgroundRemoval = garmentImageDataUrl;
          console.log('📸 Stored garment image after background removal');
        }
      } else {
        console.warn('⚠️ Garment background removal failed, using original:', garmentBgResult.error);
        if (includeDebug && garmentBgResult.debug) {
          debugInfo.garmentBackgroundRemoval = garmentBgResult.debug;
        }
        // Continue with original image - but log a warning
        console.warn('⚠️ WARNING: Using original garment image with background. Preprocessing may not have worked correctly.');
      }
    }

    // Step 3: Segment garment based on user selection
    if (segmentGarment && garmentType) {
      const segmentedResult = await getSegmentedGarment(
        garmentImageDataUrl,
        garmentType,
        useAdvancedSegmentation,
        includeDebug
      );
      if (segmentedResult.success) {
        garmentImageDataUrl = segmentedResult.segmentedImageDataUrl;
        steps.garmentSegmented = true;
        if (includeDebug) {
          debugInfo.garmentSegmentation = segmentedResult.debug;
          debugInfo.garmentImageAfterSegmentation = garmentImageDataUrl;
          console.log('📸 Stored garment image after segmentation');
        }
      } else {
        console.warn('Garment segmentation failed, using original:', segmentedResult.error);
        // Continue with original image
      }
    }

    // Convert processed images back to File objects
    // CRITICAL: These MUST be the background-removed versions, NOT original images
    console.log('🔄 Converting processed images to File objects...');
    console.log('📸 Person image dataUrl type:', personImageDataUrl.substring(0, 30));
    console.log('📸 Garment image dataUrl type:', garmentImageDataUrl.substring(0, 30));
    
    // CRITICAL: Only convert if background removal succeeded
    // If it failed, we should NOT create File objects from original data
    if (removePersonBackground && !steps.personBackgroundRemoved) {
      throw new Error('Person background removal failed. Cannot proceed with original image.');
    }
    if (removeGarmentBackground && !steps.garmentBackgroundRemoved) {
      throw new Error('Garment background removal failed. Cannot proceed with original image.');
    }
    
    // Create File objects from the PROCESSED data URLs (background-removed versions)
    const processedPersonImage = await dataUrlToFile(personImageDataUrl, 'processed-person-bg-removed.png');
    const processedGarmentImage = await dataUrlToFile(garmentImageDataUrl, 'processed-garment-bg-removed.png');
    
    console.log('✅ Converted to File objects (VERIFIED PREPROCESSED):', {
      personImageSize: processedPersonImage.size,
      garmentImageSize: processedGarmentImage.size,
      personImageType: processedPersonImage.type,
      garmentImageType: processedGarmentImage.type,
      personImageName: processedPersonImage.name,
      garmentImageName: processedGarmentImage.name,
    });
    
    // Final verification: Ensure we're using processed images (not originals)
    if (steps.personBackgroundRemoved) {
      console.log('✅ VERIFIED: Person image is background-removed');
    } else {
      throw new Error('CRITICAL: Person image background was NOT removed - cannot use original image!');
    }
    
    if (steps.garmentBackgroundRemoved) {
      console.log('✅ VERIFIED: Garment image is background-removed');
    } else {
      throw new Error('CRITICAL: Garment image background was NOT removed - cannot use original image!');
    }

    debugInfo.totalProcessingTimeMs = Math.round((performance.now() - startTime) * 100) / 100;

    // Store final processed versions in debug info
    if (includeDebug) {
      debugInfo.finalPersonImageDataUrl = personImageDataUrl;
      debugInfo.finalGarmentImageDataUrl = garmentImageDataUrl;
      console.log('📸 Stored final processed images in debug info');
    }

    return {
      processedPersonImage,
      processedGarmentImage,
      personImageDataUrl,
      garmentImageDataUrl,
      success: true,
      steps,
      debug: includeDebug ? debugInfo : undefined,
    };
  } catch (error: any) {
    debugInfo.totalProcessingTimeMs = Math.round((performance.now() - startTime) * 100) / 100;
    
    return {
      processedPersonImage: personImageFile,
      processedGarmentImage: garmentImageFile,
      personImageDataUrl: await fileToDataUrl(personImageFile).catch(() => ''),
      garmentImageDataUrl: await fileToDataUrl(garmentImageFile).catch(() => ''),
      success: false,
      error: error.message || 'Preprocessing failed',
      steps,
      debug: includeDebug ? debugInfo : undefined,
    };
  }
};

