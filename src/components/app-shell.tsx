'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
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
import { PresetLibrary } from './preset-library';
import { BenchmarkDashboard } from './benchmark-dashboard';
import { MarketingStudio } from './marketing-studio';
import { MockupStudio } from './mockup-studio';
import { HolidayCalendar } from './holiday-calendar';
import { CustomerDesigns } from './customer-designs';
import { InsightsDashboard } from './insights-dashboard';
import { CompareView } from './compare-view';
import { ConceptLineage } from './concept-lineage';
import { DropPlanner } from './drop-planner';
import { ToastProvider } from './toast';

type Tab = 'dashboard' | 'concepts' | 'workflow' | 'specs' | 'ai' | 'brainstorm' | 'archive' | 'presets' | 'marketing' | 'mockup' | 'benchmark' | 'calendar' | 'customer' | 'insights' | 'compare' | 'lineage' | 'drops' | 'detail';

const PRIMARY_TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'workflow', label: 'Workflow', icon: '⊞' },
  { id: 'customer', label: 'Customer Designs', icon: '◐' },
  { id: 'drops', label: 'Drops', icon: '◇' },
  { id: 'calendar', label: 'Calendar', icon: '◷' },
  { id: 'brainstorm', label: 'Brainstorm', icon: '💡' },
  { id: 'ai', label: 'AI Generate', icon: '✦' },
  { id: 'presets', label: 'Presets', icon: '★' },
  { id: 'mockup', label: 'Mockup', icon: '▣' },
  { id: 'marketing', label: 'Marketing', icon: '◈' },
  { id: 'specs', label: 'Specs DB', icon: '⚙' },
  { id: 'archive', label: 'Archive', icon: '📦' },
];

