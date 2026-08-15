'use server';

import { writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { addToLibrary } from './actions/image-library';
import { requireUser } from '@/lib/auth-tenant';
import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
  DOCUMENT_EXTENSIONS,
  IMAGE_EXTENSIONS,
  fileExtension,
  formatBytes,
  type UploadKind,
} from './upload-limits';

const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads');

// Folder allowlist. `folder` reaches this module from client components and is
// interpolated straight into a filesystem path, so a caller passing
// "../../lib/actions" would write outside public/uploads/.
const ALLOWED_FOLDERS = new Set([
  'avatars',
  'identity-docs',
  'categories',
  'menu-items',
  'menu-bg',
  'menu-custom',
  'covers',
  'support',
  // Owner KYC folders, named by the column they populate in the superadmin
  // Owner Management console (app/superadmin/owners/owners-client.tsx).
  'owner-profileImage',
  'owner-identityDocImage',
  'owner-identityDocBackImage',
]);

async function ensureDir(dir: string) {
  try {
    await mkdir(dir, { recursive: true });
  } catch {}
}

function sanitizeFilename(name: string): string {
  const base = name.replace(/\.[^.]+$/, '');
  return base
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export type UploadResult = { url: string } | { error: string };

/**
 * Validate and store one upload, returning the reason on rejection.
 *
 * Mirrors `validateUpload` in lib/upload-limits.ts. The client checks first so
 * the user is told before a 5 MB body goes over the wire, but this is the gate
 * that actually holds: every export of a "use server" module is a public POST
 * endpoint, so the browser-side check is a convenience, not a control.
 */
export async function uploadFile(
  file: File,
  folder: string,
  kind: UploadKind = 'image'
): Promise<UploadResult> {
  // requireUser, not requireTenant: the superadmin Owner Management console
  // uploads owner KYC images and platform admins carry no restaurantId. Any
  // signed-in user is still a large step up from the previous state, where this
  // endpoint accepted writes from anyone on the internet.
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };

  if (!ALLOWED_FOLDERS.has(folder)) return { error: 'Unsupported upload target' };
  if (!file || typeof file.arrayBuffer !== 'function') return { error: 'No file received' };
  if (file.size === 0) return { error: 'That file is empty.' };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: `File is ${formatBytes(file.size)}. Maximum size is ${MAX_UPLOAD_LABEL}.` };
  }

  const ext = fileExtension(file.name);
  const mime = (file.type || '').toLowerCase();
  const allowed = kind === 'document' ? DOCUMENT_EXTENSIONS : IMAGE_EXTENSIONS;
  const mimeOk =
    (mime.startsWith('image/') && mime !== 'image/svg+xml') ||
    (kind === 'document' && mime === 'application/pdf');
  if (!mimeOk && !allowed.includes(ext)) {
    return {
      error:
        kind === 'document'
          ? 'Unsupported file. Upload a photo (JPG, PNG, WebP, HEIC) or a PDF.'
          : 'Unsupported file. Upload a photo (JPG, PNG, WebP, HEIC).',
    };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());

    // A random suffix, not the bare sanitized name. Two staff photos both
    // picked as "img_0001.jpg" used to resolve to the same path, so the second
    // upload silently replaced the first — across tenants, since the path
    // carries no restaurant id.
    const safeName = sanitizeFilename(file.name) || 'upload';
    const safeExt = (allowed.includes(ext) ? ext : 'jpg').replace(/[^a-z0-9]/g, '');
    const filename = `${safeName}-${randomBytes(6).toString('hex')}.${safeExt}`;

    const folderPath = join(UPLOAD_DIR, folder);
    await ensureDir(folderPath);
    await writeFile(join(folderPath, filename), buffer);

    const url = `/uploads/${folder}/${filename}`;

    // Persist to image library so it shows in the Library tab. PDFs are not
    // images and would render as a broken thumbnail there.
    if (safeExt !== 'pdf') {
      await addToLibrary({ url, name: safeName, folder });
    }

    return { url };
  } catch (err) {
    console.error('Upload error:', err);
    return { error: 'Could not save the file. Try again.' };
  }
}

export async function deleteImage(publicId: string): Promise<boolean> {
  const auth = await requireUser();
  if (!auth.ok) return false;

  // Confine deletion to the upload tree: `publicId` arrives from the client and
  // was joined onto public/ unchecked, so "../../.env" resolved to a real file.
  if (!/^\/?uploads\/[a-z0-9_-]+\/[a-z0-9._-]+$/i.test(publicId) || publicId.includes('..')) {
    return false;
  }

  try {
    await unlink(join(process.cwd(), 'public', publicId.replace(/^\//, '')));
    return true;
  } catch {
    return false;
  }
}
