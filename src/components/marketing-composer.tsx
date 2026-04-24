'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Concept } from '@/lib/types';
import { useToast } from './toast';
import { ImageDownloadButtons } from './image-download';

type NameStyle = 'white_pill' | 'black_pill' | 'transparent_light' | 'transparent_dark';
type Aspect = 'square' | 'portrait' | 'landscape' | 'story';

interface Props {
  concept: Concept;
  onClose: () => void;
}

const NAME_STYLES: { id: NameStyle; label: string; description: string }[] = [
  { id: 'white_pill', label: 'White pill', description: 'White rounded background, black text' },
  { id: 'black_pill', label: 'Black pill', description: 'Black rounded background, white text' },
  { id: 'transparent_light', label: 'Light outline', description: 'Transparent, white text with dark stroke' },
  { id: 'transparent_dark', label: 'Dark outline', description: 'Transparent, black text with white stroke' },
];

const ASPECTS: { id: Aspect; label: string; ratio: string }[] = [
  { id: 'square', label: 'Square', ratio: '1:1 (Instagram feed)' },
  { id: 'portrait', label: 'Portrait', ratio: '4:5 (Instagram portrait)' },
  { id: 'landscape', label: 'Landscape', ratio: '16:10 (web / shopify hero)' },
  { id: 'story', label: 'Story', ratio: '9:16 (Instagram / TikTok story)' },
];

/**
 * Marketing graphic composer — uploads a product photo, sets overlay options,
 * and calls /api/marketing-graphic to produce the final composite.
 */
