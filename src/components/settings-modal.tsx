'use client';

import { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { useToast } from './toast';

interface Profile {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
  confirmedAt?: string | null;
  lastSignInAt?: string | null;
  pending?: boolean;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { openAIKey, setOpenAIKey, geminiKey, setGeminiKey, currentUser, setCurrentUserName } = useAppStore();
  const { toast } = useToast();
  const [key, setKey] = useState(openAIKey);
  const [gKey, setGKey] = useState(geminiKey);
  const [name, setName] = useState(currentUser.name);
  const [activeSection, setActiveSection] = useState<'general' | 'team'>('general');

  // Team management
  const [teamMembers, setTeamMembers] = useState<Profile[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('designer');
  const [inviting, setInviting] = useState(false);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteWarning, setInviteWarning] = useState<string | null>(null);
  const [emailError, setEmailError] = useState('');

  const isAdmin = currentUser.role === 'admin';

  const loadTeam = async () => {
    setLoadingTeam(true);
    try {
      const res = await fetch('/api/auth/users');
      const data = await res.json();
      if (Array.isArray(data)) setTeamMembers(data);
    } catch {
      toast('Failed to load team', 'error');
    } finally {
      setLoadingTeam(false);
    }
  };

  useEffect(() => {
    if (isAdmin && activeSection === 'team') {
      loadTeam();
    }
  }, [isAdmin, activeSection]);

  const handleSave = () => {
    setOpenAIKey(key);
    setGeminiKey(gKey);
    setCurrentUserName(name);
    toast('Settings saved', 'success');
    onClose();
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  const handleInvite = async () => {
    setEmailError('');
    setInviteLink(null);
    setInviteWarning(null);

    const email = inviteEmail.trim().toLowerCase();

    if (!email) {
      setEmailError('Please enter an email address');
      return;
    }
    if (!EMAIL_REGEX.test(email)) {
      setEmailError('Invalid email format');
      return;
    }

    // Check for local duplicates
    if (teamMembers.some((m) => m.email.toLowerCase() === email)) {
      setEmailError('This user is already on the team');
      return;
    }

    setInviting(true);
    try {
      const res = await fetch('/api/auth/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role: inviteRole }),
      });
      const data = await res.json();

      if (!res.ok) {
        setEmailError(data.error || 'Failed to invite');
        return;
      }

      // Success messages based on return
      if (data.existed) {
        toast(`${email} was already on the team — role updated`, 'info');
      } else if (data.emailSent === false && data.inviteLink) {
        setInviteLink(data.inviteLink);
        setInviteWarning(data.warning || 'Email delivery failed. Share this link manually.');
        toast('Invite created — share the link manually', 'info');
      } else {
        toast(`Invite sent to ${email}`, 'success');
      }

      setInviteEmail('');
      // Refresh team list
      await loadTeam();
    } catch {
      setEmailError('Network error. Please try again.');
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveUser = async (userId: string, email: string) => {
    if (!window.confirm(`Remove ${email} from the team?`)) return;
    try {
      const res = await fetch('/api/auth/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error('Failed to remove user');
      setTeamMembers((prev) => prev.filter((m) => m.id !== userId));
      toast(`${email} removed`, 'success');
    } catch {
      toast('Failed to remove user', 'error');
    }
  };

  const handleRoleChange = async (userId: string, role: string) => {
    try {
      const res = await fetch('/api/auth/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role }),
      });
      if (!res.ok) throw new Error('Failed to update role');
      setTeamMembers((prev) => prev.map((m) => (m.id === userId ? { ...m, role } : m)));
      toast('Role updated', 'success');
    } catch {
      toast('Failed to update role', 'error');
    }
  };

  const copyInviteLink = () => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink);
      toast('Invite link copied to clipboard', 'success');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 modal-backdrop z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface border border-border rounded-xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground text-lg">×</button>
        </div>

        {/* Section Tabs */}
        <div className="flex gap-1 border-b border-border mb-4">
          <button
            onClick={() => setActiveSection('general')}
            className={`px-3 py-2 text-sm relative ${activeSection === 'general' ? 'text-accent' : 'text-muted hover:text-foreground'}`}
          >
            General
            {activeSection === 'general' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />}
          </button>
          {isAdmin && (
            <button
              onClick={() => setActiveSection('team')}
              className={`px-3 py-2 text-sm relative ${activeSection === 'team' ? 'text-accent' : 'text-muted hover:text-foreground'}`}
            >
              Team Members
              {activeSection === 'team' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />}
            </button>
          )}
        </div>

        {activeSection === 'general' && (
          <div className="space-y-4">
            {/* Current user info */}
            <div className="bg-background border border-border rounded-lg p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center text-white font-bold text-sm">
                {currentUser.avatar}
              </div>
              <div>
                <div className="text-sm font-medium">{currentUser.name}</div>
                <div className="text-xs text-muted capitalize">{currentUser.role}</div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-1.5">Display Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              />
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
              <p className="text-xs text-muted mt-1">Used for AI image generation and brainstorm.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-1.5">Gemini API Key</label>
              <input
                type="password"
                value={gKey}
                onChange={(e) => setGKey(e.target.value)}
                placeholder="AIza..."
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              />
              <p className="text-xs text-muted mt-1">Optional. Get one at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" className="text-accent hover:underline">aistudio.google.com</a></p>
            </div>

            <div className="flex justify-between pt-2">
              <button
                onClick={handleSignOut}
                className="px-4 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
              >
                Sign Out
              </button>
              <div className="flex gap-2">
                <button onClick={onClose} className="px-4 py-2 text-sm text-muted hover:text-foreground transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'team' && isAdmin && (
          <div className="space-y-4">
            {/* Invite form */}
            <div className="bg-background border border-border rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold">Invite Team Member</h3>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => { setInviteEmail(e.target.value); setEmailError(''); setInviteLink(null); setInviteWarning(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !inviting) handleInvite(); }}
                  placeholder="email@company.com"
                  className={`flex-1 bg-surface border rounded-lg px-3 py-2 text-sm focus:outline-none ${emailError ? 'border-red-400 focus:border-red-500' : 'border-border focus:border-accent'}`}
                  disabled={inviting}
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="bg-surface border border-border rounded-lg px-2 py-2 text-sm"
                  disabled={inviting}
                >
                  <option value="designer">Designer</option>
                  <option value="reviewer">Reviewer</option>
                  <option value="admin">Admin</option>
                </select>
                <button
                  onClick={handleInvite}
                  disabled={inviting || !inviteEmail.trim()}
                  className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm rounded-lg disabled:opacity-50 min-w-[80px]"
                >
                  {inviting ? (
                    <span className="flex items-center justify-center gap-1">
                      <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    </span>
                  ) : 'Invite'}
                </button>
              </div>
              {emailError && (
                <p className="text-xs text-red-600">{emailError}</p>
              )}
              {!emailError && (
                <p className="text-xs text-muted">They'll receive an email to set their password and access the app.</p>
              )}

              {/* Manual invite link fallback */}
              {inviteLink && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                  <p className="text-xs text-amber-800 font-medium">{inviteWarning}</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={inviteLink}
                      onFocus={(e) => e.target.select()}
                      className="flex-1 bg-white border border-amber-200 rounded px-2 py-1.5 text-xs font-mono"
                    />
                    <button
                      onClick={copyInviteLink}
                      className="px-3 py-1 bg-accent hover:bg-accent-hover text-white text-xs rounded"
                    >
                      Copy
                    </button>
                  </div>
                  <p className="text-[10px] text-amber-700">Send this link to the user — it lets them set their password and sign in.</p>
                </div>
              )}
            </div>

            {/* Team list */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">Team ({teamMembers.length})</h3>
                <button
                  onClick={loadTeam}
                  disabled={loadingTeam}
                  className="text-xs text-muted hover:text-foreground disabled:opacity-50"
                >
                  {loadingTeam ? '...' : '↻ Refresh'}
                </button>
              </div>
              {loadingTeam && teamMembers.length === 0 ? (
                <div className="flex items-center justify-center py-6">
                  <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              ) : teamMembers.length === 0 ? (
                <p className="text-sm text-muted text-center py-4">No team members yet</p>
              ) : (
                <div className="space-y-2">
                  {teamMembers.map((member) => {
                    const isCurrentUser = member.id === currentUser.id;
                    return (
                      <div key={member.id} className="flex items-center justify-between bg-background border border-border rounded-lg p-3">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-8 h-8 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-bold shrink-0">
                            {(member.name || member.email[0]).split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium truncate">{member.name || member.email.split('@')[0]}</span>
                              {isCurrentUser && <span className="text-[10px] text-accent bg-accent/10 px-1.5 py-0.5 rounded">You</span>}
                              {member.pending && <span className="text-[10px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">Pending</span>}
                            </div>
                            <div className="text-xs text-muted truncate">{member.email}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isCurrentUser ? (
                            <span className="text-xs text-muted capitalize bg-border/50 px-2 py-0.5 rounded">{member.role}</span>
                          ) : (
                            <select
                              value={member.role}
                              onChange={(e) => handleRoleChange(member.id, e.target.value)}
                              className="text-xs bg-background border border-border rounded px-1.5 py-0.5 capitalize"
                            >
                              <option value="designer">Designer</option>
                              <option value="reviewer">Reviewer</option>
                              <option value="admin">Admin</option>
                            </select>
                          )}
                          {!isCurrentUser && (
                            <button
                              onClick={() => handleRemoveUser(member.id, member.email)}
                              className="text-xs text-red-500 hover:text-red-700 px-2 py-1"
                              title="Remove from team"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
