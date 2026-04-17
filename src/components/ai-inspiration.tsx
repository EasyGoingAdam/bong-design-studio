'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '@/lib/store';
import { TextArea, Tag } from './ui';
import { useToast } from './toast';
import { CoilBaseRelationship } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { QUICK_PICK_POOL } from '@/lib/quick-picks';

interface BrainstormResult {
  id?: string; // db id from archive
  name: string;
  collection: string;
  description: string;
  theme: string;
  style: string;
  tags: string[];
  audience: string;
  priority: string;
  lifecycle: string;
  complexity: number;
  density: string;
  coordination: string;
  coilNotes: string;
  baseNotes: string;
}

interface ArchivedIdea extends BrainstormResult {
  id: string;
  sourcePrompt: string;
  usedAt: string | null;
  conceptId: string | null;
  createdAt: string;
}

// Hooks for shuffling: pick N random items from array, stable per-render
function shuffleAndPick<T>(pool: T[], n: number, seed: number): T[] {
  // Deterministic shuffle based on seed so same visit = same picks
  const arr = [...pool];
  let s = seed;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, n);
}

type View = 'brainstorm' | 'archive';

export function AIInspiration({ onOpenConcept }: { onOpenConcept: (id: string) => void }) {
  const { addConcept, openAIKey } = useAppStore();
  const { toast } = useToast();

  const [view, setView] = useState<View>('brainstorm');
  const [userPrompt, setUserPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<BrainstormResult[]>([]);
  const [error, setError] = useState('');
  const [count, setCount] = useState(5);
  const [pickSeed, setPickSeed] = useState(() => Math.floor(Math.random() * 1e9));

  // Archive state
  const [archiveIdeas, setArchiveIdeas] = useState<ArchivedIdea[]>([]);
  const [archiveFilter, setArchiveFilter] = useState<'all' | 'unused' | 'used'>('unused');
  const [archiveSearch, setArchiveSearch] = useState('');
  const [loadingArchive, setLoadingArchive] = useState(false);

  // Randomly pick 12 quick-picks per seed change
  const quickPicks = useMemo(() => shuffleAndPick(QUICK_PICK_POOL, 12, pickSeed), [pickSeed]);

  // Load archive on mount AND when switching to archive view
  useEffect(() => {
    if (view === 'archive') loadArchive();
  }, [view]);

  const loadArchive = async () => {
    setLoadingArchive(true);
    try {
      const res = await fetch('/api/brainstorm-ideas');
      const data = await res.json();
      if (Array.isArray(data)) setArchiveIdeas(data);
    } catch {
      toast('Failed to load archive', 'error');
    } finally {
      setLoadingArchive(false);
    }
  };

  const handleBrainstorm = async (overridePrompt?: string) => {
    if (!openAIKey) {
      setError('Please set your OpenAI API key in Settings first.');
      return;
    }

    setGenerating(true);
    setError('');
    setResults([]);

    try {
      const res = await fetch('/api/brainstorm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: overridePrompt ?? userPrompt,
          apiKey: openAIKey,
          count,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Brainstorm failed');

      if (Array.isArray(data.concepts)) {
        setResults(data.concepts);
        if (data.concepts.length === 0) {
          toast('No new ideas — all generated ideas were already in your archive. Try a different prompt.', 'info');
        } else if (data.filteredOut > 0) {
          toast(`${data.concepts.length} new ideas (${data.filteredOut} filtered as duplicates)`, 'success');
        } else {
          toast(`${data.concepts.length} fresh ideas generated`, 'success');
        }
      } else {
        throw new Error('Unexpected response format');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Brainstorm failed');
    } finally {
      setGenerating(false);
    }
  };

  const buildConceptFromIdea = (result: BrainstormResult) => ({
    name: result.name,
    collection: result.collection || '',
    description: result.description,
    tags: result.tags || [],
    intendedAudience: result.audience || '',
    priority: (result.priority as 'low' | 'medium' | 'high' | 'urgent') || 'medium',
    lifecycleType: (result.lifecycle as 'seasonal' | 'evergreen' | 'limited_edition' | 'custom') || 'evergreen',
    specs: {
      designStyleName: result.style || '',
      designTheme: result.theme || '',
      patternDensity: (result.density as 'low' | 'medium' | 'high' | 'very_high') || 'medium',
      laserComplexity: (result.complexity as 1 | 2 | 3 | 4 | 5) || 3,
      estimatedEtchingTime: '',
      surfaceCoverage: 50,
      lineThickness: '',
      bwContrastGuidance: '',
      symmetryRequirement: 'none' as const,
      coordinationMode: (result.coordination as CoilBaseRelationship) || 'thematic',
      productionFeasibility: 3 as const,
      riskNotes: '',
    },
    coilSpecs: { dimensions: '45mm x 120mm wrap', printableArea: '42mm x 115mm', notes: result.coilNotes || '' },
    baseSpecs: { dimensions: '65mm diameter circle', printableArea: '60mm diameter', notes: result.baseNotes || '' },
  });

  const handleUseThis = async (result: BrainstormResult, index: number) => {
    try {
      const concept = await addConcept(buildConceptFromIdea(result));
      // Mark idea as used in archive (if it has a db id)
      if (result.id) {
        fetch(`/api/brainstorm-ideas/${result.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conceptId: concept.id }),
        }).catch(console.error);
      }
      setResults((prev) => prev.filter((_, i) => i !== index));
      toast(`"${result.name}" added to Concepts`, 'success');
    } catch {
      setError('Failed to create concept. Please try again.');
    }
  };

  const handleUseArchived = async (idea: ArchivedIdea) => {
    try {
      const concept = await addConcept(buildConceptFromIdea(idea));
      await fetch(`/api/brainstorm-ideas/${idea.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conceptId: concept.id }),
      });
      setArchiveIdeas((prev) =>
        prev.map((i) => (i.id === idea.id ? { ...i, usedAt: new Date().toISOString(), conceptId: concept.id } : i))
      );
      toast(`"${idea.name}" added to Concepts`, 'success');
    } catch {
      toast('Failed to create concept', 'error');
    }
  };

  const handleDeleteArchived = async (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}" from archive? This cannot be undone.`)) return;
    try {
      await fetch(`/api/brainstorm-ideas/${id}`, { method: 'DELETE' });
      setArchiveIdeas((prev) => prev.filter((i) => i.id !== id));
      toast('Idea removed from archive', 'success');
    } catch {
      toast('Failed to delete idea', 'error');
    }
  };

  const filteredArchive = useMemo(() => {
    let list = archiveIdeas;
    if (archiveFilter === 'used') list = list.filter((i) => i.usedAt);
    if (archiveFilter === 'unused') list = list.filter((i) => !i.usedAt);
    if (archiveSearch.trim()) {
      const q = archiveSearch.toLowerCase();
      list = list.filter((i) =>
        i.name.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        i.style.toLowerCase().includes(q) ||
        (i.tags || []).some((t) => t.toLowerCase().includes(q))
      );
    }
    return list;
  }, [archiveIdeas, archiveFilter, archiveSearch]);

  // ========== ARCHIVE VIEW ==========
  if (view === 'archive') {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold">Archive Ideas</h2>
            <p className="text-sm text-muted">Every idea ever brainstormed — revisit, reuse, or remove.</p>
          </div>
          <button
            onClick={() => setView('brainstorm')}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm rounded-lg transition-colors"
          >
            ← Back to Brainstorm
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex gap-1 bg-surface border border-border rounded-lg p-0.5">
            <button
              onClick={() => setArchiveFilter('unused')}
              className={`px-3 py-1.5 text-xs rounded transition-colors ${archiveFilter === 'unused' ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}
            >
              Unused
            </button>
            <button
              onClick={() => setArchiveFilter('used')}
              className={`px-3 py-1.5 text-xs rounded transition-colors ${archiveFilter === 'used' ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}
            >
              Used
            </button>
            <button
              onClick={() => setArchiveFilter('all')}
              className={`px-3 py-1.5 text-xs rounded transition-colors ${archiveFilter === 'all' ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}
            >
              All
            </button>
          </div>
          <input
            type="text"
            value={archiveSearch}
            onChange={(e) => setArchiveSearch(e.target.value)}
            placeholder="Search ideas..."
            className="flex-1 min-w-[200px] bg-background border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
          />
          <button
            onClick={loadArchive}
            className="px-3 py-1.5 text-xs bg-background border border-border rounded-lg hover:bg-surface-hover transition-colors text-muted"
          >
            ↻ Refresh
          </button>
        </div>

        {loadingArchive ? (
          <div className="text-center py-16">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : filteredArchive.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4 opacity-40">📦</div>
            <h3 className="text-lg font-medium mb-1">No ideas {archiveFilter !== 'all' ? archiveFilter : 'yet'}</h3>
            <p className="text-sm text-muted">
              {archiveIdeas.length === 0
                ? 'Generate some ideas on the Brainstorm page to build your archive.'
                : 'Try a different filter or search.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredArchive.map((idea) => (
              <div
                key={idea.id}
                className={`bg-surface border rounded-xl p-4 transition-colors ${
                  idea.usedAt ? 'border-border opacity-70' : 'border-border hover:border-border-light'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-base font-semibold">{idea.name}</h4>
                      {idea.usedAt && (
                        <span className="text-[10px] text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                          ✓ Used
                        </span>
                      )}
                      {idea.collection && (
                        <span className="text-xs text-muted bg-border/50 px-2 py-0.5 rounded">{idea.collection}</span>
                      )}
                      {idea.style && (
                        <span className="text-xs text-accent bg-accent/10 px-2 py-0.5 rounded">{idea.style}</span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted mt-0.5">
                      Created {formatDate(idea.createdAt)}
                      {idea.usedAt && ` · Used ${formatDate(idea.usedAt)}`}
                      {idea.sourcePrompt && ` · From: "${idea.sourcePrompt}"`}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {idea.usedAt && idea.conceptId ? (
                      <button
                        onClick={() => onOpenConcept(idea.conceptId!)}
                        className="px-3 py-1.5 bg-background border border-border text-sm rounded-lg hover:bg-surface-hover transition-colors"
                      >
                        Open Concept →
                      </button>
                    ) : (
                      <button
                        onClick={() => handleUseArchived(idea)}
                        className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-sm rounded-lg transition-colors"
                      >
                        Use This →
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteArchived(idea.id, idea.name)}
                      className="px-2 py-1.5 text-xs text-red-500 hover:text-red-700 border border-transparent hover:border-red-200 rounded-lg transition-colors"
                      title="Delete from archive"
                    >
                      🗑
                    </button>
                  </div>
                </div>

                <p className="text-sm mt-2">{idea.description}</p>

                {idea.theme && <p className="text-xs text-muted mt-1">Theme: {idea.theme}</p>}

                <div className="grid grid-cols-2 gap-3 mt-3">
                  {idea.coilNotes && (
                    <div className="bg-background border border-border rounded-lg p-2.5">
                      <span className="text-[10px] text-muted uppercase tracking-wide">Coil</span>
                      <p className="text-xs mt-0.5">{idea.coilNotes}</p>
                    </div>
                  )}
                  {idea.baseNotes && (
                    <div className="bg-background border border-border rounded-lg p-2.5">
                      <span className="text-[10px] text-muted uppercase tracking-wide">Base</span>
                      <p className="text-xs mt-0.5">{idea.baseNotes}</p>
                    </div>
                  )}
                </div>

                {idea.tags && idea.tags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    {idea.tags.map((t) => <Tag key={t} label={t} />)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ========== BRAINSTORM VIEW ==========
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">AI Brainstorm</h2>
          <p className="text-sm text-muted">Fresh ideas every time. Used ideas archive automatically — never repeats.</p>
        </div>
        <button
          onClick={() => setView('archive')}
          className="px-4 py-2 bg-background border border-border text-sm rounded-lg hover:bg-surface-hover transition-colors flex items-center gap-2"
        >
          📦 Archive Ideas
        </button>
      </div>

      {/* Input Section */}
      <div className="bg-surface border border-border rounded-xl p-5 mb-6">
        <label className="block text-sm font-medium mb-2">Describe a vibe, theme, or idea (or leave blank)</label>
        <TextArea
          value={userPrompt}
          onChange={setUserPrompt}
          placeholder='e.g., "something nature-inspired but modern and edgy" or "a limited drop for Halloween"...'
          rows={3}
        />

        {/* Quick Picks */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted">
              Quick picks — click to brainstorm instantly
            </span>
            <button
              onClick={() => setPickSeed(Math.floor(Math.random() * 1e9))}
              disabled={generating}
              className="text-xs text-accent hover:text-accent-hover disabled:opacity-50 flex items-center gap-1"
              title="Shuffle quick picks"
            >
              ↻ Shuffle
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {quickPicks.map((pick) => (
              <button
                key={pick.label}
                onClick={() => {
                  setUserPrompt(pick.prompt);
                  handleBrainstorm(pick.prompt);
                }}
                disabled={generating}
                className="px-3 py-1.5 text-xs rounded-lg border bg-background border-border text-muted hover:text-foreground hover:border-border-light transition-colors disabled:opacity-50"
              >
                {pick.label}
              </button>
            ))}
            <button
              onClick={() => {
                setUserPrompt('');
                handleBrainstorm('');
              }}
              disabled={generating}
              className="px-3 py-1.5 text-xs rounded-lg border bg-accent/20 border-accent/40 text-accent hover:bg-accent/30 transition-colors disabled:opacity-50"
            >
              ✦ Surprise Me
            </button>
          </div>
        </div>

        {/* Count selector + Generate */}
        <div className="flex items-center gap-3 mt-5 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Ideas:</span>
            {[1, 3, 5, 7, 10].map((n) => (
              <button
                key={n}
                onClick={() => setCount(n)}
                className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                  count === n ? 'bg-accent text-white' : 'bg-background border border-border text-muted hover:text-foreground'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <button
            onClick={() => handleBrainstorm()}
            disabled={generating}
            className="flex-1 min-w-[200px] py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {generating ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Brainstorming {count} {count === 1 ? 'idea' : 'ideas'}...
              </span>
            ) : (
              `✦ Brainstorm ${count} ${count === 1 ? 'Idea' : 'Ideas'}`
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-4">
          {error}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">{results.length} Fresh {results.length === 1 ? 'Concept' : 'Concepts'}</h3>
            <button
              onClick={() => handleBrainstorm()}
              disabled={generating}
              className="text-sm text-accent hover:text-accent-hover disabled:opacity-50"
            >
              ✦ Generate More
            </button>
          </div>

          {results.map((result, i) => (
            <div key={result.id || i} className="bg-surface border border-border rounded-xl p-5 hover:border-border-light transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h4 className="text-lg font-semibold">{result.name}</h4>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {result.collection && (
                      <span className="text-xs text-muted bg-border/50 px-2 py-0.5 rounded">{result.collection}</span>
                    )}
                    {result.style && (
                      <span className="text-xs text-accent bg-accent/10 px-2 py-0.5 rounded">{result.style}</span>
                    )}
                    {result.lifecycle && result.lifecycle !== 'evergreen' && (
                      <span className="text-xs text-orange-700 bg-orange-100 px-2 py-0.5 rounded capitalize">{result.lifecycle.replace('_', ' ')}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleUseThis(result, i); }}
                  className="shrink-0 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm rounded-lg font-medium transition-colors"
                >
                  Use This →
                </button>
              </div>

              <p className="text-sm mt-3">{result.description}</p>

              {result.theme && <p className="text-xs text-muted mt-2">Theme: {result.theme}</p>}

              <div className="grid grid-cols-2 gap-3 mt-3">
                {result.coilNotes && (
                  <div className="bg-background border border-border rounded-lg p-2.5">
                    <span className="text-[10px] text-muted uppercase tracking-wide">Coil</span>
                    <p className="text-xs mt-0.5">{result.coilNotes}</p>
                  </div>
                )}
                {result.baseNotes && (
                  <div className="bg-background border border-border rounded-lg p-2.5">
                    <span className="text-[10px] text-muted uppercase tracking-wide">Base</span>
                    <p className="text-xs mt-0.5">{result.baseNotes}</p>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-3">
                {result.tags?.map((t) => <Tag key={t} label={t} />)}
              </div>

              <div className="flex items-center gap-4 mt-2 text-xs text-muted">
                {result.audience && <span>Audience: {result.audience}</span>}
                {result.complexity && <span>Complexity: {'●'.repeat(result.complexity)}{'○'.repeat(5 - result.complexity)}</span>}
                {result.density && <span>Density: {result.density}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!generating && results.length === 0 && !error && (
        <div className="text-center py-16">
          <div className="text-5xl mb-4 opacity-40">✦</div>
          <h3 className="text-lg font-medium mb-1">Ready when you are</h3>
          <p className="text-sm text-muted max-w-md mx-auto">
            Every idea ever generated is saved to your archive — no repeats, ever.
            Pick a category above or type your own vibe. Need up to 10 ideas at once.
          </p>
        </div>
      )}
    </div>
  );
}
