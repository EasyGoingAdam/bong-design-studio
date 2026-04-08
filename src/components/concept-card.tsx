'use client';

import { Concept } from '@/lib/types';
import { StatusBadge, PriorityBadge, Tag } from './ui';

export function ConceptCard({ concept, onClick }: { concept: Concept; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full bg-surface border border-border rounded-xl p-4 hover:border-border-light transition-all text-left group"
    >
      {/* Image Row */}
      <div className="flex gap-2 mb-3">
        <div className="flex-1 aspect-square rounded-lg bg-background placeholder-pattern border border-border flex items-center justify-center">
          {concept.coilImageUrl ? (
            <img src={concept.coilImageUrl} alt="Coil" className="w-full h-full object-cover rounded-lg" />
          ) : (
            <span className="text-[10px] text-muted">Coil</span>
          )}
        </div>
        <div className="flex-1 aspect-square rounded-lg bg-background placeholder-pattern border border-border flex items-center justify-center">
          {concept.baseImageUrl ? (
            <img src={concept.baseImageUrl} alt="Base" className="w-full h-full object-cover rounded-lg" />
          ) : (
            <span className="text-[10px] text-muted">Base</span>
          )}
        </div>
      </div>

      {/* Info */}
      <h3 className="text-sm font-semibold truncate group-hover:text-accent transition-colors">{concept.name}</h3>
      <p className="text-xs text-muted mt-0.5 truncate">{concept.collection || 'No collection'}</p>

      {/* Badges */}
      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        <StatusBadge status={concept.status} />
        <PriorityBadge priority={concept.priority} />
      </div>

      {/* Tags */}
      {concept.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {concept.tags.slice(0, 3).map((t) => (
            <Tag key={t} label={t} />
          ))}
          {concept.tags.length > 3 && (
            <span className="text-xs text-muted">+{concept.tags.length - 3}</span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-border">
        <span className="text-xs text-muted">{concept.designer}</span>
        <span className="text-xs text-muted">{new Date(concept.updatedAt).toLocaleDateString()}</span>
      </div>
    </button>
  );
}

export function ConceptCardMini({ concept, onClick }: { concept: Concept; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="kanban-card bg-surface border border-border rounded-lg p-3 cursor-pointer hover:border-border-light transition-all"
    >
      {/* Thumbnail row */}
      <div className="flex gap-1.5 mb-2">
        <div className="w-10 h-10 rounded bg-background placeholder-pattern border border-border flex items-center justify-center shrink-0">
          {concept.coilImageUrl ? (
            <img src={concept.coilImageUrl} alt="" className="w-full h-full object-cover rounded" />
          ) : (
            <span className="text-[8px] text-muted">C</span>
          )}
        </div>
        <div className="w-10 h-10 rounded bg-background placeholder-pattern border border-border flex items-center justify-center shrink-0">
          {concept.baseImageUrl ? (
            <img src={concept.baseImageUrl} alt="" className="w-full h-full object-cover rounded" />
          ) : (
            <span className="text-[8px] text-muted">B</span>
          )}
        </div>
        <div className="flex-1 min-w-0 ml-1">
          <h4 className="text-sm font-medium truncate">{concept.name}</h4>
          <p className="text-xs text-muted truncate">{concept.designer}</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1">
          {concept.tags.slice(0, 2).map((t) => (
            <Tag key={t} label={t} />
          ))}
        </div>
        <PriorityBadge priority={concept.priority} />
      </div>

      <div className="text-[10px] text-muted mt-1.5">
        {new Date(concept.createdAt).toLocaleDateString()}
      </div>
    </div>
  );
}
