'use client';

import { Component, ReactNode, ErrorInfo } from 'react';
import { log } from '@/lib/log';

interface Props {
  children: ReactNode;
  /**
   * Where in the app this boundary sits. Surfaced in the error UI and
   * the console log so multi-boundary apps can tell which one tripped.
   */
  scope?: string;
  /**
   * Optional custom fallback. If omitted, the default editorial card is
   * rendered.
   */
  fallback?: (props: { error: Error; reset: () => void; scope?: string }) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Top-level React error boundary. Catches render-time exceptions in its
 * subtree and renders a friendly recovery UI without taking down the
 * whole app.
 *
 * Logged exceptions include scope so multi-boundary apps can tell which
 * region crashed. In production we'd ship these to Sentry / Datadog /
 * Highlight here; for now we just structured-log to console so the
 * runtime hook can pick them up.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Single structured line — same format the server uses so logs
    // remain consistently greppable across client + server.
    log.error('react.boundary.caught', {
      scope: this.props.scope || 'root',
      err: error,
      component_stack: info.componentStack?.split('\n').slice(0, 3).join(' '),
    });
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback({ error, reset: this.reset, scope: this.props.scope });
    }

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-surface border border-border rounded-xl p-8 text-center">
          <div className="text-5xl mb-4 opacity-40">⚠</div>
          <div className="eyebrow mb-1">{this.props.scope || 'Application'} error</div>
          <h1 className="display-sm mb-3">Something went wrong</h1>
          <p className="text-sm text-muted mb-5">
            The app hit an unexpected error. You can try again — your work is auto-saved as you go.
          </p>
          <details className="text-xs text-muted mb-5 text-left bg-background border border-border rounded-lg p-3">
            <summary className="cursor-pointer font-medium text-foreground">Technical details</summary>
            <p className="mt-2 mono break-all">{error.message}</p>
          </details>
          <div className="flex gap-2 justify-center">
            <button
              onClick={this.reset}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium"
            >
              Try again
            </button>
            <button
              onClick={() => { if (typeof window !== 'undefined') window.location.reload(); }}
              className="px-4 py-2 bg-surface border border-border rounded-lg text-sm font-medium hover:border-foreground"
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
