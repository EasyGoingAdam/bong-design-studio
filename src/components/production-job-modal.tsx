'use client';

import { useState, useMemo } from 'react';
import { useAppStore } from '@/lib/store';
import { Select, TextArea } from './ui';
import { useToast } from './toast';
import {
  ProductionJob,
  ProductionComplexity,
  CoilSize,
  PriorityLevel,
  COMPLEXITY_LABELS,
  COIL_SIZE_LABELS,
} from '@/lib/types';
import { estimateJobMinutes, fmtMinutes, guessCoilSize } from '@/lib/production';

/**
 * Create / edit a manual production job. Shows the live deterministic time
 * estimate and offers an "AI estimate" that asks the OpenAI brain for a
 * smarter per-phase breakdown (with graceful baseline fallback).
 */
export function ProductionJobModal({
  job,
  onClose,
}: {
  job?: ProductionJob;
  onClose: () => void;
}) {
  const { addProductionJob, updateProductionJob, openAIKey, productionSettings } = useAppStore();
  const { toast } = useToast();
  const editing = !!job;

  const [form, setForm] = useState<Partial<ProductionJob>>(() => ({
    title: job?.title || '',
    sourceType: job?.sourceType || 'manual',
    productType: job?.productType || '',
    sku: job?.sku || '',
    quantity: job?.quantity || 1,
    complexity: job?.complexity || 'medium',
    setupComplexity: job?.setupComplexity || 'medium',
    alignmentDifficulty: job?.alignmentDifficulty || 'medium',
    detailLevel: job?.detailLevel || 'medium',
    etchingZones: job?.etchingZones || 1,
    repeatDesign: job?.repeatDesign || false,
    priority: job?.priority || 'medium',
    dueDate: job?.dueDate || '',
    shipByDate: job?.shipByDate || '',
    rush: job?.rush || false,
    revenueValue: job?.revenueValue || 0,
    inventoryAvailable: job?.inventoryAvailable ?? true,
    designName: job?.designName || '',
    textName: job?.textName || '',
    coilSize: job?.coilSize,
    hasText: job?.hasText ?? false,
    hasDesign: job?.hasDesign ?? true,
    customerName: job?.customerName || '',
    customerEmail: job?.customerEmail || '',
    customerPhone: job?.customerPhone || '',
    material: job?.material || '',
    machineSettings: job?.machineSettings || '',
    qcResult: job?.qcResult || '',
    qcNotes: job?.qcNotes || '',
    tags: job?.tags || [],
    notes: job?.notes || '',
    designNotes: job?.designNotes || '',
    // Manual estimate overrides (0 = use computed)
    estimatedSetupMinutes: job?.estimatedSetupMinutes || 0,
    estimatedRunMinutes: job?.estimatedRunMinutes || 0,
    estimatedFinishMinutes: job?.estimatedFinishMinutes || 0,
    estimatedTotalMinutes: job?.estimatedTotalMinutes || 0,
    aiReasoning: job?.aiReasoning || '',
    aiConfidence: job?.aiConfidence,
  }));
  const [tagsInput, setTagsInput] = useState((job?.tags || []).join(', '));
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [manualEstimate, setManualEstimate] = useState(
    !!(job?.estimatedTotalMinutes && job.estimatedTotalMinutes > 0 && !job.aiReasoning),
  );

  const set = <K extends keyof ProductionJob>(k: K, v: ProductionJob[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Live deterministic estimate (the anchor). Used unless a manual override
  // or an AI estimate has set explicit minutes.
  const computed = useMemo(
    () => estimateJobMinutes(form, { coilMinutes: productionSettings.coilSizeMinutes }),
    [form, productionSettings.coilSizeMinutes],
  );
  // Note: != null (not truthiness) so a deliberate manual "0 minutes" —
  // e.g. a no-op/administrative job — isn't silently ignored.
  const effectiveTotal =
    manualEstimate && form.estimatedTotalMinutes != null
      ? form.estimatedTotalMinutes
      : form.aiReasoning && form.estimatedTotalMinutes
        ? form.estimatedTotalMinutes
        : computed.total;

  const runAiEstimate = async () => {
    if (!openAIKey) { toast('Set your OpenAI API key in Settings first', 'error'); return; }
    setAiBusy(true);
    try {
      const res = await fetch('/api/production/ai-estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job: form, apiKey: openAIKey }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'AI estimate failed', 'error'); return; }
      setForm((f) => ({
        ...f,
        estimatedSetupMinutes: data.estimated_setup_minutes,
        estimatedRunMinutes: data.estimated_run_minutes,
        estimatedFinishMinutes: data.estimated_inspection_minutes,
        estimatedTotalMinutes: data.estimated_total_minutes,
        aiConfidence: data.confidence,
        aiReasoning: data.reasoning_summary,
      }));
      setManualEstimate(false);
      toast(
        data.fallback
          ? 'Used baseline estimate (AI unavailable)'
          : `AI estimate: ${fmtMinutes(data.estimated_total_minutes)} · ${Math.round(data.confidence * 100)}% confidence`,
        data.fallback ? 'info' : 'success',
      );
    } catch {
      toast('AI estimate failed', 'error');
    } finally {
      setAiBusy(false);
    }
  };

  const handleSave = async () => {
    if (!form.title?.trim()) { toast('Title is required', 'error'); return; }
    setSaving(true);
    const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean);

    // Decide which estimate to persist.
    const payload: Partial<ProductionJob> = { ...form, tags };
    if (!manualEstimate && !form.aiReasoning) {
      payload.estimatedSetupMinutes = computed.setup;
      payload.estimatedRunMinutes = computed.run;
      payload.estimatedFinishMinutes = computed.finish;
      payload.estimatedTotalMinutes = computed.total;
    }
    // Empty date strings → undefined so the DB stores NULL.
    if (!payload.dueDate) payload.dueDate = undefined;
    if (!payload.shipByDate) payload.shipByDate = undefined;

    try {
      if (editing) {
        await updateProductionJob(job!.id, payload);
        toast('Job updated', 'success');
      } else {
        const created = await addProductionJob(payload);
        if (!created) { toast('Failed to create job', 'error'); setSaving(false); return; }
        toast(`Created "${created.title}"`, 'success');
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const complexityOpts = (['low', 'medium', 'high', 'very_high'] as ProductionComplexity[]).map((c) => ({
    value: c, label: COMPLEXITY_LABELS[c],
  }));

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-xl w-full max-w-2xl max-h-[95vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-surface border-b border-border px-5 py-3 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold">{editing ? 'Edit Production Job' : 'New Production Job'}</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground text-lg px-2">×</button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-muted mb-1">Production Title *</label>
            <input
              value={form.title || ''}
              onChange={(e) => set('title', e.target.value)}
              placeholder="e.g. Father's Day Skull Bong"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1">Product Type</label>
              <input value={form.productType || ''} onChange={(e) => set('productType', e.target.value)} placeholder="Beaker, GBT…" className="w-full bg-background border border-border rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">SKU</label>
              <input value={form.sku || ''} onChange={(e) => set('sku', e.target.value)} className="w-full bg-background border border-border rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Quantity</label>
              <input type="number" min={1} value={form.quantity || 1} onChange={(e) => set('quantity', Math.max(1, Number(e.target.value)))} className="w-full bg-background border border-border rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Revenue ($)</label>
              <input type="number" min={0} value={form.revenueValue || 0} onChange={(e) => set('revenueValue', Math.max(0, Number(e.target.value)))} className="w-full bg-background border border-border rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-accent" />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1">Source</label>
              <Select value={form.sourceType || 'manual'} onChange={(v) => set('sourceType', v as ProductionJob['sourceType'])} options={[
                { value: 'manual', label: 'Manual' },
                { value: 'workflow', label: 'Design Studio' },
                { value: 'shipstation', label: 'ShipStation' },
              ]} className="w-full" />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Design Name</label>
              <input value={form.designName || ''} onChange={(e) => set('designName', e.target.value)} placeholder="e.g. Skull Dad" className="w-full bg-background border border-border rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Text Name</label>
              <input value={form.textName || ''} onChange={(e) => set('textName', e.target.value)} placeholder="Name to etch" className="w-full bg-background border border-border rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Customer</label>
              <input value={form.customerName || ''} onChange={(e) => set('customerName', e.target.value)} className="w-full bg-background border border-border rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-accent" />
            </div>
          </div>

          {/* Customer info — populated automatically on ShipStation import. */}
          <details className="bg-background/50 border border-border rounded-lg" open={!!(form.customerEmail || form.customerPhone || form.orderDate)}>
            <summary className="cursor-pointer px-3 py-2 text-xs font-semibold select-none">Customer Info</summary>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 pt-0">
              <div>
                <label className="block text-[10px] text-muted mb-1">Email</label>
                <input value={form.customerEmail || ''} onChange={(e) => set('customerEmail', e.target.value)} className="w-full bg-background border border-border rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-accent" />
              </div>
              <div>
                <label className="block text-[10px] text-muted mb-1">Phone</label>
                <input value={form.customerPhone || ''} onChange={(e) => set('customerPhone', e.target.value)} className="w-full bg-background border border-border rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-accent" />
              </div>
              <div>
                <label className="block text-[10px] text-muted mb-1">Order placed</label>
                <input type="date" value={form.orderDate || ''} onChange={(e) => set('orderDate', e.target.value)} className="w-full bg-background border border-border rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-accent" />
              </div>
            </div>
          </details>

          {/* Complexity drivers */}
          <div className="bg-background/50 border border-border rounded-lg p-3 space-y-3">
            <div className="text-xs font-semibold">Complexity &amp; Time Drivers</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[10px] text-muted mb-1">Coil / Piece</label>
                <Select
                  value={form.coilSize || ''}
                  onChange={(v) => set('coilSize', (v || undefined) as CoilSize | undefined)}
                  placeholder="Auto from SKU"
                  options={[
                    { value: 'pipe', label: `${COIL_SIZE_LABELS.pipe} (fastest)` },
                    { value: 'small_coil', label: `${COIL_SIZE_LABELS.small_coil} (60-90m)` },
                    { value: 'big_coil', label: `${COIL_SIZE_LABELS.big_coil} (90-120m)` },
                  ]}
                  className="w-full"
                />
                {!form.coilSize && guessCoilSize(`${form.productType || ''} ${form.sku || ''}`) && (
                  <button type="button" onClick={() => set('coilSize', guessCoilSize(`${form.productType || ''} ${form.sku || ''}`))} className="text-[9px] text-accent hover:underline mt-0.5">
                    Use {COIL_SIZE_LABELS[guessCoilSize(`${form.productType || ''} ${form.sku || ''}`)!]} (from SKU)
                  </button>
                )}
              </div>
              <div>
                <label className="block text-[10px] text-muted mb-1">Engraving Complexity</label>
                <Select value={form.complexity || 'medium'} onChange={(v) => set('complexity', v as ProductionComplexity)} options={complexityOpts} className="w-full" />
              </div>
              <div>
                <label className="block text-[10px] text-muted mb-1">Setup Complexity</label>
                <Select value={form.setupComplexity || 'medium'} onChange={(v) => set('setupComplexity', v as ProductionJob['setupComplexity'])} options={[
                  { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' },
                ]} />
              </div>
              <div>
                <label className="block text-[10px] text-muted mb-1">Alignment Difficulty</label>
                <Select value={form.alignmentDifficulty || 'medium'} onChange={(v) => set('alignmentDifficulty', v as ProductionJob['alignmentDifficulty'])} options={[
                  { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' },
                ]} />
              </div>
              <div>
                <label className="block text-[10px] text-muted mb-1">Etching Zones</label>
                <input type="number" min={1} value={form.etchingZones || 1} onChange={(e) => set('etchingZones', Math.max(1, Number(e.target.value)))} className="w-full bg-background border border-border rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-accent" />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={!!form.hasDesign} onChange={(e) => set('hasDesign', e.target.checked)} className="accent-accent" />
                Graphic design
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={!!form.hasText} onChange={(e) => set('hasText', e.target.checked)} className="accent-accent" />
                Text / name etch
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={!!form.repeatDesign} onChange={(e) => set('repeatDesign', e.target.checked)} className="accent-accent" />
                Repeat design (setup known — faster)
              </label>
            </div>

            {/* Estimate readout */}
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
              <div className="text-xs">
                <span className="text-muted">Estimated total: </span>
                <span className="font-semibold">{fmtMinutes(effectiveTotal)}</span>
                {form.aiReasoning && (
                  <span className="ml-2 text-[10px] text-purple-700 bg-purple-50 border border-purple-200 rounded px-1.5 py-0.5">
                    ✦ AI{form.aiConfidence != null ? ` ${Math.round(form.aiConfidence * 100)}%` : ''}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={runAiEstimate}
                disabled={aiBusy}
                className="text-xs px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium disabled:opacity-50"
              >
                {aiBusy ? 'Estimating…' : '✦ AI estimate'}
              </button>
            </div>
            {form.aiReasoning && (
              <p className="text-[11px] text-muted italic">{form.aiReasoning}</p>
            )}
            <div className="text-[10px] text-muted">
              Baseline breakdown — setup {fmtMinutes(computed.setup)} · run {fmtMinutes(computed.run)} · finish {fmtMinutes(computed.finish)}
            </div>
            <label className="flex items-center gap-2 text-[11px] cursor-pointer text-muted">
              <input type="checkbox" checked={manualEstimate} onChange={(e) => { setManualEstimate(e.target.checked); if (e.target.checked && !form.estimatedTotalMinutes) set('estimatedTotalMinutes', computed.total); }} className="accent-accent" />
              Manually override total minutes
            </label>
            {manualEstimate && (
              <input type="number" min={0} value={form.estimatedTotalMinutes || 0} onChange={(e) => { set('estimatedTotalMinutes', Math.max(0, Number(e.target.value))); set('aiReasoning', ''); }} className="w-32 bg-background border border-border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-accent" />
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1">Priority</label>
              <Select value={form.priority || 'medium'} onChange={(v) => set('priority', v as PriorityLevel)} options={[
                { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }, { value: 'urgent', label: 'Urgent' },
              ]} />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Due Date</label>
              <input type="date" value={form.dueDate || ''} onChange={(e) => set('dueDate', e.target.value)} className="w-full bg-background border border-border rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Ship-by Date</label>
              <input type="date" value={form.shipByDate || ''} onChange={(e) => set('shipByDate', e.target.value)} className="w-full bg-background border border-border rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-accent" />
            </div>
            <div className="flex flex-col justify-center gap-1.5 pt-4">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={!!form.rush} onChange={(e) => set('rush', e.target.checked)} className="accent-accent" /> Rush
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={!!form.inventoryAvailable} onChange={(e) => set('inventoryAvailable', e.target.checked)} className="accent-accent" /> Inventory available
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs text-muted mb-1">Tags (comma separated)</label>
            <input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="Father's Day, Deal, Custom" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
          </div>

          {/* Production details — captured for repeatability + future data. */}
          <div className="bg-background/50 border border-border rounded-lg p-3 space-y-3">
            <div className="text-xs font-semibold">Production Details</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] text-muted mb-1">Material / blank</label>
                <input value={form.material || ''} onChange={(e) => set('material', e.target.value)} placeholder="e.g. clear glass beaker" className="w-full bg-background border border-border rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-accent" />
              </div>
              <div>
                <label className="block text-[10px] text-muted mb-1">Laser settings (power / speed / passes)</label>
                <input value={form.machineSettings || ''} onChange={(e) => set('machineSettings', e.target.value)} placeholder="e.g. 60% / 300mm/s / 2 passes" className="w-full bg-background border border-border rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-accent" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] text-muted mb-1">QC result</label>
                <Select value={form.qcResult || ''} onChange={(v) => set('qcResult', v as ProductionJob['qcResult'])} placeholder="Not checked" options={[
                  { value: 'pass', label: 'Pass' }, { value: 'fail', label: 'Fail' },
                ]} className="w-full" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[10px] text-muted mb-1">QC notes</label>
                <input value={form.qcNotes || ''} onChange={(e) => set('qcNotes', e.target.value)} className="w-full bg-background border border-border rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-accent" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1">Production Notes</label>
              <TextArea value={form.notes || ''} onChange={(v) => set('notes', v)} rows={2} placeholder="Operator instructions…" />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Design Notes</label>
              <TextArea value={form.designNotes || ''} onChange={(v) => set('designNotes', v)} rows={2} placeholder="From the design team…" />
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 bg-surface border-t border-border px-5 py-3 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted hover:text-foreground">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg font-medium disabled:opacity-50">
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Job'}
          </button>
        </div>
      </div>
    </div>
  );
}
