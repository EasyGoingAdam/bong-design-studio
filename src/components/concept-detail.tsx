'use client';

import { useState, useMemo } from 'react';
import { useAppStore } from '@/lib/store';
import { ConceptStatus, STATUS_LABELS, KANBAN_COLUMNS } from '@/lib/types';
import { StatusBadge, PriorityBadge, LifecycleBadge, Tag, Input, TextArea, Select, SliderInput } from './ui';
import { ManufacturingPanel } from './manufacturing-panel';
import { QuickGenerateModal } from './quick-generate-modal';

export function ConceptDetail({ conceptId, onBack }: { conceptId: string; onBack: () => void }) {
  const { concepts, updateConcept, deleteConcept, duplicateConcept, moveConcept, addComment, addApproval } = useAppStore();
  const concept = concepts.find((c) => c.id === conceptId);
  const [activeSection, setActiveSection] = useState<'overview' | 'specs' | 'versions' | 'comments' | 'ai' | 'manufacturing'>('overview');
  const [commentText, setCommentText] = useState('');
  const [editing, setEditing] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);

  // Editable fields
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editCollection, setEditCollection] = useState('');
  const [editAudience, setEditAudience] = useState('');
  const [editMfgNotes, setEditMfgNotes] = useState('');
  const [editPriority, setEditPriority] = useState('');
  const [editLifecycle, setEditLifecycle] = useState('');

  if (!concept) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted">Concept not found.</p>
        <button onClick={onBack} className="text-accent text-sm mt-2">Go back</button>
      </div>
    );
  }

  const startEditing = () => {
    setEditName(concept.name);
    setEditDesc(concept.description);
    setEditTags(concept.tags.join(', '));
    setEditCollection(concept.collection);
    setEditAudience(concept.intendedAudience);
    setEditMfgNotes(concept.manufacturingNotes);
    setEditPriority(concept.priority);
    setEditLifecycle(concept.lifecycleType);
    setEditing(true);
  };

  const saveEdits = () => {
    updateConcept(concept.id, {
      name: editName,
      description: editDesc,
      tags: editTags.split(',').map((t) => t.trim()).filter(Boolean),
      collection: editCollection,
      intendedAudience: editAudience,
      manufacturingNotes: editMfgNotes,
      priority: editPriority as typeof concept.priority,
      lifecycleType: editLifecycle as typeof concept.lifecycleType,
    });
    setEditing(false);
  };

  const handleComment = () => {
    if (!commentText.trim()) return;
    addComment(concept.id, commentText.trim());
    setCommentText('');
  };

  const handleApprove = () => {
    addApproval(concept.id, 'approved', 'Concept approved');
    moveConcept(concept.id, 'approved');
  };

  const handleNeedsRevision = () => {
    addApproval(concept.id, 'needs_revision', 'Needs revision');
    moveConcept(concept.id, 'ideation');
  };

  const currentIdx = KANBAN_COLUMNS.indexOf(concept.status);
  const nextStatus = currentIdx < KANBAN_COLUMNS.length - 1 ? KANBAN_COLUMNS[currentIdx + 1] : null;

  const sections = [
    { id: 'overview' as const, label: 'Overview' },
    { id: 'specs' as const, label: 'Specs' },
    { id: 'versions' as const, label: `Versions (${concept.versions.length})` },
    { id: 'comments' as const, label: `Comments (${concept.comments.length})` },
    { id: 'ai' as const, label: `AI History (${concept.aiGenerations.length})` },
    { id: 'manufacturing' as const, label: 'Manufacturing' },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Back + Header */}
      <button onClick={onBack} className="text-sm text-muted hover:text-foreground mb-3 flex items-center gap-1">
        ← Back to Library
      </button>

      <div className="mb-4">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h2 className="text-2xl font-bold">{concept.name}</h2>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <StatusBadge status={concept.status} />
              <PriorityBadge priority={concept.priority} />
              <LifecycleBadge type={concept.lifecycleType} />
              <span className="text-xs text-muted">{concept.collection}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!editing ? (
            <button onClick={startEditing} className="px-3 py-1.5 text-sm bg-background border border-border rounded-lg hover:bg-surface-hover">
              Edit
            </button>
          ) : (
            <>
              <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-sm text-muted hover:text-foreground">Cancel</button>
              <button onClick={saveEdits} className="px-3 py-1.5 text-sm bg-accent text-white rounded-lg">Save</button>
            </>
          )}
          <button onClick={() => { duplicateConcept(concept.id); }} className="px-3 py-1.5 text-sm bg-background border border-border rounded-lg hover:bg-surface-hover">
            Duplicate
          </button>
          {concept.status !== 'approved' && (
            <button onClick={handleApprove} className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg">
              Approve
            </button>
          )}
          {nextStatus && (
            <button onClick={() => moveConcept(concept.id, nextStatus)} className="px-3 py-1.5 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg">
              Move to {STATUS_LABELS[nextStatus]}
            </button>
          )}
        </div>
      </div>

      {/* Section Tabs */}
      <div className="border-b border-border mb-4">
        <div className="flex gap-1">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`px-3 py-2 text-sm transition-colors relative ${
                activeSection === s.id ? 'text-accent' : 'text-muted hover:text-foreground'
              }`}
            >
              {s.label}
              {activeSection === s.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />}
            </button>
          ))}
        </div>
      </div>

      {/* Overview */}
      {activeSection === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Images */}
          <div className="lg:col-span-2 space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <span className="text-xs text-muted block mb-1">Coil</span>
                <div className="aspect-square rounded-xl bg-surface placeholder-pattern border border-border flex items-center justify-center overflow-hidden relative group">
                  {concept.coilImageUrl ? (
                    <>
                      <img src={concept.coilImageUrl} alt="Coil" className="w-full h-full object-contain" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button
                          onClick={() => setShowGenerate(true)}
                          className="text-xs text-white bg-accent/80 hover:bg-accent px-3 py-1.5 rounded-lg"
                        >
                          ✦ Regenerate
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      onClick={() => setShowGenerate(true)}
                      className="flex flex-col items-center gap-1.5 text-muted hover:text-accent transition-colors"
                    >
                      <span className="text-2xl">✦</span>
                      <span className="text-xs">Generate</span>
                    </button>
                  )}
                </div>
              </div>
              <div>
                <span className="text-xs text-muted block mb-1">Base</span>
                <div className="aspect-square rounded-xl bg-surface placeholder-pattern border border-border flex items-center justify-center overflow-hidden relative group">
                  {concept.baseImageUrl ? (
                    <>
                      <img src={concept.baseImageUrl} alt="Base" className="w-full h-full object-contain" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button
                          onClick={() => setShowGenerate(true)}
                          className="text-xs text-white bg-accent/80 hover:bg-accent px-3 py-1.5 rounded-lg"
                        >
                          ✦ Regenerate
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      onClick={() => setShowGenerate(true)}
                      className="flex flex-col items-center gap-1.5 text-muted hover:text-accent transition-colors"
                    >
                      <span className="text-2xl">✦</span>
                      <span className="text-xs">Generate</span>
                    </button>
                  )}
                </div>
              </div>
              <div>
                <span className="text-xs text-muted block mb-1">Combined</span>
                <div className="aspect-square rounded-xl bg-surface placeholder-pattern border border-border flex items-center justify-center overflow-hidden">
                  {concept.combinedImageUrl ? (
                    <img src={concept.combinedImageUrl} alt="Combined" className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-sm text-muted">No preview</span>
                  )}
                </div>
              </div>
            </div>

            {/* AI Generate Button */}
            <button
              onClick={() => setShowGenerate(true)}
              className="w-full py-2.5 bg-accent/10 hover:bg-accent/20 border border-accent/30 text-accent text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <span>✦</span>
              {concept.coilImageUrl || concept.baseImageUrl ? 'Regenerate Images with AI' : 'Generate Images with AI'}
            </button>

            {/* Description */}
            {editing ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted block mb-1">Name</label>
                  <Input value={editName} onChange={setEditName} />
                </div>
                <div>
                  <label className="text-xs text-muted block mb-1">Collection</label>
                  <Input value={editCollection} onChange={setEditCollection} />
                </div>
                <div>
                  <label className="text-xs text-muted block mb-1">Description</label>
                  <TextArea value={editDesc} onChange={setEditDesc} rows={4} />
                </div>
                <div>
                  <label className="text-xs text-muted block mb-1">Tags (comma-separated)</label>
                  <Input value={editTags} onChange={setEditTags} />
                </div>
                <div>
                  <label className="text-xs text-muted block mb-1">Audience</label>
                  <Input value={editAudience} onChange={setEditAudience} />
                </div>
                <div>
                  <label className="text-xs text-muted block mb-1">Manufacturing Notes</label>
                  <TextArea value={editMfgNotes} onChange={setEditMfgNotes} rows={2} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted block mb-1">Priority</label>
                    <Select value={editPriority} onChange={setEditPriority} options={[
                      { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' },
                      { value: 'high', label: 'High' }, { value: 'urgent', label: 'Urgent' },
                    ]} />
                  </div>
                  <div>
                    <label className="text-xs text-muted block mb-1">Lifecycle</label>
                    <Select value={editLifecycle} onChange={setEditLifecycle} options={[
                      { value: 'evergreen', label: 'Evergreen' }, { value: 'seasonal', label: 'Seasonal' },
                      { value: 'limited_edition', label: 'Limited Edition' }, { value: 'custom', label: 'Custom' },
                    ]} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
                <div>
                  <span className="text-xs text-muted">Description</span>
                  <p className="text-sm mt-0.5">{concept.description || 'No description'}</p>
                </div>
                <div>
                  <span className="text-xs text-muted">Intended Audience</span>
                  <p className="text-sm mt-0.5">{concept.intendedAudience || 'Not specified'}</p>
                </div>
                <div>
                  <span className="text-xs text-muted">Manufacturing Notes</span>
                  <p className="text-sm mt-0.5">{concept.manufacturingNotes || 'None'}</p>
                </div>
                <div>
                  <span className="text-xs text-muted">Tags</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {concept.tags.map((t) => <Tag key={t} label={t} />)}
                    {concept.tags.length === 0 && <span className="text-sm text-muted">No tags</span>}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div className="bg-surface border border-border rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted">Designer</span><span>{concept.designer}</span></div>
              <div className="flex justify-between"><span className="text-muted">Created</span><span>{new Date(concept.createdAt).toLocaleDateString()}</span></div>
              <div className="flex justify-between"><span className="text-muted">Updated</span><span>{new Date(concept.updatedAt).toLocaleDateString()}</span></div>
              <div className="flex justify-between"><span className="text-muted">Versions</span><span>{concept.versions.length}</span></div>
              <div className="flex justify-between"><span className="text-muted">Comments</span><span>{concept.comments.length}</span></div>
              <div className="flex justify-between"><span className="text-muted">AI Generations</span><span>{concept.aiGenerations.length}</span></div>
            </div>

            {/* Quick Actions */}
            <div className="bg-surface border border-border rounded-xl p-4 space-y-2">
              <h4 className="text-sm font-semibold">Actions</h4>
              <button
                onClick={() => setShowGenerate(true)}
                className="w-full py-2 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg font-medium flex items-center justify-center gap-1.5"
              >
                <span>✦</span>
                {concept.coilImageUrl || concept.baseImageUrl ? 'Regenerate Graphics' : 'Generate Graphics with AI'}
              </button>
              {concept.status !== 'approved' && (
                <button onClick={handleApprove} className="w-full py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg">
                  Approve
                </button>
              )}
              <button onClick={handleNeedsRevision} className="w-full py-1.5 text-sm bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg">
                Needs Revision
              </button>
              {nextStatus && (
                <button onClick={() => moveConcept(concept.id, nextStatus)} className="w-full py-1.5 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg">
                  Move to {STATUS_LABELS[nextStatus]}
                </button>
              )}
              <button onClick={() => updateConcept(concept.id, { status: 'archived' })} className="w-full py-1.5 text-sm bg-background border border-border rounded-lg text-muted hover:text-foreground">
                Archive
              </button>
            </div>

            {/* Approval Log */}
            <div className="bg-surface border border-border rounded-xl p-4">
              <h4 className="text-sm font-semibold mb-2">Approval Log</h4>
              {concept.approvalLogs.length === 0 ? (
                <p className="text-xs text-muted">No approvals yet</p>
              ) : (
                <div className="space-y-2">
                  {concept.approvalLogs.map((log) => (
                    <div key={log.id} className="text-xs border-b border-border pb-2 last:border-0 last:pb-0">
                      <div className="flex items-center gap-1">
                        <span className={`font-medium ${log.action === 'approved' ? 'text-green-400' : log.action === 'needs_revision' ? 'text-yellow-400' : 'text-blue-400'}`}>
                          {log.action === 'approved' ? 'Approved' : log.action === 'needs_revision' ? 'Needs Revision' : 'Moved'}
                        </span>
                        <span className="text-muted">by {log.userName}</span>
                      </div>
                      <p className="text-muted">{log.notes}</p>
                      <span className="text-muted">{new Date(log.createdAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Specs */}
      {activeSection === 'specs' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-surface border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-3">Design Specifications</h3>
            <div className="space-y-2 text-sm">
              {[
                ['Style', concept.specs.designStyleName],
                ['Theme', concept.specs.designTheme],
                ['Density', concept.specs.patternDensity],
                ['Complexity', '●'.repeat(concept.specs.laserComplexity) + '○'.repeat(5 - concept.specs.laserComplexity)],
                ['Etching Time', concept.specs.estimatedEtchingTime],
                ['Surface Coverage', `${concept.specs.surfaceCoverage}%`],
                ['Line Thickness', concept.specs.lineThickness],
                ['B/W Guidance', concept.specs.bwContrastGuidance],
                ['Symmetry', concept.specs.symmetryRequirement],
                ['Coordination', concept.specs.coordinationMode],
                ['Feasibility', '★'.repeat(concept.specs.productionFeasibility) + '☆'.repeat(5 - concept.specs.productionFeasibility)],
                ['Risk Notes', concept.specs.riskNotes],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4">
                  <span className="text-muted shrink-0">{label}</span>
                  <span className="text-right">{value || '—'}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <div className="bg-surface border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-3">Coil Specs</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted">Dimensions</span><span>{concept.coilSpecs.dimensions || '—'}</span></div>
                <div className="flex justify-between"><span className="text-muted">Printable Area</span><span>{concept.coilSpecs.printableArea || '—'}</span></div>
                <div className="flex justify-between"><span className="text-muted">Notes</span><span>{concept.coilSpecs.notes || '—'}</span></div>
              </div>
            </div>
            <div className="bg-surface border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-3">Base Specs</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted">Dimensions</span><span>{concept.baseSpecs.dimensions || '—'}</span></div>
                <div className="flex justify-between"><span className="text-muted">Printable Area</span><span>{concept.baseSpecs.printableArea || '—'}</span></div>
                <div className="flex justify-between"><span className="text-muted">Notes</span><span>{concept.baseSpecs.notes || '—'}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Versions */}
      {activeSection === 'versions' && (
        <div className="space-y-3">
          {concept.versions.length === 0 ? (
            <p className="text-sm text-muted text-center py-8">No versions yet. Generate AI concepts or upload images to create versions.</p>
          ) : (
            concept.versions.map((v) => (
              <div key={v.id} className="bg-surface border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold">Version {v.versionNumber}</h4>
                  <span className="text-xs text-muted">{new Date(v.createdAt).toLocaleString()}</span>
                </div>
                <p className="text-sm text-muted mb-3">{v.notes}</p>
                <div className="flex gap-3">
                  <div className="w-20 h-20 rounded bg-background placeholder-pattern border border-border flex items-center justify-center overflow-hidden">
                    {v.coilImageUrl ? <img src={v.coilImageUrl} alt="" className="w-full h-full object-contain" /> : <span className="text-[8px] text-muted">Coil</span>}
                  </div>
                  <div className="w-20 h-20 rounded bg-background placeholder-pattern border border-border flex items-center justify-center overflow-hidden">
                    {v.baseImageUrl ? <img src={v.baseImageUrl} alt="" className="w-full h-full object-contain" /> : <span className="text-[8px] text-muted">Base</span>}
                  </div>
                </div>
                {v.prompt && (
                  <details className="mt-2">
                    <summary className="text-xs text-muted cursor-pointer">View prompt</summary>
                    <pre className="text-xs text-muted bg-background rounded p-2 mt-1 whitespace-pre-wrap">{v.prompt}</pre>
                  </details>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Comments */}
      {activeSection === 'comments' && (
        <div className="max-w-2xl space-y-4">
          <div className="flex gap-2">
            <TextArea value={commentText} onChange={setCommentText} placeholder="Leave a comment..." rows={2} className="flex-1" />
            <button onClick={handleComment} disabled={!commentText.trim()} className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm rounded-lg self-end disabled:opacity-50">
              Post
            </button>
          </div>
          {concept.comments.length === 0 ? (
            <p className="text-sm text-muted text-center py-8">No comments yet.</p>
          ) : (
            <div className="space-y-3">
              {[...concept.comments].reverse().map((c) => (
                <div key={c.id} className="bg-surface border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{c.userName}</span>
                    <span className="text-xs text-muted">{new Date(c.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="text-sm">{c.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* AI History */}
      {activeSection === 'ai' && (
        <div className="space-y-3">
          {concept.aiGenerations.length === 0 ? (
            <p className="text-sm text-muted text-center py-8">No AI generations yet.</p>
          ) : (
            concept.aiGenerations.map((gen) => (
              <div key={gen.id} className="bg-surface border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted bg-accent/20 text-accent px-2 py-0.5 rounded">{gen.mode}</span>
                  <span className="text-xs text-muted">{new Date(gen.createdAt).toLocaleString()}</span>
                </div>
                <div className="flex gap-3 mb-3">
                  <div className="w-24 h-24 rounded bg-background placeholder-pattern border border-border flex items-center justify-center overflow-hidden">
                    {gen.coilImageUrl ? <img src={gen.coilImageUrl} alt="" className="w-full h-full object-contain" /> : <span className="text-xs text-muted">Coil</span>}
                  </div>
                  <div className="w-24 h-24 rounded bg-background placeholder-pattern border border-border flex items-center justify-center overflow-hidden">
                    {gen.baseImageUrl ? <img src={gen.baseImageUrl} alt="" className="w-full h-full object-contain" /> : <span className="text-xs text-muted">Base</span>}
                  </div>
                </div>
                <details>
                  <summary className="text-xs text-muted cursor-pointer">View prompts</summary>
                  <div className="mt-2 space-y-2">
                    <div>
                      <span className="text-[10px] text-muted uppercase">Coil Prompt</span>
                      <pre className="text-xs text-muted bg-background rounded p-2 whitespace-pre-wrap">{gen.coilPrompt}</pre>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted uppercase">Base Prompt</span>
                      <pre className="text-xs text-muted bg-background rounded p-2 whitespace-pre-wrap">{gen.basePrompt}</pre>
                    </div>
                  </div>
                </details>
              </div>
            ))
          )}
        </div>
      )}

      {/* Manufacturing */}
      {activeSection === 'manufacturing' && (
        <ManufacturingPanel conceptId={conceptId} />
      )}

      {/* Quick Generate Modal */}
      {showGenerate && concept && (
        <QuickGenerateModal concept={concept} onClose={() => setShowGenerate(false)} />
      )}
    </div>
  );
}
