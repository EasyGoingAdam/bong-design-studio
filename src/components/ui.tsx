'use client';

import { useEffect, type ReactNode } from 'react';
import { ConceptStatus, PriorityLevel, STATUS_COLORS, STATUS_LABELS, PRIORITY_COLORS, LifecycleType } from '@/lib/types';

/**
 * Close-on-Escape. Attaches a single keydown listener to window for as long
 * as `active` stays true. Extracted from 7 different modals that all
 * duplicated this effect.
 */
export function useEscapeKey(onEscape: () => void, active: boolean = true) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onEscape, active]);
}

/**
 * Shared modal shell. Handles backdrop, Escape key, role/aria wiring,
 * body click-through prevention, and sticky header. Individual modals
 * just supply their content.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  maxWidth = 'max-w-2xl',
  children,
  header,
  padding = 'p-5',
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  maxWidth?: string;
  children: ReactNode;
  /** Optional override for the header row — use instead of title/subtitle */
  header?: ReactNode;
  /** Tailwind padding class for the body. Default p-5. */
  padding?: string;
}) {
  useEscapeKey(onClose, open);
  if (!open) return null;

  const labelId = title ? 'modal-title' : undefined;

  return (
    <div
      className="fixed inset-0 bg-black/60 modal-backdrop z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelId}
    >
      <div
        className={`bg-surface border border-border rounded-xl w-full ${maxWidth} max-h-[92vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        {(header || title) && (
          <div className="sticky top-0 bg-surface border-b border-border px-5 py-3 flex items-center justify-between z-10">
            {header ?? (
              <>
                <div>
                  {title && <h2 id={labelId} className="text-base font-semibold">{title}</h2>}
                  {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
                </div>
                <button
                  onClick={onClose}
                  className="text-muted hover:text-foreground text-lg leading-none"
                  aria-label="Close"
                >
                  ×
                </button>
              </>
            )}
          </div>
        )}
        <div className={padding}>{children}</div>
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: ConceptStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: PriorityLevel }) {
  const labels: Record<PriorityLevel, string> = { low: 'Low', medium: 'Med', high: 'High', urgent: 'Urgent' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_COLORS[priority]}`}>
      {priority === 'urgent' && '! '}{labels[priority]}
    </span>
  );
}

export function LifecycleBadge({ type }: { type: LifecycleType }) {
  const styles: Record<LifecycleType, string> = {
    seasonal: 'bg-orange-500/20 text-orange-400',
    evergreen: 'bg-green-500/20 text-green-400',
    limited_edition: 'bg-pink-500/20 text-pink-400',
    custom: 'bg-cyan-500/20 text-cyan-400',
  };
  const labels: Record<LifecycleType, string> = {
    seasonal: 'Seasonal',
    evergreen: 'Evergreen',
    limited_edition: 'Limited',
    custom: 'Custom',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[type]}`}>
      {labels[type]}
    </span>
  );
}

export function Tag({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-border/50 text-muted text-xs rounded">
      {label}
      {onRemove && (
        <button onClick={onRemove} className="hover:text-foreground">×</button>
      )}
    </span>
  );
}

export function PlaceholderImage({ label, size = 'md' }: { label: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'h-16 w-16', md: 'h-32 w-32', lg: 'h-48 w-48' };
  return (
    <div className={`${sizes[size]} placeholder-pattern rounded-lg flex items-center justify-center border border-border`}>
      <span className="text-xs text-muted text-center px-2">{label}</span>
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: {
  icon: string;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-4xl mb-3 opacity-50">{icon}</div>
      <h3 className="text-lg font-medium mb-1">{title}</h3>
      <p className="text-sm text-muted max-w-md">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm rounded-lg transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="text-sm text-muted mb-1">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
    </div>
  );
}

export function Select({ value, onChange, options, placeholder, className = '' }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent ${className}`}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function TextArea({ value, onChange, placeholder, rows = 3, className = '' }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={`w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent resize-none ${className}`}
    />
  );
}

export function Input({ value, onChange, placeholder, type = 'text', className = '' }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent ${className}`}
    />
  );
}

export function SliderInput({ value, onChange, min = 1, max = 5, label }: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  label: string;
}) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-muted">{label}</span>
        <span className="font-medium">{value}/{max}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-accent"
      />
    </div>
  );
}
