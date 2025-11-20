# Preprocessing Pipeline Documentation

This directory contains the image preprocessing utilities for the Inspired Outfitting application.

## Overview

The preprocessing pipeline improves AI try-on consistency by:
1. Removing backgrounds from both person and garment images
2. Segmenting garments based on user selection
3. Sending only the relevant, preprocessed segments to the AI model

## Files

### `imageProcessing.ts`
Core image manipulation utilities:
- File to data URL conversion
- Canvas operations
- Image format conversions

### `backgroundRemoval.ts`
Background removal service with fallback:
- **Replicate API** (primary) - Uses `851-labs/background-remover` model, requires `REPLICATE_API_TOKEN`
- **Client-side removal** (fallback) - Basic brightness-based removal, always available

### `garmentSegmentation.ts`
Smart garment segmentation based on user selection:
- **Smart Detection**: Uses aspect ratio and edge density analysis to detect single-garment images
- **Intelligent Cropping**: Avoids unnecessary cropping when image contains only the selected garment type
- **Region-based Segmentation**: Falls back to region cropping when detection confidence is low

Garment types supported:
- **Top**: Upper body region (shoulders to waist)
- **Bottom**: Lower body region (waist to ankles)
- **Full Body**: Entire image (dresses, jumpsuits)
- **Complete Outfit**: Entire image (top + bottom combination)

Detection methods:
- **Aspect Ratio Analysis**: Identifies garment type based on image dimensions
- **Edge Density Analysis**: Analyzes edge distribution in top vs bottom halves
- **Combined Detection**: Uses both methods with confidence scoring (>0.6 threshold)

### `preprocessingPipeline.ts`
Main orchestrator that combines all preprocessing steps:
- Coordinates background removal for both images
- Applies garment segmentation
- Returns processed images ready for AI generation

## Usage

```typescript
import { preprocessImages, GarmentType } from '@/lib/preprocessingPipeline';

const result = await preprocessImages(
  personImageFile,
  garmentImageFile,
  {
    removePersonBackground: true,
    removeGarmentBackground: true,
    segmentGarment: true,
    garmentType: 'top', // or 'bottom', 'fullBody', 'completeOutfit'
    useAdvancedSegmentation: false
  }
);

if (result.success) {
  // Use result.processedPersonImage and result.processedGarmentImage
  // These are File objects ready to be sent to the AI
}
```

## API Keys

### Required for Background Removal
- **Replicate API Token**: Required for high-quality background removal
  - Sign up at: https://replicate.com/account/api-tokens
  - Add to `.env.local`: `REPLICATE_API_TOKEN=your_token`
  - Model used: `851-labs/background-remover:a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc`

If no API token is provided, the system falls back to client-side background removal (basic but free).

## Error Handling

All preprocessing functions return result objects with:
- `success`: Boolean indicating success
- `error`: Error message if failed
- Fallback behavior: If preprocessing fails, original images are used

## Performance

- Background removal: 1-3 seconds (API) or 0.5-1 second (client-side)
- Segmentation: < 0.5 seconds
- Total preprocessing time: Typically 2-5 seconds

## Future Improvements

- Integration with ML-based segmentation models
- Support for more sophisticated background removal
- Batch processing for multiple images
- Caching of preprocessed images

