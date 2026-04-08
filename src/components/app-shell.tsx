'use client';

import { useState } from 'react';
import { Dashboard } from './dashboard';
import { ConceptsLibrary } from './concepts-library';
import { WorkflowBoard } from './workflow-board';
import { SpecsDatabase } from './specs-database';
import { AIGeneration } from './ai-generation';
import { AIInspiration } from './ai-inspiration';
import { ConceptDetail } from './concept-detail';
import { SettingsModal } from './settings-modal';
import { ToastProvider } from './toast';

type Tab = 'dashboard' | 'concepts' | 'workflow' | 'specs' | 'ai' | 'brainstorm' | 'detail';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '◫' },
  { id: 'concepts', label: 'Concepts', icon: '▦' },
  { id: 'workflow', label: 'Workflow', icon: '⊞' },
  { id: 'specs', label: 'Specs DB', icon: '⚙' },
  { id: 'brainstorm', label: 'Brainstorm', icon: '💡' },
  { id: 'ai', label: 'AI Generate', icon: '✦' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const openConcept = (id: string) => {
    setSelectedConceptId(id);
    setActiveTab('detail');
  };

  const goBack = () => {
    setSelectedConceptId(null);
    setActiveTab('concepts');
  };

  return (
    <ToastProvider>
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Bar */}
      <header className="border-b border-border px-6 py-3 flex items-center justify-between bg-surface shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-white font-bold text-sm">
            DS
          </div>
          <h1 className="text-lg font-semibold tracking-tight">Design Studio</h1>
          <span className="text-xs text-muted bg-border/50 px-2 py-0.5 rounded-full">Laser Etch Manager</span>
        </div>
        <button
          onClick={() => setShowSettings(true)}
          aria-label="Open settings"
          className="text-sm text-muted hover:text-foreground transition-colors px-3 py-1.5 rounded-md hover:bg-surface-hover"
        >
          Settings
        </button>
      </header>

      {/* Tab Navigation */}
      <nav className="border-b border-border bg-surface px-6 shrink-0" role="navigation" aria-label="Main navigation">
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                if (tab.id !== 'detail') setSelectedConceptId(null);
              }}
              className={`px-4 py-3 text-sm font-medium transition-colors relative ${
                activeTab === tab.id
                  ? 'text-accent'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              <span className="mr-1.5">{tab.icon}</span>
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />
              )}
            </button>
          ))}
          {activeTab === 'detail' && selectedConceptId && (
            <button
              className="px-4 py-3 text-sm font-medium text-accent relative"
            >
              <span className="mr-1.5">◉</span>
              Concept Detail
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />
            </button>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {activeTab === 'dashboard' && <Dashboard onOpenConcept={openConcept} />}
        {activeTab === 'concepts' && <ConceptsLibrary onOpenConcept={openConcept} />}
        {activeTab === 'workflow' && <WorkflowBoard onOpenConcept={openConcept} />}
        {activeTab === 'specs' && <SpecsDatabase />}
        {activeTab === 'brainstorm' && <AIInspiration onOpenConcept={openConcept} />}
        {activeTab === 'ai' && <AIGeneration onOpenConcept={openConcept} />}
        {activeTab === 'detail' && selectedConceptId && (
          <ConceptDetail conceptId={selectedConceptId} onBack={goBack} />
        )}
      </main>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
    </ToastProvider>
  );
}
