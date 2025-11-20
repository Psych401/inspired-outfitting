/**
 * Image processing utilities for converting between different formats
 */

/**
 * Convert a File to base64 data URL
 */
export const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
};

/**
 * Convert a data URL or blob URL to a File object
 * Works with both data: URLs (base64) and blob: URLs
 * CRITICAL: For background-removed images, MUST preserve PNG format with transparency
 */
export const dataUrlToFile = async (dataUrl: string, fileName: string): Promise<File> => {
  // Handle both data URLs and blob URLs
  let blob: Blob;
  
  if (dataUrl.startsWith('data:')) {
    // Data URL (base64) - convert directly
    const response = await fetch(dataUrl);
    blob = await response.blob();
  } else if (dataUrl.startsWith('blob:')) {
    // Blob URL - fetch and convert
    const response = await fetch(dataUrl);
    blob = await response.blob();
  } else {
    // Assume it's a URL that can be fetched
    const response = await fetch(dataUrl);
    blob = await response.blob();
  }
  
  // CRITICAL: Force PNG format for background-removed images to preserve transparency
  // If the blob is not PNG, convert it to PNG via canvas
  if (blob.type !== 'image/png' && fileName.includes('bg-removed')) {
    console.warn('⚠️ Background-removed image is not PNG, converting to PNG to preserve transparency');
    const img = await loadImage(dataUrl);
    const canvas = imageToCanvas(img);
    const pngBlob = await canvasToBlob(canvas, 'image/png');
    return new File([pngBlob], fileName, { type: 'image/png' });
  }
  
  // Ensure PNG type is set for background-removed files
  const fileType = fileName.includes('bg-removed') ? 'image/png' : (blob.type || 'image/png');
  return new File([blob], fileName, { type: fileType });
};

/**
 * Convert a File to base64 string (without data URL prefix)
 */
export const fileToBase64 = async (file: File): Promise<string> => {
  const dataUrl = await fileToDataUrl(file);
  return dataUrl.split(',')[1];
};

/**
 * Convert base64 string to data URL
 */
export const base64ToDataUrl = (base64: string, mimeType: string = 'image/png'): string => {
  return `data:${mimeType};base64,${base64}`;
};

/**
 * Load an image from a data URL or URL
 */
export const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
};

/**
 * Convert an image element to a canvas
 */
export const imageToCanvas = (img: HTMLImageElement): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');
  ctx.drawImage(img, 0, 0);
  return canvas;
};

/**
 * Convert canvas to data URL
 */
export const canvasToDataUrl = (canvas: HTMLCanvasElement, mimeType: string = 'image/png', quality?: number): string => {
  return canvas.toDataURL(mimeType, quality);
};

/**
 * Convert canvas to blob
 */
export const canvasToBlob = (canvas: HTMLCanvasElement, mimeType: string = 'image/png', quality?: number): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to convert canvas to blob'));
      },
      mimeType,
      quality
    );
  });
};

/**
 * Convert canvas to File
 */
export const canvasToFile = async (canvas: HTMLCanvasElement, fileName: string, mimeType: string = 'image/png', quality?: number): Promise<File> => {
  const blob = await canvasToBlob(canvas, mimeType, quality);
  return new File([blob], fileName, { type: mimeType });
};

