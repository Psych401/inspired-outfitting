import { getSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { uploadPrivateUserImage, type UserImageType } from '@/lib/supabase/storage';

export interface UserImageRecord {
  id: string;
  userId: string;
  jobId?: string;
  imageType: UserImageType;
  storageBucket: string;
  storagePath: string;
  mimeType?: string;
  fileSize?: number;
  createdAt: string;
}

export async function saveUserImage(params: {
  userId: string;
  imageType: UserImageType;
  buffer: Buffer;
  mimeType: string;
  jobId?: string;
  sourcePersonImageId?: string;
  sourceGarmentImageId?: string;
}): Promise<UserImageRecord> {
  const uploaded = await uploadPrivateUserImage({
    userId: params.userId,
    imageType: params.imageType,
    buffer: params.buffer,
    mimeType: params.mimeType,
    jobId: params.jobId,
  });
  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('user_images')
    .insert({
      user_id: params.userId,
      job_id: params.jobId ?? null,
      image_type: params.imageType,
      storage_bucket: uploaded.storageBucket,
      storage_path: uploaded.storagePath,
      mime_type: params.mimeType,
      file_size: uploaded.fileSize,
      source_person_image_id: params.sourcePersonImageId ?? null,
      source_garment_image_id: params.sourceGarmentImageId ?? null,
    })
    .select('*')
    .single();
  if (error) throw new Error(`user_images insert failed: ${error.message}`);
  return {
    id: data.id,
    userId: data.user_id,
    jobId: data.job_id ?? undefined,
    imageType: data.image_type,
    storageBucket: data.storage_bucket,
    storagePath: data.storage_path,
    mimeType: data.mime_type ?? undefined,
    fileSize: data.file_size ?? undefined,
    createdAt: data.created_at,
  };
}

