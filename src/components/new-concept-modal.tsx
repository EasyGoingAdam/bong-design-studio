'use client';

import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Input, TextArea, Select } from './ui';
import { useToast } from './toast';

export function NewConceptModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { addConcept, templates } = useAppStore();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [collection, setCollection] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [priority, setPriority] = useState('medium');
  const [lifecycle, setLifecycle] = useState('evergreen');
  const [templateId, setTemplateId] = useState('');
  const [audience, setAudience] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) { setNameError('Concept name is required'); return; }
    setNameError('');
    const template = templates.find((t) => t.id === templateId);
    const concept = await addConcept({
      name: name.trim(),
      collection: collection.trim(),
      description: description.trim(),
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      priority: priority as 'low' | 'medium' | 'high' | 'urgent',
      lifecycleType: lifecycle as 'seasonal' | 'evergreen' | 'limited_edition' | 'custom',
      intendedAudience: audience.trim(),
      specs: template?.specs ? {
        designStyleName: template.specs.designStyleName || '',
        designTheme: template.specs.designTheme || '',
        patternDensity: template.specs.patternDensity || 'medium',
        laserComplexity: template.specs.laserComplexity || 3,
        estimatedEtchingTime: '',
        surfaceCoverage: 50,
        lineThickness: '',
        bwContrastGuidance: '',
        symmetryRequirement: template.specs.symmetryRequirement || 'none',
        coordinationMode: template.specs.coordinationMode || 'thematic',
        productionFeasibility: template.specs.productionFeasibility || 3,
        riskNotes: '',
      } : undefined,
    });
    toast('Concept created', 'success');
    onClose();
    onCreated(concept.id);
  };

  return (
    <div className="fixed inset-0 bg-black/60 modal-backdrop z-50 flex items-center justify-center p-4" onClick={() => {
      const hasData = !!(name || collection || description || tags || audience);
      if (hasData) {
        if (window.confirm('Discard unsaved changes?')) onClose();
      } else {
        onClose();
      }
    }}>
      <div className="bg-surface border border-border rounded-xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">New Concept</h2>

        <div className="space-y-3">
          <div>
            <label className="block text-sm text-muted mb-1">Concept Name *</label>
            <Input value={name} onChange={(v: string) => { setName(v); setNameError(''); }} placeholder="e.g., Sacred Geometry V2" />
            {nameError && <p className="text-xs text-red-400 mt-1">{nameError}</p>}
          </div>
          <div>
            <label className="block text-sm text-muted mb-1">Collection / Style Family</label>
            <Input value={collection} onChange={setCollection} placeholder="e.g., Geometry Series" />
          </div>
          <div>
            <label className="block text-sm text-muted mb-1">Start from Template</label>
            <Select
              value={templateId}
              onChange={setTemplateId}
              placeholder="No template"
              options={templates.map((t) => ({ value: t.id, label: `${t.name} — ${t.category}` }))}
            />
          </div>
          <div>
            <label className="block text-sm text-muted mb-1">Description / Creative Direction</label>
            <TextArea value={description} onChange={setDescription} placeholder="Describe the concept..." />
          </div>
          <div>
            <label className="block text-sm text-muted mb-1">Intended Audience / Vibe</label>
            <Input value={audience} onChange={setAudience} placeholder="e.g., Premium collectors" />
          </div>
          <div>
            <label className="block text-sm text-muted mb-1">Tags (comma-separated)</label>
            <Input value={tags} onChange={setTags} placeholder="geometric, premium, bold" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-muted mb-1">Priority</label>
              <Select
                value={priority}
                onChange={setPriority}
                options={[
                  { value: 'low', label: 'Low' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'high', label: 'High' },
                  { value: 'urgent', label: 'Urgent' },
                ]}
              />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Lifecycle Type</label>
              <Select
                value={lifecycle}
                onChange={setLifecycle}
                options={[
                  { value: 'evergreen', label: 'Evergreen' },
                  { value: 'seasonal', label: 'Seasonal' },
                  { value: 'limited_edition', label: 'Limited Edition' },
                  { value: 'custom', label: 'Custom' },
                ]}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted hover:text-foreground">Cancel</button>
          <button
            onClick={handleCreate}
            disabled={!name.trim()}
            className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors disabled:opacity-50"
          >
            Create Concept
          </button>
        </div>
      </div>
    </div>
  );
}
