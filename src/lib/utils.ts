'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';

export function formatDate(isoString: string): string {
  if (!isoString) return '—';
  try {
    return format(new Date(isoString), 'MMM d, yyyy');
  } catch {
    return '—';
  }
}

export function formatDateTime(isoString: string): string {
  if (!isoString) return '—';
  try {
    return format(new Date(isoString), 'MMM d, yyyy h:mm a');
  } catch {
    return '—';
  }
}

export function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

export function isDataUri(url: string): boolean {
  return url.startsWith('data:');
}
