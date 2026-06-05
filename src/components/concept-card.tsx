'use client';

import { Concept } from '@/lib/types';
import { StatusBadge, PriorityBadge, Tag } from './ui';
import { ImageDownloadButtons } from './image-download';

export function ConceptCard({ concept, onClick, onGenerate }: { concept: Concept; onClick: () => void; onGenerate?: () => void }) {
  const hasImages = !!(concept.coilImageUrl || concept.baseImageUrl);

  return (
    <div className="w-full bg-surface border border-border rounded-xl p-4 hover:border-border-light transition-all text-left group">
      {/* Image Row */}
      <button onClick={onClick} className="w-full text-left">
        <div className="flex gap-2 mb-3">
          <div className="flex-1 aspect-square rounded-lg bg-background placeholder-pattern border border-border flex items-center justify-center overflow-hidden">
            {concept.coilImageUrl ? (
              <img src={concept.coilImageUrl} alt="Coil" className="w-full h-full object-cover rounded-lg" />
            ) : (
              <span className="text-[10px] text-muted">Coil</span>
            )}
          </div>
          <div className="flex-1 aspect-square rounded-lg bg-background placeholder-pattern border border-border flex items-center justify-center overflow-hidden">
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
          {concept.source && (
            <span
              className="text-[10px] bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded-full font-medium"
              title={`Submitted from ${concept.source}`}
            >
              ↓ {concept.source}
            </span>
          )}
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
      </button>

      {/* Footer with AI Generate */}
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-border">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-muted truncate">{concept.designer}</span>
          {concept.aiGenerations.length > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); onClick(); }}
              className="text-[10px] bg-accent/10 hover:bg-accent/20 text-accent px-1.5 py-0.5 rounded font-medium shrink-0 transition-colors"
              title={`${concept.aiGenerations.length} AI generation${concept.aiGenerations.length === 1 ? '' : 's'} saved — click to view all`}
            >
              ✦ {concept.aiGenerations.length}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onGenerate && (
            <button
              onClick={(e) => { e.stopPropagation(); onGenerate(); }}
              className="text-[10px] text-accent hover:text-accent-hover bg-accent/10 hover:bg-accent/20 px-2 py-1 rounded transition-colors"
            >
              ✦ {hasImages ? 'Regen' : 'Generate'}
            </button>
          )}
          <span className="text-xs text-muted">{new Date(concept.updatedAt).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}

export function ConceptCardMini({
  concept,
  onClick,
  onToggleHighlight,
}: {
  concept: Concept;
  onClick: () => void;
  /** Optional — when provided, the star button toggles concept.highlighted.
   *  Omitted on non-workflow surfaces that shouldn't allow the toggle. */
  onToggleHighlight?: () => void;
}) {
  const isHighlighted = !!concept.highlighted;
  return (
    <div
      onClick={onClick}
      className={`kanban-card bg-surface border rounded-lg p-3 cursor-pointer transition-all relative ${
        isHighlighted
          ? 'border-amber-400 ring-1 ring-amber-200'
          : 'border-border hover:border-border-light'
      }`}
    >
      {/* Star/highlight toggle — top-right corner so it's reachable without
          opening the concept. Sits OUTSIDE the click target via
          stopPropagation so clicking the star doesn't also open detail. */}
      {onToggleHighlight && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleHighlight(); }}
          className={`absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center rounded-full text-sm transition-colors ${
            isHighlighted
              ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
              : 'text-muted/40 hover:text-amber-500 hover:bg-amber-50'
          }`}
          aria-label={isHighlighted ? 'Unstar (un-highlight)' : 'Star (highlight — design soonest)'}
          title={isHighlighted ? 'Highlighted — click to unstar' : 'Star for "design soonest"'}
        >
          {isHighlighted ? '★' : '☆'}
        </button>
      )}
      {/* Thumbnail row — switches layout based on designType.
          Stamps concepts: tile up to 4 stamp thumbs in a 2x2 grid where
          the coil+base thumbnails would normally live, with a "+N" pill
          if there are more than 4. Keeps the workflow card the same
          visual height regardless of mode. */}
      <div className="flex gap-1.5 mb-2 pr-7">
        {concept.designType === 'stamps' && (concept.stamps?.length || 0) > 0 ? (
          <div className="w-[88px] h-[88px] grid grid-cols-2 grid-rows-2 gap-0.5 shrink-0">
            {(concept.stamps || []).slice(0, 4).map((s) => (
              <div
                key={s.id}
                className="bg-background placeholder-pattern border border-border rounded-sm overflow-hidden relative group/stamp"
                title={s.subject}
              >
                {s.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.imageUrl} alt={s.subject} className="w-full h-full object-cover" />
                ) : (
                  <span className="block text-[7px] text-muted px-0.5">{s.subject.slice(0, 4)}</span>
                )}
                {/* Per-stamp download — appears on hover so the 2x2 grid
                    stays clean. stopPropagation inside ImageDownloadButtons
                    prevents the parent card click from firing. */}
                {s.imageUrl && (
                  <div
                    className="absolute top-0.5 right-0.5 opacity-0 group-hover/stamp:opacity-100 transition-opacity"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ImageDownloadButtons
                      imageUrl={s.imageUrl}
                      filename={`${concept.name}-stamp-${s.subject.replace(/[^a-z0-9-]/gi, '-').slice(0, 30)}`}
                    />
                  </div>
                )}
              </div>
            ))}
            {/* Fill empty grid slots with placeholders so the 2x2 stays
                visually balanced even with <4 stamps. */}
            {Array.from({ length: Math.max(0, 4 - (concept.stamps?.length || 0)) }).map((_, i) => (
              <div key={`empty-${i}`} className="bg-background border border-border/40 rounded-sm" />
            ))}
          </div>
        ) : (
          <>
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
          </>
        )}
        <div className="flex-1 min-w-0 ml-1">
          <h4 className="text-sm font-medium truncate">{concept.name}</h4>
          <p className="text-xs text-muted truncate">{concept.designer}</p>
          {concept.designType === 'stamps' && (concept.stamps?.length || 0) > 0 && (
            <span className="inline-block mt-0.5 text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full font-medium">
              ⊞ {concept.stamps?.length} stamp{(concept.stamps?.length || 0) === 1 ? '' : 's'}
            </span>
          )}
          {concept.source && (
            <span
              className="inline-block mt-0.5 text-[9px] bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded-full font-medium truncate max-w-full"
              title={`Submitted from ${concept.source}`}
            >
              ↓ {concept.source}
            </span>
          )}
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

      <div className="text-[10px] text-muted mt-1.5 flex items-center justify-between">
        <span>{new Date(concept.createdAt).toLocaleDateString()}</span>
        {concept.aiGenerations.length > 0 && (
          <span
            className="text-[9px] bg-accent/10 text-accent px-1.5 py-0.5 rounded font-medium"
            title={`${concept.aiGenerations.length} AI generation${concept.aiGenerations.length === 1 ? '' : 's'} saved — open this concept to view all`}
          >
            ✦ {concept.aiGenerations.length} gen{concept.aiGenerations.length === 1 ? '' : 's'}
          </span>
        )}
      </div>
    </div>
  );
}
