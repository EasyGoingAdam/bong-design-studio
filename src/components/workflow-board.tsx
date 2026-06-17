'use client';

import { useMemo, useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useAppStore } from '@/lib/store';
import { KANBAN_COLUMNS, STATUS_LABELS, ConceptStatus, Concept, PriorityLevel } from '@/lib/types';
import { ConceptCardMini } from './concept-card';
import { useToast } from './toast';
import { ConfirmDialog } from './confirm-dialog';

const COLUMN_STRIP: Record<ConceptStatus, string> = {
  ideation: 'col-strip-ideation',
  in_review: 'col-strip-review',
  approved: 'col-strip-approved',
  ready_for_manufacturing: 'col-strip-ready',
  manufactured: 'col-strip-mfg',
  archived: 'col-strip-archived',
};

/**
 * Build a single lower-cased search haystack per concept once, then do a
 * cheap substring check per keystroke. Previously this function called
 * .toLowerCase() ~13 times per concept on EVERY keystroke — 200 concepts
 * meant 2,600 redundant lowercase ops per character typed.
 */
function buildSearchHaystack(concept: Concept): string {
  return [
    concept.name,
    concept.collection,
    concept.designer,
    concept.description,
    ...concept.tags,
    concept.specs.designStyleName,
    concept.specs.designTheme,
    concept.intendedAudience,
    concept.manufacturingNotes,
    concept.marketingStory || '',
    concept.priority,
    concept.lifecycleType,
    concept.source || '',
    concept.submitterName || '',
    concept.submitterEmail || '',
  ].join(' ').toLowerCase();
}

function matchesHaystack(haystack: string, q: string): boolean {
  if (!q) return true;
  return haystack.includes(q.toLowerCase());
}

