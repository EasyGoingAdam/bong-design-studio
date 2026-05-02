'use client';

import { useEffect, useState } from 'react';
import { useToast } from './toast';

interface ShareLink {
  id: string;
  conceptId: string;
  token: string;
  createdAt: string;
  createdBy: string;
  expiresAt: string | null;
  viewCount: number;
  revoked: boolean;
  allowComments: boolean;
  titleOverride: string;
}

interface Props {
  conceptId: string;
  conceptName: string;
  designerName: string;
  onClose: () => void;
}

const EXPIRY_OPTIONS = [
  { label: 'Never', days: 0 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
];

export function SharePreviewModal({ conceptId, conceptName, designerName, onClose }: Props) {
  const { toast } = useToast();

  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // New-link form state
  const [expiresInDays, setExpiresInDays] = useState(0);
  const [allowComments, setAllowComments] = useState(true);
  const [titleOverride, setTitleOverride] = useState('');

  // Fetch existing links on mount
  useEffect(() => {
    fetch(`/api/concepts/${conceptId}/share-links`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setLinks)
      .finally(() => setLoading(false));
  }, [conceptId]);

  // Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const createLink = async () => {
    setCreating(true);
    try {
      const res = await fetch(`/api/concepts/${conceptId}/share-links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expiresInDays: expiresInDays > 0 ? expiresInDays : undefined,
          allowComments,
          titleOverride: titleOverride.trim(),
          createdBy: designerName,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast(err.error || 'Failed to create share link', 'error');
        return;
      }
      const newLink = await res.json();
      setLinks((prev) => [newLink, ...prev]);
      setTitleOverride('');
      toast('Share link created — copy and send', 'success');
    } catch {
      toast('Network error', 'error');
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (token: string) => {
    if (!confirm('Revoke this share link? Anyone with the URL will see "preview unavailable" and won\'t be able to view the concept.')) return;
    const res = await fetch(`/api/share-links/${token}`, { method: 'DELETE' });
    if (!res.ok) {
      toast('Could not revoke link', 'error');
      return;
    }
    setLinks((prev) => prev.map((l) => (l.token === token ? { ...l, revoked: true } : l)));
    toast('Share link revoked', 'info');
  };

  const copyUrl = async (token: string) => {
    const url = `${window.location.origin}/preview/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied to clipboard', 'success');
    } catch {
      // Fallback prompt
      prompt('Copy this URL:', url);
    }
  };

  const previewUrl = (token: string) => `${typeof window !== 'undefined' ? window.location.origin : ''}/preview/${token}`;

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString();

  return (
    <div
      className="fixed inset-0 bg-black/60 modal-backdrop z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-surface border border-border rounded-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-surface border-b border-border px-5 py-3 flex items-center justify-between z-10">
          <div>
            <h2 className="text-base font-semibold">🔗 Share Preview</h2>
            <p className="text-xs text-muted mt-0.5">
              Generate a public, view-only URL for <strong>{conceptName}</strong> that you can send to customers or collaborators.
            </p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground text-lg leading-none">×</button>
        </div>

        <div className="p-5 space-y-5">
          {/* Create new link */}
          <div className="bg-background border border-border rounded-xl p-4">
            <div className="text-xs font-semibold mb-3">Create new share link</div>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium mb-1 text-muted">
                  Public title <span className="font-normal italic">(optional — defaults to concept name)</span>
                </label>
                <input
                  type="text"
                  value={titleOverride}
                  onChange={(e) => setTitleOverride(e.target.value)}
                  placeholder={conceptName}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium mb-1 text-muted">Expires after</label>
                  <select
                    value={expiresInDays}
                    onChange={(e) => setExpiresInDays(Number(e.target.value))}
                    className="w-full bg-surface border border-border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-accent"
                  >
                    {EXPIRY_OPTIONS.map((opt) => (
                      <option key={opt.days} value={opt.days}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 self-end pb-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={allowComments}
                    onChange={(e) => setAllowComments(e.target.checked)}
                    className="accent-accent"
                  />
                  Allow visitor comments
                </label>
              </div>
              <button
                onClick={createLink}
                disabled={creating}
                className="w-full py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {creating ? 'Creating…' : '+ Generate Share Link'}
              </button>
            </div>
          </div>

          {/* Existing links */}
          <div>
            <div className="text-xs font-semibold mb-2">Existing links</div>
            {loading ? (
              <div className="text-xs text-muted py-4 text-center">Loading…</div>
            ) : links.length === 0 ? (
              <div className="text-xs text-muted py-4 text-center italic">No share links yet.</div>
            ) : (
              <div className="space-y-2">
                {links.map((link) => {
                  const expired = link.expiresAt && new Date(link.expiresAt).getTime() < Date.now();
                  const status = link.revoked
                    ? { label: 'Revoked', cls: 'bg-red-100 text-red-700 border-red-200' }
                    : expired
                      ? { label: 'Expired', cls: 'bg-gray-100 text-gray-700 border-gray-200' }
                      : { label: 'Active', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
                  return (
                    <div
                      key={link.id}
                      className={`bg-surface border rounded-lg p-3 ${link.revoked || expired ? 'opacity-60' : 'border-border'}`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${status.cls}`}>
                          {status.label}
                        </span>
                        <span className="text-[10px] text-muted">
                          {link.viewCount} view{link.viewCount === 1 ? '' : 's'}
                          {link.expiresAt && ` · expires ${formatDate(link.expiresAt)}`}
                        </span>
                      </div>
                      {link.titleOverride && (
                        <div className="text-xs font-medium mb-1 truncate">&quot;{link.titleOverride}&quot;</div>
                      )}
                      <div className="font-mono text-[11px] text-muted bg-background border border-border rounded px-2 py-1 truncate mb-2">
                        {previewUrl(link.token)}
                      </div>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="text-[10px] text-muted">
                          Created {formatDate(link.createdAt)}{link.createdBy ? ` by ${link.createdBy}` : ''}
                          {link.allowComments && ' · comments on'}
                        </div>
                        <div className="flex gap-1.5">
                          {!link.revoked && !expired && (
                            <>
                              <button
                                onClick={() => copyUrl(link.token)}
                                className="text-[11px] px-2 py-1 bg-accent hover:bg-accent-hover text-white rounded transition-colors"
                              >
                                Copy URL
                              </button>
                              <a
                                href={previewUrl(link.token)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[11px] px-2 py-1 bg-background border border-border hover:bg-surface-hover rounded transition-colors"
                              >
                                Open ↗
                              </a>
                              <button
                                onClick={() => revoke(link.token)}
                                className="text-[11px] px-2 py-1 text-red-600 hover:bg-red-50 border border-red-200 rounded transition-colors"
                              >
                                Revoke
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
