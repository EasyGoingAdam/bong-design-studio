'use client';

import { useEffect, useMemo, useState } from 'react';
import { Concept } from '@/lib/types';
import { useToast } from './toast';

const STORAGE_KEY = 'cost-calc-defaults-v1';

interface Defaults {
  ratePerMin: number;
  materialsCost: number;
  packaging: number;
  marginPct: number;
}

const DEFAULT_DEFAULTS: Defaults = {
  ratePerMin: 1.25,
  materialsCost: 8,
  packaging: 2,
  marginPct: 60,
};

function loadDefaults(): Defaults {
  if (typeof window === 'undefined') return DEFAULT_DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_DEFAULTS;
    return { ...DEFAULT_DEFAULTS, ...JSON.parse(raw) };
  } catch { return DEFAULT_DEFAULTS; }
}

function saveDefaults(d: Defaults) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch {}
}

/**
 * Parse the existing free-text estimatedEtchingTime into minutes.
 * Accepts: "12", "12 min", "12m", "1h 30min", "1.5h", "90 seconds".
 * Returns 0 if unparseable.
 */
function parseMinutes(input: string | undefined): number {
  if (!input) return 0;
  const s = input.toLowerCase().trim();
  let total = 0;
  const hMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hour)/);
  if (hMatch) total += parseFloat(hMatch[1]) * 60;
  const mMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:m|min|minute)/);
  if (mMatch) total += parseFloat(mMatch[1]);
  const sMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:s|sec|second)/);
  if (sMatch) total += parseFloat(sMatch[1]) / 60;
  if (total === 0) {
    // Bare number → assume minutes
    const num = parseFloat(s);
    if (!isNaN(num)) total = num;
  }
  return Math.round(total * 100) / 100;
}

/**
 * Cost Calculator — quick utility surfacing unit cost and suggested retail
 * for a Concept. Margin / rate / materials defaults are remembered in
 * localStorage so reopening doesn't require re-entering shop economics.
 */
export function CostCalculatorModal({
  concept, onClose,
}: { concept: Concept; onClose: () => void }) {
  const { toast } = useToast();
  const initialMinutes = useMemo(
    () => parseMinutes(concept.specs?.estimatedEtchingTime),
    [concept.specs?.estimatedEtchingTime]
  );

  const [minutes, setMinutes] = useState<number>(initialMinutes || 10);
  const [defaults, setDefaultsState] = useState<Defaults>(DEFAULT_DEFAULTS);

  useEffect(() => { setDefaultsState(loadDefaults()); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const updateDefault = <K extends keyof Defaults>(k: K, v: Defaults[K]) => {
    const next = { ...defaults, [k]: v };
    setDefaultsState(next);
    saveDefaults(next);
  };

  // Math
  const laserCost = minutes * defaults.ratePerMin;
  const unitCost = laserCost + defaults.materialsCost + defaults.packaging;
  const suggestedRetail = unitCost / (1 - defaults.marginPct / 100);
  const grossProfit = suggestedRetail - unitCost;

  const copyResult = async () => {
    const text =
      `${concept.name} — Cost Sheet\n` +
      `  Laser: ${minutes} min × $${defaults.ratePerMin.toFixed(2)} = $${laserCost.toFixed(2)}\n` +
      `  Materials: $${defaults.materialsCost.toFixed(2)}\n` +
      `  Packaging: $${defaults.packaging.toFixed(2)}\n` +
      `  Unit cost: $${unitCost.toFixed(2)}\n` +
      `  Margin target: ${defaults.marginPct}%\n` +
      `  Suggested retail: $${suggestedRetail.toFixed(2)}\n` +
      `  Gross profit: $${grossProfit.toFixed(2)}`;
    try {
      await navigator.clipboard.writeText(text);
      toast('Cost sheet copied to clipboard', 'success');
    } catch { toast('Could not copy', 'error'); }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 modal-backdrop z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-xl w-full max-w-md max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-surface border-b border-border px-5 py-3 flex items-center justify-between">
          <div>
            <div className="eyebrow">Cost Calculator</div>
            <h2 className="serif text-xl font-medium">{concept.name}</h2>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Inputs */}
          <FieldRow
            label="Laser time (min)"
            hint={initialMinutes
              ? `Parsed from "${concept.specs.estimatedEtchingTime}"`
              : 'Set in Specs to remember this'}
          >
            <input
              type="number"
              step="0.5"
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value) || 0)}
              className="input-field"
            />
          </FieldRow>

          <FieldRow label="Rate ($/min)" hint="Saved across sessions">
            <input
              type="number"
              step="0.05"
              value={defaults.ratePerMin}
              onChange={(e) => updateDefault('ratePerMin', Number(e.target.value) || 0)}
              className="input-field"
            />
          </FieldRow>

          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Materials ($)">
              <input
                type="number"
                step="0.5"
                value={defaults.materialsCost}
                onChange={(e) => updateDefault('materialsCost', Number(e.target.value) || 0)}
                className="input-field"
              />
            </FieldRow>
            <FieldRow label="Packaging ($)">
              <input
                type="number"
                step="0.5"
                value={defaults.packaging}
                onChange={(e) => updateDefault('packaging', Number(e.target.value) || 0)}
                className="input-field"
              />
            </FieldRow>
          </div>

          <FieldRow label="Margin target (%)">
            <input
              type="number"
              step="1"
              min="0"
              max="95"
              value={defaults.marginPct}
              onChange={(e) => updateDefault('marginPct', Number(e.target.value) || 0)}
              className="input-field"
            />
          </FieldRow>

          {/* Result */}
          <div className="bg-background border border-border rounded-lg p-4 space-y-1.5">
            <ResultRow label="Laser cost" value={laserCost} muted />
            <ResultRow label="Materials" value={defaults.materialsCost} muted />
            <ResultRow label="Packaging" value={defaults.packaging} muted />
            <div className="rule-dotted my-2" />
            <ResultRow label="Unit cost" value={unitCost} bold />
            <div className="rule-dotted my-2" />
            <ResultRow label="Suggested retail" value={suggestedRetail} accent big />
            <ResultRow label="Gross profit" value={grossProfit} muted />
          </div>

          <button
            onClick={copyResult}
            className="w-full py-2 bg-foreground hover:bg-accent text-surface rounded-lg text-sm font-medium transition-colors"
          >
            ⧉ Copy cost sheet
          </button>
        </div>
      </div>

      <style jsx>{`
        .input-field {
          width: 100%;
          background: var(--color-background);
          border: 1px solid var(--color-border);
          border-radius: 0.5rem;
          padding: 0.4rem 0.6rem;
          font-size: 0.875rem;
          font-variant-numeric: tabular-nums;
          outline: none;
          transition: border-color 0.12s;
        }
        .input-field:focus { border-color: var(--color-foreground); }
      `}</style>
    </div>
  );
}

function FieldRow({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="eyebrow block mb-1">{label}</label>
      {children}
      {hint && <div className="text-[10px] text-muted mt-1">{hint}</div>}
    </div>
  );
}

function ResultRow({
  label, value, muted, bold, accent, big,
}: { label: string; value: number; muted?: boolean; bold?: boolean; accent?: boolean; big?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className={`text-xs ${muted ? 'text-muted' : 'text-foreground'} ${bold ? 'font-medium' : ''}`}>
        {label}
      </span>
      <span
        className={`tabular-nums ${big ? 'text-2xl serif' : 'text-sm'} ${
          accent ? 'text-accent font-medium' : muted ? 'text-muted' : 'text-foreground'
        } ${bold ? 'font-medium' : ''}`}
      >
        ${value.toFixed(2)}
      </span>
    </div>
  );
}
