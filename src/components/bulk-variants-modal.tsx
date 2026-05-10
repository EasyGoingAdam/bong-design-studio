'use client';

import { useEffect, useState } from 'react';
import { Concept } from '@/lib/types';
import { useAppStore } from '@/lib/store';
import { useToast } from './toast';

const VARIANT_STYLES: { id: string; label: string; suffix: string }[] = [
  { id: 'art-nouveau', label: 'Art Nouveau',
    suffix: 'in art-nouveau style with sinuous lines, ornate floral framing, and Mucha-inspired curves' },
  { id: 'geometric',   label: 'Geometric',
    suffix: 'in bold geometric style with sacred-geometry composition, sharp triangles, and radial symmetry' },
  { id: 'botanical',   label: 'Botanical',
    suffix: 'in detailed botanical-illustration style with leaf veins, vines, and Victorian herbarium feel' },
  { id: 'minimalist',  label: 'Minimalist',
    suffix: 'in stark minimalist style with single-weight line work and maximum negative space' },
  { id: 'tribal',      label: 'Tribal/Tattoo',
    suffix: 'in bold tribal-tattoo style with thick black fills and aggressive negative space' },
  { id: 'celestial',   label: 'Celestial',
    suffix: 'in celestial-astrology style with constellations, sun & moon motifs, and decorative star ornament' },
];

interface VariantState {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  imageUrl?: string;
  error?: string;
}

/**
 * Bulk Variant Generator — produces 6 stylistic permutations of one
 * Concept's coil image in parallel. Each one is captured to AI history
 * AND optionally saved as a new Concept (the "Save selected" button).
 *
 * Reuses /api/generate-image; doesn't introduce a new endpoint.
 */
