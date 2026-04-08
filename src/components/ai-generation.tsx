'use client';

import { useState, useMemo } from 'react';
import { useAppStore } from '@/lib/store';
import { GenerationMode, CoilBaseRelationship } from '@/lib/types';
import { Input, TextArea, Select, SliderInput } from './ui';
import { buildCoilPrompt, buildBasePrompt, SAMPLE_PROMPTS } from '@/lib/prompt-builder';
import { ImageDownloadButtons } from './image-download';
import { useToast } from './toast';

const MODE_OPTIONS = [
  { value: 'concept_art', label: 'Concept Art Mode' },
  { value: 'production_bw', label: 'Production B&W Mode' },
  { value: 'pattern_wrap', label: 'Pattern / Wrap Mode' },
  { value: 'premium_luxury', label: 'Premium / Luxury Mode' },
  { value: 'seasonal_drop', label: 'Seasonal Drop Mode' },
];

const RELATIONSHIP_OPTIONS = [
  { value: 'exact_match', label: 'Exact Match' },
  { value: 'mirror', label: 'Mirrored' },
  { value: 'thematic', label: 'Thematic' },
  { value: 'complementary', label: 'Complementary' },
  { value: 'continuation', label: 'Continuation / Flow' },
  { value: 'contrast', label: 'Contrast' },
  { value: 'loose', label: 'Loosely Coordinated' },
  { value: 'independent', label: 'Independent / Standalone' },
];

