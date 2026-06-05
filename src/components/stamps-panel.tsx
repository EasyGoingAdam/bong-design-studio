'use client';

import { useState } from 'react';
import { Concept, Stamp } from '@/lib/types';
import { useAppStore } from '@/lib/store';
import { useToast } from './toast';
import { log } from '@/lib/log';
import { ImageDownloadButtons } from './image-download';

/**
 * StampsPanel — concept-detail surface for stamps-mode concepts.
 *
 *   - Grid of stamps with per-stamp regenerate
 *   - "Regenerate all" button at top
 *   - Tap any stamp to edit (regenerate with the same subject)
 *   - "Add stamp" button (up to 5 total) — picks a new subject via the
 *     brainstorm endpoint
 *   - Per-stamp delete
 *
 * Mutations go through useAppStore.updateConcept so the workflow card
 * updates immediately + server-side persistence runs in the background.
 */

const MAX_STAMPS = 5;

export function StampsPanel({ concept }: { concept: Concept }) {
  const { updateConcept, openAIKey, geminiKey } = useAppStore();
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState(false);

  const stamps = concept.stamps || [];
  const themeFromConcept = (() => {
    // Theme might live in name ("baseball stamps"), description, or tags.
    // Use the first tag if it looks like a theme, else fall back to name.
    const firstTag = (concept.tags || []).find((t) => !['stamps', `${stamps.length}-pack`].includes(t.toLowerCase()));
    return firstTag || concept.name.replace(/\bstamps?\b/i, '').trim() || concept.name;
  })();

  const saveStamps = (next: Stamp[]) => {
    updateConcept(concept.id, { stamps: next });
  };

  /** Regenerate one stamp using its current subject. */
  const regenerateOne = async (stampId: string) => {
    if (!openAIKey) { toast('Set your OpenAI API key in Settings first', 'error'); return; }
    const current = stamps.find((s) => s.id === stampId);
    if (!current) return;
    setBusyId(stampId);
    log.info('client.stamps.regen.one', { concept_id: concept.id.slice(0, 8), subject: current.subject });
    try {
      const res = await fetch('/api/generate-stamps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme: themeFromConcept,
          count: 1,
          subjects: [current.subject],
          apiKey: openAIKey,
          geminiKey,
        }),
      });
      const data = await res.json();
      const fresh = Array.isArray(data.stamps) && data.stamps[0];
      if (!res.ok || !fresh?.imageUrl) {
        toast(data.error || fresh?.error || 'Regenerate failed', 'error');
        return;
      }
      // Keep the original id so the grid doesn't reorder.
      saveStamps(stamps.map((s) => s.id === stampId
        ? { ...s, imageUrl: fresh.imageUrl, prompt: fresh.prompt, createdAt: fresh.createdAt, model: fresh.model }
        : s
      ));
      toast(`Regenerated "${current.subject}"`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Regenerate failed', 'error');
    } finally {
      setBusyId(null);
    }
  };

  /** Regenerate every stamp in place — keeps subjects, gets new visual takes. */
  const regenerateAll = async () => {
    if (!openAIKey) { toast('Set your OpenAI API key in Settings first', 'error'); return; }
    if (stamps.length === 0) return;
    setBusyAll(true);
    try {
      const res = await fetch('/api/generate-stamps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme: themeFromConcept,
          count: stamps.length,
          subjects: stamps.map((s) => s.subject),
          apiKey: openAIKey,
          geminiKey,
        }),
      });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.stamps)) {
        toast(data.error || 'Regenerate-all failed', 'error');
        return;
      }
      // Match incoming stamps to existing ones by subject so ids stay stable.
      const fresh: Stamp[] = stamps.map((existing) => {
        const incoming = data.stamps.find((s: { subject: string }) => s.subject === existing.subject);
        if (!incoming?.imageUrl) return existing;
        return {
          ...existing,
          imageUrl: incoming.imageUrl,
          prompt: incoming.prompt,
          createdAt: incoming.createdAt,
          model: incoming.model,
        };
      });
      saveStamps(fresh);
      toast(`Regenerated ${stamps.length} stamps`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Regenerate-all failed', 'error');
    } finally {
      setBusyAll(false);
    }
  };

  /** Brainstorm one more subject + generate it, up to MAX_STAMPS. */
  const addStamp = async () => {
    if (stamps.length >= MAX_STAMPS) return;
    if (!openAIKey) { toast('Set your OpenAI API key in Settings first', 'error'); return; }
    setBusyAll(true);
    try {
      // Brainstorm enough subjects to definitely include one we don't
      // already have. Could call subjects-only endpoint but reusing the
      // generate-stamps brainstorm path keeps the API surface small.
      const need = Math.min(MAX_STAMPS, stamps.length + 1);
      const res = await fetch('/api/generate-stamps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme: themeFromConcept,
          count: need,
          apiKey: openAIKey,
          geminiKey,
        }),
      });
      const data = await res.json();
      const incoming: Stamp[] = Array.isArray(data.stamps) ? data.stamps : [];
      // Pick the first subject we don't already have.
      const haveSubjects = new Set(stamps.map((s) => s.subject.toLowerCase()));
      const novel = incoming.find((s) => !haveSubjects.has(s.subject.toLowerCase()) && s.imageUrl);
      if (!novel) {
        toast('AI couldn\'t suggest a new subject — try regenerating all instead.', 'info');
        return;
      }
      saveStamps([...stamps, novel]);
      toast(`Added "${novel.subject}"`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Add stamp failed', 'error');
    } finally {
      setBusyAll(false);
    }
  };

  const removeStamp = (stampId: string) => {
    const current = stamps.find((s) => s.id === stampId);
    if (!current) return;
    if (!window.confirm(`Remove the "${current.subject}" stamp from this concept?`)) return;
    saveStamps(stamps.filter((s) => s.id !== stampId));
    toast(`Removed "${current.subject}"`, 'info');
  };

  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="flex items-baseline justify-between mb-3 gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold">
            Stamps · {stamps.length}{stamps.length < MAX_STAMPS ? `/${MAX_STAMPS}` : ''}
          </h3>
          <p className="text-[11px] text-muted">
            Theme: <span className="font-medium">{themeFromConcept}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {stamps.length > 0 && (
            <button
              type="button"
              onClick={regenerateAll}
              disabled={busyAll || !!busyId}
              className="text-xs px-3 py-1.5 bg-background border border-border rounded-lg hover:border-foreground disabled:opacity-50"
            >
              {busyAll ? '↻ Regenerating…' : '↻ Regenerate all'}
            </button>
          )}
          {stamps.length < MAX_STAMPS && (
            <button
              type="button"
              onClick={addStamp}
              disabled={busyAll || !!busyId}
              className="text-xs px-3 py-1.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium disabled:opacity-50"
            >
              + Add stamp
            </button>
          )}
        </div>
      </div>

      {stamps.length === 0 ? (
        <div className="text-center text-xs text-muted py-6">
          No stamps yet. Use the AI Generate tab in Stamps mode to seed this concept, or click <strong>+ Add stamp</strong>.
        </div>
      ) : (
        // Larger grid — these are the PRIMARY images for a stamps
        // concept (no separate coil/base) so they need room to be
        // inspected. Two-up on mobile, three-up on lg+, never more.
        // Each tile has the same download buttons + score the coil
        // image would normally get.
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {stamps.map((s) => {
            const isBusy = busyId === s.id || busyAll;
            return (
              <div key={s.id} className="bg-background border border-border rounded-xl overflow-hidden">
                {/* Big square preview — matches the coil-image preview
                    sizing on standard concepts. */}
                <div className="aspect-square bg-background placeholder-pattern relative">
                  {s.imageUrl && !isBusy && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.imageUrl}
                      alt={s.subject}
                      className="w-full h-full object-contain p-2"
                    />
                  )}
                  {isBusy && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                  {!s.imageUrl && !isBusy && (
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-muted">
                      No image
                    </div>
                  )}
                </div>
                <div className="p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-sm truncate" title={s.subject}>{s.subject}</div>
                    {s.imageUrl && (
                      <ImageDownloadButtons
                        imageUrl={s.imageUrl}
                        filename={`${concept.name}-stamp-${s.subject.replace(/[^a-z0-9-]/gi, '-').slice(0, 30)}`}
                      />
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => regenerateOne(s.id)}
                      disabled={isBusy}
                      className="flex-1 text-xs px-2 py-1.5 bg-surface border border-border rounded hover:border-foreground disabled:opacity-50"
                    >
                      {busyId === s.id ? '↻ Regenerating…' : '↻ Regenerate'}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeStamp(s.id)}
                      disabled={isBusy}
                      className="text-xs px-2 py-1.5 bg-surface border border-border rounded hover:border-red-300 text-muted hover:text-red-700 disabled:opacity-50"
                      title="Remove this stamp"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
