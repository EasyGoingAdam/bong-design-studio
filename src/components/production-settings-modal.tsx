'use client';

import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { useToast } from './toast';
import { ProductionSettings, workdayHours, DEFAULT_PRODUCTION_SETTINGS } from '@/lib/types';

/**
 * Admin panel for the AI production brain. Exposes the knobs that the
 * scheduler/estimator use — model, workday window, buffer, and the
 * priority weights — instead of hardcoding them.
 */
export function ProductionSettingsModal({ onClose }: { onClose: () => void }) {
  const { productionSettings, setProductionSettings } = useAppStore();
  const { toast } = useToast();
  const [form, setForm] = useState<ProductionSettings>({ ...productionSettings });

  const set = <K extends keyof ProductionSettings>(k: K, v: ProductionSettings[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = () => {
    setProductionSettings(form);
    toast('AI production settings saved', 'success');
    onClose();
  };

  const reset = () => setForm({ ...DEFAULT_PRODUCTION_SETTINGS });

  const Weight = ({ label, k, hint }: { label: string; k: keyof ProductionSettings; hint: string }) => (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium">{label}</label>
        <span className="text-xs text-muted">{form[k] as number}/5</span>
      </div>
      <input
        type="range" min={1} max={5} step={1}
        value={form[k] as number}
        onChange={(e) => set(k, Number(e.target.value) as ProductionSettings[typeof k])}
        className="w-full accent-accent"
      />
      <p className="text-[10px] text-muted leading-snug">{hint}</p>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div className="bg-surface border border-border rounded-xl w-full max-w-lg max-h-[95vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-surface border-b border-border px-5 py-3 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-semibold">AI Production Settings</h2>
            <p className="text-xs text-muted">Tunes the schedule generator + time estimates</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground text-lg px-2">×</button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1">Planning model</label>
              <select value={form.model} onChange={(e) => set('model', e.target.value)} className="w-full bg-background border border-border rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-accent">
                <option value="gpt-4o">gpt-4o (recommended)</option>
                <option value="gpt-4o-mini">gpt-4o-mini (faster/cheaper)</option>
                <option value="gpt-4.1">gpt-4.1</option>
                <option value="gpt-4.1-mini">gpt-4.1-mini</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Max jobs per AI plan</label>
              <input type="number" min={5} max={200} value={form.maxJobsPerPlan} onChange={(e) => set('maxJobsPerPlan', Math.max(5, Number(e.target.value)))} className="w-full bg-background border border-border rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-accent" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1">Workday start</label>
              <input type="time" value={form.workdayStart} onChange={(e) => set('workdayStart', e.target.value)} className="w-full bg-background border border-border rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Workday end</label>
              <input type="time" value={form.workdayEnd} onChange={(e) => set('workdayEnd', e.target.value)} className="w-full bg-background border border-border rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Buffer %</label>
              <input type="number" min={0} max={50} value={form.bufferPct} onChange={(e) => set('bufferPct', Math.min(50, Math.max(0, Number(e.target.value))))} className="w-full bg-background border border-border rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-accent" />
            </div>
          </div>
          <p className="text-[10px] text-muted -mt-2">Effective workday: <span className="font-medium">{workdayHours(form)}h</span> per machine · {form.bufferPct}% reserved for issues.</p>

          <div>
            <label className="block text-xs text-muted mb-1">Default per-machine piece target</label>
            <input type="number" min={1} max={20} value={form.dailyPieceTarget} onChange={(e) => set('dailyPieceTarget', Math.max(1, Number(e.target.value)))} className="w-32 bg-background border border-border rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-accent" />
          </div>

          <div className="border-t border-border pt-3 space-y-3">
            <div className="text-xs font-semibold">Scheduling priority weights</div>
            <Weight label="Due-date urgency" k="dueDateWeight" hint="How hard to prioritize jobs by due / ship-by date." />
            <Weight label="Revenue value" k="revenueWeight" hint="How much to favor higher-revenue jobs." />
            <Weight label="Rush-order boost" k="rushBoost" hint="How strongly rush orders float to the top." />
            <Weight label="Complexity spreading" k="complexityPenalty" hint="How hard to avoid stacking high-complexity jobs back-to-back." />
            <Weight label="Testing-job priority" k="testingPriority" hint="How much to favor testing/internal jobs vs customer orders." />
          </div>
        </div>

        <div className="sticky bottom-0 bg-surface border-t border-border px-5 py-3 flex justify-between items-center">
          <button onClick={reset} className="text-xs text-muted hover:text-foreground">Reset to defaults</button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-muted hover:text-foreground">Cancel</button>
            <button onClick={save} className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg font-medium">Save Settings</button>
          </div>
        </div>
      </div>
    </div>
  );
}