export function MarketingComposer({ concept, onClose }: Props) {
  const { openAIKey, updateConcept } = useAppStore();
  const { toast } = useToast();

  const [productPhoto, setProductPhoto] = useState<string>(concept.productPhotoUrl || '');
  const [productName, setProductName] = useState(concept.name);
  const [tagline, setTagline] = useState(concept.marketingTagline || '');
  const [nameStyle, setNameStyle] = useState<NameStyle>('white_pill');
  const [aspect, setAspect] = useState<Aspect>('square');
  const [coilBadgeSize, setCoilBadgeSize] = useState(280);
  const [dimBackground, setDimBackground] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [taglineOptions, setTaglineOptions] = useState<string[]>([]);
  const [preview, setPreview] = useState(concept.marketingGraphicUrl || '');
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onPhotoSelected = (file: File) => {
    // Read file as data URI so we can send it straight to the compositor
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setProductPhoto(reader.result);
      }
    };
    reader.onerror = () => toast('Failed to read file', 'error');
    reader.readAsDataURL(file);
  };

  const suggestTagline = async () => {
    if (!openAIKey) {
      toast('Set your OpenAI API key in Settings first', 'error');
      return;
    }
    setSuggesting(true);
    try {
      const res = await fetch('/api/suggest-tagline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName,
          description: concept.description,
          style: concept.specs.designStyleName,
          theme: concept.specs.designTheme,
          audience: concept.intendedAudience,
          apiKey: openAIKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || 'Tagline suggestion failed', 'error');
        return;
      }
      setTaglineOptions(data.taglines || []);
      if (data.taglines?.length > 0 && !tagline) {
        setTagline(data.taglines[0]);
      }
    } catch {
      toast('Network error', 'error');
    } finally {
      setSuggesting(false);
    }
  };

  const generate = async () => {
    if (!productPhoto) {
      setError('Upload a product photo first.');
      return;
    }
    if (!productName.trim()) {
      setError('Product name is required.');
      return;
    }
    if (!concept.coilImageUrl) {
      setError('This concept has no coil design image — generate one first.');
      return;
    }

    setGenerating(true);
    setError('');
    try {
      const res = await fetch('/api/marketing-graphic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productPhoto,
          productName: productName.trim(),
          coilImageUrl: concept.coilImageUrl,
          tagline: tagline.trim(),
          nameStyle,
          aspect,
          coilBadgeSize,
          dimBackground,
          filenameHint: concept.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Generation failed');
        return;
      }
      setPreview(data.url);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const saveToConcept = () => {
    if (!preview) return;
    updateConcept(concept.id, {
      marketingGraphicUrl: preview,
      marketingTagline: tagline.trim(),
      // If the product photo was uploaded as a data URI, the sharp endpoint
      // didn't upload it separately — save the data URI so the composer can
      // re-use it without asking for the file again. Small tradeoff: slightly
      // larger row. Acceptable for the use case.
      productPhotoUrl: productPhoto,
      // Also pre-fill the product name if it changed from the concept name.
      ...(productName.trim() !== concept.name ? { name: productName.trim() } : {}),
    });
    toast('Marketing graphic saved to concept', 'success');
    onClose();
  };

  const aspectBox = (() => {
    switch (aspect) {
      case 'square':    return { className: 'aspect-square', style: {} };
      case 'portrait':  return { className: '', style: { aspectRatio: '1080 / 1350' } };
      case 'landscape': return { className: '', style: { aspectRatio: '1600 / 1000' } };
      case 'story':     return { className: '', style: { aspectRatio: '1080 / 1920' } };
    }
  })();

  return (
    <div
      className="fixed inset-0 bg-black/60 modal-backdrop z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-surface border border-border rounded-xl w-full max-w-6xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-surface border-b border-border px-5 py-3 flex items-center justify-between z-10">
          <div>
            <h2 className="text-base font-semibold">Marketing Graphic Composer</h2>
            <p className="text-xs text-muted mt-0.5">
              Upload the finished product photo, set the overlay options, and the server composites everything into a ready-to-post marketing image.
            </p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground text-lg leading-none">×</button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-0">
          {/* Left: controls */}
          <div className="lg:col-span-2 p-5 space-y-4 border-r border-border">

            {/* Product photo upload */}
            <div>
              <label className="block text-xs font-medium mb-1.5">Product photo</label>
              {productPhoto ? (
                <div className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={productPhoto}
                    alt="Product"
                    className="w-full rounded-lg border border-border object-contain bg-background"
                    style={{ maxHeight: 240 }}
                  />
                  <label className="absolute bottom-2 right-2 text-[11px] bg-background/90 border border-border rounded px-2 py-1 cursor-pointer hover:bg-background">
                    Replace
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && onPhotoSelected(e.target.files[0])}
                    />
                  </label>
                </div>
              ) : (
                <label className="block border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-accent hover:bg-accent/5 transition-colors">
                  <div className="text-xs text-muted">Click to upload the product photo</div>
                  <div className="text-[10px] text-muted mt-1">JPG / PNG, any size — we&apos;ll fit it to the canvas</div>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && onPhotoSelected(e.target.files[0])}
                  />
                </label>
              )}
            </div>

            {/* Product name */}
            <div>
              <label className="block text-xs font-medium mb-1.5">Product name</label>
              <input
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              />
            </div>

            {/* Tagline */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium">Tagline <span className="text-muted font-normal">(optional)</span></label>
                <button
                  onClick={suggestTagline}
                  disabled={suggesting}
                  className="text-[11px] text-accent hover:underline disabled:opacity-50"
                >
                  {suggesting ? '✦ Writing…' : '✦ Suggest'}
                </button>
              </div>
              <input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="e.g. stillness, etched in glass"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              />
              {taglineOptions.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {taglineOptions.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTagline(t)}
                      className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                        tagline === t
                          ? 'bg-accent text-white border-accent'
                          : 'border-border text-muted hover:text-foreground'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Aspect */}
            <div>
              <label className="block text-xs font-medium mb-1.5">Aspect ratio</label>
              <div className="grid grid-cols-2 gap-1.5">
                {ASPECTS.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setAspect(a.id)}
                    className={`text-left px-2 py-1.5 rounded border transition-colors ${
                      aspect === a.id
                        ? 'bg-accent/10 border-accent'
                        : 'bg-background border-border hover:border-accent/40'
                    }`}
                  >
                    <div className="text-xs font-medium">{a.label}</div>
                    <div className="text-[10px] text-muted">{a.ratio}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Name style */}
            <div>
              <label className="block text-xs font-medium mb-1.5">Name overlay style</label>
              <div className="grid grid-cols-2 gap-1.5">
                {NAME_STYLES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setNameStyle(s.id)}
                    className={`text-left px-2 py-1.5 rounded border transition-colors ${
                      nameStyle === s.id
                        ? 'bg-accent/10 border-accent'
                        : 'bg-background border-border hover:border-accent/40'
                    }`}
                  >
                    <div className="text-xs font-medium">{s.label}</div>
                    <div className="text-[10px] text-muted leading-tight">{s.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Coil badge size */}
            <div>
              <label className="block text-xs font-medium mb-1.5">
                Coil badge size <span className="text-muted font-normal">({coilBadgeSize}px)</span>
              </label>
              <input
                type="range"
                min={200}
                max={400}
                step={20}
                value={coilBadgeSize}
                onChange={(e) => setCoilBadgeSize(Number(e.target.value))}
                className="w-full accent-accent"
              />
            </div>

            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={dimBackground}
                onChange={(e) => setDimBackground(e.target.checked)}
                className="accent-accent"
              />
              Dim background for legibility
              <span className="text-muted">(adds a subtle top-down gradient)</span>
            </label>

            <button
              onClick={generate}
              disabled={generating || !productPhoto || !productName.trim() || !concept.coilImageUrl}
              className="w-full py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {generating ? 'Compositing…' : preview ? 'Re-generate' : 'Generate Marketing Graphic'}
            </button>

            {!concept.coilImageUrl && (
              <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                This concept doesn&apos;t have a coil design yet. Generate one from the concept detail page first.
              </div>
            )}

            {error && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</div>
            )}
          </div>

          {/* Right: preview */}
          <div className="lg:col-span-3 p-5 bg-background flex flex-col">
            <div className="text-xs text-muted uppercase tracking-wider mb-2">Preview</div>
            <div
              className={`flex-1 rounded-xl border border-border overflow-hidden bg-surface flex items-center justify-center ${aspectBox.className}`}
              style={{ ...aspectBox.style, minHeight: 320 }}
            >
              {generating ? (
                <div className="flex flex-col items-center gap-2 text-muted">
                  <span className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs">Compositing the marketing image…</span>
                </div>
              ) : preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Marketing preview" className="w-full h-full object-contain" />
              ) : (
                <div className="text-center text-xs text-muted p-6">
                  Fill in the fields and click <b>Generate Marketing Graphic</b> to see the result here.
                </div>
              )}
            </div>

            {preview && !generating && (
              <div className="mt-3 flex gap-2">
                <button
                  onClick={saveToConcept}
                  className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  ✓ Save to concept
                </button>
                <ImageDownloadButtons
                  imageUrl={preview}
                  filename={`${concept.name}-marketing-${aspect}`}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
