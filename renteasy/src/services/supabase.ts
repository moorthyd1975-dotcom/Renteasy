import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Retrieve Supabase credentials strictly from Vite environment (NO hard-coded fallbacks)
const rawUrl = (import.meta.env.VITE_SUPABASE_URL as string) || '';
const rawKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || '';

// Normalize URL (strip trailing /rest/v1 or trailing slash if passed)
export const normalizeSupabaseUrl = (url: string): string => {
  if (!url) return '';
  let clean = url.trim();
  clean = clean.replace(/\/rest\/v1\/?$/, '');
  clean = clean.replace(/\/+$/, '');
  return clean;
};

export const SUPABASE_URL = normalizeSupabaseUrl(rawUrl);
export const SUPABASE_ANON_KEY = rawKey.trim();
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const STORAGE_BUCKET = 'rentease-evidence';

// Create Supabase client (use dummy safe placeholder if env missing to prevent immediate crash before error screen renders)
export const supabase: SupabaseClient = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_ANON_KEY || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

// In-memory cache for short-lived signed URLs (1 hour lifetime)
// Key: storage path; Value: { url: string; expiresAt: number }
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Compresses any image (File, Blob, or base64 data URL)
 * Ensures longest side is at most 1400px and JPEG quality ~0.8.
 */
export async function compressImage(
  source: File | Blob | string,
  maxDimension = 1400,
  quality = 0.8
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    let srcUrl = '';
    let shouldRevoke = false;

    if (typeof source === 'string') {
      srcUrl = source;
    } else {
      srcUrl = URL.createObjectURL(source);
      shouldRevoke = true;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      if (shouldRevoke) URL.revokeObjectURL(srcUrl);

      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(width, 1);
      canvas.height = Math.max(height, 1);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context not available'));
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Canvas image compression failed'));
          }
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      if (shouldRevoke) URL.revokeObjectURL(srcUrl);
      reject(new Error('Failed to load image for compression'));
    };

    img.src = srcUrl;
  });
}

/**
 * Converts a Blob to a base64 data URI string (needed when sending to server-side AI)
 */
export function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Uploads compressed evidence to the private 'rentease-evidence' Supabase bucket.
 * Follows storage path: <owner_id>/<folder>/evidence-<uuid>.jpg
 * Returns the storage PATH (e.g. "uuid/meter/evidence-uuid.jpg"), NOT a base64 string.
 * If upload fails, throws an error so the caller can display it and allow retry.
 */
export async function uploadEvidenceToStorage(
  source: File | Blob | string,
  folder: 'meter' | 'rent' | 'profile',
  filenamePrefix = 'evidence'
): Promise<string> {
  // Compress to max 1400px, quality 0.8 JPEG
  const compressedBlob = await compressImage(source, 1400, 0.8);

  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user) {
    throw new Error('You must be logged in to upload evidence.');
  }

  const ownerId = authData.user.id;
  const uniqueId = crypto.randomUUID();
  const filePath = `${ownerId}/${folder}/${filenamePrefix}-${uniqueId}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(filePath, compressedBlob, {
      contentType: 'image/jpeg',
      cacheControl: '3600',
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Failed to upload evidence to cloud storage: ${uploadError.message}`);
  }

  // Return the storage path for database storage
  return filePath;
}

/**
 * Resolves a storage path or legacy URL to a viewable URL.
 * - If already starts with http://, https://, or data:, returns as is.
 * - Otherwise requests a short-lived (1 hour) signed URL from Supabase Storage with in-memory caching.
 */
export async function getEvidenceSignedUrl(pathOrUrl: string): Promise<string> {
  if (!pathOrUrl) return '';

  // Backward compatibility: legacy http/https or base64 data URIs
  if (
    pathOrUrl.startsWith('http://') ||
    pathOrUrl.startsWith('https://') ||
    pathOrUrl.startsWith('data:')
  ) {
    return pathOrUrl;
  }

  // Check in-memory cache (valid if more than 5 minutes before expiry)
  const cached = signedUrlCache.get(pathOrUrl);
  const now = Date.now();
  if (cached && cached.expiresAt > now + 300_000) {
    return cached.url;
  }

  try {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(pathOrUrl, 3600); // 1 hour

    if (error || !data?.signedUrl) {
      console.warn('Could not generate signed URL for path:', pathOrUrl, error?.message);
      return '';
    }

    signedUrlCache.set(pathOrUrl, {
      url: data.signedUrl,
      expiresAt: now + 3600 * 1000,
    });

    return data.signedUrl;
  } catch (err) {
    console.warn('Error resolving signed URL:', err);
    return '';
  }
}

/**
 * Diagnostic helper to verify whether Supabase tables and storage are active
 */
export async function testSupabaseConnection(): Promise<{
  connected: boolean;
  tablesFound: boolean;
  bucketFound: boolean;
  message: string;
}> {
  if (!isSupabaseConfigured) {
    return {
      connected: false,
      tablesFound: false,
      bucketFound: false,
      message: 'Supabase credentials not found. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    };
  }

  try {
    const { error: ownersError } = await supabase.from('owners').select('id').limit(1);

    if (ownersError) {
      if (ownersError.code === 'PGRST205' || ownersError.message?.includes('schema cache')) {
        return {
          connected: true,
          tablesFound: false,
          bucketFound: false,
          message: 'Connected to Supabase, but tables have not been created yet. Please execute supabase/schema.sql in the Supabase SQL editor.',
        };
      }
      return {
        connected: false,
        tablesFound: false,
        bucketFound: false,
        message: `Connection error: ${ownersError.message}`,
      };
    }

    // Check storage bucket
    let hasBucket = false;
    try {
      const { data: buckets } = await supabase.storage.listBuckets();
      hasBucket = !!buckets?.some((b) => b.name === STORAGE_BUCKET);
    } catch {
      hasBucket = false;
    }

    return {
      connected: true,
      tablesFound: true,
      bucketFound: hasBucket,
      message: 'Successfully connected to Supabase PostgreSQL database and tables!',
    };
  } catch (err: any) {
    return {
      connected: false,
      tablesFound: false,
      bucketFound: false,
      message: err?.message || 'Unknown network error',
    };
  }
}
