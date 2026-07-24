import React, { useCallback, useRef, useState } from 'react';
import { supabase } from '@/lib/db';
import { PORTFOLIO_BUCKET, PORTFOLIO_PREFIX } from '@/hooks/usePortfolioData';
import { UploadCloud, X, Loader2, ImagePlus, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

type Props = {
  value?: string;
  onChange: (url: string) => void;
  label?: string;
  aspect?: 'square' | 'video' | 'cover';
  className?: string;
  allowClear?: boolean;
};

const aspectClass: Record<NonNullable<Props['aspect']>, string> = {
  square: 'aspect-square',
  video: 'aspect-video',
  cover: 'aspect-[3/1]',
};

const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'] as const;

function isAcceptedImage(file: File): boolean {
  if (ACCEPTED_MIME_TYPES.includes(file.type as any)) return true;
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
  return ACCEPTED_EXTENSIONS.includes(ext as any);
}

export function ImageDropzone({ value, onChange, label, aspect = 'square', className, allowClear = true }: Props) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const errorTimer = useRef<number | null>(null);

  const showError = useCallback(
    (message: string) => {
      setError(message);
      toast({ title: 'Unsupported file', description: message, variant: 'destructive' });
      if (errorTimer.current) window.clearTimeout(errorTimer.current);
      errorTimer.current = window.setTimeout(() => setError(null), 4000);
    },
    [toast],
  );

  const upload = useCallback(
    async (file: File) => {
      if (!isAcceptedImage(file)) {
        showError('Only JPG, PNG, and WebP images are supported. Please convert your file and try again.');
        return;
      }
      setUploading(true);
      setProgress(10);
      try {
        const ext = (file.name.split('.').pop() || 'png').toLowerCase();
        const key = `${PORTFOLIO_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        setProgress(40);
        const { error } = await supabase.storage
          .from(PORTFOLIO_BUCKET)
          .upload(key, file, { upsert: false, cacheControl: '3600', contentType: file.type });
        if (error) throw error;
        setProgress(80);
        const { data: pub } = supabase.storage.from(PORTFOLIO_BUCKET).getPublicUrl(key);
        onChange(pub.publicUrl);
        setProgress(100);
      } catch (e: any) {
        toast({ title: 'Upload failed', description: e?.message ?? 'Please try again', variant: 'destructive' });
      } finally {
        setUploading(false);
        setTimeout(() => setProgress(0), 400);
      }
    },
    [onChange, toast, showError],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void upload(file);
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files);
    const valid = files.find(isAcceptedImage);
    if (valid) {
      void upload(valid);
      return;
    }
    if (files.length > 0) {
      showError('Only JPG, PNG, and WebP images can be pasted here.');
    }
  };

  return (
    <div className={className}>
      {label ? <p className="text-xs font-medium text-muted-foreground mb-1.5">{label}</p> : null}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onPaste={onPaste}
        className={cn(
          'group relative w-full overflow-hidden rounded-xl border-2 border-dashed transition-all',
          aspectClass[aspect],
          dragging
            ? 'border-primary bg-primary/10 scale-[1.01]'
            : 'border-border/60 bg-muted/30 hover:border-primary/50 hover:bg-muted/50',
          error && 'border-destructive bg-destructive/5',
          'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary relative',
        )}
      >
        {value ? (
          <>
            <img src={value} alt={label ?? 'Preview'} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
              <span className="rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-foreground shadow">
                <ImagePlus className="mr-1 inline h-3.5 w-3.5" />
                Replace
              </span>
              {allowClear && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange('');
                  }}
                  className="rounded-full bg-destructive/95 px-3 py-1.5 text-xs font-semibold text-destructive-foreground shadow"
                >
                  <X className="mr-1 inline h-3.5 w-3.5" />
                  Remove
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-center text-muted-foreground">
            <UploadCloud className={cn('h-6 w-6', error && 'text-destructive')} />
            <p className="text-xs font-medium">Drop, paste, or click to upload</p>
            <p className="text-[10px] opacity-70">JPG · PNG · WEBP · no size limit</p>
          </div>
        )}

        {uploading && (
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-background/95 px-3 py-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-1.5 flex items-start gap-1.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
