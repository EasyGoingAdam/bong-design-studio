'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { useToast } from './toast';
import type { ProductTemplate, DesignProject, DesignTarget, DesignVersion } from '@/lib/studio-db';

type Shape = 'standard' | 'wide' | 'tall' | 'wrap';
type Detail = 'simple' | 'balanced' | 'intricate';
type Coverage = 'light' | 'medium' | 'heavy';

const SHAPES: { id: Shape; label: string; glyph: string }[] = [
  { id: 'standard', label: 'Standard', glyph: '▭' },
  { id: 'wide', label: 'Wide', glyph: '━━' },
  { id: 'tall', label: 'Tall', glyph: '▯' },
  { id: 'wrap', label: 'Wrap Around', glyph: '↻' },
];
const DETAILS: { id: Detail; label: string; hint: string }[] = [
  { id: 'simple', label: 'Simple', hint: 'Bold, few elements, lots of white space' },
  { id: 'balanced', label: 'Balanced', hint: 'Normal engraving detail' },
  { id: 'intricate', label: 'Intricate', hint: 'Richer linework and detail' },
];

/**
 * Bong Design Studio 2.0 — the single simplified workspace.
 * Describe → Product/Area → Shape → Detail → Generate → Refine → Export.
 * All AI/model/threshold/prompt machinery is hidden; the employee only makes
 * design choices. Backed by the new studio APIs (binary black/white masters).
 */
