'use client';

import { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { Dashboard } from './dashboard';
import { ConceptsLibrary } from './concepts-library';
import { WorkflowBoard } from './workflow-board';
import { SpecsDatabase } from './specs-database';
import { AIGeneration } from './ai-generation';
import { AIInspiration } from './ai-inspiration';
import { ConceptDetail } from './concept-detail';
import { SettingsModal } from './settings-modal';
import { LoginPage } from './login-page';
import { ArchiveBrowser } from './archive-browser';
import { ToastProvider } from './toast';

type Tab = 'dashboard' | 'concepts' | 'workflow' | 'specs' | 'ai' | 'brainstorm' | 'archive' | 'detail';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '◫' },
  { id: 'concepts', label: 'Concepts', icon: '▦' },
  { id: 'workflow', label: 'Workflow', icon: '⊞' },
  { id: 'specs', label: 'Specs DB', icon: '⚙' },
  { id: 'brainstorm', label: 'Brainstorm', icon: '💡' },
  { id: 'ai', label: 'AI Generate', icon: '✦' },
  { id: 'archive', label: 'Archive', icon: '📦' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const { initialize, initialized, loading, setAuthUser } = useAppStore();

  // Auth state
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setAuthenticated(true);
        setAuthUser(session.user.id, session.user.email || '');
        initialize();
      }
      setAuthChecked(true);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setAuthenticated(true);
        setAuthUser(session.user.id, session.user.email || '');
        initialize();
      } else if (event === 'SIGNED_OUT') {
        setAuthenticated(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [initialize, setAuthUser]);

  const handleLogin = () => {
    // Session will be picked up by onAuthStateChange
  };

  const openConcept = (id: string) => {
    setSelectedConceptId(id);
    setActiveTab('detail');
  };

  const goBack = () => {
    setSelectedConceptId(null);
    setActiveTab('concepts');
  };

  // Show nothing while checking auth
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Show login if not authenticated
  if (!authenticated) {
    return (
      <ToastProvider>
        <LoginPage onLogin={handleLogin} />
      </ToastProvider>
    );
  }

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
        {loading && !initialized && (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-muted">Loading design studio...</span>
            </div>
          </div>
        )}
        {initialized && activeTab === 'dashboard' && <Dashboard onOpenConcept={openConcept} />}
        {initialized && activeTab === 'concepts' && <ConceptsLibrary onOpenConcept={openConcept} />}
        {initialized && activeTab === 'workflow' && <WorkflowBoard onOpenConcept={openConcept} />}
        {initialized && activeTab === 'specs' && <SpecsDatabase />}
        {initialized && activeTab === 'brainstorm' && <AIInspiration onOpenConcept={openConcept} />}
        {initialized && activeTab === 'ai' && <AIGeneration onOpenConcept={openConcept} />}
        {initialized && activeTab === 'archive' && <ArchiveBrowser onOpenConcept={openConcept} />}
        {initialized && activeTab === 'detail' && selectedConceptId && (
          <ConceptDetail conceptId={selectedConceptId} onBack={goBack} />
        )}
      </main>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
    </ToastProvider>
  );
}
