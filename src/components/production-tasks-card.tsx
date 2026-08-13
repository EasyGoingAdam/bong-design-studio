'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { formatDate } from '@/lib/utils';

interface ProductionTask {
  id: string;
  conceptId: string;
  label: string;
  completed: boolean;
  completedAt: string | null;
  completedBy: string | null;
  sortOrder: number;
}

/**
 * Task-based Production Readiness. The % is DERIVED from task completion (never
 * stored), so it updates immediately when a task is checked. Each completion
 * records a timestamp and who did it. Auto-seeds a default checklist per concept.
 */
export function ProductionTasksCard({ conceptId }: { conceptId: string }) {
  const currentUser = useAppStore((s) => s.currentUser);
  const [tasks, setTasks] = useState<ProductionTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/concepts/${conceptId}/production-tasks`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: ProductionTask[]) => { if (!cancelled) setTasks(Array.isArray(rows) ? rows : []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [conceptId]);

  const { done, total, percent } = useMemo(() => {
    const d = tasks.filter((t) => t.completed).length;
    const tt = tasks.length;
    return { done: d, total: tt, percent: tt > 0 ? Math.round((d / tt) * 100) : 0 };
  }, [tasks]);

  const toggle = async (task: ProductionTask) => {
    const next = !task.completed;
    // Optimistic — the % recomputes instantly from task state.
    setTasks((prev) => prev.map((t) => (t.id === task.id
      ? { ...t, completed: next, completedAt: next ? new Date().toISOString() : null, completedBy: next ? currentUser.name : null }
      : t)));
    try {
      const res = await fetch(`/api/concepts/${conceptId}/production-tasks`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id, completed: next, completedBy: currentUser.name }),
      });
      if (res.ok) {
        const row = (await res.json()) as ProductionTask;
        setTasks((prev) => prev.map((t) => (t.id === task.id ? row : t)));
      } else {
        // Roll back on failure.
        setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
      }
    } catch {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
    }
  };

  const addTask = async () => {
    const label = newLabel.trim();
    if (!label) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/concepts/${conceptId}/production-tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, sortOrder: tasks.length }),
      });
      if (res.ok) {
        const row = (await res.json()) as ProductionTask;
        setTasks((prev) => [...prev, row]);
        setNewLabel('');
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async (task: ProductionTask) => {
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    try {
      await fetch(`/api/concepts/${conceptId}/production-tasks`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id }),
      });
    } catch { /* optimistic */ }
  };

  const ready = total > 0 && done === total;
  const barColor = ready ? 'bg-green-500' : done > 0 ? 'bg-accent' : 'bg-border-light';
  const ringColor = ready ? 'text-green-600' : 'text-accent';

  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold">Production Readiness</h3>
          <p className="text-[11px] text-muted leading-snug">
            {loading ? 'Loading…' : ready ? '✓ All production tasks complete.' : `${done} of ${total} tasks complete.`}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-3xl font-bold ${ringColor}`}>{percent}%</div>
          <div className="text-[10px] text-muted">{done}/{total} tasks</div>
        </div>
      </div>

      <div className="w-full h-1.5 bg-background rounded-full overflow-hidden mb-3">
        <div className={`h-full transition-all ${barColor}`} style={{ width: `${percent}%` }} />
      </div>

      <ul className="space-y-1.5">
        {tasks.map((t) => (
          <li key={t.id} className="flex items-start gap-2 text-xs group">
            <input
              type="checkbox"
              checked={t.completed}
              onChange={() => toggle(t)}
              className="accent-accent mt-0.5 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className={`font-medium leading-tight ${t.completed ? 'text-muted line-through' : 'text-foreground'}`}>
                {t.label}
              </div>
              {t.completed && t.completedAt && (
                <div className="text-[10px] text-muted leading-snug">
                  {formatDate(t.completedAt)}{t.completedBy ? ` · ${t.completedBy}` : ''}
                </div>
              )}
            </div>
            <button
              onClick={() => remove(t)}
              className="text-muted hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              title="Remove task"
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      {!loading && (
        <div className="flex items-center gap-1.5 mt-3">
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addTask(); }}
            placeholder="Add a task…"
            className="flex-1 bg-background border border-border rounded px-2 py-1 text-xs focus:outline-none focus:border-accent"
          />
          <button
            onClick={addTask}
            disabled={busy || !newLabel.trim()}
            className="text-xs px-2 py-1 bg-accent hover:bg-accent-hover text-white rounded disabled:opacity-50"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}