export function WorkflowBoard({
  onOpenConcept,
  onOpenArchive,
}: {
  onOpenConcept: (id: string) => void;
  onOpenArchive?: () => void;
}) {
  const { concepts, moveConcept, deleteConcept, updateConcept, duplicateConcept, openAIKey } = useAppStore();
  const { toast } = useToast();

  // Global search across every column
  const [globalSearch, setGlobalSearch] = useState('');
  // AI-ranked semantic search results. When populated, overrides the keyword
  // filter — we show only matched concepts, ordered by AI relevance score.
  const [aiMatches, setAiMatches] = useState<{ id: string; score: number; reason: string }[] | null>(null);
  const [aiSearching, setAiSearching] = useState(false);
  // Per-column search — every column gets its own input. Stored as a
  // Record keyed by status id so we don't need 6 separate useState calls
  // (previously only Manufactured/Archived had this).
  const [columnSearch, setColumnSearch] = useState<Record<string, string>>({});
  const mfgSearch = columnSearch['manufactured'] || '';
  const archiveSearch = columnSearch['archived'] || '';
  // Helper so the JSX can set individual column searches cleanly.
  const setColumnSearchFor = (col: string, value: string) =>
    setColumnSearch((prev) => ({ ...prev, [col]: value }));
  const setMfgSearch = (v: string) => setColumnSearchFor('manufactured', v);
  const setArchiveSearch = (v: string) => setColumnSearchFor('archived', v);
  // "Starred only" filter — when on, every column hides non-highlighted
  // concepts. Persisted to localStorage so the toggle survives reloads.
  const [starredOnly, setStarredOnly] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try { return window.localStorage.getItem('workflow-starred-only-v1') === '1'; }
    catch { return false; }
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem('workflow-starred-only-v1', starredOnly ? '1' : '0'); } catch {}
  }, [starredOnly]);

  // Sort order applied within each column. Persisted to localStorage so the
  // designer doesn't have to re-pick on every visit. Default is 'newest'
  // so freshly-created ideation cards float to the top.
  type SortMode = 'newest' | 'oldest' | 'updated' | 'priority' | 'default';
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    if (typeof window === 'undefined') return 'newest';
    try {
      const saved = window.localStorage.getItem('workflow-sort-v1');
      return (saved as SortMode) || 'newest';
    } catch { return 'newest'; }
  });
  // Persist whenever it changes so the choice survives reloads.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem('workflow-sort-v1', sortMode); } catch {}
  }, [sortMode]);

  // Multi-select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  // Build a search haystack per concept ONCE per concepts change. Each
  // keystroke just does a cheap `.includes(lower)` against the precomputed
  // string. This is O(N) on concepts change, O(1) per keystroke per concept.
  const haystacks = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of concepts) map.set(c.id, buildSearchHaystack(c));
    return map;
  }, [concepts]);

  const columns = useMemo(() => {
    const map: Record<string, Concept[]> = {};
    const g = globalSearch.trim();
    const mfgQ = mfgSearch.trim();
    const archiveQ = archiveSearch.trim();

    // If AI matches are active, build a lookup of allowed ids + their order/score.
    const aiMatchMap = aiMatches
      ? new Map(aiMatches.map((m, idx) => [m.id, { score: m.score, order: idx }]))
      : null;

    for (const col of KANBAN_COLUMNS) {
      let items = concepts.filter((c) => c.status === col);
      // "Starred only" filter — applied first so it short-circuits the
      // search + sort work below.
      if (starredOnly) {
        items = items.filter((c) => !!c.highlighted);
      }

      if (aiMatchMap) {
        // AI mode: keep only matched concepts, sorted by AI relevance
        items = items
          .filter((c) => aiMatchMap.has(c.id))
          .sort((a, b) => (aiMatchMap.get(a.id)!.order - aiMatchMap.get(b.id)!.order));
      } else {
        if (g) {
          items = items.filter((c) => matchesHaystack(haystacks.get(c.id) || '', g));
        }
        // Apply user-selected sort. AI relevance order is preserved when
        // AI search is active because we already sorted above.
        if (sortMode === 'newest') {
          items = [...items].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        } else if (sortMode === 'oldest') {
          items = [...items].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        } else if (sortMode === 'updated') {
          items = [...items].sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );
        } else if (sortMode === 'priority') {
          const rank: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
          items = [...items].sort(
            (a, b) => (rank[a.priority] ?? 99) - (rank[b.priority] ?? 99)
          );
        }
      }

      // Per-column search — applies on TOP of the global search so the
      // user can narrow within a single column. Empty string = no filter.
      const perColQ = (columnSearch[col] || '').trim();
      if (perColQ) {
        items = items.filter((c) => matchesHaystack(haystacks.get(c.id) || '', perColQ));
      }

      // Highlighted/starred concepts ALWAYS float to the top of their
      // column, on top of whatever sort the user picked. Stable sort: the
      // user's chosen sort order is preserved among the starred subset
      // and among the unstarred subset; we just promote stars above all.
      items = [...items].sort((a, b) => {
        const aH = a.highlighted ? 1 : 0;
        const bH = b.highlighted ? 1 : 0;
        if (aH !== bH) return bH - aH;
        return 0; // preserve previous order (sort is stable in modern JS engines)
      });
      map[col] = items;
    }
    return map;
  }, [concepts, haystacks, globalSearch, columnSearch, aiMatches, sortMode, starredOnly]);

  const runAISearch = async () => {
    const q = globalSearch.trim();
    if (!q) {
      toast('Type a search query first', 'info');
      return;
    }
    if (!openAIKey) {
      toast('Set your OpenAI API key in Settings first', 'error');
      return;
    }
    setAiSearching(true);
    try {
      const payload = concepts.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        tags: c.tags,
        style: c.specs.designStyleName,
        theme: c.specs.designTheme,
        audience: c.intendedAudience,
        status: c.status,
      }));
      const res = await fetch('/api/semantic-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, concepts: payload, apiKey: openAIKey }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || 'AI search failed', 'error');
        return;
      }
      setAiMatches(data.matches || []);
      if ((data.matches || []).length === 0) {
        toast('No AI matches found — try different wording', 'info');
      } else {
        toast(`Found ${data.matches.length} AI-ranked match${data.matches.length > 1 ? 'es' : ''}`, 'success');
      }
    } catch {
      toast('Network error — AI search failed', 'error');
    } finally {
      setAiSearching(false);
    }
  };

  const clearAISearch = () => {
    setAiMatches(null);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllInColumn = (col: ConceptStatus) => {
    const ids = (columns[col] || []).map((c) => c.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = ids.every((id) => next.has(id));
      if (allSelected) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const bulkMove = (status: ConceptStatus) => {
    selectedIds.forEach((id) => moveConcept(id, status));
    toast(`Moved ${selectedIds.size} concept${selectedIds.size > 1 ? 's' : ''} to ${STATUS_LABELS[status]}`, 'success');
    clearSelection();
  };

  const bulkArchive = () => {
    selectedIds.forEach((id) => updateConcept(id, { status: 'archived' }));
    toast(`Archived ${selectedIds.size} concept${selectedIds.size > 1 ? 's' : ''}`, 'info');
    clearSelection();
  };

  const bulkDuplicate = async () => {
    const count = selectedIds.size;
    for (const id of selectedIds) {
      await duplicateConcept(id);
    }
    toast(`Duplicated ${count} concept${count > 1 ? 's' : ''}`, 'success');
    clearSelection();
  };

  const bulkSetPriority = (priority: PriorityLevel) => {
    selectedIds.forEach((id) => updateConcept(id, { priority }));
    toast(`Set ${selectedIds.size} to ${priority} priority`, 'success');
    clearSelection();
  };

  const bulkAddTag = () => {
    const tag = window.prompt('Tag to add to all selected concepts:');
    if (!tag?.trim()) return;
    const clean = tag.trim();
    selectedIds.forEach((id) => {
      const c = concepts.find((cc) => cc.id === id);
      if (!c) return;
      if (!c.tags.includes(clean)) updateConcept(id, { tags: [...c.tags, clean] });
    });
    toast(`Added tag "${clean}" to ${selectedIds.size} concept${selectedIds.size > 1 ? 's' : ''}`, 'success');
    clearSelection();
  };

  const bulkExport = () => {
    const picked = concepts.filter((c) => selectedIds.has(c.id));
    const rows = [
      ['Name', 'Collection', 'Status', 'Priority', 'Tags', 'Designer', 'Created', 'Updated'],
      ...picked.map((c) => [
        c.name,
        c.collection,
        c.status,
        c.priority,
        c.tags.join('; '),
        c.designer,
        c.createdAt,
        c.updatedAt,
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `concepts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast(`Exported ${picked.length} concepts to CSV`, 'success');
  };

  const bulkDelete = () => {
    selectedIds.forEach((id) => deleteConcept(id));
    toast(`Deleted ${selectedIds.size} concept${selectedIds.size > 1 ? 's' : ''}`, 'success');
    clearSelection();
    setShowBulkDeleteConfirm(false);
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const conceptId = result.draggableId;
    const newStatus = result.destination.droppableId as ConceptStatus;
    moveConcept(conceptId, newStatus);
    toast(`Moved to ${STATUS_LABELS[newStatus]}`, 'success');
  };

  const hasSelection = selectedIds.size > 0;

  // Unfiltered totals (so badge can show "2/12" when filtering)
  const totalByStatus = useMemo(() => {
    const map: Record<string, number> = {};
    for (const col of KANBAN_COLUMNS) {
      map[col] = concepts.filter((c) => c.status === col).length;
    }
    return map;
  }, [concepts]);

  return (
    <div className="p-3 sm:p-6 h-full">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-3 md:gap-4">
        <div className="min-w-0">
          <div className="eyebrow mb-1">Production Pipeline</div>
          <h2 className="display-sm">Workflow</h2>
          <p className="text-xs sm:text-sm text-muted mt-1">
            Drag concepts between stages{hasSelection ? '' : ' — click checkboxes to multi-select'}
          </p>
        </div>
        <div className="flex items-center gap-2 w-full md:max-w-xl">
          <div className="relative flex-1">
            <input
              type="text"
              value={globalSearch}
              onChange={(e) => {
                setGlobalSearch(e.target.value);
                if (aiMatches) setAiMatches(null); // typing exits AI mode
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.metaKey) runAISearch();
              }}
              placeholder={aiMatches ? 'AI-ranked results — clear to return' : 'Search all columns — name, tag, designer, theme…'}
              className="w-full bg-surface border border-border rounded-lg pl-9 pr-8 py-2 text-sm focus:outline-none focus:border-accent"
              aria-label="Global search across workflow board"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm pointer-events-none">⌕</span>
            {(globalSearch || aiMatches) && (
              <button
                onClick={() => { setGlobalSearch(''); clearAISearch(); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground text-sm leading-none px-1"
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>
          <button
            onClick={runAISearch}
            disabled={aiSearching || !globalSearch.trim()}
            className="text-sm px-3 py-2 bg-surface border border-border rounded-lg hover:bg-surface-hover transition-colors disabled:opacity-50 whitespace-nowrap font-medium"
            title="Ask AI to semantically rank concepts by your query (⌘+Enter)"
          >
            {aiSearching ? '✦ Thinking…' : '✦ Ask AI'}
          </button>
          {/* Sort selector — applies within each column. Default 'newest'
              answers Adam's complaint that fresh ideation cards weren't
              floating to the top. Persisted in localStorage. */}
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="text-sm px-3 py-2 bg-surface border border-border rounded-lg focus:outline-none focus:border-foreground whitespace-nowrap"
            title="Sort concepts within each column"
            aria-label="Sort order"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="updated">Recently updated</option>
            <option value="priority">By priority</option>
            <option value="default">Default order</option>
          </select>
          {/* Starred-only toggle — when on, hides every non-highlighted
              concept across all columns. Star icon flips between filled
              (active) and outline (inactive). Persisted in localStorage. */}
          <button
            type="button"
            onClick={() => setStarredOnly(!starredOnly)}
            className={`text-sm px-3 py-2 rounded-lg font-medium border whitespace-nowrap transition-colors ${
              starredOnly
                ? 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200'
                : 'bg-surface text-muted border-border hover:border-border-light'
            }`}
            title={starredOnly ? 'Showing starred only — click to show all' : 'Show only starred concepts'}
            aria-pressed={starredOnly}
          >
            {starredOnly ? '★ Starred only' : '☆ Starred only'}
          </button>
        </div>
      </div>

      {aiMatches && aiMatches.length > 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-4 text-xs">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-purple-900">✦ AI-ranked results</span>
            <span className="text-purple-700">for &ldquo;{globalSearch}&rdquo;</span>
            <button onClick={clearAISearch} className="ml-auto text-purple-700 hover:text-purple-900 underline">
              Clear AI ranking
            </button>
          </div>
          <p className="text-purple-800">
            Showing {aiMatches.length} concept{aiMatches.length > 1 ? 's' : ''} semantically matched to your query. Cards are grouped by their current workflow stage and ordered by relevance.
          </p>
        </div>
      )}

      {/* Bulk Action Toolbar */}
      {hasSelection && (
        <div className="bg-accent/5 border border-accent/20 rounded-lg p-3 mb-4 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-accent">{selectedIds.size} selected</span>
          <div className="h-4 w-px bg-border" />
          <div className="flex gap-2 flex-wrap">
            {KANBAN_COLUMNS.map((col) => (
              <button
                key={col}
                onClick={() => bulkMove(col)}
                className="text-xs px-2.5 py-1.5 bg-surface border border-border rounded-lg hover:bg-surface-hover transition-colors"
              >
                Move to {STATUS_LABELS[col]}
              </button>
            ))}
            <button
              onClick={bulkDuplicate}
              className="text-xs px-2.5 py-1.5 bg-surface border border-border rounded-lg hover:bg-surface-hover transition-colors"
            >
              ⧉ Duplicate All
            </button>
            <div className="inline-flex items-stretch rounded-lg border border-border overflow-hidden">
              <span className="text-[10px] text-muted px-2 self-center bg-surface">Priority:</span>
              {(['low', 'medium', 'high', 'urgent'] as PriorityLevel[]).map((p) => (
                <button
                  key={p}
                  onClick={() => bulkSetPriority(p)}
                  className="text-xs px-2 py-1.5 bg-surface border-l border-border hover:bg-surface-hover capitalize"
                  title={`Set all selected to ${p} priority`}
                >
                  {p}
                </button>
              ))}
            </div>
            <button
              onClick={bulkAddTag}
              className="text-xs px-2.5 py-1.5 bg-surface border border-border rounded-lg hover:bg-surface-hover transition-colors"
            >
              + Add tag
            </button>
            <button
              onClick={bulkExport}
              className="text-xs px-2.5 py-1.5 bg-surface border border-border rounded-lg hover:bg-surface-hover transition-colors"
            >
              ↓ Export CSV
            </button>
            <button
              onClick={bulkArchive}
              className="text-xs px-2.5 py-1.5 bg-surface border border-border rounded-lg hover:bg-surface-hover text-muted transition-colors"
            >
              📦 Archive All
            </button>
            <button
              onClick={() => setShowBulkDeleteConfirm(true)}
              className="text-xs px-2.5 py-1.5 bg-red-50 border border-red-200 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
            >
              Delete All
            </button>
          </div>
          <button
            onClick={clearSelection}
            className="text-xs text-muted hover:text-foreground ml-auto"
          >
            Clear selection
          </button>
        </div>
      )}

      <DragDropContext onDragEnd={handleDragEnd}>
        {/* Board layout, three regimes:
            - Mobile (<sm): one column per screen (85vw) with snap scrolling
              — swipe between stages, next column peeks in as an affordance.
            - Tablet (sm–lg): fixed 288px columns, horizontal scroll.
            - Desktop (lg+): all 6 columns flex to share the viewport width
              equally (min 200px each) — nothing is cut off and there's no
              hidden horizontal scroll to discover. Only if the window is
              narrower than 6×200px does scrolling kick back in. */}
        <div
          className="flex gap-3 lg:gap-4 overflow-x-auto pb-4 snap-x snap-mandatory sm:snap-none"
          style={{ minHeight: 'calc(100vh - 260px)' }}
        >
          {KANBAN_COLUMNS.map((col) => {
            const colConcepts = columns[col] || [];
            const allSelected = colConcepts.length > 0 && colConcepts.every((c) => selectedIds.has(c.id));
            // Every column now exposes its own search input — previously
            // only Manufactured + Archived had this. Helps when a column
            // (Ideation, In Review) accumulates dozens of cards.
            const isSearchable = true;
            const searchValue = columnSearch[col] || '';
            const setSearchValue = (v: string) => setColumnSearchFor(col, v);
            const hasActiveSearch = !!searchValue || !!globalSearch.trim();
            const total = totalByStatus[col] || 0;

            return (
              <div
                key={col}
                className="shrink-0 lg:shrink snap-center sm:snap-align-none w-[85vw] sm:w-72 lg:w-auto lg:flex-1 lg:basis-0 lg:min-w-[200px] bg-surface border border-border rounded-lg flex flex-col overflow-hidden"
              >
                <div className={`col-strip ${COLUMN_STRIP[col]}`} />
                {/* Column Header */}
                <div className="p-3 border-b border-border">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={() => selectAllInColumn(col)}
                        className="w-3.5 h-3.5 rounded accent-accent cursor-pointer shrink-0"
                        title={`Select all in ${STATUS_LABELS[col]}`}
                      />
                      <h3 className="text-sm font-semibold truncate">{STATUS_LABELS[col]}</h3>
                    </div>
                    <span className="text-xs text-muted bg-border/50 px-1.5 py-0.5 rounded-full shrink-0">
                      {hasActiveSearch ? `${colConcepts.length}/${total}` : colConcepts.length}
                    </span>
                  </div>

                  {isSearchable && setSearchValue && (
                    <input
                      type="text"
                      value={searchValue}
                      onChange={(e) => setSearchValue(e.target.value)}
                      placeholder={`Search ${STATUS_LABELS[col].toLowerCase()}…`}
                      className="w-full mt-2 bg-background border border-border rounded-md px-2 py-1.5 text-xs focus:outline-none focus:border-accent"
                    />
                  )}

                  {col === 'archived' && onOpenArchive && total > 0 && (
                    <button
                      onClick={onOpenArchive}
                      className="mt-2 w-full text-[10px] text-muted hover:text-accent transition-colors"
                      title="Open full archive page with advanced filters + CSV export"
                    >
                      Open full archive page →
                    </button>
                  )}
                </div>

                {/* Droppable Area */}
                <Droppable droppableId={col}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex-1 p-2 space-y-2 overflow-y-auto transition-colors ${
                        snapshot.isDraggingOver ? 'bg-accent/5' : ''
                      }`}
                    >
                      {colConcepts.map((concept, index) => (
                        <Draggable key={concept.id} draggableId={concept.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={`${snapshot.isDragging ? 'opacity-80 rotate-1' : ''} relative`}
                            >
                              {/* Selection checkbox overlay */}
                              <div className="absolute top-2 left-2 z-10">
                                <input
                                  type="checkbox"
                                  checked={selectedIds.has(concept.id)}
                                  onChange={(e) => { e.stopPropagation(); toggleSelect(concept.id); }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-3.5 h-3.5 rounded accent-accent cursor-pointer"
                                />
                              </div>
                              <div className={`${selectedIds.has(concept.id) ? 'ring-2 ring-accent ring-offset-1 rounded-lg' : ''} ${col === 'archived' ? 'opacity-75' : ''}`}>
                                <ConceptCardMini
                                  concept={concept}
                                  onClick={() => onOpenConcept(concept.id)}
                                  onToggleHighlight={() => {
                                    updateConcept(concept.id, { highlighted: !concept.highlighted });
                                    toast(
                                      concept.highlighted
                                        ? `Unstarred "${concept.name}"`
                                        : `Starred "${concept.name}" — design soonest`,
                                      'success'
                                    );
                                  }}
                                />
                                {aiMatches && (() => {
                                  const match = aiMatches.find((m) => m.id === concept.id);
                                  if (!match) return null;
                                  return (
                                    <div className="mt-1 px-1.5 py-1 bg-purple-50 border border-purple-200 rounded text-[10px] text-purple-800 leading-snug">
                                      <div className="flex items-center gap-1 mb-0.5">
                                        <span className="font-bold">✦ {match.score}/10</span>
                                      </div>
                                      <div className="italic">{match.reason}</div>
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                      {colConcepts.length === 0 && !snapshot.isDraggingOver && (
                        <div className="text-center text-xs text-muted py-8 opacity-50">
                          {hasActiveSearch
                            ? 'No matches found'
                            : col === 'archived'
                              ? 'Nothing archived'
                              : 'Drop concepts here'}
                        </div>
                      )}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      <ConfirmDialog
        open={showBulkDeleteConfirm}
        title={`Delete ${selectedIds.size} Concept${selectedIds.size > 1 ? 's' : ''}`}
        message="This will permanently delete all selected concepts and their versions, images, comments, and AI generations. This cannot be undone."
        confirmLabel="Delete All"
        confirmVariant="danger"
        onConfirm={bulkDelete}
        onCancel={() => setShowBulkDeleteConfirm(false)}
      />
    </div>
  );
}
