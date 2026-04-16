'use client';

import { useState, useRef, useEffect } from 'react';

interface ImageDownloadProps {
  imageUrl: string;
  filename: string;
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Only set crossOrigin for non-data URIs — data URIs don't need CORS
    if (!url.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

async function downloadAs(imageUrl: string, filename: string, format: 'png' | 'jpg' | 'svg') {
  try {
    const img = await loadImage(imageUrl);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width || 1024;
    canvas.height = img.naturalHeight || img.height || 1024;
    const ctx = canvas.getContext('2d')!;

    if (format === 'jpg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.drawImage(img, 0, 0);

    if (format === 'svg') {
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
    // Fallback for data URIs: convert base64 directly to blob
    if (imageUrl.startsWith('data:')) {
      try {
        const res = await fetch(imageUrl);
        const blob = await res.blob();
        triggerDownload(blob, `${filename}.png`);
      } catch {
        // Last resort
        const a = document.createElement('a');
        a.href = imageUrl;
        a.download = `${filename}.png`;
        a.click();
      }
    } else {
      const a = document.createElement('a');
      a.href = imageUrl;
      a.download = `${filename}.png`;
      a.click();
    }
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

export async function invertImage(imageUrl: string): Promise<string> {
  const img = await loadImage(imageUrl);
  // Use the FULL original resolution — never downscale
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error('Could not determine image dimensions');

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  // Disable any smoothing to preserve pixel-perfect quality
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255 - data[i];       // R
    data[i + 1] = 255 - data[i + 1]; // G
    data[i + 2] = 255 - data[i + 2]; // B
    // Alpha stays the same
  }
  ctx.putImageData(imageData, 0, 0);

  // Use toBlob for maximum quality PNG output (toDataURL can compress)
  return new Promise<string>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) { reject(new Error('Failed to create blob')); return; }
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read blob'));
        reader.readAsDataURL(blob);
      },
      'image/png'  // Lossless PNG format
    );
  });
}

export function ImageDownloadButtons({ imageUrl, filename }: ImageDownloadProps) {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (!imageUrl) return null;

  const handleDownload = async (fmt: 'png' | 'jpg' | 'svg') => {
    setDownloading(true);
    try {
      await downloadAs(imageUrl, filename, fmt);
    } finally {
      setDownloading(false);
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="text-[10px] text-muted hover:text-foreground bg-background/80 hover:bg-background border border-border px-1.5 py-0.5 rounded transition-colors"
        aria-label="Download image"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {downloading ? '...' : '↓'}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-surface border border-border rounded-lg shadow-xl z-20 py-1 min-w-[120px]" role="menu">
          {(['png', 'jpg', 'svg'] as const).map((fmt) => (
            <button
              key={fmt}
              onClick={(e) => { e.stopPropagation(); handleDownload(fmt); }}
              className="w-full text-left px-3 py-1.5 text-xs text-muted hover:text-foreground hover:bg-surface-hover transition-colors flex items-center gap-2"
              role="menuitem"
              disabled={downloading}
            >
              <span className="w-8 text-[10px] font-mono uppercase opacity-60">.{fmt}</span>
              <span>Download {fmt.toUpperCase()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
