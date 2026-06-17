'use client';

import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { useToast } from './toast';
import { TextArea } from './ui';
import { ProductionJob } from '@/lib/types';

/**
 * End-of-day operator close-out. The operator must record what got made,
 * what didn't (and why) before the day can be closed — the accountability
 * gate from the build plan. Pre-fills the unfinished list so they only have
 * to explain.
 */
export function ProductionCloseoutModal({
  date,
  completedPieces,
  targetPieces,
  unfinished,
  onClose,
}: {
  date: string;
  completedPieces: number;
  targetPieces: number;
  unfinished: ProductionJob[];
  onClose: () => void;
}) {
  const { closeOutDay } = useAppStore();
  const { toast } = useToast();

  const [completedSummary, setCompletedSummary] = useState('');
  const [unfinishedSummary, setUnfinishedSummary] = useState(
    unfinished.length ? unfinished.map((j) => `• ${j.title} — `).join('\n') : '',
  );
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!completedSummary.trim()) { toast('Note what was completed before closing.', 'error'); return; }
    if (unfinished.length > 0 && !unfinishedSummary.trim()) {
      toast('There are unfinished jobs — note what wasn’t done and why.', 'error');
      return;
    }
    setSaving(true);
    await closeOutDay(date, {
      completedSummary: completedSummary.trim(),
      unfinishedSummary: unfinishedSummary.trim(),
      notes: notes.trim(),
      completedPieces,
      targetPieces,
      unfinishedJobs: unfinished.length,
    });
    toast('Day closed out', 'success');
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div className="bg-surface border border-border rounded-xl w-full max-w-lg max-h-[95vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-surface border-b border-border px-5 py-3 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-semibold">Close Out Day</h2>
            <p className="text-xs text-muted">{date}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground text-lg px-2">×</button>
        </div>

        <div className="p-5 space-y-4">
          <div className={`rounded-lg border px-3 py-2 text-sm ${completedPieces >= targetPieces ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
            {completedPieces >= targetPieces ? '✓' : '⚠'} Made <strong>{completedPieces}</strong> of <strong>{targetPieces}</strong> target pieces
            {unfinished.length > 0 && <> · <strong>{unfinished.length}</strong> job(s) unfinished</>}
          </div>

          <div>
            <label className="block text-xs text-muted mb-1">What was completed? *</label>
            <TextArea value={completedSummary} onChange={setCompletedSummary} rows={3} placeholder="Summarize what got made today…" />
          </div>

          {unfinished.length > 0 && (
            <div>
              <label className="block text-xs text-muted mb-1">What wasn’t completed, and why? *</label>
              <TextArea value={unfinishedSummary} onChange={setUnfinishedSummary} rows={Math.min(8, Math.max(3, unfinished.length + 1))} placeholder="Explain each unfinished job…" />
              <p className="text-[10px] text-muted mt-1">{unfinished.length} unfinished: {unfinished.map((j) => j.title).join(', ')}</p>
            </div>
          )}

          <div>
            <label className="block text-xs text-muted mb-1">Anything else? (machine issues, materials, blockers)</label>
            <TextArea value={notes} onChange={setNotes} rows={2} placeholder="Optional" />
          </div>
        </div>

        <div className="sticky bottom-0 bg-surface border-t border-border px-5 py-3 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted hover:text-foreground">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="px-4 py-2 text-sm bg-foreground text-background rounded-lg font-medium hover:opacity-90 disabled:opacity-50">
            {saving ? 'Closing…' : 'Close Out Day'}
          </button>
        </div>
      </div>
    </div>
  );
}
