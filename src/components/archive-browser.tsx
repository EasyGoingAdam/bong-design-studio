'use client';

import { useState, useMemo } from 'react';
import { useAppStore } from '@/lib/store';
import { StatusBadge, PriorityBadge, Tag } from './ui';
import { useToast } from './toast';
import { ConfirmDialog } from './confirm-dialog';
import { ImageDownloadButtons } from './image-download';
import { formatDate } from '@/lib/utils';

export function ArchiveBrowser({ onOpenConcept }: { onOpenConcept: (id: string) => void }) {
  const { concepts, updateConcept, deleteConcept } = useAppStore();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const archived = useMemo(() => {
    let result = concepts.filter((c) => c.status === 'archived');

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        c.collection.toLowerCase().includes(q) ||
        c.designer.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q)) ||
        c.specs.designStyleName.toLowerCase().includes(q) ||
        c.specs.designTheme.toLowerCase().includes(q) ||
        c.intendedAudience.toLowerCase().includes(q) ||
        c.priority.toLowerCase().includes(q) ||
        c.lifecycleType.toLowerCase().includes(q)
      );
    }

    return result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [concepts, search]);

  const handleRestore = (id: string) => {
    updateConcept(id, { status: 'ideation' });
    toast('Concept restored to Ideation', 'success');
  };

  const handleDelete = (id: string) => {
    deleteConcept(id);
    setDeleteTarget(null);
    toast('Concept permanently deleted', 'success');
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold">Archive</h2>
          <p className="text-sm text-muted">{archived.length} archived concept{archived.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search archived concepts by name, collection, designer, tags, style, theme..."
          className="w-full max-w-lg bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
        />
      </div>

      {archived.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3 opacity-40">📦</div>
          <h3 className="text-lg font-medium mb-1">{search ? 'No matches found' : 'No archived concepts'}</h3>
          <p className="text-sm text-muted max-w-md mx-auto">
            {search ? 'Try a different search term.' : 'Archived concepts will appear here. You can restore them back to the pipeline or permanently delete them.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {archived.map((c) => (
            <div key={c.id} className="bg-surface border border-border rounded-xl p-4 hover:border-border-light transition-all">
              <div className="flex items-start gap-4">
                {/* Images */}
                <div className="flex gap-2 shrink-0">
                  <div className="w-20 h-20 rounded-lg bg-background placeholder-pattern border border-border flex items-center justify-center overflow-hidden relative group">
                    {c.coilImageUrl ? (
                      <>
                        <img src={c.coilImageUrl} alt="Coil" className="w-full h-full object-contain" />
                        <div className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <ImageDownloadButtons imageUrl={c.coilImageUrl} filename={`${c.name}-coil`} />
                        </div>
                      </>
                    ) : (
                      <span className="text-[8px] text-muted">Coil</span>
                    )}
                  </div>
                  <div className="w-20 h-20 rounded-lg bg-background placeholder-pattern border border-border flex items-center justify-center overflow-hidden relative group">
                    {c.baseImageUrl ? (
                      <>
                        <img src={c.baseImageUrl} alt="Base" className="w-full h-full object-contain" />
                        <div className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <ImageDownloadButtons imageUrl={c.baseImageUrl} filename={`${c.name}-base`} />
                        </div>
                      </>
                    ) : (
                      <span className="text-[8px] text-muted">Base</span>
                    )}
                  </div>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <button onClick={() => onOpenConcept(c.id)} className="text-left hover:text-accent transition-colors">
                    <h3 className="text-sm font-semibold truncate">{c.name}</h3>
                  </button>
                  <p className="text-xs text-muted mt-0.5">{c.collection || 'No collection'} · {c.designer}</p>
                  {c.description && (
                    <p className="text-xs text-muted mt-1 line-clamp-2">{c.description}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <PriorityBadge priority={c.priority} />
                    {c.tags.slice(0, 4).map((t) => <Tag key={t} label={t} />)}
                    {c.tags.length > 4 && <span className="text-xs text-muted">+{c.tags.length - 4}</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted">
                    <span>Archived {formatDate(c.updatedAt)}</span>
                    <span>{c.versions.length} version{c.versions.length !== 1 ? 's' : ''}</span>
                    <span>{c.comments.length} comment{c.comments.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    onClick={() => handleRestore(c.id)}
                    className="px-3 py-1.5 text-xs bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
                  >
                    Restore
                  </button>
                  <button
                    onClick={() => onOpenConcept(c.id)}
                    className="px-3 py-1.5 text-xs bg-background border border-border rounded-lg hover:bg-surface-hover transition-colors"
                  >
                    View
                  </button>
                  <button
                    onClick={() => setDeleteTarget(c.id)}
                    className="px-3 py-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Concept Permanently"
        message="This will permanently delete this concept and all its versions, images, comments, and AI generations. This cannot be undone."
        confirmLabel="Delete Permanently"
        confirmVariant="danger"
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
