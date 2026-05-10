'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CfpDesign,
  CfpListResponse,
  CfpStatus,
  CFP_STATUS_META,
  CFP_STATUS_FORWARD,
  CFP_STATUS_TERMINAL,
  CFP_GLYCERIN_HEX,
  CfpGlycerinColor,
} from '@/lib/cfp-types';
import { useToast } from './toast';
import { useAppStore } from '@/lib/store';

/**
 * Customer Designs — reads live data from the Customize Freeze Pipe
 * external API via /api/cfp/* server-side proxy. Lets the team triage
 * designs (advance status, append notes) without leaving the app.
 *
 * The CFP API is the source of truth — we don't mirror its data into the
 * local concepts table. State changes go upstream via PATCH; local UI
 * refreshes on success.
 */
export function CustomerDesigns({ onOpenConcept }: { onOpenConcept: (id: string) => void }) {
  const { toast } = useToast();
  const { currentUser, addConcept } = useAppStore();

  const [designs, setDesigns] = useState<CfpDesign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | CfpStatus>('all');
  const [submittedOnly, setSubmittedOnly] = useState(true);
  const [colorFilter, setColorFilter] = useState<'all' | CfpGlycerinColor>('all');

  // Selected design for the detail drawer
  const [activeId, setActiveId] = useState<string | null>(null);

  const fetchDesigns = useCallback(async (append = false) => {
    if (append) setLoadingMore(true); else { setLoading(true); setError(null); }

    const params = new URLSearchParams();
    params.set('limit', '50');
    params.set('sort', 'submitted');
    params.set('order', 'desc');
    if (submittedOnly) params.set('submittedOnly', '1');
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (colorFilter !== 'all') params.set('glycerinColor', colorFilter);
    if (search.trim()) params.set('q', search.trim());
    if (append && cursor) params.set('cursor', cursor);

    try {
      const res = await fetch(`/api/cfp/designs?${params.toString()}`);
      const data = (await res.json().catch(() => ({}))) as Partial<CfpListResponse> & { error?: string };
      if (!res.ok) {
        setError(data.error || `Upstream error ${res.status}`);
        if (!append) setDesigns([]);
        return;
      }
      const list = Array.isArray(data.designs) ? data.designs : [];
      setDesigns((prev) => (append ? [...prev, ...list] : list));
      setHasMore(!!data.hasMore);
      setCursor(data.nextCursor || null);
    } catch {
      setError('Network error — could not reach CFP API');
      if (!append) setDesigns([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [submittedOnly, statusFilter, colorFilter, search, cursor]);

  // Initial + filter-change refetch (debounced for search)
  useEffect(() => {
    setCursor(null);
    const t = setTimeout(() => fetchDesigns(false), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submittedOnly, statusFilter, colorFilter, search]);

  const updateStatus = async (id: string, next: CfpStatus, note?: string) => {
    try {
      const res = await fetch(`/api/cfp/designs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: next,
          internalNotes: note || undefined,
          actorName: currentUser?.name || 'Design Studio',
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast(err.error || 'Status change failed', 'error');
        return false;
      }
      // Optimistic local update
      setDesigns((prev) => prev.map((d) => d.id === id ? { ...d, status: next } : d));
      toast(`Marked ${CFP_STATUS_META[next].label.toLowerCase()}`, 'success');
      return true;
    } catch {
      toast('Network error', 'error');
      return false;
    }
  };

  const stats = useMemo(() => {
    const byStatus: Record<string, number> = {};
    designs.forEach((d) => { byStatus[d.status] = (byStatus[d.status] || 0) + 1; });
    return { total: designs.length, byStatus };
  }, [designs]);

  const activeDesign = useMemo(
    () => designs.find((d) => d.id === activeId) || null,
    [designs, activeId]
  );

  /**
   * Promote a CFP design into a local Concept. Pre-fills the new Concept
   * with everything we know about the customer submission so the design
   * team can take it over for refinement, mockups, marketing etc.
   * The selected version's PNG is proxied through our route so the
   * authenticated upstream URL never leaks to the browser.
   */
  const importToConcepts = async (d: CfpDesign) => {
    const ver = d.selectedVersion?.versionNumber || d.allVersions[0]?.versionNumber;
    const coilImageUrl = ver
      ? `/api/cfp/designs/${d.id}/files/v${ver}/png`
      : '';

    const tags = [
      'customer-design',
      d.glycerinColor?.toLowerCase() || '',
      d.style?.toLowerCase().replace(/\s+/g, '-') || '',
    ].filter(Boolean);

    try {
      const concept = await addConcept({
        name: d.textRequested || d.theme || `Customer design ${d.id.slice(0, 6)}`,
        description: [
          d.userPrompt && `Customer brief: ${d.userPrompt}`,
          d.theme && `Theme: ${d.theme}`,
          d.style && `Style: ${d.style}`,
        ].filter(Boolean).join('\n\n'),
        tags,
        coilImageUrl,
        coilOnly: true,
        priority: 'high',
        lifecycleType: 'custom',
        intendedAudience: 'Customer custom order',
        source: `cfp:${d.source}`,
        externalId: d.id,
        externalUrl: `https://customize-freezepipe-production.up.railway.app/admin/designs/${d.id}`,
        submitterName: d.customerName || '',
        submitterEmail: d.customerEmail || '',
        manufacturingNotes: [
          d.orderNumber && `Order: ${d.orderNumber}`,
          d.glycerinColor && `Glycerin: ${d.glycerinColor}`,
          d.widthMm && `Dimensions: ${d.widthMm} × ${d.heightMm} mm`,
        ].filter(Boolean).join('\n'),
      });
      toast(`Imported as Concept "${concept.name}"`, 'success');

      // Fire-and-forget: tell CFP we linked this design so their admin shows
      // a "Linked in etching tool" badge. Idempotent on their side, so retries
      // are safe. Failures here don't block the UX — the concept already
      // exists locally.
      fetch(`/api/cfp/designs/${d.id}/import-receipts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conceptId: concept.id,
          conceptUrl: typeof window !== 'undefined'
            ? `${window.location.origin}/?concept=${concept.id}`
            : '',
          conceptName: concept.name,
          importedBy: currentUser?.name || 'Design Studio',
        }),
      }).catch(() => { /* non-fatal */ });

      onOpenConcept(concept.id);
    } catch {
      toast('Could not import — try again', 'error');
    }
  };

  /* ───────────── Render ───────────── */

  return (
    <div className="p-3 sm:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-5">
        <div>
          <div className="eyebrow mb-1">Customer Submissions · Live</div>
          <h2 className="display-sm">Self-Designed</h2>
          <p className="text-xs sm:text-sm text-muted mt-1">
            Live feed from <span className="mono">customize-freezepipe.com</span> — triage, advance status, add notes.
          </p>
        </div>
        <button
          onClick={() => fetchDesigns(false)}
          disabled={loading}
          className="px-3 py-1.5 text-sm bg-surface border border-border rounded-lg hover:border-border-light disabled:opacity-50"
        >
          {loading ? '⟳ Refreshing…' : '⟳ Refresh'}
        </button>
      </div>

      {/* Setup-error banner */}
      {error && error.includes('not configured') && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-5">
          <div className="text-sm font-medium text-amber-900 mb-1">CFP API not configured</div>
          <p className="text-xs text-amber-800 mb-2">
            Set <span className="mono">CFP_API_KEY</span> in Railway to your <span className="mono">cfp_live_…</span> token, then redeploy.
            Generate one at <span className="mono">customize-freezepipe.com/admin/settings</span>.
          </p>
        </div>
      )}
      {error && !error.includes('not configured') && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-5 text-sm text-red-900">
          {error}
        </div>
      )}

      {/* Stat strip */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-5">
        <Stat label="Total" value={stats.total} />
        <Stat label="New" value={stats.byStatus.new || 0} accent={(stats.byStatus.new || 0) > 0} />
        <Stat label="In progress" value={stats.byStatus.in_progress || 0} />
        <Stat label="Etched" value={stats.byStatus.etched || 0} />
        <Stat label="Shipped" value={stats.byStatus.shipped || 0} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <div className="flex-1 relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search email, name, order #, prompt, theme…"
            className="w-full bg-surface border border-border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-foreground"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm pointer-events-none">⌕</span>
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-muted self-center">
          <input
            type="checkbox"
            checked={submittedOnly}
            onChange={(e) => setSubmittedOnly(e.target.checked)}
            className="accent-accent"
          />
          Submitted only
        </label>
      </div>

      {/* Status chips */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <FilterChip active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>All</FilterChip>
        {[...CFP_STATUS_FORWARD, ...CFP_STATUS_TERMINAL].map((s) => (
          <FilterChip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
            {CFP_STATUS_META[s].label}{stats.byStatus[s] ? ` · ${stats.byStatus[s]}` : ''}
          </FilterChip>
        ))}
      </div>

      {/* Glycerin color chips */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        <FilterChip active={colorFilter === 'all'} onClick={() => setColorFilter('all')}>All colors</FilterChip>
        {(Object.keys(CFP_GLYCERIN_HEX) as CfpGlycerinColor[]).map((c) => (
          <FilterChip key={c} active={colorFilter === c} onClick={() => setColorFilter(c)}>
            <span
              className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
              style={{ background: CFP_GLYCERIN_HEX[c] }}
            />
            {c}
          </FilterChip>
        ))}
      </div>

      {/* Loading state */}
      {loading && designs.length === 0 && (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
          <div className="text-sm text-muted mt-3">Fetching live designs…</div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && designs.length === 0 && (
        <div className="bg-surface border border-dashed border-border rounded-xl p-10 text-center">
          <div className="text-5xl mb-4 opacity-30">↓</div>
          <h3 className="serif text-xl font-medium mb-2">No designs match your filters</h3>
          <p className="text-sm text-muted">Try clearing filters or expanding the time window.</p>
        </div>
      )}

      {/* Grid */}
      {designs.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {designs.map((d) => (
            <DesignCard key={d.id} design={d} onOpen={() => setActiveId(d.id)} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {hasMore && (
        <div className="text-center mt-6">
          <button
            onClick={() => fetchDesigns(true)}
            disabled={loadingMore}
            className="px-4 py-2 text-sm bg-surface border border-border rounded-lg hover:border-border-light disabled:opacity-50"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}

      {/* Detail drawer */}
      {activeDesign && (
        <DesignDrawer
          design={activeDesign}
          onClose={() => setActiveId(null)}
          onStatusChange={(s, note) => updateStatus(activeDesign.id, s, note)}
          onImport={() => importToConcepts(activeDesign)}
        />
      )}
    </div>
  );
}

/* ───────────── Subcomponents ───────────── */

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`bg-surface border rounded-lg p-3 ${accent ? 'border-accent' : 'border-border'}`}>
      <div className="eyebrow mb-0.5">{label}</div>
      <div className={`serif text-2xl font-medium tabular-nums ${accent ? 'text-accent' : ''}`}>{value}</div>
    </div>
  );
}

function FilterChip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-1 rounded-full border transition-colors ${
        active
          ? 'bg-foreground text-surface border-foreground'
          : 'bg-surface text-muted border-border hover:border-border-light'
      }`}
    >
      {children}
    </button>
  );
}

function DesignCard({ design: d, onOpen }: { design: CfpDesign; onOpen: () => void }) {
  const meta = CFP_STATUS_META[d.status];
  const heroUrl = d.selectedVersion?.downloadUrls.png
    || d.selectedVersion?.downloadUrls.jpeg
    || d.allVersions[0]?.downloadUrls.png;
  const isNew = d.status === 'new';

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden flex flex-col hover:border-border-light transition-colors">
      <button onClick={onOpen} className="aspect-square bg-background placeholder-pattern relative overflow-hidden">
        {heroUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heroUrl} alt={d.textRequested || d.theme || 'design'} className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted text-xs">No image</div>
        )}
        {isNew && (
          <div className="absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full bg-accent text-white font-medium">
            NEW
          </div>
        )}
        {d.glycerinColor && (
          <div
            className="absolute top-2 right-2 w-6 h-6 rounded-full border-2 border-white shadow"
            style={{ background: CFP_GLYCERIN_HEX[d.glycerinColor] }}
            title={`${d.glycerinColor} glycerin`}
          />
        )}
      </button>

      <div className="p-4 flex-1 flex flex-col">
        <button onClick={onOpen} className="text-left mb-2">
          <h3 className="serif text-lg font-medium leading-tight hover:text-accent transition-colors line-clamp-1">
            {d.textRequested || d.theme || 'Untitled design'}
          </h3>
          {d.style && <div className="eyebrow mt-1">{d.style}</div>}
        </button>

        <div className="text-xs text-muted space-y-0.5 mb-3">
          {d.customerName && <div className="text-foreground">{d.customerName}</div>}
          {d.customerEmail && (
            <a href={`mailto:${d.customerEmail}`} className="hover:text-accent truncate block">
              {d.customerEmail}
            </a>
          )}
          {d.orderNumber && <div className="mono text-[10px]">{d.orderNumber}</div>}
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${meta.cls}`}>
            {meta.label}
          </span>
          {d.allVersions.length > 1 && (
            <span className="text-[10px] text-muted">v{d.selectedVersion?.versionNumber || '?'} of {d.allVersions.length}</span>
          )}
          {d.widthMm && d.heightMm && (
            <span className="text-[10px] text-muted mono">{d.widthMm}×{d.heightMm}mm</span>
          )}
        </div>

        <div className="text-[10px] text-muted mt-auto pt-2 border-t border-border">
          {d.submittedAt
            ? <>Submitted {new Date(d.submittedAt).toLocaleDateString()}</>
            : <>Draft · started {new Date(d.createdAt).toLocaleDateString()}</>}
        </div>

        <button
          onClick={onOpen}
          className="mt-3 text-xs px-3 py-1.5 bg-foreground text-surface rounded-lg hover:bg-accent transition-colors font-medium"
        >
          Open →
        </button>
      </div>
    </div>
  );
}

function DesignDrawer({
  design: d,
  onClose,
  onStatusChange,
  onImport,
}: {
  design: CfpDesign;
  onClose: () => void;
  onStatusChange: (s: CfpStatus, note?: string) => Promise<boolean>;
  onImport: () => void;
}) {
  const [note, setNote] = useState('');
  const [busyStatus, setBusyStatus] = useState<CfpStatus | null>(null);
  const [activeVersion, setActiveVersion] = useState<number>(d.selectedVersion?.versionNumber || 1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const v = d.allVersions.find((x) => x.versionNumber === activeVersion) || d.selectedVersion;
  // Use our authenticated proxy so the browser never sees the bearer token.
  const heroUrl = v ? `/api/cfp/designs/${d.id}/files/v${v.versionNumber}/png` : '';
  const downloadUrl = (ext: 'png' | 'jpeg' | 'svg') =>
    v ? `/api/cfp/designs/${d.id}/files/v${v.versionNumber}/${ext}` : '#';

  const handleStatus = async (next: CfpStatus) => {
    setBusyStatus(next);
    const ok = await onStatusChange(next, note.trim() || undefined);
    setBusyStatus(null);
    if (ok) setNote('');
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 modal-backdrop z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-t-xl sm:rounded-xl w-full max-w-3xl max-h-[95vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-surface border-b border-border p-4 flex items-start justify-between gap-3 z-10">
          <div className="min-w-0">
            <div className="eyebrow mb-1">{d.style || 'Customer design'}</div>
            <h3 className="serif text-2xl font-medium leading-tight">
              {d.textRequested || d.theme || 'Untitled'}
            </h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-muted">
              <span className={`px-2 py-0.5 rounded-full font-medium ${CFP_STATUS_META[d.status].cls}`}>
                {CFP_STATUS_META[d.status].label}
              </span>
              {d.glycerinColor && (
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: CFP_GLYCERIN_HEX[d.glycerinColor] }} />
                  {d.glycerinColor}
                </span>
              )}
              <span className="mono">{d.source}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-5">
          {/* Image + version picker */}
          <div className="aspect-square bg-background placeholder-pattern rounded-lg overflow-hidden">
            {heroUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={heroUrl} alt="design" className="w-full h-full object-contain" />
            )}
          </div>
          {v && (
            <div className="flex flex-wrap gap-2">
              <a
                href={downloadUrl('png')}
                download
                className="text-xs px-3 py-1.5 bg-foreground text-surface rounded-lg hover:bg-accent transition-colors font-medium"
              >
                ↓ PNG
              </a>
              <a
                href={downloadUrl('jpeg')}
                download
                className="text-xs px-3 py-1.5 bg-surface border border-border rounded-lg hover:border-foreground"
              >
                ↓ JPEG
              </a>
              <a
                href={downloadUrl('svg')}
                download
                className="text-xs px-3 py-1.5 bg-surface border border-border rounded-lg hover:border-foreground"
              >
                ↓ SVG
              </a>
              <button
                onClick={onImport}
                className="ml-auto text-xs px-3 py-1.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors"
                title="Create a local Concept seeded with this customer design"
              >
                ⇪ Import to Concepts
              </button>
            </div>
          )}
          {d.allVersions.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <span className="eyebrow self-center">Versions:</span>
              {d.allVersions.map((ver) => (
                <button
                  key={ver.id}
                  onClick={() => setActiveVersion(ver.versionNumber)}
                  className={`text-xs px-2.5 py-1 rounded border ${
                    activeVersion === ver.versionNumber
                      ? 'bg-foreground text-surface border-foreground'
                      : 'bg-surface text-muted border-border hover:border-border-light'
                  }`}
                  title={ver.modelUsed}
                >
                  v{ver.versionNumber}
                  {d.selectedVersion?.id === ver.id && ' ★'}
                </button>
              ))}
            </div>
          )}

          {/* Customer info */}
          <div className="grid grid-cols-2 gap-4 text-xs">
            <Field label="Customer" value={d.customerName || '—'} />
            <Field label="Email" value={d.customerEmail} mailto />
            <Field label="Order #" value={d.orderNumber || '—'} mono />
            <Field label="Submitted" value={d.submittedAt ? new Date(d.submittedAt).toLocaleString() : 'Draft'} />
            {d.widthMm && (
              <Field label="Dimensions" value={`${d.widthMm} × ${d.heightMm} mm`} mono />
            )}
            {d.complexity && <Field label="Complexity" value={d.complexity} />}
          </div>

          {/* Prompts */}
          {(d.userPrompt || v?.promptUsed) && (
            <details className="bg-background border border-border rounded-lg p-3 text-xs">
              <summary className="cursor-pointer font-medium">Prompts</summary>
              <div className="mt-3 space-y-3">
                {d.userPrompt && (
                  <div>
                    <div className="eyebrow mb-1">Customer typed</div>
                    <p className="text-muted whitespace-pre-wrap">{d.userPrompt}</p>
                  </div>
                )}
                {v?.promptUsed && (
                  <div>
                    <div className="eyebrow mb-1">Model received (v{v.versionNumber})</div>
                    <p className="text-muted whitespace-pre-wrap">{v.promptUsed}</p>
                  </div>
                )}
                {d.finalPromptSentToOpenai && (
                  <div>
                    <div className="eyebrow mb-1">Final prompt</div>
                    <p className="text-muted whitespace-pre-wrap">{d.finalPromptSentToOpenai}</p>
                  </div>
                )}
              </div>
            </details>
          )}

          {/* Note input */}
          <div>
            <label className="eyebrow block mb-1">Internal note (optional, attached to next status change)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="e.g. Etched on Machine #2"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-foreground resize-none"
            />
          </div>

          {/* Status actions */}
          <div>
            <div className="eyebrow mb-2">Advance status</div>
            <div className="flex flex-wrap gap-2">
              {CFP_STATUS_FORWARD.map((s) => {
                const isCurrent = d.status === s;
                const isDone = CFP_STATUS_FORWARD.indexOf(s) < CFP_STATUS_FORWARD.indexOf(d.status as CfpStatus);
                return (
                  <button
                    key={s}
                    onClick={() => handleStatus(s)}
                    disabled={isCurrent || busyStatus !== null}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors ${
                      isCurrent
                        ? 'bg-accent text-white border-accent'
                        : isDone
                          ? 'bg-background text-muted border-border'
                          : 'bg-surface border-border hover:border-foreground'
                    } disabled:opacity-50`}
                  >
                    {busyStatus === s ? '…' : isDone ? '✓ ' : ''}{CFP_STATUS_META[s].label}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {CFP_STATUS_TERMINAL.map((s) => (
                <button
                  key={s}
                  onClick={() => handleStatus(s)}
                  disabled={d.status === s || busyStatus !== null}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  {CFP_STATUS_META[s].label}
                </button>
              ))}
            </div>
          </div>

          {/* External link */}
          <div className="text-[11px] text-muted pt-3 border-t border-border">
            CFP design ID: <span className="mono">{d.id}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label, value, mailto, mono,
}: { label: string; value: string; mailto?: boolean; mono?: boolean }) {
  return (
    <div>
      <div className="eyebrow mb-0.5">{label}</div>
      {mailto ? (
        <a href={`mailto:${value}`} className={`hover:text-accent ${mono ? 'mono' : ''}`}>{value}</a>
      ) : (
        <div className={mono ? 'mono' : ''}>{value}</div>
      )}
    </div>
  );
}
