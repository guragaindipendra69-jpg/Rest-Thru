'use client';

import { useEffect, useRef, useState } from 'react';
import { FileText, Loader2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { uploadFile } from '@/lib/upload';
import {
  DOCUMENT_ACCEPT,
  IMAGE_ACCEPT,
  MAX_UPLOAD_LABEL,
  isPdf,
  validateUpload,
  type UploadKind,
} from '@/lib/upload-limits';
import { cn } from '@/lib/utils';

/**
 * One file picker with preview, used by every profile / category / document
 * upload in the dashboard.
 *
 * Each dialog used to inline its own dropzone, and they had drifted: the
 * category picker capped at 2 MB, the staff pickers advertised "up to 10MB"
 * while enforcing nothing, and the staff *edit* form had no picker at all. The
 * limit and the accepted formats now come from lib/upload-limits.ts, so the
 * label the user reads is the rule lib/upload.ts applies.
 *
 * The upload happens on pick rather than on form submit. The parent holds a
 * URL, not a File, which is what makes this drop into an edit form: an
 * untouched field keeps the stored URL and sends it back unchanged.
 */
export function UploadField({
  value,
  onChange,
  folder,
  kind = 'image',
  shape = 'box',
  hint,
  disabled,
  className,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  folder: string;
  kind?: UploadKind;
  shape?: 'circle' | 'box' | 'wide';
  hint?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [uploading, setUploading] = useState(false);
  // Shown while the upload is in flight so the user sees their pick land
  // immediately; dropped once the stored URL takes over.
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Object URLs are revoked on replacement and on unmount — a dialog that is
  // opened and closed repeatedly would otherwise pin every picked file in
  // memory for the life of the tab.
  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  const handlePick = async (file: File | null) => {
    if (!file) return;

    const check = validateUpload(file, kind);
    if (!check.ok) {
      toast.error(check.error);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    const preview = isPdf(file.name) ? null : URL.createObjectURL(file);
    setLocalPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return preview;
    });
    setUploading(true);

    const res = await uploadFile(file, folder, kind);

    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';

    if ('error' in res) {
      toast.error(res.error);
      setLocalPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }

    onChange(res.url);
    setLocalPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  };

  const shown = localPreview ?? value;
  const pdf = !localPreview && isPdf(value);

  const frame =
    shape === 'circle'
      ? 'h-28 w-28 rounded-full'
      : shape === 'wide'
        ? 'h-40 w-full rounded-lg'
        : 'h-32 w-full rounded-lg';

  return (
    <div className={cn('space-y-2', className)}>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={kind === 'document' ? DOCUMENT_ACCEPT : IMAGE_ACCEPT}
        disabled={disabled || uploading}
        onChange={(e) => handlePick(e.target.files?.[0] ?? null)}
      />

      <div className={cn(shape === 'circle' && 'flex justify-center')}>
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          className={cn(
            frame,
            'group relative flex flex-col items-center justify-center gap-1.5 overflow-hidden',
            'border-2 border-dashed border-border-control bg-muted/30 text-muted-foreground',
            'transition-colors hover:border-primary hover:text-primary',
            'disabled:cursor-not-allowed disabled:opacity-60'
          )}
        >
          {uploading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-xs">Uploading…</span>
            </>
          ) : pdf ? (
            <>
              <FileText className="h-7 w-7" />
              <span className="text-xs font-medium">PDF attached</span>
              <span className="text-[11px]">Click to replace</span>
            </>
          ) : shown ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={shown} alt="Upload preview" className="h-full w-full object-cover" />
              <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                Click to change
              </span>
            </>
          ) : (
            <>
              <Upload className="h-6 w-6" />
              <span className="text-xs font-medium">Click to upload</span>
              <span className="px-2 text-center text-[11px] leading-tight">
                {hint ?? (kind === 'document'
                  ? `Photo or PDF, up to ${MAX_UPLOAD_LABEL}`
                  : `JPG, PNG, WebP, HEIC, up to ${MAX_UPLOAD_LABEL}`)}
              </span>
            </>
          )}
        </button>
      </div>

      {value && !uploading && (
        <div className="flex items-center justify-center gap-3">
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-primary hover:underline"
          >
            View full size
          </a>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            className="h-auto gap-1 px-2 py-1 text-xs text-destructive hover:text-destructive"
            onClick={() => onChange(null)}
          >
            <X className="h-3 w-3" />
            Remove
          </Button>
        </div>
      )}
    </div>
  );
}
