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
import { ManufacturingBoard } from './manufacturing-board';
import { HolidayCalendar } from './holiday-calendar';
import { CustomerDesigns } from './customer-designs';
import { UpcomingHolidayBanner } from './upcoming-holiday-banner';
import { InsightsDashboard } from './insights-dashboard';
import { CompareView } from './compare-view';
import { ConceptLineage } from './concept-lineage';
import { DropPlanner } from './drop-planner';
import { ToastProvider } from './toast';
import { ErrorBoundary } from './error-boundary';
import { installAuthFetch, setAuthToken } from '@/lib/auth-fetch';

type Tab = 'dashboard' | 'concepts' | 'workflow' | 'manufacturing' | 'specs' | 'ai' | 'brainstorm' | 'archive' | 'presets' | 'marketing' | 'mockup' | 'benchmark' | 'calendar' | 'customer' | 'insights' | 'compare' | 'lineage' | 'drops' | 'detail';

const PRIMARY_TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'workflow', label: 'Workflow', icon: '⊞' },
  { id: 'manufacturing', label: 'Manufacturing', icon: '⚒' },
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

  // Honor ?tab=<id>&concept=<id> on the root path. The Readiness Checklist
  // uses these to deep-link to the Mockup / Marketing studio with a
  // specific concept already selected — clicking "Product mockup" on the
  // checklist drops you into the mockup tab with the right concept loaded.
  // Stored in sessionStorage so the destination tab can pick it up on
  // mount, then cleared so the intent fires exactly once.
  useEffect(() => {
    if (pathname !== '/') return;
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    const tab = sp.get('tab');
    const concept = sp.get('concept');
    if (concept) {
      try { window.sessionStorage.setItem('studio-intent-concept', concept); } catch {}
    }
    if (tab) {
      // Tab id is validated against the union below; anything we don't
      // know is ignored.
      const validTabs: Tab[] = ['workflow','manufacturing','calendar','customer','drops','brainstorm','ai','presets','mockup','marketing','specs','archive','dashboard','concepts','insights','compare','lineage','benchmark'];
      if ((validTabs as string[]).includes(tab)) {
        setActiveTab(tab as Tab);
      }
    }
    if (tab || concept) {
      // Strip the query so a reload doesn't re-fire the intent.
      const url = new URL(window.location.href);
      url.search = '';
      window.history.replaceState({}, '', url.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Auth state
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    // Attach the Supabase token to every /api request so the server-side
    // auth middleware can authenticate calls. Install before any fetch runs.
    installAuthFetch();
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        // Prime the API token BEFORE the first authenticated fetches fire.
        setAuthToken(session.access_token);
        setAuthenticated(true);
        setAuthUser(session.user.id, session.user.email || '');
        initialize();
      }
      setAuthChecked(true);
    });

    // Listen for auth changes — keep the cached token fresh across refreshes.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setAuthToken(session?.access_token ?? null);
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
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

  // Inline fallback for a crashed tab — keeps the nav usable and shows the
  // real error (message + stack) so it can be copied/reported.
  const renderTabError = ({ error, reset, scope }: { error: Error; reset: () => void; scope?: string }) => (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="bg-red-50 border border-red-200 rounded-xl p-5">
        <h2 className="text-lg font-semibold text-red-800">This section hit an error{scope ? ` (${scope})` : ''}</h2>
        <p className="text-sm text-red-700 mt-1">The rest of the app is fine — switch tabs, try again, or reload.</p>
        <pre className="mt-3 text-xs bg-white/70 border border-red-200 rounded-lg p-3 overflow-auto max-h-64 text-red-900 whitespace-pre-wrap">
          {error.message}{error.stack ? `\n\n${error.stack}` : ''}
        </pre>
        <div className="mt-3 flex gap-2">
          <button onClick={reset} className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium">Try again</button>
          <button onClick={() => { try { navigator.clipboard.writeText(`${error.message}\n${error.stack || ''}`); } catch {} }} className="px-3 py-1.5 text-sm border border-red-300 text-red-700 rounded-lg hover:bg-red-100">Copy error</button>
          <button onClick={() => { if (typeof window !== 'undefined') window.location.reload(); }} className="px-3 py-1.5 text-sm border border-red-300 text-red-700 rounded-lg hover:bg-red-100">Reload</button>
        </div>
      </div>
    </div>
  );

  // Stale-chunk recovery: after a deploy, an already-open tab can reference
  // JS chunks that no longer exist, throwing ChunkLoadError on navigation.
  // Auto-reload once (guarded against loops) to pull the fresh manifest.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isChunkError = (msg: string) =>
      /ChunkLoadError|Loading chunk [\d]+ failed|Failed to fetch dynamically imported module|importing a module script failed/i.test(msg);
    const recover = (msg: string) => {
      if (!isChunkError(msg)) return;
      const KEY = 'chunk-reload-at';
      const last = Number(sessionStorage.getItem(KEY) || '0');
      // Only reload if we haven't already done so in the last 10s.
      if (Date.now() - last > 10_000) {
        sessionStorage.setItem(KEY, String(Date.now()));
        window.location.reload();
      }
    };
    const onError = (e: ErrorEvent) => recover(e.message || String(e.error || ''));
    const onRejection = (e: PromiseRejectionEvent) => recover(String((e.reason && (e.reason.message || e.reason)) || ''));
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

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
      {/* Upcoming-holiday banner — sits ABOVE the top bar so it's the
          first thing the team sees on every page. Auto-hides itself
          when nothing's coming up within 60 days. Dismissible per-event
          per-day so the same holiday doesn't nag every page load. */}
      <UpcomingHolidayBanner />

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

      {/* Tab Navigation — horizontally scrollable on mobile so all tabs stay
          reachable. NOTE: overflow lives on the INNER row, not the <nav>,
          so the "More" dropdown can escape vertically without being clipped.
          Previously the dropdown was getting cropped because the parent
          `overflow-x-auto` implicitly clipped the y-axis too. */}
      <nav className="border-b border-border bg-surface px-2 sm:px-6 shrink-0 relative" role="navigation" aria-label="Main navigation">
        <div className="flex gap-1 items-center min-w-max overflow-x-auto">
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
        {/* Each tab is isolated in its own error boundary, keyed by the
            active tab so switching tabs always re-mounts a fresh boundary.
            A crash in one view (e.g. AI Generate) now shows an inline error
            with the message + stack instead of white-screening the app. */}
        <ErrorBoundary key={activeTab} scope={activeTab} fallback={renderTabError}>
          {initialized && activeTab === 'dashboard' && <Dashboard onOpenConcept={openConcept} />}
          {initialized && activeTab === 'concepts' && <ConceptsLibrary onOpenConcept={openConcept} />}
          {initialized && activeTab === 'workflow' && (
            <WorkflowBoard
              onOpenConcept={openConcept}
              onOpenArchive={() => setActiveTab('archive')}
            />
          )}
          {initialized && activeTab === 'manufacturing' && <ManufacturingBoard />}
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
        </ErrorBoundary>
      </main>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
    </ToastProvider>
  );
}