export function AIGeneration({ onOpenConcept }: { onOpenConcept: (id: string) => void }) {
  const { concepts, addConcept, addAIGeneration, addVersion, openAIKey } = useAppStore();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [stylePrompt, setStylePrompt] = useState('');
  const [themePrompt, setThemePrompt] = useState('');
  const [references, setReferences] = useState('');
  const [constraints, setConstraints] = useState('');
  const [complexityLevel, setComplexityLevel] = useState(3);
  const [coilInstructions, setCoilInstructions] = useState('');
  const [baseInstructions, setBaseInstructions] = useState('');
  const [relationship, setRelationship] = useState<CoilBaseRelationship>('thematic');
  const [mode, setMode] = useState<GenerationMode>('production_bw');
  const [contrast, setContrast] = useState('high');
  const [density, setDensity] = useState('medium');

  const [generating, setGenerating] = useState(false);
  const [generatedCoilUrl, setGeneratedCoilUrl] = useState('');
  const [generatedBaseUrl, setGeneratedBaseUrl] = useState('');
  const [error, setError] = useState('');
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [showSamples, setShowSamples] = useState(false);

  // Which existing concept to generate for (optional)
  const [targetConceptId, setTargetConceptId] = useState('');

  const inputs = {
    title, stylePrompt, themePrompt, references, constraints,
    complexityLevel, coilInstructions, baseInstructions,
    relationship, mode, patternDensity: density, contrast,
  };

  const coilPrompt = useMemo(() => buildCoilPrompt(inputs), [title, stylePrompt, themePrompt, references, constraints, complexityLevel, coilInstructions, baseInstructions, relationship, mode, density, contrast]);
  const basePrompt = useMemo(() => buildBasePrompt(inputs), [title, stylePrompt, themePrompt, references, constraints, complexityLevel, coilInstructions, baseInstructions, relationship, mode, density, contrast]);

  const handleGenerate = async () => {
    if (!openAIKey) {
      setError('Please set your OpenAI API key in Settings first.');
      return;
    }
    if (!title.trim()) {
      setError('Please enter a design title.');
      return;
    }

    setGenerating(true);
    setError('');
    setGeneratedCoilUrl('');
    setGeneratedBaseUrl('');

    try {
      // Generate Coil image
      const coilRes = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: coilPrompt, apiKey: openAIKey }),
      });
      const coilData = await coilRes.json();
      if (!coilRes.ok) throw new Error(coilData.error || 'Failed to generate coil image');
      setGeneratedCoilUrl(coilData.imageUrl);

      // Generate Base image
      const baseRes = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: basePrompt, apiKey: openAIKey }),
      });
      const baseData = await baseRes.json();
      if (!baseRes.ok) throw new Error(baseData.error || 'Failed to generate base image');
      setGeneratedBaseUrl(baseData.imageUrl);

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveAsNewConcept = () => {
    const concept = addConcept({
      name: title,
      description: `AI Generated: ${stylePrompt} / ${themePrompt}`,
      tags: [mode, relationship],
      coilImageUrl: generatedCoilUrl,
      baseImageUrl: generatedBaseUrl,
    });
    addAIGeneration(concept.id, {
      prompt: `${coilPrompt}\n\n---\n\n${basePrompt}`,
      coilPrompt,
      basePrompt,
      mode,
      coilImageUrl: generatedCoilUrl,
      baseImageUrl: generatedBaseUrl,
    });
    addVersion(concept.id, {
      coilImageUrl: generatedCoilUrl,
      baseImageUrl: generatedBaseUrl,
      prompt: coilPrompt,
      notes: 'AI generated initial concept',
    });
    toast('Concept created from generation', 'success');
    onOpenConcept(concept.id);
  };

  const handleSaveToExisting = () => {
    if (!targetConceptId) return;
    addAIGeneration(targetConceptId, {
      prompt: `${coilPrompt}\n\n---\n\n${basePrompt}`,
      coilPrompt,
      basePrompt,
      mode,
      coilImageUrl: generatedCoilUrl,
      baseImageUrl: generatedBaseUrl,
    });
    addVersion(targetConceptId, {
      coilImageUrl: generatedCoilUrl,
      baseImageUrl: generatedBaseUrl,
      prompt: coilPrompt,
      notes: 'AI generated variation',
    });
    toast('Saved as new version', 'success');
    onOpenConcept(targetConceptId);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold">AI Concept Generation</h2>
          <p className="text-sm text-muted">Generate coordinated Coil + Base design concepts</p>
        </div>
        <button
          onClick={() => setShowSamples(!showSamples)}
          className="text-sm text-accent hover:text-accent-hover"
        >
          {showSamples ? 'Hide' : 'View'} Sample Prompts
        </button>
      </div>

      {/* Sample Prompts Panel */}
      {showSamples && (
        <div className="bg-surface border border-border rounded-xl p-4 mb-4 space-y-4">
          <h3 className="text-sm font-semibold">Sample Prompts Reference</h3>
          {Object.entries(SAMPLE_PROMPTS).map(([key, sample]) => (
            <div key={key} className="border-t border-border pt-3">
              <h4 className="text-xs font-semibold text-accent mb-1">{sample.title}</h4>
              {'coil' in sample ? (
                <div className="space-y-2">
                  <div>
                    <span className="text-[10px] text-muted uppercase">Coil Prompt</span>
                    <pre className="text-xs text-muted bg-background rounded p-2 overflow-x-auto whitespace-pre-wrap">{sample.coil}</pre>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted uppercase">Base Prompt</span>
                    <pre className="text-xs text-muted bg-background rounded p-2 overflow-x-auto whitespace-pre-wrap">{sample.base}</pre>
                  </div>
                </div>
              ) : (
                <pre className="text-xs text-muted bg-background rounded p-2 overflow-x-auto whitespace-pre-wrap">{sample.prompt}</pre>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Form */}
        <div className="space-y-4">
          <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold">Design Parameters</h3>

            <div>
              <label className="block text-xs text-muted mb-1">Design Title *</label>
              <Input value={title} onChange={setTitle} placeholder="e.g., Sacred Geometry Mandala" />
            </div>

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

            <div>
              <label className="block text-xs text-muted mb-1">Style Prompt</label>
              <Input value={stylePrompt} onChange={setStylePrompt} placeholder="e.g., geometric, mandala, sacred geometry" />
            </div>

            <div>
              <label className="block text-xs text-muted mb-1">Theme Prompt</label>
              <Input value={themePrompt} onChange={setThemePrompt} placeholder="e.g., spiritual, mathematical, nature" />
            </div>

            <div>
              <label className="block text-xs text-muted mb-1">References / Inspiration</label>
              <TextArea value={references} onChange={setReferences} placeholder="Describe reference images or inspiration..." rows={2} />
            </div>

            <div>
              <label className="block text-xs text-muted mb-1">Laser Etching Constraints</label>
              <TextArea value={constraints} onChange={setConstraints} placeholder="Special constraints for laser etching..." rows={2} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted mb-1">Contrast</label>
                <Select value={contrast} onChange={setContrast} options={[{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }]} />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Pattern Density</label>
                <Select value={density} onChange={setDensity} options={[{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }, { value: 'very_high', label: 'Very High' }]} />
              </div>
            </div>

            <SliderInput value={complexityLevel} onChange={setComplexityLevel} label="Complexity Level" />
          </div>

          <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold">Part-Specific Instructions</h3>
            <div>
              <label className="block text-xs text-muted mb-1">Coil-Specific Instructions</label>
              <TextArea value={coilInstructions} onChange={setCoilInstructions} placeholder="Instructions specific to the coil piece..." rows={2} />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Base-Specific Instructions</label>
              <TextArea value={baseInstructions} onChange={setBaseInstructions} placeholder="Instructions specific to the base piece..." rows={2} />
            </div>
          </div>

          <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold">Save to Existing Concept (Optional)</h3>
            <Select
              value={targetConceptId}
              onChange={setTargetConceptId}
              placeholder="Create new concept"
              options={concepts.map((c) => ({ value: c.id, label: `${c.name} (${c.status})` }))}
            />
          </div>

          {/* Prompt Preview */}
          <div className="bg-surface border border-border rounded-xl p-4">
            <button
              onClick={() => setShowPromptPreview(!showPromptPreview)}
              className="text-sm font-semibold flex items-center gap-1"
            >
              <span>{showPromptPreview ? '▾' : '▸'}</span> Preview Built Prompts
            </button>
            {showPromptPreview && (
              <div className="mt-3 space-y-3">
                <div>
                  <span className="text-[10px] text-muted uppercase">Coil Prompt</span>
                  <pre className="text-xs text-muted bg-background rounded p-2 overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto">{coilPrompt}</pre>
                </div>
                <div>
                  <span className="text-[10px] text-muted uppercase">Base Prompt</span>
                  <pre className="text-xs text-muted bg-background rounded p-2 overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto">{basePrompt}</pre>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {!stylePrompt && !themePrompt && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-2 text-xs text-yellow-400">Tip: Add a style or theme prompt for better results.</div>
          )}

          <button
            onClick={handleGenerate}
            disabled={generating || !title.trim()}
            className="w-full py-3 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {generating ? '✦ Generating Concepts...' : '✦ Generate Coil + Base Concepts'}
          </button>
        </div>

        {/* Output Preview */}
        <div className="space-y-4">
          <div className="bg-surface border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-3">Generated Output</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted">Coil Concept</span>
                  {generatedCoilUrl && <ImageDownloadButtons imageUrl={generatedCoilUrl} filename={`${title || 'concept'}-coil`} />}
                </div>
                <div className="aspect-square rounded-lg bg-background placeholder-pattern border border-border flex items-center justify-center overflow-hidden">
                  {generatedCoilUrl ? (
                    <img src={generatedCoilUrl} alt="Generated Coil" className="w-full h-full object-contain" />
                  ) : generating ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs text-muted">Generating...</span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted">Coil preview</span>
                  )}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted">Base Concept</span>
                  {generatedBaseUrl && <ImageDownloadButtons imageUrl={generatedBaseUrl} filename={`${title || 'concept'}-base`} />}
                </div>
                <div className="aspect-square rounded-lg bg-background placeholder-pattern border border-border flex items-center justify-center overflow-hidden">
                  {generatedBaseUrl ? (
                    <img src={generatedBaseUrl} alt="Generated Base" className="w-full h-full object-contain" />
                  ) : generating ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs text-muted">Generating...</span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted">Base preview</span>
                  )}
                </div>
              </div>
            </div>

            {/* Combined Preview */}
            {(generatedCoilUrl || generatedBaseUrl) && (
              <div className="mt-4">
                <span className="text-xs text-muted block mb-1">Combined Preview</span>
                <div className="flex gap-2 items-end bg-background rounded-lg p-4 border border-border">
                  <div className="flex-1">
                    {generatedCoilUrl && <img src={generatedCoilUrl} alt="Coil" className="w-full rounded" />}
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-muted text-center block">Coil</span>
                      {generatedCoilUrl && <ImageDownloadButtons imageUrl={generatedCoilUrl} filename={`${title || 'concept'}-coil-combined`} />}
                    </div>
                  </div>
                  <div className="text-muted text-lg">+</div>
                  <div className="flex-1">
                    {generatedBaseUrl && <img src={generatedBaseUrl} alt="Base" className="w-full rounded" />}
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-muted text-center block">Base</span>
                      {generatedBaseUrl && <ImageDownloadButtons imageUrl={generatedBaseUrl} filename={`${title || 'concept'}-base-combined`} />}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Actions when images are generated */}
          {(generatedCoilUrl || generatedBaseUrl) && (
            <div className="bg-surface border border-border rounded-xl p-4 space-y-2">
              <h3 className="text-sm font-semibold mb-2">Actions</h3>
              <button
                onClick={handleSaveAsNewConcept}
                className="w-full py-2 bg-accent hover:bg-accent-hover text-white text-sm rounded-lg transition-colors"
              >
                Save as New Concept
              </button>
              {targetConceptId && (
                <button
                  onClick={handleSaveToExisting}
                  className="w-full py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors"
                >
                  Save as Version to Selected Concept
                </button>
              )}
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="w-full py-2 bg-background border border-border text-foreground text-sm rounded-lg hover:bg-surface-hover transition-colors"
              >
                Regenerate
              </button>
            </div>
          )}

          {/* Quick refinement actions */}
          {(generatedCoilUrl || generatedBaseUrl) && (
            <div className="bg-surface border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-2">Quick Refinements</h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Generate More Like This', action: 'generate_more' },
                  { label: 'Refine This Concept', action: 'refine' },
                  { label: 'Simplify for Laser', action: 'simplify_laser' },
                  { label: 'Coordinate More', action: 'coordinate_more' },
                  { label: 'Complement Base', action: 'complement_base' },
                  { label: 'Higher Contrast', action: 'higher_contrast' },
                  { label: 'Reduce Detail', action: 'reduce_detail' },
                ].map((btn) => (
                  <button
                    key={btn.action}
                    onClick={() => {
                      // For now, these set a constraint and re-generate
                      setConstraints(`REFINEMENT: ${btn.label}. ${constraints}`);
                    }}
                    className="text-xs py-2 px-3 bg-background border border-border rounded-lg text-muted hover:text-foreground hover:bg-surface-hover transition-colors text-left"
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