const SECONDARY_TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '◫' },
  { id: 'concepts', label: 'Concepts', icon: '▦' },
  { id: 'insights', label: 'Insights', icon: '◑' },
  { id: 'compare', label: 'Compare', icon: '⊞' },
  { id: 'lineage', label: 'Lineage', icon: '⌥' },
  { id: 'benchmark', label: 'Benchmark', icon: '⚖' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  // Tabs that have their own bookmarkable URL. Add new entries here when
  // promoting a tab to a real route.
  const PATH_TO_TAB: Record<string, Tab> = {
    '/calendar': 'calendar',
    '/customer-designs': 'customer',
    '/compare': 'compare',
    '/drops': 'drops',
  };
  const TAB_TO_PATH: Partial<Record<Tab, string>> = {
    calendar: '/calendar',
    customer: '/customer-designs',
    compare: '/compare',
    drops: '/drops',
  };
  const initialTab: Tab = PATH_TO_TAB[pathname] || 'workflow';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  // Remember which tab the user came from so "back" returns them there
  // instead of always snapping to Workflow.
  const [previousTab, setPreviousTab] = useState<Tab>('workflow');
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const { initialize, initialized, loading, setAuthUser } = useAppStore();

  // Keep tab ↔ URL in sync for routed tabs. Browser back/forward or direct
  // URL pastes switch the active tab; navigating to / from a routed tab
  // resets to the default Workflow.
  useEffect(() => {
    const targetTab = PATH_TO_TAB[pathname];
    if (targetTab && targetTab !== activeTab) {
      setActiveTab(targetTab);
    } else if (pathname === '/' && TAB_TO_PATH[activeTab]) {
      setActiveTab('workflow');
    }
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // Snapshot where we were so goBack can return there
    if (activeTab !== 'detail') setPreviousTab(activeTab);
    setSelectedConceptId(id);
    setActiveTab('detail');
  };

  const goBack = () => {
    setSelectedConceptId(null);
    setActiveTab(previousTab);
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
      <header className="border-b border-border px-3 sm:px-6 py-3 flex items-center justify-between bg-surface shrink-0 gap-2">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <div className="brand-mark shrink-0">DS</div>
          <div className="min-w-0">
            <h1 className="serif text-lg sm:text-xl font-medium tracking-tight truncate leading-none">Design Studio</h1>
            <div className="hidden md:block eyebrow mt-1">Laser Etch Concept Manager</div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Visible build indicator — confirms which deploy is actually
              running in your browser. Hover for the build time. The bright
              color (vs muted) makes it impossible to miss when checking
              whether a refresh actually picked up the latest deploy. */}
          <span
            className="hidden sm:inline text-[11px] font-mono font-semibold px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded"
            title={`Build ${process.env.NEXT_PUBLIC_BUILD_SHA || 'dev'} — ${process.env.NEXT_PUBLIC_BUILD_TIME || 'unknown time'}`}
          >
            BUILD v{process.env.NEXT_PUBLIC_BUILD_SHA || 'dev'}
          </span>
          <button
            onClick={() => setShowSettings(true)}
            aria-label="Open settings"
            className="text-sm text-muted hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-surface-hover border border-transparent hover:border-border"
          >
            Settings
          </button>
        </div>
      </header>

      {/* Tab Navigation — horizontally scrollable on mobile so all tabs stay reachable */}
      <nav className="border-b border-border bg-surface px-2 sm:px-6 shrink-0 overflow-x-auto" role="navigation" aria-label="Main navigation">
        <div className="flex gap-1 items-center min-w-max">
          {PRIMARY_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setShowMoreMenu(false);
                if (tab.id !== 'detail') setSelectedConceptId(null);
                // Routed tabs get their own URL; non-routed tabs reset to /.
                const targetPath = TAB_TO_PATH[tab.id];
                if (targetPath && pathname !== targetPath) {
                  router.push(targetPath);
                } else if (!targetPath && TAB_TO_PATH[activeTab]) {
                  router.push('/');
                }
              }}
              className={`px-3 sm:px-4 py-3 text-sm font-medium transition-colors relative whitespace-nowrap min-h-[44px] ${
                activeTab === tab.id
                  ? 'text-accent'
                  : 'text-muted hover:text-foreground'
              }`}
              aria-current={activeTab === tab.id ? 'page' : undefined}
              aria-label={tab.label}
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
              className="px-3 sm:px-4 py-3 text-sm font-medium text-accent relative whitespace-nowrap"
            >
              <span className="mr-1.5">◉</span>
              Concept Detail
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />
            </button>
          )}

          {/* More dropdown (pushed to the right) */}
          <div className="ml-auto relative shrink-0">
            <button
              onClick={() => setShowMoreMenu((v) => !v)}
              onBlur={() => setTimeout(() => setShowMoreMenu(false), 150)}
              className={`px-4 py-3 text-sm font-medium transition-colors relative min-h-[44px] ${
                SECONDARY_TABS.some((t) => t.id === activeTab)
                  ? 'text-accent'
                  : 'text-muted hover:text-foreground'
              }`}
              aria-haspopup="menu"
              aria-expanded={showMoreMenu}
              aria-label="More tabs"
            >
              <span className="mr-1.5">⋯</span>
              More
              {SECONDARY_TABS.some((t) => t.id === activeTab) && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />
              )}
            </button>
            {showMoreMenu && (
              <div
                className="absolute right-0 top-full mt-0 bg-surface border border-border rounded-b-lg shadow-xl z-30 min-w-[180px] py-1"
                role="menu"
              >
                {SECONDARY_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setActiveTab(tab.id);
                      setShowMoreMenu(false);
                      setSelectedConceptId(null);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center gap-2 ${
                      activeTab === tab.id
                        ? 'text-accent bg-accent/5'
                        : 'text-muted hover:text-foreground hover:bg-surface-hover'
                    }`}
                    role="menuitem"
                  >
                    <span>{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
              </div>
            )}
          </div>
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
        {initialized && activeTab === 'workflow' && (
          <WorkflowBoard
            onOpenConcept={openConcept}
            onOpenArchive={() => setActiveTab('archive')}
          />
        )}
        {initialized && activeTab === 'specs' && <SpecsDatabase />}
        {initialized && activeTab === 'brainstorm' && <AIInspiration onOpenConcept={openConcept} />}
        {initialized && activeTab === 'ai' && <AIGeneration onOpenConcept={openConcept} />}
        {initialized && activeTab === 'archive' && <ArchiveBrowser onOpenConcept={openConcept} />}
        {initialized && activeTab === 'presets' && <PresetLibrary onOpenConcept={openConcept} />}
        {initialized && activeTab === 'marketing' && <MarketingStudio />}
        {initialized && activeTab === 'mockup' && <MockupStudio />}
        {initialized && activeTab === 'benchmark' && <BenchmarkDashboard />}
        {initialized && activeTab === 'calendar' && <HolidayCalendar onOpenConcept={openConcept} />}
        {initialized && activeTab === 'customer' && <CustomerDesigns onOpenConcept={openConcept} />}
        {initialized && activeTab === 'insights' && <InsightsDashboard onOpenConcept={openConcept} />}
        {initialized && activeTab === 'compare' && <CompareView onOpenConcept={openConcept} />}
        {initialized && activeTab === 'lineage' && <ConceptLineage onOpenConcept={openConcept} />}
        {initialized && activeTab === 'drops' && <DropPlanner onOpenConcept={openConcept} />}
        {initialized && activeTab === 'detail' && selectedConceptId && (
          <ConceptDetail conceptId={selectedConceptId} onBack={goBack} />
        )}
      </main>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
    </ToastProvider>
  );
}
