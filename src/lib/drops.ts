/**
 * Drop Planner — local-first model for grouping concepts into seasonal
 * launches ("drops"). Persisted to localStorage so the team can iterate
 * without touching Supabase. Move to a real DB table when multi-user
 * sync becomes a hard requirement.
 */

import { v4 as uuidv4 } from 'uuid';

export interface Drop {
  id: string;
  name: string;             // "Halloween 2026"
  launchDate: string;       // ISO date (YYYY-MM-DD)
  holidayId?: string;       // links to HOLIDAY_EVENTS.id
  conceptIds: string[];
  notes: string;
  createdAt: string;
}

const STORAGE_KEY = 'drops-v1';

function read(): Drop[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function write(drops: Drop[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drops));
  } catch { /* quota / private mode */ }
}

export function listDrops(): Drop[] {
  return read().sort((a, b) => a.launchDate.localeCompare(b.launchDate));
}

export function createDrop(input: Omit<Drop, 'id' | 'createdAt'>): Drop {
  const drop: Drop = {
    ...input,
    id: uuidv4(),
    createdAt: new Date().toISOString(),
  };
  write([...read(), drop]);
  return drop;
}

export function updateDrop(id: string, patch: Partial<Drop>): Drop | null {
  const drops = read();
  const idx = drops.findIndex((d) => d.id === id);
  if (idx < 0) return null;
  drops[idx] = { ...drops[idx], ...patch };
  write(drops);
  return drops[idx];
}

export function deleteDrop(id: string): void {
  write(read().filter((d) => d.id !== id));
}

export function addConceptToDrop(dropId: string, conceptId: string): Drop | null {
  const drops = read();
  const idx = drops.findIndex((d) => d.id === dropId);
  if (idx < 0) return null;
  if (!drops[idx].conceptIds.includes(conceptId)) {
    drops[idx].conceptIds = [...drops[idx].conceptIds, conceptId];
    write(drops);
  }
  return drops[idx];
}

export function removeConceptFromDrop(dropId: string, conceptId: string): Drop | null {
  const drops = read();
  const idx = drops.findIndex((d) => d.id === dropId);
  if (idx < 0) return null;
  drops[idx].conceptIds = drops[idx].conceptIds.filter((id) => id !== conceptId);
  write(drops);
  return drops[idx];
}

export function daysUntilLaunch(drop: Drop, from = new Date()): number {
  const target = new Date(drop.launchDate + 'T00:00:00');
  const now = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.round((target.getTime() - now.getTime()) / 86_400_000);
}
