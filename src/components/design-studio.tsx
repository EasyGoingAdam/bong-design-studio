'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { useToast } from './toast';
import { ImageDownloadButtons } from './image-download';
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

  useEffect(() => {
    fetch('/api/product-templates').then((r) => r.json()).then((d) => {
      const t: ProductTemplate[] = Array.isArray(d.templates) ? d.templates : [];
      setTemplates(t);
      if (t.length && !productName) setProductName(t[0].productName);
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const products = useMemo(() => Array.from(new Set(templates.map((t) => t.productName))), [templates]);
  const areasForProduct = useMemo(() => templates.filter((t) => t.productName === productName), [templates, productName]);

  // Default the selected areas + shape when the product changes.
  useEffect(() => {
    if (areasForProduct.length === 0) { setSelectedAreas([]); return; }
    setSelectedAreas([areasForProduct[0].targetName]);
    setShape((areasForProduct[0].shape as Shape) || 'standard');
  }, [productName]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleArea = (name: string) => {
    setSelectedAreas((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);
  };

  const buildTargets = () => selectedAreas.map((name, i) => {
    const tpl = areasForProduct.find((t) => t.targetName === name);
    const isWrap = shape === 'wrap' || tpl?.shape === 'wrap';
    return {
      name,
      targetType: tpl?.targetType ?? 'coil',
      productTemplateId: tpl?.id ?? null,
      physicalWidth: tpl?.widthIn ?? null,
      physicalHeight: tpl?.heightIn ?? null,
      units: tpl?.units ?? 'in',
      aspectRatio: tpl?.aspectRatio ?? null,
      shape,
      wrap: isWrap,
      seamless: isWrap ? seamless : false,
      detailLevel: detail,
      etchCoverage: coverage,
      sortOrder: i,
    };
  });

  const generate = async () => {
    if (!describe.trim()) { toast('Describe your design first', 'error'); return; }
    if (selectedAreas.length === 0) { toast('Pick at least one area', 'error'); return; }
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

  const setStatus = async (status: string) => {
    if (!project) return;
    await fetch(`/api/studio/projects/${project.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    setProject({ ...project, status });
    toast(status === 'approved' ? 'Approved ✓' : 'Saved', 'success');
  };

  const canGenerate = describe.trim().length > 0 && selectedAreas.length > 0 && !generating;

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
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
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted mb-2">Where does it go?</h2>
          <div className="flex flex-wrap items-center gap-3">
            <select value={productName} onChange={(e) => setProductName(e.target.value)} className="bg-surface border border-border rounded-lg px-3 py-2 text-sm">
              {products.length === 0 && <option value="">No products yet</option>}
              {products.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <div className="flex flex-wrap gap-2">
              {areasForProduct.map((a) => (
                <button key={a.id} onClick={() => toggleArea(a.targetName)}
                  className={`px-3 py-2 text-sm rounded-lg border ${selectedAreas.includes(a.targetName) ? 'bg-accent text-white border-accent' : 'border-border hover:border-foreground'}`}>
                  {a.targetName}
                </button>
              ))}
            </div>
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
            <div className="flex gap-2">
              <button onClick={() => setStatus('favorite')} className="px-3 py-1.5 text-sm rounded-lg border border-border hover:border-foreground">☆ Save</button>
              <button onClick={() => setStatus('approved')} className="px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white">✓ Approve</button>
            </div>
          </div>
          <div className={`grid gap-5 ${(project.targets?.length ?? 0) > 1 ? 'md:grid-cols-2' : ''}`}>
            {(project.targets ?? []).map((t) => (
              <TargetCard key={t.id} target={t} busy={busyTarget === t.id}
                onRegenerate={() => generateTarget(t.id, '')}
                onEdit={(fb) => generateTarget(t.id, fb)}
                onReverse={() => reverseTarget(t)}
                projectName={project.name} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── One target's result: preview + refine + export ──────────────────────────
function TargetCard({ target, busy, onRegenerate, onEdit, onReverse, projectName }: {
  target: DesignTarget; busy: boolean;
  onRegenerate: () => void; onEdit: (feedback: string) => void; onReverse: () => void; projectName: string;
}) {
  const [feedback, setFeedback] = useState('');
  const v = target.currentVersion;
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

      <div className="flex flex-wrap gap-2 mt-3">
        <button onClick={onRegenerate} disabled={busy} className="px-3 py-1.5 text-sm rounded-lg border border-border hover:border-foreground disabled:opacity-40">Regenerate</button>
        <button onClick={onReverse} disabled={busy || !v} className="px-3 py-1.5 text-sm rounded-lg border border-border hover:border-foreground disabled:opacity-40">Reverse ◑</button>
        {v?.imageUrl && <ImageDownloadButtons imageUrl={v.imageUrl} filename={fileBase} />}
      </div>

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
      {v && v.versionNumber > 1 && <div className="text-[11px] text-muted mt-2">Version {v.versionNumber}{v.inverted ? ' · reversed' : ''}</div>}
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
