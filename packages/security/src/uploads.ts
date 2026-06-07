// =============================================================================
// @hsi/security — file-upload validation + signed-URL helper signature.
// Allowed MIME types for image/video/audio/pdf/text. Max size from config
// (UPLOAD_MAX_MB). Used to validate evidence uploads before they enter the
// chain of custody.
// =============================================================================

export type UploadCategory = 'image' | 'video' | 'audio' | 'pdf' | 'text';

export const ALLOWED_MIME_TYPES: Record<UploadCategory, string[]> = {
  image: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'],
  video: ['video/mp4', 'video/webm', 'video/quicktime'],
  audio: ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg'],
  pdf: ['application/pdf'],
  text: ['text/plain', 'text/markdown', 'text/csv', 'application/json'],
};

const ALL_ALLOWED = new Set(Object.values(ALLOWED_MIME_TYPES).flat());

export interface UploadValidationInput {
  fileName: string;
  mimeType: string;
  /** Size in bytes. */
  sizeBytes: number;
}

export interface UploadValidationOptions {
  /** Max upload size in MB (pass config.UPLOAD_MAX_MB). */
  maxMb: number;
  /** Restrict to specific categories (defaults to all allowed). */
  allowCategories?: UploadCategory[];
}

export interface UploadValidationResult {
  ok: boolean;
  category?: UploadCategory;
  errors: string[];
}

function categoryOf(mime: string): UploadCategory | undefined {
  for (const [cat, list] of Object.entries(ALLOWED_MIME_TYPES) as [UploadCategory, string[]][]) {
    if (list.includes(mime)) return cat;
  }
  return undefined;
}

/** Validate a single upload's MIME type and size against policy. */
export function validateUpload(
  input: UploadValidationInput,
  options: UploadValidationOptions,
): UploadValidationResult {
  const errors: string[] = [];
  const category = categoryOf(input.mimeType);

  if (!ALL_ALLOWED.has(input.mimeType) || !category) {
    errors.push(`Disallowed MIME type: ${input.mimeType}`);
  } else if (options.allowCategories && !options.allowCategories.includes(category)) {
    errors.push(`MIME category '${category}' not permitted for this upload.`);
  }

  const maxBytes = options.maxMb * 1024 * 1024;
  if (input.sizeBytes <= 0) errors.push('Empty file.');
  if (input.sizeBytes > maxBytes) {
    errors.push(`File exceeds max size of ${options.maxMb}MB.`);
  }

  if (!input.fileName || input.fileName.includes('..') || /[\\/]/.test(input.fileName)) {
    errors.push('Invalid file name.');
  }

  return { ok: errors.length === 0, category, errors };
}

// -----------------------------------------------------------------------------
// Signed-upload-URL helper signature (documented).
// Storage providers (Supabase Storage / S3 / R2) issue short-lived signed
// upload URLs. We define the SHAPE here so callers depend on an interface, not
// a concrete SDK. Implement this with the provider SDK in the app layer.
// -----------------------------------------------------------------------------
export interface SignedUploadRequest {
  bucket: string;
  /** Object key/path within the bucket. */
  path: string;
  contentType: string;
  /** Seconds until the signed URL expires. */
  expiresInSeconds: number;
}

export interface SignedUploadResult {
  url: string;
  /** Headers the client must send with the PUT/POST. */
  headers: Record<string, string>;
  expiresAt: number;
}

/**
 * Function signature for issuing a signed upload URL. Provide a concrete
 * implementation in the app (e.g. supabase.storage.from(bucket).createSignedUploadUrl).
 */
export type CreateSignedUploadUrl = (req: SignedUploadRequest) => Promise<SignedUploadResult>;
