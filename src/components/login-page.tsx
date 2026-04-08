'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [showReset, setShowReset] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError('Please enter email and password'); return; }

    setLoading(true);
    setError('');

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        setError(authError.message === 'Invalid login credentials'
          ? 'Invalid email or password'
          : authError.message
        );
      } else {
        onLogin();
      }
    } catch {
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email) { setError('Please enter your email address first'); return; }

    setLoading(true);
    setError('');

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/`,
      });

      if (resetError) {
        setError(resetError.message);
      } else {
        setResetSent(true);
      }
    } catch {
      setError('Failed to send reset email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center text-white font-bold text-lg mx-auto mb-3">
            DS
          </div>
          <h1 className="text-xl font-bold text-foreground">Design Studio</h1>
          <p className="text-sm text-muted mt-1">Laser Etch Concept Manager</p>
        </div>

        {/* Login Form */}
        <div className="bg-surface border border-border rounded-xl p-6">
          {!showReset ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <h2 className="text-lg font-semibold text-center mb-2">Sign In</h2>

              <div>
                <label className="block text-sm text-muted mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  placeholder="you@company.com"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-accent"
                  autoComplete="email"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm text-muted mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  placeholder="••••••••"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-accent"
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-red-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>

              <button
                type="button"
                onClick={() => { setShowReset(true); setError(''); }}
                className="w-full text-sm text-muted hover:text-accent transition-colors"
              >
                Forgot password?
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-center mb-2">Reset Password</h2>

              {resetSent ? (
                <div className="text-center space-y-3">
                  <div className="text-3xl">✉️</div>
                  <p className="text-sm text-foreground">Password reset email sent to <strong>{email}</strong></p>
                  <p className="text-xs text-muted">Check your inbox and follow the link to reset your password.</p>
                  <button
                    onClick={() => { setShowReset(false); setResetSent(false); }}
                    className="text-sm text-accent hover:text-accent-hover"
                  >
                    Back to login
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted text-center">Enter your email and we'll send a reset link.</p>
                  <div>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setError(''); }}
                      placeholder="you@company.com"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-accent"
                    />
                  </div>

                  {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-red-700">
                      {error}
                    </div>
                  )}

                  <button
                    onClick={handleResetPassword}
                    disabled={loading}
                    className="w-full py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Sending...' : 'Send Reset Email'}
                  </button>

                  <button
                    onClick={() => { setShowReset(false); setError(''); }}
                    className="w-full text-sm text-muted hover:text-accent transition-colors"
                  >
                    Back to login
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <p className="text-xs text-muted text-center mt-4">
          Contact your admin to get an account.
        </p>
      </div>
    </div>
  );
}
