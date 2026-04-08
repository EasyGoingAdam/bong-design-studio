'use client';

import { useState, useMemo } from 'react';
import { useAppStore } from '@/lib/store';
import { Concept, GenerationMode, CoilBaseRelationship } from '@/lib/types';
import { Select, TextArea, SliderInput } from './ui';
import { buildCoilPrompt, buildBasePrompt } from '@/lib/prompt-builder';
import { ImageDownloadButtons } from './image-download';

const MODE_OPTIONS = [
  { value: 'production_bw', label: 'Production B&W (Laser-Ready)' },
  { value: 'concept_art', label: 'Concept Art' },
  { value: 'pattern_wrap', label: 'Pattern / Wrap' },
  { value: 'premium_luxury', label: 'Premium / Luxury' },
  { value: 'seasonal_drop', label: 'Seasonal Drop' },
];

const RELATIONSHIP_OPTIONS = [
  { value: 'exact_match', label: 'Exact Match' },
  { value: 'mirror', label: 'Mirrored' },
  { value: 'thematic', label: 'Thematic' },
  { value: 'loose', label: 'Loosely Coordinated' },
];

export function QuickGenerateModal({ concept, onClose }: { concept: Concept; onClose: () => void }) {
  const { openAIKey, updateConcept, addAIGeneration, addVersion } = useAppStore();

  // Pre-fill from concept specs
  const [mode, setMode] = useState<GenerationMode>('production_bw');
  const [relationship, setRelationship] = useState<CoilBaseRelationship>(concept.specs.coordinationMode || 'thematic');
  const [complexity, setComplexity] = useState<number>(concept.specs.laserComplexity || 3);
  const [contrast, setContrast] = useState('high');
  const [coilInstructions, setCoilInstructions] = useState(concept.coilSpecs.notes || '');
  const [baseInstructions, setBaseInstructions] = useState(concept.baseSpecs.notes || '');
  const [extraNotes, setExtraNotes] = useState('');

  const [generating, setGenerating] = useState(false);
  const [generatedCoilUrl, setGeneratedCoilUrl] = useState('');
  const [generatedBaseUrl, setGeneratedBaseUrl] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const hasExistingImages = !!(concept.coilImageUrl || concept.baseImageUrl);

  const inputs = useMemo(() => ({
    title: concept.name,
    stylePrompt: concept.specs.designStyleName || concept.tags.join(', '),
    themePrompt: concept.specs.designTheme || concept.description,
    references: extraNotes,
    constraints: concept.specs.riskNotes || '',
    complexityLevel: complexity,
    coilInstructions,
    baseInstructions,
    relationship,
    mode,
    patternDensity: concept.specs.patternDensity || 'medium',
    contrast,
  }), [concept, mode, relationship, complexity, contrast, coilInstructions, baseInstructions, extraNotes]);

  const coilPrompt = useMemo(() => buildCoilPrompt(inputs), [inputs]);
  const basePrompt = useMemo(() => buildBasePrompt(inputs), [inputs]);

  const handleGenerate = async () => {
    if (!openAIKey) {
      setError('Please set your OpenAI API key in Settings first.');
      return;
    }

    setGenerating(true);
    setError('');
    setGeneratedCoilUrl('');
    setGeneratedBaseUrl('');
    setSaved(false);

    try {
      // Generate both images
      const [coilRes, baseRes] = await Promise.all([
        fetch('/api/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: coilPrompt, apiKey: openAIKey }),
        }),
        fetch('/api/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: basePrompt, apiKey: openAIKey }),
        }),
      ]);

      const coilData = await coilRes.json();
      if (!coilRes.ok) throw new Error(coilData.error || 'Failed to generate coil image');

      const baseData = await baseRes.json();
      if (!baseRes.ok) throw new Error(baseData.error || 'Failed to generate base image');

      setGeneratedCoilUrl(coilData.imageUrl);
      setGeneratedBaseUrl(baseData.imageUrl);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = () => {
    // Update concept images
    updateConcept(concept.id, {
      coilImageUrl: generatedCoilUrl,
      baseImageUrl: generatedBaseUrl,
    });

    // Save AI generation record
    addAIGeneration(concept.id, {
      prompt: `${coilPrompt}\n\n---\n\n${basePrompt}`,
      coilPrompt,
      basePrompt,
      mode,
      coilImageUrl: generatedCoilUrl,
      baseImageUrl: generatedBaseUrl,
    });

    // Save as new version
    addVersion(concept.id, {
      coilImageUrl: generatedCoilUrl,
      baseImageUrl: generatedBaseUrl,
      prompt: coilPrompt,
      notes: hasExistingImages ? 'AI regenerated images' : 'AI generated initial images',
    });

    setSaved(true);
  };

  const handleSaveAndClose = () => {
    if (!saved && (generatedCoilUrl || generatedBaseUrl)) {
      handleSave();
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 modal-backdrop z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-surface border-b border-border px-6 py-4 rounded-t-xl z-10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">
                {hasExistingImages ? 'Regenerate' : 'Generate'} Images — {concept.name}
              </h2>
              <p className="text-xs text-muted mt-0.5">
                {hasExistingImages
                  ? 'Generate new Coil + Base images to replace the current ones'
                  : 'Generate Coil + Base concept images using AI'}
              </p>
            </div>
            <button onClick={onClose} className="text-muted hover:text-foreground text-lg px-2">×</button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* Current images (if any) */}
          {hasExistingImages && (
            <div className="bg-background border border-border rounded-lg p-3">
              <span className="text-xs text-muted block mb-2">Current Images</span>
              <div className="flex gap-3">
                <div className="w-20 h-20 rounded bg-surface placeholder-pattern border border-border flex items-center justify-center overflow-hidden">
                  {concept.coilImageUrl ? (
                    <img src={concept.coilImageUrl} alt="Coil" className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-[8px] text-muted">No coil</span>
                  )}
                </div>
                <div className="w-20 h-20 rounded bg-surface placeholder-pattern border border-border flex items-center justify-center overflow-hidden">
                  {concept.baseImageUrl ? (
                    <img src={concept.baseImageUrl} alt="Base" className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-[8px] text-muted">No base</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Quick Settings */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1">Generation Mode</label>
              <Select value={mode} onChange={(v) => setMode(v as GenerationMode)} options={MODE_OPTIONS} />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Coil/Base Relationship</label>
              <Select value={relationship} onChange={(v) => setRelationship(v as CoilBaseRelationship)} options={RELATIONSHIP_OPTIONS} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1">Contrast</label>
              <Select
                value={contrast}
                onChange={setContrast}
                options={[
                  { value: 'low', label: 'Low' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'high', label: 'High' },
                ]}
              />
            </div>
            <SliderInput value={complexity} onChange={setComplexity} label="Complexity" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1">Coil Instructions</label>
              <TextArea value={coilInstructions} onChange={setCoilInstructions} placeholder="Specific coil details..." rows={2} />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Base Instructions</label>
              <TextArea value={baseInstructions} onChange={setBaseInstructions} placeholder="Specific base details..." rows={2} />
            </div>
          </div>

          <div>
            <label className="block text-xs text-muted mb-1">Additional Notes / Direction</label>
            <TextArea value={extraNotes} onChange={setExtraNotes} placeholder="Any extra creative direction..." rows={2} />
          </div>

          {/* Auto-detected context */}
          <div className="bg-background border border-border rounded-lg p-3 text-xs text-muted space-y-1">
            <div className="font-medium text-foreground text-[11px] uppercase tracking-wide mb-1">Auto-filled from concept</div>
            <div>Style: {concept.specs.designStyleName || concept.tags.join(', ') || 'Not set'}</div>
            <div>Theme: {concept.specs.designTheme || 'From description'}</div>
            <div>Density: {concept.specs.patternDensity} · Symmetry: {concept.specs.symmetryRequirement}</div>
            <div>Coil: {concept.coilSpecs.dimensions || 'Default'} · Base: {concept.baseSpecs.dimensions || 'Default'}</div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full py-3 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {generating ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Generating Coil + Base...
              </span>
            ) : (
              `✦ ${hasExistingImages ? 'Regenerate' : 'Generate'} Coil + Base Images`
            )}
          </button>

          {/* Generated Output */}
          {(generatedCoilUrl || generatedBaseUrl) && (
            <div className="space-y-3">
              <div className="bg-background border border-border rounded-lg p-4">
                <span className="text-xs text-muted block mb-2">Generated Images</span>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-muted">Coil</span>
                      {generatedCoilUrl && <ImageDownloadButtons imageUrl={generatedCoilUrl} filename={`${concept.name}-coil`} />}
                    </div>
                    <div className="aspect-square rounded-lg border border-border overflow-hidden bg-surface">
                      {generatedCoilUrl ? (
                        <img src={generatedCoilUrl} alt="Generated Coil" className="w-full h-full object-contain" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-muted">Failed</div>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-muted">Base</span>
                      {generatedBaseUrl && <ImageDownloadButtons imageUrl={generatedBaseUrl} filename={`${concept.name}-base`} />}
                    </div>
                    <div className="aspect-square rounded-lg border border-border overflow-hidden bg-surface">
                      {generatedBaseUrl ? (
                        <img src={generatedBaseUrl} alt="Generated Base" className="w-full h-full object-contain" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-muted">Failed</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                {!saved ? (
                  <>
                    <button
                      onClick={handleSave}
                      className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg font-medium transition-colors"
                    >
                      Save as New Version
                    </button>
                    <button
                      onClick={handleGenerate}
                      disabled={generating}
                      className="flex-1 py-2.5 bg-background border border-border text-foreground text-sm rounded-lg hover:bg-surface-hover transition-colors"
                    >
                      Regenerate
                    </button>
                  </>
                ) : (
                  <div className="flex-1 py-2.5 bg-green-600/20 text-green-400 text-sm rounded-lg font-medium text-center border border-green-600/30">
                    Saved as Version {concept.versions.length}
                  </div>
                )}
              </div>

              {saved && (
                <button
                  onClick={handleSaveAndClose}
                  className="w-full py-2.5 bg-accent hover:bg-accent-hover text-white text-sm rounded-lg transition-colors"
                >
                  Done
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
