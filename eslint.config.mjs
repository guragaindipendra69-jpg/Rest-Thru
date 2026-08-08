import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

// ESLint 9 uses flat config. `eslint-config-next` is still published in the
// legacy "extends" shape, so FlatCompat translates it — this is the migration
// path Next.js documents, not a workaround.
const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

export default [
  {
    // Flat config has no implicit ignores beyond node_modules, so the build
    // output and generated Prisma client have to be excluded explicitly or
    // linting crawls tens of thousands of generated files.
    ignores: [
      '.next/**',
      'out/**',
      'build/**',
      'next-env.d.ts',
      'lovable/**',
      'supabase/**',
    ],
  },
  ...compat.extends('next/core-web-vitals'),
];
