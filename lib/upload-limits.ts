/**
 * Upload constraints shared by the client-side file pickers and the server
 * writer in lib/upload.ts.
 *
 * Deliberately NOT a "use server" module. The dialogs import it to reject an
 * oversized or unsupported file before it is streamed to the action, and
 * `uploadFile` imports the same values as the authoritative gate, so the
 * message the user sees and the rule actually enforced cannot drift apart.
 */

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = '5 MB';

/**
 * Extensions accepted for a photo. Broad on purpose: a phone camera roll hands
 * over HEIC/HEIF, a scanner produces TIFF, and Windows still reports `.jfif`
 * for some saved JPEGs.
 *
 * SVG is excluded on purpose. Uploads are served from the app's own origin
 * under /uploads/, and next.config.js sets no `script-src`, so an SVG opened
 * directly would execute its inline script as first-party code. It is the one
 * image format that is also a document.
 */
export const IMAGE_EXTENSIONS = [
  'jpg', 'jpeg', 'jpe', 'jfif', 'pjpeg', 'pjp',
  'png', 'apng', 'gif', 'webp', 'avif',
  'heic', 'heif', 'bmp', 'dib', 'tif', 'tiff', 'ico',
];

/** Identity documents also arrive as a scan or a phone-exported PDF. */
export const DOCUMENT_EXTENSIONS = ['pdf', ...IMAGE_EXTENSIONS];

/** `accept` attribute values. Kept alongside the rules they advertise. */
export const IMAGE_ACCEPT = 'image/*';
export const DOCUMENT_ACCEPT = 'image/*,application/pdf,.pdf';

export type UploadKind = 'image' | 'document';

export function fileExtension(name: string): string {
  return name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
}

export function isPdf(nameOrUrl: string | null | undefined): boolean {
  return !!nameOrUrl && fileExtension(nameOrUrl.split('?')[0]) === 'pdf';
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Validate one picked file.
 *
 * Type is checked by MIME *or* extension rather than MIME alone: browsers
 * report an empty `File.type` for several formats they will still happily
 * upload (HEIC on Windows being the common one), so an MIME-only allowlist
 * silently rejects a photo the user can see in the picker.
 */
export function validateUpload(
  file: File,
  kind: UploadKind = 'image'
): { ok: true } | { ok: false; error: string } {
  if (file.size === 0) {
    return { ok: false, error: 'That file is empty.' };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: `File is ${formatBytes(file.size)}. Maximum size is ${MAX_UPLOAD_LABEL}.`,
    };
  }

  const allowed = kind === 'document' ? DOCUMENT_EXTENSIONS : IMAGE_EXTENSIONS;
  const ext = fileExtension(file.name);
  const mime = (file.type || '').toLowerCase();

  const mimeOk =
    mime.startsWith('image/') && mime !== 'image/svg+xml'
      ? true
      : kind === 'document' && mime === 'application/pdf';

  if (mimeOk || allowed.includes(ext)) return { ok: true };

  if (mime === 'image/svg+xml' || ext === 'svg') {
    return { ok: false, error: 'SVG files are not supported. Upload a JPG, PNG or WebP.' };
  }
  return {
    ok: false,
    error:
      kind === 'document'
        ? 'Unsupported file. Upload a photo (JPG, PNG, WebP, HEIC) or a PDF.'
        : 'Unsupported file. Upload a photo (JPG, PNG, WebP, HEIC).',
  };
}
