'use client';

import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { SpecTemplate } from '@/lib/types';
import { Input, TextArea, Select, SliderInput, EmptyState } from './ui';
import { useToast } from './toast';
import { ConfirmDialog } from './confirm-dialog';

export function SpecsDatabase() {
  const { templates, addTemplate, updateTemplate, deleteTemplate } = useAppStore();
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold">Style & Specs Database</h2>
          <p className="text-sm text-muted">Design templates and technical specifications</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm rounded-lg transition-colors"
        >
          + New Template
        </button>
      </div>

      {templates.length === 0 ? (
        <EmptyState icon="⚙" title="No templates yet" description="Create design templates to standardize your concepts." action={{ label: '+ New Template', onClick: () => setShowNew(true) }} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => (
            <div key={t.id} className="bg-surface border border-border rounded-xl p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="text-sm font-semibold">{t.name}</h3>
                  <span className="text-xs text-muted bg-border/50 px-1.5 py-0.5 rounded">{t.category}</span>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setEditingId(editingId === t.id ? null : t.id)}
                    className="text-xs text-muted hover:text-foreground px-2 py-1 rounded hover:bg-surface-hover"
                  >
                    {editingId === t.id ? 'Close' : 'Edit'}
                  </button>
                  <button
                    onClick={() => setDeleteTargetId(t.id)}
                    className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-surface-hover"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <p className="text-xs text-muted mb-3">{t.description}</p>

              {/* Quick specs preview */}
              <div className="space-y-1.5 text-xs">
                {t.specs.designStyleName && (
                  <div className="flex justify-between">
                    <span className="text-muted">Style</span>
                    <span>{t.specs.designStyleName}</span>
                  </div>
                )}
                {t.specs.patternDensity && (
                  <div className="flex justify-between">
                    <span className="text-muted">Density</span>
                    <span className="capitalize">{t.specs.patternDensity}</span>
                  </div>
                )}
                {t.specs.laserComplexity && (
                  <div className="flex justify-between">
                    <span className="text-muted">Complexity</span>
                    <span>{'●'.repeat(t.specs.laserComplexity)}{'○'.repeat(5 - t.specs.laserComplexity)}</span>
                  </div>
                )}
                {t.specs.symmetryRequirement && (
                  <div className="flex justify-between">
                    <span className="text-muted">Symmetry</span>
                    <span className="capitalize">{t.specs.symmetryRequirement}</span>
                  </div>
                )}
                {t.specs.productionFeasibility && (
                  <div className="flex justify-between">
                    <span className="text-muted">Feasibility</span>
                    <span>{'★'.repeat(t.specs.productionFeasibility)}{'☆'.repeat(5 - t.specs.productionFeasibility)}</span>
                  </div>
                )}
                {t.coilSpecs?.dimensions && (
                  <div className="flex justify-between">
                    <span className="text-muted">Coil</span>
                    <span>{t.coilSpecs.dimensions}</span>
                  </div>
                )}
                {t.baseSpecs?.dimensions && (
                  <div className="flex justify-between">
                    <span className="text-muted">Base</span>
                    <span>{t.baseSpecs.dimensions}</span>
                  </div>
                )}
              </div>

              {/* Edit Form */}
              {editingId === t.id && (
                <TemplateForm
                  template={t}
                  onSave={(updates) => { updateTemplate(t.id, updates); toast('Template updated', 'success'); setEditingId(null); }}
                  onCancel={() => setEditingId(null)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 bg-black/60 modal-backdrop z-50 flex items-center justify-center p-4" onClick={() => setShowNew(false)}>
          <div className="bg-surface border border-border rounded-xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">New Template</h2>
            <TemplateForm
              onSave={(t) => { addTemplate(t); toast('Template created', 'success'); setShowNew(false); }}
              onCancel={() => setShowNew(false)}
            />
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTargetId}
        title="Delete Template"
        message="Are you sure you want to delete this template? This cannot be undone."
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={() => { if (deleteTargetId) { deleteTemplate(deleteTargetId); toast('Template deleted', 'success'); } setDeleteTargetId(null); }}
        onCancel={() => setDeleteTargetId(null)}
      />
    </div>
  );
}

function TemplateForm({
  template,
  onSave,
  onCancel,
}: {
  template?: SpecTemplate;
  onSave: (t: Partial<SpecTemplate>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(template?.name || '');
  const [category, setCategory] = useState(template?.category || '');
  const [description, setDescription] = useState(template?.description || '');
  const [styleName, setStyleName] = useState(template?.specs?.designStyleName || '');
  const [density, setDensity] = useState<string>(template?.specs?.patternDensity || 'medium');
  const [complexity, setComplexity] = useState<number>(template?.specs?.laserComplexity || 3);
  const [symmetry, setSymmetry] = useState<string>(template?.specs?.symmetryRequirement || 'none');
  const [feasibility, setFeasibility] = useState<number>(template?.specs?.productionFeasibility || 3);
  const [coilDim, setCoilDim] = useState(template?.coilSpecs?.dimensions || '45mm x 120mm wrap');
  const [baseDim, setBaseDim] = useState(template?.baseSpecs?.dimensions || '65mm diameter circle');

  return (
    <div className="space-y-3 mt-3 pt-3 border-t border-border">
      <div>
        <label className="block text-xs text-muted mb-1">Template Name</label>
        <Input value={name} onChange={setName} placeholder="e.g., Geometric" />
      </div>
      <div>
        <label className="block text-xs text-muted mb-1">Category</label>
        <Input value={category} onChange={setCategory} placeholder="e.g., Pattern" />
      </div>
      <div>
        <label className="block text-xs text-muted mb-1">Description</label>
        <TextArea value={description} onChange={setDescription} placeholder="Describe this template..." rows={2} />
      </div>
      <div>
        <label className="block text-xs text-muted mb-1">Design Style Name</label>
        <Input value={styleName} onChange={setStyleName} placeholder="e.g., Sacred Geometry" />
      </div>
      <div>
        <label className="block text-xs text-muted mb-1">Pattern Density</label>
        <Select
          value={density}
          onChange={setDensity}
          options={[
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' },
            { value: 'very_high', label: 'Very High' },
          ]}
        />
      </div>
      <SliderInput value={complexity} onChange={setComplexity} label="Laser Complexity" />
      <div>
        <label className="block text-xs text-muted mb-1">Symmetry Requirement</label>
        <Select
          value={symmetry}
          onChange={setSymmetry}
          options={[
            { value: 'none', label: 'None' },
            { value: 'symmetrical', label: 'Symmetrical' },
            { value: 'wraparound', label: 'Wraparound' },
            { value: 'partial', label: 'Partial' },
          ]}
        />
      </div>
      <SliderInput value={feasibility} onChange={setFeasibility} label="Production Feasibility" />
      <div>
        <label className="block text-xs text-muted mb-1">Coil Dimensions</label>
        <Input value={coilDim} onChange={setCoilDim} />
      </div>
      <div>
        <label className="block text-xs text-muted mb-1">Base Dimensions</label>
        <Input value={baseDim} onChange={setBaseDim} />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-muted hover:text-foreground">Cancel</button>
        <button
          onClick={() => onSave({
            name, category, description,
            specs: {
              designStyleName: styleName,
              patternDensity: density as 'low' | 'medium' | 'high' | 'very_high',
              laserComplexity: complexity as 1 | 2 | 3 | 4 | 5,
              symmetryRequirement: symmetry as 'none' | 'symmetrical' | 'wraparound' | 'partial',
              productionFeasibility: feasibility as 1 | 2 | 3 | 4 | 5,
            },
            coilSpecs: { dimensions: coilDim },
            baseSpecs: { dimensions: baseDim },
          })}
          className="px-3 py-1.5 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg"
        >
          Save
        </button>
      </div>
    </div>
  );
}
