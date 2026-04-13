import { randomUUID } from 'crypto';
import { getSupabaseServiceRoleClient } from './server';

export type UserImageType = 'person' | 'garment' | 'generated';

function getBucket(): string {
  return process.env.SUPABASE_TRYON_BUCKET?.trim() || 'tryon-images';
}

function folderForType(imageType: UserImageType): string {
  switch (imageType) {
    case 'person':
      return 'person';
    case 'garment':
      return 'garments';
    case 'generated':
      return 'generated';
  }
}

function extensionFromMime(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

export async function uploadPrivateUserImage(params: {
  userId: string;
  imageType: UserImageType;
  buffer: Buffer;
  mimeType: string;
  jobId?: string;
}): Promise<{ storageBucket: string; storagePath: string; fileSize: number }> {
  const supabase = getSupabaseServiceRoleClient();
  const bucket = getBucket();
  const folder = folderForType(params.imageType);
  const ext = extensionFromMime(params.mimeType);
  const prefix = params.jobId ? `${params.jobId}-` : '';
  const fileName = `${prefix}${Date.now()}-${randomUUID()}.${ext}`;
  const storagePath = `users/${params.userId}/${folder}/${fileName}`;

  const { error } = await supabase.storage.from(bucket).upload(storagePath, params.buffer, {
    contentType: params.mimeType,
    upsert: false,
  });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return { storageBucket: bucket, storagePath, fileSize: params.buffer.length };
}

export async function createPrivateSignedImageUrl(
  storageBucket: string,
  storagePath: string,
  expiresInSec = 300
): Promise<string | null> {
  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase.storage
    .from(storageBucket)
    .createSignedUrl(storagePath, expiresInSec);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