export function DesignStudio() {
  const currentUser = useAppStore((s) => s.currentUser);
  const openAIKey = useAppStore((s) => s.openAIKey);
  const { toast } = useToast();

  const [templates, setTemplates] = useState<ProductTemplate[]>([]);
  const [describe, setDescribe] = useState('');
  const [productName, setProductName] = useState('');
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [shape, setShape] = useState<Shape>('standard');
  const [detail, setDetail] = useState<Detail>('balanced');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [seamless, setSeamless] = useState(true);
  const [coverage, setCoverage] = useState<Coverage>('medium');

  const [brainstormOpen, setBrainstormOpen] = useState(false);

  const [project, setProject] = useState<DesignProject | null>(null);
  const [generating, setGenerating] = useState(false);
  const [busyTarget, setBusyTarget] = useState<string | null>(null);

  const [view, setView] = useState<'create' | 'archive'>('create');
  const [projects, setProjects] = useState<DesignProject[]>([]);
  const [showProducts, setShowProducts] = useState(false);
  const [mockupUrl, setMockupUrl] = useState<string | null>(null);
  const [mockupBusy, setMockupBusy] = useState(false);
  const isAdmin = currentUser?.role === 'admin';

  const loadTemplates = () => {
    fetch('/api/product-templates').then((r) => r.json()).then((d) => {
      const t: ProductTemplate[] = Array.isArray(d.templates) ? d.templates : [];
      setTemplates(t);
      setProductName((prev) => prev || (t[0]?.productName ?? ''));
    }).catch(() => {});
  };
  useEffect(() => { loadTemplates(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadArchive = () => {
    fetch('/api/studio/projects').then((r) => r.json()).then((d) => setProjects(Array.isArray(d.projects) ? d.projects : [])).catch(() => {});
  };
  useEffect(() => { if (view === 'archive') loadArchive(); }, [view]);

  const openProject = async (id: string) => {
    const res = await fetch(`/api/studio/projects/${id}`);
    const proj = await res.json();
    if (res.ok && proj?.id) { setProject(proj); setView('create'); }
  };

  const restoreVersion = async (targetId: string, versionId: string) => {
    setBusyTarget(targetId);
    try {
      const res = await fetch('/api/studio/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ versionId }) });
      const data = await res.json();
      if (res.ok && data?.version) {
        // Just move the "current" pointer — don't append (it's already in history).
        setProject((prev) => prev ? { ...prev, targets: (prev.targets ?? []).map((t) => t.id === targetId ? { ...t, currentVersionId: data.version.id, currentVersion: data.version } : t) } : prev);
      }
    } finally { setBusyTarget(null); }
  };

  const products = useMemo(() => Array.from(new Set(templates.map((t) => t.productName))), [templates]);
  const areasForProduct = useMemo(() => templates.filter((t) => t.productName === productName), [templates, productName]);
  // Freeform = no product chosen (or none exist): generate a single design from
  // just the shape + detail, no physical dimensions required.
  const isFreeform = !productName || areasForProduct.length === 0;

  // Default the selected areas + shape when the product changes.
  useEffect(() => {
    if (areasForProduct.length === 0) { setSelectedAreas([]); return; }
    setSelectedAreas([areasForProduct[0].targetName]);
    setShape((areasForProduct[0].shape as Shape) || 'standard');
  }, [productName]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleArea = (name: string) => {
    setSelectedAreas((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);
  };

  const buildTargets = () => {
    const shapeAspect = shape === 'wide' ? 1.5 : shape === 'tall' ? 0.667 : shape === 'wrap' ? 3 : 1;
    // Freeform (or no area picked) → a single generic "Design" target.
    const areas = (!isFreeform && selectedAreas.length > 0) ? selectedAreas : ['Design'];
    return areas.map((name, i) => {
      const tpl = areasForProduct.find((t) => t.targetName === name);
      const isWrap = shape === 'wrap' || tpl?.shape === 'wrap';
      return {
        name,
        targetType: tpl?.targetType ?? 'custom',
        productTemplateId: tpl?.id ?? null,
        physicalWidth: tpl?.widthIn ?? null,
        physicalHeight: tpl?.heightIn ?? null,
        units: tpl?.units ?? 'in',
        aspectRatio: tpl?.aspectRatio ?? shapeAspect,
        shape,
        wrap: isWrap,
        seamless: isWrap ? seamless : false,
        detailLevel: detail,
        etchCoverage: coverage,
        sortOrder: i,
      };
    });
  };

  const generate = async () => {
    if (!describe.trim()) { toast('Describe your design first', 'error'); return; }
    setGenerating(true);
    setProject(null);
    try {
      const name = describe.trim().slice(0, 60);
      const res = await fetch('/api/studio/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, originalRequest: describe.trim(), refinedPrompt: describe.trim(),
          productName, type: selectedAreas.length > 1 ? 'set' : 'single', relationship: 'coordinated',
          createdBy: currentUser?.name ?? '', targets: buildTargets(),
        }),
      });
      const proj: DesignProject = await res.json();
      if (!res.ok || !proj?.id) { toast((proj as { error?: string })?.error || 'Could not start the project', 'error'); return; }
      setProject(proj);
      // Generate each target (sequential to stay gentle on rate limits).
      for (const t of proj.targets ?? []) {
        await generateTarget(t.id, '', proj);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Generation failed', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const generateTarget = async (targetId: string, feedback: string, projOverride?: DesignProject) => {
    setBusyTarget(targetId);
    try {
      const res = await fetch('/api/studio/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId, feedback, createdBy: currentUser?.name ?? '' }),
      });
      const data = await res.json();
      if (!res.ok || !data?.version) { toast(data?.error || 'Generation failed', 'error'); return; }
      applyVersion(targetId, data.version, projOverride);
      if (data.validation?.warnings?.length) toast(data.validation.warnings[0], 'info');
    } finally {
      setBusyTarget(null);
    }
  };

  const editTarget = async (targetId: string, feedback: string) => {
    if (!feedback.trim()) return;
    setBusyTarget(targetId);
    try {
      const res = await fetch('/api/studio/edit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId, feedback, createdBy: currentUser?.name ?? '' }),
      });
      const data = await res.json();
      if (!res.ok || !data?.version) { toast(data?.error || 'Edit failed', 'error'); return; }
      applyVersion(targetId, data.version);
      if (data.validation?.warnings?.length) toast(data.validation.warnings[0], 'info');
    } finally {
      setBusyTarget(null);
    }
  };

  const reverseTarget = async (target: DesignTarget) => {
    const vId = target.currentVersion?.id;
    if (!vId) return;
    setBusyTarget(target.id);
    try {
      const res = await fetch('/api/studio/reverse', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId: vId }),
      });
      const data = await res.json();
      if (!res.ok || !data?.version) { toast(data?.error || 'Reverse failed', 'error'); return; }
      applyVersion(target.id, data.version);
    } finally {
      setBusyTarget(null);
    }
  };

  const applyVersion = (targetId: string, version: DesignVersion, projOverride?: DesignProject) => {
    setProject((prev) => {
      const base = projOverride ?? prev;
      if (!base) return prev;
      return {
        ...base,
        targets: (base.targets ?? []).map((t) => t.id === targetId
          ? { ...t, currentVersionId: version.id, currentVersion: version, versions: [...(t.versions ?? []), version] }
          : t),
      };
    });
  };

  const reverseAll = async () => {
    if (!project) return;
    for (const t of project.targets ?? []) { if (t.currentVersion?.id) await reverseTarget(t); }
  };

  const downloadOne = async (versionId: string, name: string, format: 'svg' | 'png' | 'jpg', wIn?: number | null, hIn?: number | null) => {
    const dim = wIn && hIn ? `&wIn=${wIn}&hIn=${hIn}` : '';
    const res = await fetch(`/api/studio/export?versionId=${versionId}&format=${format}&name=${encodeURIComponent(name)}${dim}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${name}.${format}`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const downloadSet = async () => {
    if (!project) return;
    const base = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    for (const t of project.targets ?? []) {
      if (!t.currentVersion?.id) continue;
      const fn = `${base}-${t.name.toLowerCase()}`;
      for (const f of ['svg', 'png', 'jpg'] as const) await downloadOne(t.currentVersion.id, fn, f, t.physicalWidth, t.physicalHeight);
    }
    toast('Downloaded the full set', 'success');
  };

  const duplicateProject = async (id: string) => {
    const res = await fetch(`/api/studio/projects/${id}/duplicate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ createdBy: currentUser?.name ?? '' }),
    });
    const data = await res.json();
    if (!res.ok || !data?.id) { toast(data?.error || 'Duplicate failed', 'error'); return; }
    toast('Duplicated — editing the copy', 'success');
    await openProject(data.id);
  };

  const deleteProject = async (id: string) => {
    if (!window.confirm('Delete this design permanently?')) return;
    await fetch(`/api/studio/projects/${id}`, { method: 'DELETE' });
    setProjects((prev) => prev.filter((p) => p.id !== id));
    if (project?.id === id) { setProject(null); }
  };

  const previewOnProduct = async () => {
    if (!project) return;
    const blank = templates.find((t) => t.productName === project.productName && t.previewImage)?.previewImage;
    if (!blank) { toast('Add a product photo in ⚙ Products to enable previews', 'info'); return; }
    const coil = project.targets?.find((t) => /coil/i.test(t.name))?.currentVersion?.imageUrl || project.targets?.[0]?.currentVersion?.imageUrl;
    const base = project.targets?.find((t) => /base/i.test(t.name))?.currentVersion?.imageUrl;
    if (!coil) { toast('Generate the design first', 'error'); return; }
    setMockupBusy(true);
    setMockupUrl(null);
    try {
      const res = await fetch('/api/mockup-product', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blankProductUrl: blank, coilDesignUrl: coil, baseDesignUrl: base, apiKey: openAIKey, angle: 'front', etchStyle: 'frosted', placement: 'auto', background: 'white_studio', folder: 'studio-mockups', filename: `mockup-${project.id.slice(0, 8)}` }),
      });
      const data = await res.json();
      if (!res.ok || !data?.url) { toast(data?.error || 'Preview failed', 'error'); return; }
      setMockupUrl(data.url);
    } finally {
      setMockupBusy(false);
    }
  };

  const setStatus = async (status: string) => {
    if (!project) return;
    await fetch(`/api/studio/projects/${project.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    setProject({ ...project, status });
    toast(status === 'approved' ? 'Approved ✓' : 'Saved', 'success');
  };

  const canGenerate = describe.trim().length > 0 && !generating;

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center rounded-lg border border-border overflow-hidden text-sm font-medium">
          <button onClick={() => { setView('create'); }} className={`px-3 py-1.5 ${view === 'create' ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}>New Design</button>
          <button onClick={() => setView('archive')} className={`px-3 py-1.5 ${view === 'archive' ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}>Archive</button>
        </div>
        {isAdmin && (
          <button onClick={() => setShowProducts(true)} className="text-sm text-muted hover:text-foreground">⚙ Products</button>
        )}
      </div>

      {view === 'archive' && (
        <ArchiveView projects={projects} onOpen={openProject} onDelete={deleteProject} />
      )}

      {view === 'create' && (
      <>
      {/* ── Request form ─────────────────────────────────────────── */}
      <section className="space-y-5">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted mb-2">What do you want to make?</h2>
          <textarea
            value={describe}
            onChange={(e) => setDescribe(e.target.value)}
            rows={3}
            placeholder='Describe the design you want to create. Example: "A retro UFO abducting a cow with stars around it, playful but not cartoonish."'
            className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent resize-none"
          />
          <button onClick={() => setBrainstormOpen((v) => !v)} className="mt-2 text-sm text-accent hover:underline">💡 Help Me Brainstorm</button>
          {brainstormOpen && (
            <BrainstormPanel apiKey={openAIKey} seed={describe} onUse={(idea) => { setDescribe(idea); setBrainstormOpen(false); }} />
          )}
        </div>

        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted mb-2">Where does it go? <span className="text-muted font-normal normal-case">(optional)</span></h2>
          <div className="flex flex-wrap items-center gap-3">
            <select value={productName} onChange={(e) => setProductName(e.target.value)} className="bg-surface border border-border rounded-lg px-3 py-2 text-sm">
              <option value="">Just a design (no product)</option>
              {products.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            {!isFreeform && (
              <div className="flex flex-wrap gap-2">
                {areasForProduct.map((a) => (
                  <button key={a.id} onClick={() => toggleArea(a.targetName)}
                    className={`px-3 py-2 text-sm rounded-lg border ${selectedAreas.includes(a.targetName) ? 'bg-accent text-white border-accent' : 'border-border hover:border-foreground'}`}>
                    {a.targetName}
                  </button>
                ))}
              </div>
            )}
            {isFreeform && <span className="text-xs text-muted">Freeform — pick a shape below and generate.</span>}
            {selectedAreas.length > 1 && <span className="text-xs text-muted">Coordinated set · {selectedAreas.length} pieces</span>}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted mb-2">Shape</h2>
            <div className="flex flex-wrap gap-2">
              {SHAPES.map((s) => (
                <button key={s.id} onClick={() => setShape(s.id)}
                  className={`px-3 py-2 text-sm rounded-lg border flex items-center gap-1.5 ${shape === s.id ? 'bg-accent text-white border-accent' : 'border-border hover:border-foreground'}`}>
                  <span aria-hidden>{s.glyph}</span>{s.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted mb-2">Detail</h2>
            <div className="flex flex-wrap gap-2">
              {DETAILS.map((d) => (
                <button key={d.id} onClick={() => setDetail(d.id)} title={d.hint}
                  className={`px-3 py-2 text-sm rounded-lg border ${detail === d.id ? 'bg-accent text-white border-accent' : 'border-border hover:border-foreground'}`}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Advanced (collapsed) */}
        <div>
          <button onClick={() => setShowAdvanced((v) => !v)} className="text-xs text-muted hover:text-foreground">{showAdvanced ? '▾' : '▸'} Advanced</button>
          {showAdvanced && (
            <div className="mt-2 flex flex-wrap items-center gap-4 text-sm bg-surface border border-border rounded-lg p-3">
              <label className="flex items-center gap-2">
                <span className="text-muted">Etch coverage</span>
                <select value={coverage} onChange={(e) => setCoverage(e.target.value as Coverage)} className="bg-background border border-border rounded px-2 py-1">
                  <option value="light">Light</option><option value="medium">Medium</option><option value="heavy">Heavy</option>
                </select>
              </label>
              {shape === 'wrap' && (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={seamless} onChange={(e) => setSeamless(e.target.checked)} /> Seamless wrap
                </label>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <button onClick={generate} disabled={!canGenerate}
            className="px-6 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold disabled:opacity-40 flex items-center gap-2">
            {generating ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Generating…</> : 'Generate Design'}
          </button>
        </div>
      </section>

      {/* ── Result ───────────────────────────────────────────────── */}
      {project && (
        <section className="border-t border-border pt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">{project.type === 'set' ? 'Design Set' : 'Generated Design'}</h2>
            <div className="flex flex-wrap gap-2">
              {(project.targets?.length ?? 0) > 1 && (
                <>
                  <button onClick={reverseAll} disabled={busyTarget !== null} className="px-3 py-1.5 text-sm rounded-lg border border-border hover:border-foreground disabled:opacity-50">Reverse Set</button>
                  <button onClick={downloadSet} className="px-3 py-1.5 text-sm rounded-lg border border-border hover:border-foreground">Download Set</button>
                </>
              )}
              <button onClick={previewOnProduct} disabled={mockupBusy} className="px-3 py-1.5 text-sm rounded-lg border border-border hover:border-foreground disabled:opacity-50">{mockupBusy ? 'Rendering…' : '👓 Preview on Product'}</button>
              <button onClick={() => duplicateProject(project.id)} className="px-3 py-1.5 text-sm rounded-lg border border-border hover:border-foreground">⧉ Duplicate</button>
              <button onClick={() => setStatus('favorite')} className="px-3 py-1.5 text-sm rounded-lg border border-border hover:border-foreground">☆ Save</button>
              <button onClick={() => setStatus('approved')} className="px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white">✓ Approve</button>
            </div>
          </div>
          <div className={`grid gap-5 ${(project.targets?.length ?? 0) > 1 ? 'md:grid-cols-2' : ''}`}>
            {(project.targets ?? []).map((t) => (
              <TargetCard key={t.id} target={t} busy={busyTarget === t.id}
                onRegenerate={() => generateTarget(t.id, '')}
                onEdit={(fb) => editTarget(t.id, fb)}
                onReverse={() => reverseTarget(t)}
                onRestore={(vid) => restoreVersion(t.id, vid)}
                projectName={project.name} />
            ))}
          </div>
        </section>
      )}
      </>
      )}

      {showProducts && <ProductTemplateAdmin templates={templates} onClose={() => setShowProducts(false)} onChange={loadTemplates} />}

      {mockupUrl && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setMockupUrl(null)}>
          <div className="bg-surface border border-border rounded-xl max-w-lg w-full p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold">Preview on Product</span>
              <button onClick={() => setMockupUrl(null)} className="text-muted hover:text-foreground text-lg">×</button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mockupUrl} alt="Product mockup" className="w-full rounded-lg" />
            <p className="text-[11px] text-muted mt-2">Mockup is illustrative (full color) — your production files stay binary black/white.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── One target's result: preview + refine + export ──────────────────────────
function TargetCard({ target, busy, onRegenerate, onEdit, onReverse, onRestore, projectName }: {
  target: DesignTarget; busy: boolean;
  onRegenerate: () => void; onEdit: (feedback: string) => void; onReverse: () => void; onRestore: (versionId: string) => void; projectName: string;
}) {
  const [feedback, setFeedback] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [compareId, setCompareId] = useState<string | null>(null);
  const v = target.currentVersion;
  const history = target.versions ?? [];
  const compareV = compareId ? history.find((h) => h.id === compareId) ?? null : null;
  // Only surface density when a human should actually look.
  const cov = v?.blackCoverage;
  const densityNote = cov == null ? '' : cov < 0.02
    ? 'This came out nearly blank — try Regenerate, or Heavy coverage under Advanced.'
    : cov > 0.85
      ? 'This is very heavy — it may etch as a near-solid block. Try Reverse or Light coverage.'
      : '';
  const dims = target.physicalWidth && target.physicalHeight ? `${target.physicalWidth}" × ${target.physicalHeight}"` : '';
  const fileBase = `${projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}-${target.name.toLowerCase()}`;

  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold">{target.name}</span>
        <span className="text-xs text-muted">{dims}</span>
      </div>
      <div className="aspect-square bg-white rounded-lg border border-border overflow-hidden flex items-center justify-center relative">
        {busy && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><span className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" /></div>}
        {v?.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={v.imageUrl} alt={target.name} className="w-full h-full object-contain" />
        ) : <span className="text-xs text-muted">generating…</span>}
      </div>
      {densityNote && (
        <div className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{densityNote}</div>
      )}

      <div className="flex flex-wrap gap-2 mt-3">
        <button onClick={onRegenerate} disabled={busy} className="px-3 py-1.5 text-sm rounded-lg border border-border hover:border-foreground disabled:opacity-40">Regenerate</button>
        <button onClick={onReverse} disabled={busy || !v} className="px-3 py-1.5 text-sm rounded-lg border border-border hover:border-foreground disabled:opacity-40">Reverse ◑</button>
      </div>
      {v && <StudioExport versionId={v.id} name={fileBase} wIn={target.physicalWidth} hIn={target.physicalHeight} />}

      <div className="mt-3">
        <div className="text-xs text-muted mb-1">Tell AI what to change:</div>
        <div className="flex gap-2">
          <input value={feedback} onChange={(e) => setFeedback(e.target.value)}
            placeholder="Make the center image larger…"
            className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
          <button onClick={() => { if (feedback.trim()) { onEdit(feedback.trim()); setFeedback(''); } }} disabled={busy || !feedback.trim()}
            className="px-3 py-2 text-sm rounded-lg bg-accent text-white disabled:opacity-40">Update</button>
        </div>
      </div>
      <div className="flex items-center justify-between mt-2">
        {v && v.versionNumber > 0 && <span className="text-[11px] text-muted">Version {v.versionNumber}{v.inverted ? ' · reversed' : ''}</span>}
        {history.length > 1 && (
          <button onClick={() => setShowHistory((s) => !s)} className="text-[11px] text-accent hover:underline">{showHistory ? 'Hide' : `History (${history.length})`}</button>
        )}
      </div>
      {showHistory && history.length > 1 && (
        <>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {history.map((h) => (
              <div key={h.id} className="shrink-0 w-14">
                <button onClick={() => onRestore(h.id)} disabled={busy}
                  title={`Restore v${h.versionNumber}${h.feedback ? ' · ' + h.feedback : ''}`}
                  className={`w-full rounded-lg border overflow-hidden ${h.id === v?.id ? 'border-accent ring-1 ring-accent' : 'border-border hover:border-foreground'}`}>
                  <div className="aspect-square bg-white">
                    {h.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={h.imageUrl} alt={`v${h.versionNumber}`} className="w-full h-full object-contain" />
                    ) : null}
                  </div>
                  <div className="text-[9px] text-center text-muted py-0.5">v{h.versionNumber}</div>
                </button>
                {h.id !== v?.id && (
                  <button onClick={() => setCompareId(compareId === h.id ? null : h.id)}
                    className={`w-full text-[9px] mt-0.5 ${compareId === h.id ? 'text-accent font-semibold' : 'text-muted hover:text-foreground'}`}>
                    ⇄ compare
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted">Tap a version to restore it · ⇄ to compare with the current one.</p>
        </>
      )}

      {compareV && v && (
        <div className="mt-3 border border-border rounded-lg p-2 bg-background">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold">Compare</span>
            <button onClick={() => setCompareId(null)} className="text-muted hover:text-foreground text-sm">×</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[compareV, v].map((cv, i) => (
              <div key={cv.id}>
                <div className="aspect-square bg-white rounded border border-border overflow-hidden">
                  {cv.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cv.imageUrl} alt={`v${cv.versionNumber}`} className="w-full h-full object-contain" />
                  ) : null}
                </div>
                <div className="text-[11px] mt-1">
                  <b>v{cv.versionNumber}</b>{i === 1 ? ' · current' : ''}
                  {cv.feedback && <div className="text-muted line-clamp-2">“{cv.feedback}”</div>}
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => { onRestore(compareV.id); setCompareId(null); }} disabled={busy}
            className="mt-2 w-full text-xs py-1.5 rounded-lg border border-border hover:border-foreground disabled:opacity-40">
            Restore v{compareV.versionNumber}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Archive (visual project library) ────────────────────────────────────────
function ArchiveView({ projects, onOpen, onDelete }: { projects: DesignProject[]; onOpen: (id: string) => void; onDelete: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'single' | 'set'>('all');
  const [productFilter, setProductFilter] = useState('all');
  const productList = Array.from(new Set(projects.map((p) => p.productName).filter(Boolean)));
  const filtered = projects
    .filter((p) => filter === 'all' || p.type === filter)
    .filter((p) => productFilter === 'all' || p.productName === productFilter)
    .filter((p) => {
      const t = q.trim().toLowerCase();
      return !t || p.name.toLowerCase().includes(t) || (p.productName || '').toLowerCase().includes(t) || (p.originalRequest || '').toLowerCase().includes(t) || (p.createdBy || '').toLowerCase().includes(t);
    });
  const thumb = (p: DesignProject) => p.targets?.find((t) => t.currentVersion?.imageUrl)?.currentVersion?.imageUrl || '';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search designs, products, creator…"
          className="flex-1 min-w-[200px] bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
        {productList.length > 0 && (
          <select value={productFilter} onChange={(e) => setProductFilter(e.target.value)} className="bg-surface border border-border rounded-lg px-2 py-2 text-sm">
            <option value="all">All products</option>
            {productList.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
        <div className="flex rounded-lg border border-border overflow-hidden text-xs">
          {(['all', 'single', 'set'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-2 capitalize ${filter === f ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}>{f}</button>
          ))}
        </div>
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-muted text-center py-16">No designs yet. Make one in “New Design”.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((p) => (
            <div key={p.id} className="group relative bg-surface border border-border rounded-xl overflow-hidden hover:border-accent transition-colors">
              <button onClick={() => onDelete(p.id)} title="Delete" className="absolute top-1 right-1 z-10 w-6 h-6 rounded-full bg-black/50 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity">×</button>
              <button onClick={() => onOpen(p.id)} className="text-left w-full">
                <div className="aspect-square bg-white">
                  {thumb(p) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb(p)} alt={p.name} className="w-full h-full object-contain" />
                  ) : null}
                </div>
                <div className="p-2">
                  <div className="text-sm font-medium line-clamp-1">{p.name}</div>
                  <div className="text-[11px] text-muted flex items-center gap-1.5">
                    {p.productName && <span className="truncate">{p.productName}</span>}
                    {p.type === 'set' && <span className="text-accent">set</span>}
                    <span className="ml-auto capitalize">{p.status}</span>
                  </div>
                </div>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Admin: product template editor ──────────────────────────────────────────
function ProductTemplateAdmin({ templates, onClose, onChange }: { templates: ProductTemplate[]; onClose: () => void; onChange: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ productName: '', targetName: '', widthIn: '', heightIn: '', supportsWrap: false, seamlessDefault: false, previewImage: '' });
  const [uploading, setUploading] = useState(false);

  const uploadPhoto = async (file: File) => {
    setUploading(true);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader(); fr.onload = () => resolve(String(fr.result)); fr.onerror = reject; fr.readAsDataURL(file);
      });
      const res = await fetch('/api/upload-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data, folder: 'product-blanks', filename: `blank-${Date.now()}` }) });
      const out = await res.json();
      if (out?.url) { setForm((f) => ({ ...f, previewImage: out.url })); toast('Photo uploaded', 'success'); }
      else toast('Upload failed', 'error');
    } catch { toast('Upload failed', 'error'); }
    finally { setUploading(false); }
  };

  const save = async () => {
    if (!form.productName.trim() || !form.targetName.trim()) { toast('Product and area name required', 'error'); return; }
    const shape = form.supportsWrap ? 'wrap' : (Number(form.widthIn) > Number(form.heightIn) * 1.25 ? 'wide' : 'standard');
    const res = await fetch('/api/product-templates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productName: form.productName.trim(), targetName: form.targetName.trim(), widthIn: Number(form.widthIn) || null, heightIn: Number(form.heightIn) || null, supportsWrap: form.supportsWrap, seamlessDefault: form.seamlessDefault, previewImage: form.previewImage, shape }),
    });
    if (!res.ok) { toast('Save failed', 'error'); return; }
    setForm({ productName: form.productName, targetName: '', widthIn: '', heightIn: '', supportsWrap: false, seamlessDefault: false, previewImage: '' });
    onChange(); toast('Saved', 'success');
  };
  const remove = async (id: string) => {
    await fetch(`/api/product-templates?id=${id}`, { method: 'DELETE' });
    onChange();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface border border-border rounded-xl w-full max-w-lg p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Product templates</h3>
          <button onClick={onClose} className="text-muted hover:text-foreground text-lg">×</button>
        </div>
        <div className="space-y-1.5 mb-4">
          {templates.map((t) => (
            <div key={t.id} className="flex items-center justify-between text-sm bg-background border border-border rounded-lg px-3 py-2">
              <span>{t.productName} · <b>{t.targetName}</b> <span className="text-muted">{t.widthIn}×{t.heightIn} in{t.supportsWrap ? ' · wrap' : ''}</span></span>
              <button onClick={() => remove(t.id)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
            </div>
          ))}
          {templates.length === 0 && <p className="text-sm text-muted">No templates yet — add one below.</p>}
        </div>
        <div className="border-t border-border pt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })} placeholder="Product (e.g. Freeze Pipe Bong)" className="bg-background border border-border rounded-lg px-3 py-2 text-sm" />
            <input value={form.targetName} onChange={(e) => setForm({ ...form, targetName: e.target.value })} placeholder="Area (e.g. Coil)" className="bg-background border border-border rounded-lg px-3 py-2 text-sm" />
            <input value={form.widthIn} onChange={(e) => setForm({ ...form, widthIn: e.target.value })} placeholder="Width (in)" type="number" className="bg-background border border-border rounded-lg px-3 py-2 text-sm" />
            <input value={form.heightIn} onChange={(e) => setForm({ ...form, heightIn: e.target.value })} placeholder="Height (in)" type="number" className="bg-background border border-border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex items-center gap-4 text-sm flex-wrap">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.supportsWrap} onChange={(e) => setForm({ ...form, supportsWrap: e.target.checked })} /> Wrap</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.seamlessDefault} onChange={(e) => setForm({ ...form, seamlessDefault: e.target.checked })} /> Seamless default</label>
            <label className="flex items-center gap-1.5 cursor-pointer text-muted hover:text-foreground">
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); }} />
              {uploading ? 'Uploading…' : form.previewImage ? '✓ Photo set' : '+ Product photo'}
            </label>
            <button onClick={save} className="ml-auto px-4 py-2 text-sm bg-accent text-white rounded-lg">Add / Update</button>
          </div>
          <p className="text-[11px] text-muted">A product photo enables “Preview on Product” for that product.</p>
        </div>
      </div>
    </div>
  );
}

// ── Export bar (true-vector SVG / PNG / JPG / Download All) ─────────────────
function StudioExport({ versionId, name, wIn, hIn }: { versionId: string; name: string; wIn?: number | null; hIn?: number | null }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const dimQuery = wIn && hIn ? `&wIn=${wIn}&hIn=${hIn}` : '';

  const download = async (format: 'svg' | 'png' | 'jpg') => {
    setBusy(format);
    try {
      const res = await fetch(`/api/studio/export?versionId=${versionId}&format=${format}&name=${encodeURIComponent(name)}${dimQuery}`);
      if (!res.ok) { toast('Export failed', 'error'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${name}.${format}`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast('Export failed', 'error');
    } finally {
      setBusy(null);
    }
  };

  const downloadAll = async () => {
    for (const f of ['svg', 'png', 'jpg'] as const) await download(f);
  };

  const Btn = ({ f, label, ready }: { f: 'svg' | 'png' | 'jpg'; label: string; ready: boolean }) => (
    <button onClick={() => download(f)} disabled={!!busy}
      className="px-2.5 py-1.5 text-xs rounded-lg border border-border hover:border-foreground disabled:opacity-40 flex flex-col items-center leading-tight">
      <span className="font-semibold">{busy === f ? '…' : label}</span>
      <span className={`text-[9px] ${ready ? 'text-emerald-600' : 'text-muted'}`}>{ready ? 'Machine Ready' : 'Standard'}</span>
    </button>
  );

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] text-muted mr-1">Export:</span>
      <Btn f="svg" label="SVG" ready />
      <Btn f="png" label="PNG" ready />
      <Btn f="jpg" label="JPG" ready={false} />
      <button onClick={downloadAll} disabled={!!busy} className="px-2.5 py-1.5 text-xs rounded-lg bg-accent text-white disabled:opacity-40">Download All</button>
    </div>
  );
}

// ── Brainstorm assistant ────────────────────────────────────────────────────
function BrainstormPanel({ apiKey, seed, onUse }: { apiKey: string; seed: string; onUse: (idea: string) => void }) {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState(seed);
  const [loading, setLoading] = useState(false);
  const [ideas, setIdeas] = useState<{ name: string; description: string }[]>([]);

  const run = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/brainstorm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: prompt.trim(), apiKey, count: 5 }) });
      const data = await res.json();
      if (!res.ok) { toast(data?.error || 'Brainstorm failed', 'error'); return; }
      const list = (data.concepts ?? []).map((c: { name?: string; description?: string }) => ({ name: c.name ?? 'Idea', description: c.description ?? '' }));
      setIdeas(list);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Brainstorm failed', 'error');
    } finally { setLoading(false); }
  };

  return (
    <div className="mt-2 bg-surface border border-border rounded-xl p-3 space-y-2">
      <div className="flex gap-2">
        <input value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') run(); }}
          placeholder="e.g. something funny involving aliens" className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
        <button onClick={run} disabled={loading} className="px-3 py-2 text-sm rounded-lg bg-accent text-white disabled:opacity-50">{loading ? '…' : 'Ideas'}</button>
      </div>
      {ideas.length > 0 && (
        <div className="space-y-1.5">
          {ideas.map((idea, i) => (
            <div key={i} className="flex items-start justify-between gap-2 bg-background border border-border rounded-lg p-2">
              <div className="min-w-0">
                <div className="text-sm font-medium">{idea.name}</div>
                {idea.description && <div className="text-xs text-muted line-clamp-2">{idea.description}</div>}
              </div>
              <button onClick={() => onUse(`${idea.name}. ${idea.description}`.trim())} className="shrink-0 text-xs px-2 py-1 rounded bg-accent text-white">Use This</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
