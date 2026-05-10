'use client';

import { useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Concept } from '@/lib/types';
import { StatusBadge } from './ui';

/**
 * Concept Lineage — visualizes parent/child relationships between concepts
 * derived via the duplicate flow ("(Copy)") or variant generator
 * ("source: variant-of:<id>") or CFP import ("source: cfp:…").
 *
 * Detection heuristics:
 *  1. Explicit: source field starts with "variant-of:<id>" → parent is that concept
 *  2. Name pattern: stripping " (Copy)" / " (Copy 2)" / " — <variantStyle>"
 *     and finding the oldest concept with the same root name
 *
 * Each concept can have at most one parent. Roots have no parent.
 */
function rootName(name: string): string {
  return name
    .replace(/\s*\(Copy(?:\s+\d+)?\)\s*$/i, '')   // " (Copy)" / " (Copy 2)"
    .replace(/\s*—\s*[A-Za-z][^—]*$/, '')         // " — Art Nouveau" (variant suffix)
    .trim();
}

interface LineageNode {
  concept: Concept;
  children: LineageNode[];
}

function buildLineage(concepts: Concept[]): LineageNode[] {
  const byId = new Map<string, Concept>();
  concepts.forEach((c) => byId.set(c.id, c));

  // Group by root name to find name-pattern parents.
  const byRoot = new Map<string, Concept[]>();
  for (const c of concepts) {
    const r = rootName(c.name);
    const arr = byRoot.get(r) || [];
    arr.push(c);
    byRoot.set(r, arr);
  }

  // For each concept, find its parent.
  const parentOf = new Map<string, string | null>();
  for (const c of concepts) {
    let parentId: string | null = null;

    // 1. Explicit "variant-of:<id>"
    if (c.source?.startsWith('variant-of:')) {
      const candidate = c.source.slice('variant-of:'.length);
      if (byId.has(candidate)) parentId = candidate;
    }

    // 2. Name pattern fallback — only if not already linked, and only if
    //    there's actually a sibling group to attach to.
    if (!parentId) {
      const r = rootName(c.name);
      if (r !== c.name) {
        // This concept has a "(Copy)" or " — variant" suffix; find the
        // root (oldest concept whose name matches the root with NO suffix).
        const siblings = byRoot.get(r) || [];
        const root = siblings
          .filter((s) => s.name === r)
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
        if (root && root.id !== c.id) parentId = root.id;
      }
    }

    parentOf.set(c.id, parentId);
  }

  // Build tree
  const childrenOf = new Map<string, Concept[]>();
  for (const c of concepts) {
    const pid = parentOf.get(c.id);
    if (pid) {
      const arr = childrenOf.get(pid) || [];
      arr.push(c);
      childrenOf.set(pid, arr);
    }
  }

  const buildNode = (c: Concept): LineageNode => ({
    concept: c,
    children: (childrenOf.get(c.id) || [])
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map(buildNode),
  });

  return concepts
    .filter((c) => !parentOf.get(c.id))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map(buildNode);
}

export function ConceptLineage({ onOpenConcept }: { onOpenConcept: (id: string) => void }) {
  const { concepts } = useAppStore();
  const [search, setSearch] = useState('');
  const [showOnlyFamilies, setShowOnlyFamilies] = useState(true);

  const fullForest = useMemo(() => buildLineage(concepts), [concepts]);

  // Filter: families = roots with at least one child
  const visibleForest = useMemo(() => {
    let forest = fullForest;
    if (showOnlyFamilies) forest = forest.filter((n) => n.children.length > 0);
    if (search.trim()) {
      const q = search.toLowerCase();
      // Show any tree that has at least one match in name or tags.
      const hasMatch = (n: LineageNode): boolean =>
        n.concept.name.toLowerCase().includes(q) ||
        n.concept.tags.some((t) => t.toLowerCase().includes(q)) ||
        n.children.some(hasMatch);
      forest = forest.filter(hasMatch);
    }
    return forest;
  }, [fullForest, showOnlyFamilies, search]);

  const totalFamilies = fullForest.filter((n) => n.children.length > 0).length;
  const totalDescendants = fullForest.reduce((acc, n) => acc + countDesc(n), 0);

  return (
    <div className="p-3 sm:p-6 max-w-5xl mx-auto">
      <div className="mb-5">
        <div className="eyebrow mb-1">Family Tree</div>
        <h2 className="display-sm">Lineage</h2>
        <p className="text-xs sm:text-sm text-muted mt-1">
          How concepts derive from each other — duplicates, variants, and customer imports linked back to their parents.
        </p>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Stat label="Roots" value={fullForest.length} hint="Concepts with no parent" />
        <Stat label="Families" value={totalFamilies} hint="Roots that have at least one descendant" />
        <Stat label="Descendants" value={totalDescendants} hint="Total non-root concepts" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="flex-1 relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or tag…"
            className="w-full bg-surface border border-border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-foreground"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm pointer-events-none">⌕</span>
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-muted self-center">
          <input
            type="checkbox"
            checked={showOnlyFamilies}
            onChange={(e) => setShowOnlyFamilies(e.target.checked)}
            className="accent-accent"
          />
          Hide solo concepts (no descendants)
        </label>
      </div>

      {visibleForest.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted">
          {showOnlyFamilies
            ? 'No concept families yet. Duplicate or generate variants to build lineage.'
            : 'No matches.'}
        </div>
      ) : (
        <div className="space-y-4">
          {visibleForest.map((node) => (
            <Tree key={node.concept.id} node={node} depth={0} onOpen={onOpenConcept} />
          ))}
        </div>
      )}
    </div>
  );
}

function countDesc(n: LineageNode): number {
  return n.children.length + n.children.reduce((acc, c) => acc + countDesc(c), 0);
}

function Stat({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <div className="eyebrow mb-1">{label}</div>
      <div className="serif text-3xl font-medium tabular-nums">{value}</div>
      <div className="text-[11px] text-muted mt-1">{hint}</div>
    </div>
  );
}

function Tree({
  node, depth, onOpen,
}: { node: LineageNode; depth: number; onOpen: (id: string) => void }) {
  return (
    <div className={depth === 0 ? 'bg-surface border border-border rounded-xl p-4' : ''}>
      <Row concept={node.concept} depth={depth} onOpen={onOpen} />
      {node.children.length > 0 && (
        <div className="ml-6 mt-2 border-l-2 border-border pl-4 space-y-2">
          {node.children.map((c) => (
            <Tree key={c.concept.id} node={c} depth={depth + 1} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({
  concept: c, depth, onOpen,
}: { concept: Concept; depth: number; onOpen: (id: string) => void }) {
  return (
    <div
      role="button"
      onClick={() => onOpen(c.id)}
      className="flex items-center gap-3 cursor-pointer hover:bg-background rounded-lg p-2 -m-2 transition-colors"
    >
      {/* Thumbnail */}
      <div className="w-10 h-10 rounded bg-background placeholder-pattern shrink-0 overflow-hidden">
        {c.coilImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.coilImageUrl} alt="" className="w-full h-full object-cover" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h4 className={`font-medium truncate ${depth === 0 ? 'serif text-base' : 'text-sm'}`}>
            {c.name}
          </h4>
          <StatusBadge status={c.status} />
        </div>
        <div className="text-[11px] text-muted">
          {c.designer || 'unassigned'} · {new Date(c.createdAt).toLocaleDateString()}
          {c.aiGenerations.length > 0 && ` · ${c.aiGenerations.length} AI gens`}
          {c.versions.length > 0 && ` · v${c.versions.length}`}
        </div>
      </div>
    </div>
  );
}