export function BulkVariantsModal({
  concept, onClose, onOpenConcept,
}: { concept: Concept; onClose: () => void; onOpenConcept: (id: string) => void }) {
  const { openAIKey, addAIGeneration, addConcept } = useAppStore();
  const { toast } = useToast();

  const [picked, setPicked] = useState<Set<string>>(new Set(VARIANT_STYLES.map((v) => v.id)));
  const [variants, setVariants] = useState<VariantState[]>([]);
  const [running, setRunning] = useState(false);
  const [selectedToSave, setSelectedToSave] = useState<Set<string>>(new Set());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const togglePicked = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runGeneration = async () => {
    if (!openAIKey) { toast('Set your OpenAI API key in Settings first', 'error'); return; }
    if (picked.size === 0) { toast('Pick at least one style', 'info'); return; }

    setRunning(true);
    const styles = VARIANT_STYLES.filter((v) => picked.has(v.id));
    const initial: VariantState[] = styles.map((s) => ({
      id: s.id, label: s.label, status: 'pending',
    }));
    setVariants(initial);

    const basePrompt = concept.description ||
      `${concept.specs?.designTheme || concept.name} for laser-etched glass coil`;

    // Fire all in parallel; cap at 6 (browser/CDN concurrency-friendly).
    const jobs = styles.map(async (s) => {
      setVariants((prev) =>
        prev.map((v) => v.id === s.id ? { ...v, status: 'running' } : v)
      );
      const fullPrompt = `${basePrompt}, ${s.suffix}. Black-and-white production-ready laser etching, high contrast, no fine gradients.`;
      try {
        const res = await fetch('/api/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: fullPrompt,
            apiKey: openAIKey,
            size: '1024x1024',
            complexityLevel: concept.specs?.laserComplexity ?? 3,
            folder: 'bulk-variants',
            filename: `${concept.id}-${s.id}-${Date.now()}`,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Generation failed (${res.status})`);

        // Persist to AI history on the original concept so the team can
        // trace which variants came from which concept.
        await addAIGeneration(concept.id, {
          prompt: fullPrompt,
          coilPrompt: fullPrompt,
          basePrompt: '',
          mode: 'production_bw',
          coilImageUrl: data.imageUrl,
          baseImageUrl: '',
          model: data.actualProvider || 'gpt-image-1',
          provider: 'openai',
        });

        setVariants((prev) =>
          prev.map((v) => v.id === s.id
            ? { ...v, status: 'complete', imageUrl: data.imageUrl }
            : v
          )
        );
      } catch (e) {
        setVariants((prev) =>
          prev.map((v) => v.id === s.id
            ? { ...v, status: 'failed', error: e instanceof Error ? e.message : 'failed' }
            : v
          )
        );
      }
    });

    await Promise.allSettled(jobs);
    setRunning(false);

    const completedCount = variants.filter((v) => v.status === 'complete').length;
    if (completedCount > 0 || picked.size > 0) {
      toast(`Generated ${picked.size} variant${picked.size > 1 ? 's' : ''}`, 'success');
    }
  };

  const toggleSave = (id: string) => {
    setSelectedToSave((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const saveAsConcepts = async () => {
    const toSave = variants.filter((v) => selectedToSave.has(v.id) && v.imageUrl);
    if (toSave.length === 0) { toast('Pick at least one variant to save', 'info'); return; }

    const created: string[] = [];
    for (const v of toSave) {
      try {
        const c = await addConcept({
          name: `${concept.name} — ${v.label}`,
          collection: concept.collection,
          description: concept.description,
          tags: [...concept.tags, v.id, 'variant'],
          coilImageUrl: v.imageUrl,
          coilOnly: true,
          priority: concept.priority,
          lifecycleType: concept.lifecycleType,
          source: `variant-of:${concept.id}`,
          specs: concept.specs,
        });
        created.push(c.id);
      } catch { /* skip failed inserts */ }
    }
    toast(`Created ${created.length} new Concept${created.length === 1 ? '' : 's'}`, 'success');
    if (created.length > 0) {
      onClose();
      onOpenConcept(created[0]);
    }
  };

  const completed = variants.filter((v) => v.status === 'complete').length;
  const failed = variants.filter((v) => v.status === 'failed').length;

  return (
    <div
      className="fixed inset-0 bg-black/60 modal-backdrop z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-surface border-b border-border px-5 py-3 flex items-center justify-between">
          <div>
            <div className="eyebrow">Bulk Variant Generator</div>
            <h2 className="serif text-xl font-medium">{concept.name}</h2>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-5">
          {/* Style picker */}
          {variants.length === 0 && (
            <>
              <p className="text-sm text-muted">
                Generate the same concept in {picked.size} of {VARIANT_STYLES.length} stylistic directions in parallel.
                Each variant captures to AI history and can be promoted to its own Concept.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {VARIANT_STYLES.map((s) => {
                  const isOn = picked.has(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => togglePicked(s.id)}
                      className={`text-left p-3 rounded-lg border transition-colors ${
                        isOn
                          ? 'bg-foreground text-surface border-foreground'
                          : 'bg-surface border-border hover:border-border-light'
                      }`}
                    >
                      <div className="text-sm font-medium">{s.label}</div>
                      <div className={`text-[11px] mt-0.5 ${isOn ? 'text-surface/70' : 'text-muted'} line-clamp-2`}>
                        {s.suffix}
                      </div>
                    </button>
                  );
                })}
              </div>
              <button
                onClick={runGeneration}
                disabled={running || picked.size === 0}
                className="w-full py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                ✦ Generate {picked.size} variant{picked.size === 1 ? '' : 's'}
              </button>
            </>
          )}

          {/* Result grid */}
          {variants.length > 0 && (
            <>
              <div className="flex items-center justify-between text-xs text-muted">
                <div>
                  {running ? 'Generating…' : `${completed} complete · ${failed} failed`}
                </div>
                {!running && completed > 0 && (
                  <button
                    onClick={saveAsConcepts}
                    disabled={selectedToSave.size === 0}
                    className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium text-xs disabled:opacity-50"
                  >
                    + Save {selectedToSave.size} as Concept{selectedToSave.size === 1 ? '' : 's'}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {variants.map((v) => (
                  <div key={v.id} className="bg-background border border-border rounded-lg overflow-hidden">
                    <div className="aspect-square placeholder-pattern relative">
                      {v.status === 'running' && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                      {v.status === 'failed' && (
                        <div className="absolute inset-0 flex items-center justify-center text-red-700 text-xs p-3 text-center">
                          {v.error || 'failed'}
                        </div>
                      )}
                      {v.status === 'complete' && v.imageUrl && (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={v.imageUrl} alt={v.label} className="w-full h-full object-cover" />
                          <label className="absolute top-2 left-2 flex items-center gap-1.5 bg-surface/90 px-2 py-1 rounded-full text-[11px] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedToSave.has(v.id)}
                              onChange={() => toggleSave(v.id)}
                              className="accent-accent w-3 h-3"
                            />
                            Save
                          </label>
                        </>
                      )}
                    </div>
                    <div className="p-2 text-xs">
                      <div className="font-medium">{v.label}</div>
                      <div className="text-[10px] text-muted capitalize">{v.status}</div>
                    </div>
                  </div>
                ))}
              </div>

              {!running && (
                <button
                  onClick={() => { setVariants([]); setSelectedToSave(new Set()); }}
                  className="w-full py-2 text-sm text-muted hover:text-foreground"
                >
                  ← Generate another batch
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
