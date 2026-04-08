'use client';

import { useState, useRef, useEffect } from 'react';

interface ImageDownloadProps {
  imageUrl: string;
  filename: string;
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

async function downloadAs(imageUrl: string, filename: string, format: 'png' | 'jpg' | 'svg') {
  try {
    const img = await loadImage(imageUrl);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d')!;

    if (format === 'jpg') {
      // JPG needs white background (no transparency)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.drawImage(img, 0, 0);

    if (format === 'svg') {
      // Create an SVG that embeds the raster image
      const dataUrl = canvas.toDataURL('image/png');
      const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}">
  <image width="${canvas.width}" height="${canvas.height}" xlink:href="${dataUrl}"/>
</svg>`;
      const blob = new Blob([svgContent], { type: 'image/svg+xml' });
      triggerDownload(blob, `${filename}.svg`);
    } else {
      const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
      const quality = format === 'jpg' ? 0.95 : undefined;
      canvas.toBlob(
        (blob) => {
          if (blob) triggerDownload(blob, `${filename}.${format}`);
        },
        mimeType,
        quality
      );
    }
  } catch {
    // Fallback: if canvas fails (CORS), try direct download
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = `${filename}.png`;
    a.click();
  }
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ImageDownloadButtons({ imageUrl, filename }: ImageDownloadProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (!imageUrl) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="text-[10px] text-muted hover:text-foreground bg-background/80 hover:bg-background border border-border px-1.5 py-0.5 rounded transition-colors"
        title="Download image"
      >
        ↓
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-surface border border-border rounded-lg shadow-xl z-20 py-1 min-w-[100px]">
          {(['png', 'jpg', 'svg'] as const).map((fmt) => (
            <button
              key={fmt}
              onClick={(e) => {
                e.stopPropagation();
                downloadAs(imageUrl, filename, fmt);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
            >
              Download .{fmt.toUpperCase()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ImageWithDownload({ imageUrl, label, filename, size = 'full' }: {
  imageUrl: string;
  label: string;
  filename: string;
  size?: 'full' | 'thumb';
}) {
  if (!imageUrl) return null;

  return (
    <div className="relative group">
      <img
        src={imageUrl}
        alt={label}
        className={`${size === 'full' ? 'w-full h-full' : 'w-20 h-20'} object-contain`}
      />
      <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <ImageDownloadButtons imageUrl={imageUrl} filename={filename} />
      </div>
    </div>
  );
}
