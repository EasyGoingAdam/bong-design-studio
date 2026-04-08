'use client';

import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { TextArea, Tag } from './ui';
import { CoilBaseRelationship } from '@/lib/types';

interface BrainstormResult {
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

const QUICK_PICKS = [
  { label: 'Geometric', prompt: 'clean geometric patterns, mathematical precision, sacred geometry' },
  { label: 'Nature', prompt: 'organic nature-inspired designs, botanical, leaves, flowers' },
  { label: 'Dark / Edgy', prompt: 'dark edgy aesthetic, skulls, gothic, tattoo-inspired' },
  { label: 'Luxury', prompt: 'ornate luxury premium baroque filigree gold-leaf inspired' },
  { label: 'Patriotic', prompt: 'American patriotic, eagles, flags, stars and stripes' },
  { label: 'Abstract', prompt: 'abstract flowing forms, smoke, vapor, organic movement' },
  { label: 'Psychedelic', prompt: 'psychedelic trippy patterns, optical illusions, mind-bending' },
  { label: 'Japanese', prompt: 'Japanese-inspired, koi, waves, cherry blossom, ukiyo-e' },
  { label: 'Tribal', prompt: 'tribal patterns, Polynesian, Maori, bold black work' },
  { label: 'Minimalist', prompt: 'ultra minimalist clean lines, negative space, simple elegance' },
  { label: 'Seasonal', prompt: 'seasonal holiday themed, could be any holiday or season' },
  { label: 'Surprise Me', prompt: '' },
];

export function AIInspiration({ onOpenConcept }: { onOpenConcept: (id: string) => void }) {
  const { addConcept, openAIKey } = useAppStore();
  const [userPrompt, setUserPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<BrainstormResult[]>([]);
  const [error, setError] = useState('');
  const [count, setCount] = useState(3);

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
      } else {
        throw new Error('Unexpected response format');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Brainstorm failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleUseThis = (result: BrainstormResult, index: number) => {
    try {
      const concept = addConcept({
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
          symmetryRequirement: 'none',
          coordinationMode: (result.coordination as CoilBaseRelationship) || 'thematic',
          productionFeasibility: 3,
          riskNotes: '',
        },
        coilSpecs: { dimensions: '45mm x 120mm wrap', printableArea: '42mm x 115mm', notes: result.coilNotes || '' },
        baseSpecs: { dimensions: '65mm diameter circle', printableArea: '60mm diameter', notes: result.baseNotes || '' },
      });
      // Remove from brainstorm list
      setResults((prev) => prev.filter((_, i) => i !== index));
      // Navigate to the new concept
      onOpenConcept(concept.id);
    } catch (err) {
      console.error('Failed to create concept:', err);
      setError('Failed to create concept. Please try again.');
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">AI Brainstorm</h2>
        <p className="text-sm text-muted">Can't decide what to make? Let AI suggest design concepts for you.</p>
      </div>

      {/* Input Section */}
      <div className="bg-surface border border-border rounded-xl p-5 mb-6">
        <label className="block text-sm font-medium mb-2">Describe a vibe, theme, or idea (or leave blank for surprise)</label>
        <TextArea
          value={userPrompt}
          onChange={setUserPrompt}
          placeholder='e.g., "something nature-inspired but modern and edgy" or "a limited drop for Halloween" or just hit Surprise Me below...'
          rows={3}
        />

        {/* Quick Picks */}
        <div className="mt-3">
          <span className="text-xs text-muted block mb-2">Quick picks — click to brainstorm instantly:</span>
          <div className="flex flex-wrap gap-2">
            {QUICK_PICKS.map((pick) => (
              <button
                key={pick.label}
                onClick={() => {
                  if (pick.prompt) setUserPrompt(pick.prompt);
                  handleBrainstorm(pick.prompt);
                }}
                disabled={generating}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                  pick.label === 'Surprise Me'
                    ? 'bg-accent/20 border-accent/40 text-accent hover:bg-accent/30'
                    : 'bg-background border-border text-muted hover:text-foreground hover:border-border-light'
                } disabled:opacity-50`}
              >
                {pick.label === 'Surprise Me' ? '✦ ' : ''}{pick.label}
              </button>
            ))}
          </div>
        </div>

        {/* Count selector + Generate */}
        <div className="flex items-center gap-3 mt-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Ideas:</span>
            {[1, 3, 5].map((n) => (
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
            className="flex-1 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {generating ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Brainstorming...
              </span>
            ) : (
              '✦ Brainstorm Design Concepts'
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400 mb-4">
          {error}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">{results.length} Concept{results.length !== 1 ? 's' : ''} Generated</h3>
            <button
              onClick={() => handleBrainstorm()}
              disabled={generating}
              className="text-sm text-accent hover:text-accent-hover disabled:opacity-50"
            >
              ✦ Generate More
            </button>
          </div>

          {results.map((result, i) => (
            <div key={i} className="bg-surface border border-border rounded-xl p-5 hover:border-border-light transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h4 className="text-lg font-semibold">{result.name}</h4>
                  <div className="flex items-center gap-2 mt-1">
                    {result.collection && (
                      <span className="text-xs text-muted bg-border/50 px-2 py-0.5 rounded">{result.collection}</span>
                    )}
                    <span className="text-xs text-accent bg-accent/10 px-2 py-0.5 rounded">{result.style}</span>
                    {result.lifecycle && result.lifecycle !== 'evergreen' && (
                      <span className="text-xs text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded capitalize">{result.lifecycle.replace('_', ' ')}</span>
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

              {result.theme && (
                <p className="text-xs text-muted mt-2">Theme: {result.theme}</p>
              )}

              {/* Coil + Base notes */}
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

              {/* Tags + Specs */}
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
          <h3 className="text-lg font-medium mb-1">No ideas yet</h3>
          <p className="text-sm text-muted max-w-md mx-auto">
            Type a vibe or click one of the quick picks above to get AI-generated design concepts.
            Each concept comes with a name, description, specs, and notes for both coil and base.
          </p>
        </div>
      )}
    </div>
  );
}
