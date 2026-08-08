'use server';

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { requireTenant } from '@/lib/auth-tenant';

// NOTE: this index lives on the local filesystem under public/uploads/, which is
// ephemeral on Vercel/Netlify — the JSON is wiped on every deploy and is not
// shared between serverless instances. The images themselves are on Cloudinary
// (see lib/upload.ts); only this convenience index is local. It should move to a
// DB table, tracked in TODO.md.
//
// All three exports are Server Actions, i.e. public POST endpoints, and used to
// have no authentication whatsoever — anyone on the internet could read the
// library or write entries into it. They now require a signed-in tenant user.

const LIBRARY_FILE = join(process.cwd(), 'public', 'uploads', '_library.json');

export type LibraryEntry = { url: string; name: string; folder: string; createdAt: string };

async function ensureDir() {
  try {
    await mkdir(join(process.cwd(), 'public', 'uploads'), { recursive: true });
  } catch {}
}

async function readLibrary(): Promise<LibraryEntry[]> {
  try {
    await ensureDir();
    const data = await readFile(LIBRARY_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function getLibrary(): Promise<LibraryEntry[]> {
  const auth = await requireTenant();
  if (!auth.ok) return [];
  return readLibrary();
}

export async function addToLibrary(entry: Omit<LibraryEntry, 'createdAt'>): Promise<LibraryEntry | null> {
  const auth = await requireTenant();
  if (!auth.ok) return null;

  const library = await readLibrary();
  // Avoid duplicates by URL
  if (library.some((e) => e.url === entry.url)) {
    return { ...entry, createdAt: '' };
  }
  const newEntry: LibraryEntry = { ...entry, createdAt: new Date().toISOString() };
  library.push(newEntry);
  await ensureDir();
  await writeFile(LIBRARY_FILE, JSON.stringify(library, null, 2));
  return newEntry;
}

export async function removeFromLibrary(url: string): Promise<boolean> {
  const auth = await requireTenant();
  if (!auth.ok) return false;

  const library = await readLibrary();
  const filtered = library.filter((e) => e.url !== url);
  if (filtered.length === library.length) return false;
  await ensureDir();
  await writeFile(LIBRARY_FILE, JSON.stringify(filtered, null, 2));
  return true;
}
