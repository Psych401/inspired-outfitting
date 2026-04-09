/**
 * CPU-side validation and normalization before GPU inference (not background removal).
 * Keeps heavy VTON work on the GPU worker; this only validates and resizes for safe payloads.
 * Client should send original uploads; this does not require "cleaned" or segmented images.
 */

import sharp from 'sharp';

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB per file before decode
const MAX_DIMENSION = 1536;
const JPEG_QUALITY = 88;

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface PreprocessResult {
  personBuffer: Buffer;
  outfitBuffer: Buffer;
  personMime: string;
  outfitMime: string;
}

export class ImageValidationError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'ImageValidationError';
  }
}

function detectMimeFromBuffer(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.length >= 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return 'image/webp';
  return null;
}

/**
 * Validate size and magic bytes; normalize to JPEG within max dimension.
 */
export async function preprocessTryOnImages(
  personBuffer: Buffer,
  outfitBuffer: Buffer,
  declaredPersonMime: string,
  declaredOutfitMime: string
): Promise<PreprocessResult> {
  if (personBuffer.length > MAX_BYTES || outfitBuffer.length > MAX_BYTES) {
    throw new ImageValidationError('Image exceeds maximum size (12MB)', 'FILE_TOO_LARGE');
  }

  const pMime = detectMimeFromBuffer(personBuffer) || declaredPersonMime;
  const oMime = detectMimeFromBuffer(outfitBuffer) || declaredOutfitMime;

  if (!pMime || !ALLOWED_MIME.has(pMime)) {
    throw new ImageValidationError('Invalid or unsupported person image format', 'INVALID_PERSON_FORMAT');
  }
  if (!oMime || !ALLOWED_MIME.has(oMime)) {
    throw new ImageValidationError('Invalid or unsupported outfit image format', 'INVALID_OUTFIT_FORMAT');
  }

  const personNormalized = await normalizeImage(personBuffer, pMime);
  const outfitNormalized = await normalizeImage(outfitBuffer, oMime);

  return {
    personBuffer: personNormalized,
    outfitBuffer: outfitNormalized,
    personMime: 'image/jpeg',
    outfitMime: 'image/jpeg',
  };
}

async function normalizeImage(input: Buffer, mime: string): Promise<Buffer> {
  const img = sharp(input, { failOnError: true });
  const meta = await img.metadata();
  if (!meta.width || !meta.height) {
    throw new ImageValidationError('Could not read image dimensions', 'INVALID_IMAGE');
  }

  let pipeline = img.rotate();

  if (Math.max(meta.width, meta.height) > MAX_DIMENSION) {
    pipeline = pipeline.resize({
      width: meta.width >= meta.height ? MAX_DIMENSION : undefined,
      height: meta.height > meta.width ? MAX_DIMENSION : undefined,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  return pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
}
