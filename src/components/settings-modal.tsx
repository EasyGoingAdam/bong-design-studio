'use client';

import { useState } from 'react';
import { useAppStore } from '@/lib/store';

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { openAIKey, setOpenAIKey, currentUser, setCurrentUserName } = useAppStore();
  const [key, setKey] = useState(openAIKey);
  const [name, setName] = useState(currentUser.name);

  return (
    <div className="fixed inset-0 bg-black/60 modal-backdrop z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface border border-border rounded-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">Settings</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted mb-1.5">Display Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
            />
            <p className="text-xs text-muted mt-1">Shown on concepts, comments, and approvals.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-muted mb-1.5">OpenAI API Key</label>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk-..."
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
            />
            <p className="text-xs text-muted mt-1">Required for AI concept generation. Stored locally in your browser.</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted hover:text-foreground transition-colors">
            Cancel
          </button>
          <button
            onClick={() => { setOpenAIKey(key); setCurrentUserName(name); onClose(); }}
            className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
